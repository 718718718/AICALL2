const asyncHandler = require('../middlewares/asyncHandler');
const twilio = require('twilio');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const AgentSettings = require('../models/AgentSettings');
const conversationEngine = require('../services/conversationEngine');
const webSocketService = require('../services/websocket');
const coefontService = require('../services/cartesiaService');
const CallTerminationUtils = require('../utils/callTerminationUtils');
const callTimeoutManager = require('../services/callTimeoutManager');
const { sanitizeStatus, sanitizeCallResult, sanitizeEndReason } = require('../utils/statusValidator');
const { callQueueManager } = require('./bulkCallController');
const { getPublicBaseUrl } = require('../utils/publicUrl');

/**
 * 転送状況に基づいてcallResultを判定する
 * @param {Object} callSession - 通話セッション
 * @returns {string} 通話結果 ('成功' または '拒否')
 */
function determineCallResultFromTransfer(callSession) {
  if (callSession?.callResult) {
    // 既にhandleTransferStatusで設定済みの場合（転送完了時）
    console.log(`[handleCallStatus] Using existing callResult from transfer: ${callSession.callResult}`);
    return callSession.callResult;
  } else if (callSession?.handoffDetails?.connectedAt) {
    // 転送が成功していた場合（実際にエージェントが応答/参加した証跡 connectedAt がある場合のみ）
    // status==='human-connected' だけでは「転送を試みた/リダイレクトした」に過ぎず、接続成立の証拠にならない
    console.log(`[handleCallStatus] Transfer connected (connectedAt present), setting callResult: 成功`);
    return '成功';
  } else {
    // 転送されずに終了した場合 = 拒否
    console.log(`[handleCallStatus] No transfer occurred, setting callResult: 拒否`);
    return '拒否';
  }
}

/**
 * 会話内容と行動に基づいて通話結果を判定する
 * @param {string} intent - 分類された意図
 * @param {string} nextAction - 次の行動
 * @returns {string} 通話結果 ('成功', '不在', '拒否', '要フォロー', '失敗')
 */
function determineCallResult(intent, nextAction) {
  console.log(`[CallResult] 判定中 - Intent: ${intent}, NextAction: ${nextAction}`);

  // インテントに基づく基本的な判定
  switch (intent) {
    case 'absent':
    case 'not_available':
      return '不在';

    case 'rejection':
    case 'decline':
    case 'refuse':
      return '拒否';

    case 'interest':
    case 'positive_response':
    case 'agreement':
    case 'website_redirect':
    case 'information_provided':
      return '成功';

    case 'needs_followup':
    case 'callback_request':
    case 'partial_interest':
      return '要フォロー';

    case 'error':
    case 'system_error':
    case 'network_issue':
      return '失敗';

    default:
      // NextActionも考慮した詳細な判定
      if (nextAction === 'respond_and_end' || nextAction === 'end_call') {
        // 正常終了の場合、会話が完了したと判断
        return '成功';
      } else if (nextAction === 'apologize_and_end') {
        // 謝罪して終了の場合、フォローアップが必要
        return '要フォロー';
      } else {
        // その他の場合、成功とみなす
        return '成功';
      }
  }
}

// Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// TwiML Voice Response helper
const VoiceResponse = twilio.twiml.VoiceResponse;

// @desc    Generate TwiML for Conference with AI
// @route   POST /api/twilio/voice/conference/:callId
// @access  Public (Twilio webhook)
exports.generateConferenceTwiML = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const aiStart = req.query.aiStart === 'true';  // AI即座開始フラグ
  console.log(`[TwiML Conference] Starting call for callId: ${callId}`);
  console.log(`[TwiML Conference] AI Immediate Start: ${aiStart}`);
  console.log(`[TwiML Conference] Request body:`, req.body);
  const twiml = new VoiceResponse();

  try {
    // 通話セッションを取得
    const callSession = await CallSession.findById(callId)
      .populate('customerId');

    if (!callSession) {
      // AgentSettingsからシステムエラーメッセージを取得
      let errorMessage = 'システムエラーが発生しました。申し訳ございません。';
      try {
        const agentSettings = await AgentSettings.findOne({});
        if (agentSettings) {
          const processedMessage = conversationEngine.processTemplate('systemError', {});
          if (processedMessage) {
            errorMessage = processedMessage;
          }
        }
      } catch (error) {
        console.error('[TwiML Conference] Error getting systemError message:', error);
      }
      await coefontService.getTwilioPlayElement(twiml, errorMessage);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // デフォルトの初期メッセージを使用（遅延を避けるため）
    let initialMessage = 'お世話になります。AIコールシステム株式会社です。営業部のご担当者さまはいらっしゃいますでしょうか？';
    
    // AgentSettingsから新しいテンプレートを取得
    try {
      console.log(`[TwiML Conference] Looking for AgentSettings with assignedAgent: ${callSession.assignedAgent}`);
      const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
      if (agentSettings && agentSettings.conversationSettings) {
        console.log(`[TwiML Conference] AgentSettings found, processing template...`);
        // 新しいテンプレート処理メソッドを使用
        const processedTemplate = conversationEngine.processTemplate('initial', callSession.aiConfiguration);
        if (processedTemplate) {
          initialMessage = processedTemplate;
          console.log(`[TwiML Conference] Using processed template from AgentSettings`);
          console.log(`[TwiML Conference] Processed template: ${processedTemplate}`);
        } else {
          console.log(`[TwiML Conference] processTemplate returned null/empty`);
        }
      } else {
        console.log(`[TwiML Conference] No AgentSettings found for assignedAgent: ${callSession.assignedAgent}, using default`);
      }
    } catch (error) {
      console.error(`[TwiML Conference] Error getting AgentSettings:`, error);
      // フォールバック: AI設定があれば、それを使用してメッセージを構築（同期的に）
      if (callSession.aiConfiguration) {
        const { companyName, serviceName, representativeName, targetDepartment } = callSession.aiConfiguration;
        if (companyName && representativeName && serviceName && targetDepartment) {
          initialMessage = `お世話になります。${companyName}の${representativeName}と申します。${serviceName}のご案内でお電話しました。本日、${targetDepartment}のご担当者さまはいらっしゃいますでしょうか？`;
        }
      }
    }
    console.log(`[TwiML Conference] Connecting to OpenAI Realtime API via Media Stream`);
    console.log(`[TwiML Conference] CallId: ${callId}`);

    // OpenAI Realtime API用のMedia Stream接続を確立
    // ngrok URLからホスト部分を取得（https:// を除く）
    const ngrokHost = process.env.NGROK_URL?.replace('https://', '') || process.env.BASE_URL?.replace('https://', '') || req.get('host');

    // Check if using simple mode (for debugging)
    const useSimpleEndpoint = process.env.USE_SIMPLE_MEDIA_STREAM === 'true';
    const streamPath = useSimpleEndpoint
      ? '/api/twilio/media-stream-simple'
      : `/api/twilio/media-stream/${callId}`;

    const streamUrl = `wss://${ngrokHost}${streamPath}`;
    console.log(`[TwiML Conference] USE_SIMPLE_MEDIA_STREAM: ${process.env.USE_SIMPLE_MEDIA_STREAM}`);
    console.log(`[TwiML Conference] Using ${useSimpleEndpoint ? 'SIMPLE' : 'PRODUCTION'} endpoint`);
    console.log(`[TwiML Conference] Stream URL: ${streamUrl}`);

    const connect = twiml.connect();
    connect.stream({
      url: streamUrl,
      name: `stream_${callId}` // Add name attribute to ensure 'start' event is sent
    });

    console.log(`[TwiML Conference] TwiML generated with Media Stream connection`);

    // TwiMLを返す
    const twimlResponse = twiml.toString();
    console.log(`[TwiML Conference] TwiML Response:\n${twimlResponse}`);

    res.type('text/xml').send(twimlResponse);
  } catch (error) {
    console.error('Error generating conference TwiML:', error);
    // AgentSettingsからシステムエラーメッセージを取得
    let errorMessage = 'システムエラーが発生しました。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('systemError', {});
        if (processedMessage) {
          errorMessage = processedMessage;
        }
      }
    } catch (getAgentError) {
      console.error('[TwiML Conference] Error getting systemError message:', getAgentError);
    }
    await coefontService.getTwilioPlayElement(twiml, errorMessage);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// @desc    Generate TwiML for agent joining conference
// @route   POST /api/twilio/voice/conference/agent/:conferenceName
// @access  Public (Twilio webhook)
exports.agentJoinConference = asyncHandler(async (req, res) => {
  const { conferenceName } = req.params;
  const twiml = new VoiceResponse();

  // AgentSettingsからエージェント接続メッセージを取得
  let connectionMessage = '顧客との通話に接続します。';
  try {
    const agentSettings = await AgentSettings.findOne({});
    if (agentSettings) {
      const processedMessage = conversationEngine.processTemplate('agentConnection', {});
      if (processedMessage) {
        connectionMessage = processedMessage;
      }
    }
  } catch (error) {
    console.error('[Agent Join Conference] Error getting agentConnection message:', error);
  }
  await coefontService.getTwilioPlayElement(twiml, connectionMessage);

  const dial = twiml.dial();
  dial.conference({
    statusCallback: `/api/twilio/conference/agent-events`,
    statusCallbackEvent: 'join leave',
    statusCallbackMethod: 'POST',
    endConferenceOnExit: true // エージェントが退出したら会議を終了
  }, conferenceName);

  res.type('text/xml').send(twiml.toString());
});

// @desc    Handle speech recognition and generate AI response
// @route   POST /api/twilio/voice/gather/:callId
// @access  Public (Twilio webhook)
exports.handleSpeechInput = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { SpeechResult, Confidence } = req.body;
  const isFirst = req.query.isFirst === 'true';  // 最初の応答かどうか
  
  console.log('============================================');
  console.log('[会話ログ] 顧客の発話を受信');
  console.log(`[会話ログ] CallId: ${callId}`);
  console.log(`[会話ログ] 最初の応答: ${isFirst ? 'はい' : 'いいえ'}`);
  console.log(`[会話ログ] 顧客の発話内容: "${SpeechResult || '(無音)'}"`);
  console.log(`[会話ログ] 信頼度: ${Confidence || 'N/A'}`);
  console.log(`[会話ログ] タイムスタンプ: ${new Date().toISOString()}`);
  console.log(`[会話ログ] リクエストBody:`, JSON.stringify(req.body, null, 2));
  console.log(`[会話ログ] クエリパラメータ:`, JSON.stringify(req.query, null, 2));
  console.log(`[会話ログ] req.query.isFirst: "${req.query.isFirst}"`);
  console.log('============================================');
  const twiml = new VoiceResponse();

  try {
    // CallSessionを取得して会話状態を確認
    const callSession = await CallSession.findById(callId).populate('customerId');
    if (!callSession) {
      console.error(`[Speech Input] CallSession not found for ${callId}`);
      // AgentSettingsからシステムエラーメッセージを取得
      let errorMessage = 'システムエラーが発生しました。申し訳ございません。';
      try {
        const agentSettings = await AgentSettings.findOne({});
        if (agentSettings) {
          const processedMessage = conversationEngine.processTemplate('systemError', {});
          if (processedMessage) {
            errorMessage = processedMessage;
          }
        }
      } catch (error) {
        console.error('[Speech Input] Error getting systemError message:', error);
      }
      await coefontService.getTwilioPlayElement(twiml, errorMessage);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    
    // 会話エンジンの状態を確認し、必要なら初期化（初回のみ）
    if (!conversationEngine.hasConversation(callId)) {
      console.log(`[Speech Input] Initializing conversation for ${callId}`);
      conversationEngine.initializeConversation(callId, callSession.aiConfiguration);
    } else {
      console.log(`[Speech Input] Conversation already exists for ${callId}`);
    }

    // 初回発話判定: 初回の顧客応答かどうかを判定（挨拶無視機能のため）
    const conversationState = conversationEngine.getConversationState(callId);
    // 修正: AIが先に話している場合は、顧客の初回応答でも通常分類を行う
    const isFirstCustomerSpeech = !conversationState ||
      (!conversationState.customerSpokeFirst && !conversationState.systemSpokeFirst && conversationState.turnCount === 0);
    console.log(`[Speech Input] Conversation state:`, {
      exists: !!conversationState,
      turnCount: conversationState?.turnCount || 0,
      customerSpokeFirst: conversationState?.customerSpokeFirst || false,
      systemSpokeFirst: conversationState?.systemSpokeFirst || false,
      isTransferred: conversationState?.isTransferred || false,
      isFirstCustomerSpeech
    });

    // 転送済みの場合はAI応答をスキップ（ログのみ記録）
    if (conversationState?.isTransferred) {
      console.log(`[Speech Input] Call transferred - AI listening only, logging: "${SpeechResult || '(無音)'}"`);

      // トランスクリプトは更新（ログ収集のため）
      if (SpeechResult && SpeechResult.trim() !== '') {
        await CallSession.findByIdAndUpdate(callId, {
          $push: {
            transcript: {
              speaker: 'customer',
              message: SpeechResult,
              confidence: parseFloat(Confidence) || 0
            }
          }
        });

        // WebSocketでトランスクリプト更新を送信
        webSocketService.sendTranscriptUpdate(callId, {
          speaker: 'customer',
          message: SpeechResult,
          confidence: parseFloat(Confidence) || 0,
          timestamp: new Date()
        });
      }

      // 空のレスポンスを返す（AI応答なし）
      return res.type('text/xml').send('<Response></Response>');
    }

    // 無音や無入力の場合の処理
    if (!SpeechResult || SpeechResult.trim() === '') {
      // 最初の無音の場合、AIが名乗る
      if (isFirstCustomerSpeech) {
        console.log(`[Speech Input] First silence detected - AI will introduce itself`);
        // AIが初回メッセージを発声したことを記録
        conversationEngine.updateConversationState(callId, { systemSpokeFirst: true });
        const initialMessage = await conversationEngine.generateResponse(callId, 'initial');
        
        const gather = twiml.gather({
          input: 'speech',
          language: 'ja-JP',
          speechModel: 'enhanced',
          speechTimeout: 'auto',
          timeout: 10,
          action: `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`,
          method: 'POST',
          partialResultCallback: `${process.env.BASE_URL}/api/twilio/voice/partial/${callId}`,
          partialResultCallbackMethod: 'POST'
        });
        // CoeFontを使用
        await coefontService.getTwilioPlayElement(gather, initialMessage);
        
        // タイムアウト時のフォールバック
        twiml.redirect({
          method: 'POST'
        }, `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`);
        
        return res.type('text/xml').send(twiml.toString());
      }
      
      // 会話状態を確認して無音カウントを更新
      conversationEngine.updateConversationState(callId, { 
        continuousSilentCount: (conversationEngine.getConversationState(callId)?.continuousSilentCount || 0) + 1 
      });
      const silentCount = conversationEngine.getConversationState(callId)?.continuousSilentCount || 1;
      
      console.log(`[Speech Input] Silence detected (count: ${silentCount}) for call ${callId}`);
      
      // 初回の無音はただ待つ（相手が考えている可能性）
      if (silentCount === 1) {
        console.log(`[Speech Input] First silence - waiting for customer response`);
        const gather = twiml.gather({
          input: 'speech',
          language: 'ja-JP',
          speechModel: 'enhanced',
          speechTimeout: 3,  // 3秒待つ
          timeout: 5,
          action: `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`,
          method: 'POST',
          partialResultCallback: `${process.env.BASE_URL}/api/twilio/voice/partial/${callId}`,
          partialResultCallbackMethod: 'POST'
        });
        // 何も言わずに待つ
        
        // タイムアウト後の処理
        twiml.redirect({
          method: 'POST'
        }, `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`);
        
        return res.type('text/xml').send(twiml.toString());
      }
      
      // 2回目の無音は確認メッセージ
      if (silentCount === 2) {
        console.log(`[Speech Input] Second silence - checking if customer is there`);
        const gather = twiml.gather({
          input: 'speech',
          language: 'ja-JP',
          speechModel: 'enhanced',
          speechTimeout: 'auto',
          timeout: 10,
          action: `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`,
          method: 'POST',
          partialResultCallback: `${process.env.BASE_URL}/api/twilio/voice/partial/${callId}`,
          partialResultCallbackMethod: 'POST'
        });
        // CoeFontを使用
        // AgentSettingsからnoAnswerメッセージを取得
        let noAnswerMessage = 'お客様、お聞きになれますか？';
        try {
          const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
          if (agentSettings) {
            const processedMessage = conversationEngine.processTemplate('noAnswer', {});
            if (processedMessage) {
              noAnswerMessage = processedMessage;
            }
          }
        } catch (error) {
          console.error('[Speech Input] Error getting noAnswer message:', error);
        }
        await coefontService.getTwilioPlayElement(gather, noAnswerMessage);
        
        twiml.redirect({
          method: 'POST'
        }, `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`);
        
        return res.type('text/xml').send(twiml.toString());
      }
      
      // 3回以上の無音は終話
      if (silentCount >= 3) {
        console.log(`[Speech Input] Too many silences - ending call`);
        // CoeFontを使用
        // AgentSettingsからtooManyClarificationsメッセージを取得
        let tooManyMessage = 'お電話が遠いようですので、また改めてお電話させていただきます。失礼いたします。';
        try {
          const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
          if (agentSettings) {
            const processedMessage = conversationEngine.processTemplate('tooManyClarifications', {});
            if (processedMessage) {
              tooManyMessage = processedMessage;
            }
          }
        } catch (error) {
          console.error('[Speech Input] Error getting tooManyClarifications message:', error);
        }
        await coefontService.getTwilioPlayElement(twiml, tooManyMessage);
        twiml.hangup();
        return res.type('text/xml').send(twiml.toString());
      }
    }
    
    // 音声入力があったので無音カウントをリセット
    conversationEngine.updateConversationState(callId, { continuousSilentCount: 0 });
    
    // 通話活動を更新（タイムアウトをリセット）
    callTimeoutManager.updateCallActivity(callId);
    
    // 通話状態をai-respondingに更新
    await CallSession.findByIdAndUpdate(callId, {
      status: 'ai-responding'
    });
    
    // WebSocketで通話状態更新を通知
    let toPhoneNumber = req.body.To || '';
    if (toPhoneNumber.startsWith('+81')) {
      toPhoneNumber = '0' + toPhoneNumber.substring(3);
    }
    
    webSocketService.emitToUser(callSession.userId, 'call-status', {
      callId: callId,
      callSid: callSession.twilioCallSid,
      phoneNumber: toPhoneNumber,
      status: 'ai-responding',
      timestamp: new Date()
    });

    // トランスクリプトを即座に更新（初回判定後、分類前）
    await CallSession.findByIdAndUpdate(callId, {
      $push: {
        transcript: {
          speaker: 'customer',
          message: SpeechResult,
          confidence: parseFloat(Confidence) || 0
        }
      }
    });

    let classification;

    if (isFirstCustomerSpeech) {
      console.log(`[Speech Input] ========== FIRST CUSTOMER SPEECH DETECTED ==========`);
      console.log(`[Speech Input] Customer spoke first time: "${SpeechResult}"`);
      console.log(`[Speech Input] turnCount: ${conversationState?.turnCount || 0}`);
      console.log(`[Speech Input] Will use initial contact response regardless of content`);
      // 会話状態を「顧客が先に名乗った」と記録
      conversationEngine.updateConversationState(callId, { customerSpokeFirst: true });

      // 初回応答は分類せず、必ず初回コンタクトメッセージを返す
      classification = {
        intent: 'initial_contact',  // 固定のインテント
        confidence: 1.0,
        shouldHandoff: false,
        nextAction: 'continue'
      };
      console.log(`[Speech Input] Classification set to: initial_contact (forced)`);
    } else {
      // 2回目以降の応答は通常通り分類
      console.log(`[Speech Input] ========== SUBSEQUENT CUSTOMER SPEECH ==========`);
      console.log(`[Speech Input] turnCount: ${conversationState?.turnCount || 0}`);
      console.log(`[Speech Input] Will classify normally: "${SpeechResult}"`);
      classification = conversationEngine.classifyResponse(SpeechResult, callId);
      console.log(`[Speech Input] Classification result:`, classification);
    }
    
    // WebSocketで顧客の発話を送信
    webSocketService.sendTranscriptUpdate(callId, {
      speaker: 'customer',
      message: SpeechResult,
      phoneNumber: toPhoneNumber,
      callId: callId,
      callSid: callSession.twilioCallSid,
      timestamp: new Date()
    });

    // Handle the conversation normally - transfer logic will be handled in the AI response section below
    {
      // AI応答を生成
      let aiResponse;
      try {
        // 初回応答の場合は必ず初回コンタクトメッセージを生成
        if (isFirstCustomerSpeech) {
          console.log(`[Speech Input] Generating initial contact response for callId: ${callId}`);

          // AgentSettingsから初回テンプレートを取得
          const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
          if (agentSettings && agentSettings.conversationSettings) {
            // initialテンプレートを処理（会議開始時と同じ方法）
            const processedMessage = conversationEngine.processTemplate('initial', callSession.aiConfiguration);
            if (processedMessage) {
              aiResponse = processedMessage;
              console.log(`[Speech Input] Using initial template: ${aiResponse.substring(0, 100)}...`);
            }
          }

          // テンプレートがない場合はデフォルトメッセージ
          if (!aiResponse) {
            if (callSession && callSession.aiConfiguration) {
              const { companyName, serviceName, representativeName, targetDepartment } = callSession.aiConfiguration;
              aiResponse = `お世話になります。${companyName}の${representativeName}と申します。${serviceName}のご案内でお電話しました。本日、${targetDepartment}のご担当者さまはいらっしゃいますでしょうか？`;
            } else {
              aiResponse = 'お世話になります。本日はサービスのご案内でお電話させていただきました。ご担当者様はいらっしゃいますでしょうか？';
            }
          }
        } else {
          // 2回目以降は通常の応答生成
          console.log(`[Speech Input] Generating AI response for callId: ${callId}, intent: ${classification.intent}`);
          // カスタム変数を準備（lastAiMessageがある場合）
          const customVariables = {};
          if (classification.lastAiMessage) {
            customVariables.lastAiMessage = classification.lastAiMessage;
          }
          aiResponse = await conversationEngine.generateResponse(callId, classification.intent, customVariables);
        }

        if (!aiResponse && !isFirstCustomerSpeech) {
          console.error(`[Speech Input] WARNING: Empty AI response for callId: ${callId}, intent: ${classification.intent}`);
          // デフォルトの応答を生成
          // AgentSettingsからunknownメッセージを取得
          aiResponse = '申し訳ございません。もう一度お聞きしてもよろしいでしょうか？';
          try {
            const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
            if (agentSettings) {
              const processedMessage = conversationEngine.processTemplate('unknown', {});
              if (processedMessage) {
                aiResponse = processedMessage;
              }
            }
          } catch (error) {
            console.error('[Speech Input] Error getting unknown message:', error);
          }
        }
      } catch (aiError) {
        console.error(`[Speech Input] ERROR generating AI response:`, aiError);
        console.error(`[Speech Input] Error stack:`, aiError.stack);
        console.error(`[Speech Input] Error details:`, {
          callId,
          intent: classification.intent,
          isFirstCustomerSpeech,
          speechResult: SpeechResult
        });

        // エラーでも最初の応答は必ず返す
        if (isFirstCustomerSpeech) {
          const callSession = await CallSession.findById(callId);
          if (callSession && callSession.aiConfiguration) {
            const { companyName, serviceName, representativeName, targetDepartment } = callSession.aiConfiguration;
            aiResponse = `お世話になります。${companyName}の${representativeName}と申します。${serviceName}のご案内でお電話しました。本日、${targetDepartment}のご担当者さまはいらっしゃいますでしょうか？`;
          } else {
            aiResponse = 'お世話になります。本日はサービスのご案内でお電話させていただきました。ご担当者様はいらっしゃいますでしょうか？';
          }
        } else {
          // AgentSettingsからunknownメッセージを取得
          aiResponse = 'お聞き取りできませんでした。もう一度お願いできますでしょうか？';
          try {
            const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
            if (agentSettings) {
              const processedMessage = conversationEngine.processTemplate('unknown', {});
              if (processedMessage) {
                aiResponse = processedMessage;
              }
            }
          } catch (error) {
            console.error('[Speech Input] Error getting unknown message:', error);
          }
        }
      }
      console.log('============================================');
      console.log('[会話ログ] AIの応答');
      console.log(`[会話ログ] CallId: ${callId}`);
      console.log(`[会話ログ] AIの応答内容: "${aiResponse}"`);
      console.log(`[会話ログ] 分類されたインテント: ${classification.intent}`);
      console.log(`[会話ログ] 次のアクション: ${classification.nextAction}`);
      console.log(`[会話ログ] タイムスタンプ: ${new Date().toISOString()}`);
      console.log('============================================');
      
      // AIの応答を記録
      await CallSession.findByIdAndUpdate(callId, {
        $push: {
          transcript: {
            speaker: 'ai',
            message: aiResponse,
            confidence: 1.0
          }
        }
      });

      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'ai',
        message: aiResponse,
        phoneNumber: toPhoneNumber,
        callId: callId,
        callSid: callSession.twilioCallSid,
        timestamp: new Date()
      });

      // Check if this is a transfer scenario - trigger simple transfer after AI response
      const shouldTriggerTransfer = (
        classification.intent === 'transfer_agreement' ||
        classification.nextAction === 'trigger_transfer' ||
        (aiResponse && (aiResponse.includes('転送いたします') || aiResponse.includes('転送いたしますので')))
      );
      
      if (shouldTriggerTransfer) {
        
        console.log(`[Speech Input] TRANSFER CONFIRMED - Initiating simple transfer for call ${callId}`);
        
        // Play AI response first, then transfer
        await coefontService.getTwilioPlayElement(twiml, aiResponse);
        
        // Initiate simple transfer after AI message
        try {
          await initiateSimpleTransfer(callId, twiml);
          console.log(`[Speech Input] Simple transfer initiated for call ${callId}`);
        } catch (transferError) {
          console.error(`[Speech Input] Transfer failed for call ${callId}:`, transferError);
          
          // Send failure notification
          webSocketService.emitToUser(callSession.userId, 'transfer-failed', {
            callId,
            error: transferError.message,
            timestamp: new Date()
          });
          
          webSocketService.sendTranscriptUpdate(callId, {
            speaker: 'system',
            message: '転送に失敗しました。通話を終了します。',
            timestamp: new Date()
          });
          
          // Get error message from AgentSettings if possible
          let errorMessage = 'システムエラーが発生しました。申し訳ございません。改めてお電話いたします。';
          try {
            const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
            if (agentSettings) {
              const processedMessage = conversationEngine.processTemplate('systemError', {});
              if (processedMessage) {
                errorMessage = processedMessage;
              }
            }
          } catch (getAgentError) {
            console.error('[Speech Input] Error getting systemError message:', getAgentError);
          }
          
          // Fallback to ending call gracefully
          twiml.say({ voice: 'Polly.Mizuki', language: 'ja-JP' }, errorMessage);
          twiml.hangup();
          
          await CallSession.findByIdAndUpdate(callId, {
            status: 'failed',
            endTime: new Date(),
            error: 'Transfer failed: ' + transferError.message,
            callResult: '失敗'
          });
          
          conversationEngine.clearConversation(callId);
        }
        
        return res.type('text/xml').send(twiml.toString());
      }

      // 応答を再生して次の入力を待つ
      if (classification.nextAction === 'end_call' || classification.nextAction === 'respond_and_end' || classification.nextAction === 'apologize_and_end') {
        console.log(`[Speech Input] ENDING CALL - Action: ${classification.nextAction}, Intent: ${classification.intent}`);
        await coefontService.getTwilioPlayElement(twiml, aiResponse);
        
        // 終了前に少し待機（0.7-1.2秒のランダム待機）
        if (classification.nextAction === 'respond_and_end') {
          const waitTime = Math.floor(Math.random() * 0.5 + 0.7); // 0.7-1.2秒
          twiml.pause({ length: waitTime });
        }
        
        twiml.hangup();
        console.log(`[Speech Input] Hangup TwiML generated for call ${callId}`);
        
        // 通話を正常終了 - 会話内容に基づく自動ステータス判定
        const callResult = determineCallResult(classification.intent, classification.nextAction);
        
        await CallTerminationUtils.terminateCall(callId, callResult, null, 'ai_initiated');
        
      } else if (classification.nextAction === 'prepare_closing') {
        // 終話シグナル検出時の処理（「失礼します」等）
        console.log('[Speech Input] Closing signal detected - preparing to end call');
        await coefontService.getTwilioPlayElement(twiml, aiResponse);
        
        // 0.7-1.2秒待機してから終話
        const waitTime = Math.floor(Math.random() * 0.5 + 0.7);
        twiml.pause({ length: waitTime });
        twiml.hangup();
        
        // 通話を正常終了
        await CallTerminationUtils.terminateCall(callId, '正常終了', null, 'normal');
        
      } else {
        console.log('[Speech Input] CONTINUING CONVERSATION - Setting up next Gather');
        console.log(`[Speech Input] Setting up next Gather for continuous conversation`);
        console.log(`[Speech Input] Gather action URL: ${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`);
        const gather = twiml.gather({
          input: 'speech',
          language: 'ja-JP',
          speechModel: 'enhanced',
          speechTimeout: 'auto',  // 自動検出で自牨な会話を実現
          timeout: 10,  // 全体のタイムアウトを10秒に
          action: `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`,
          method: 'POST',
          partialResultCallback: `${process.env.BASE_URL}/api/twilio/voice/partial/${callId}`,
          partialResultCallbackMethod: 'POST'
        });
        await coefontService.getTwilioPlayElement(gather, aiResponse);
        
        // タイムアウト時のフォールバック（無音の場合も会話を継続）
        // CoeFontを使用
        // AgentSettingsからnoAnswerメッセージを取得
        let noAnswerMessage = 'お客様、何かご質問はございますか？';
        try {
          const agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent });
          if (agentSettings) {
            const processedMessage = conversationEngine.processTemplate('noAnswer', {});
            if (processedMessage) {
              noAnswerMessage = processedMessage;
            }
          }
        } catch (error) {
          console.error('[Speech Input] Error getting noAnswer message:', error);
        }
        await coefontService.getTwilioPlayElement(twiml, noAnswerMessage);
        twiml.redirect({
          method: 'POST'
        }, `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}`);
      }
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Error handling speech input:', error);
    // AgentSettingsからシステムエラーメッセージを取得
    let errorMessage = '申し訳ございません。システムエラーが発生しました。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('systemError', {});
        if (processedMessage) {
          errorMessage = processedMessage;
        }
      }
    } catch (getAgentError) {
      console.error('[Speech Input] Error getting systemError message:', getAgentError);
    }
    await coefontService.getTwilioPlayElement(twiml, errorMessage);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// @desc    Handle partial speech results
// @route   POST /api/twilio/voice/partial/:callId
// @access  Public (Twilio webhook)
exports.handlePartialSpeechResult = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { UnstableSpeechResult } = req.body;
  
  // 部分的な認識結果もログに出力
  if (UnstableSpeechResult) {
    console.log(`[会話ログ - 部分認識] CallId: ${callId}, 内容: "${UnstableSpeechResult}"`);
    
    // WebSocketで部分的な認識結果を送信
    webSocketService.sendToCallRoom(callId, 'partial-transcript', {
      speaker: 'customer',
      message: UnstableSpeechResult,
      isPartial: true,
      timestamp: new Date()
    });
  }
  
  res.status(200).send('OK');
});

// @desc    Generate TwiML for joining conference
// @route   POST /api/twilio/voice/conference/join/:conferenceName
// @access  Public (Twilio webhook)
exports.joinConference = asyncHandler(async (req, res) => {
  const { conferenceName } = req.params;
  const twiml = new VoiceResponse();

  // AgentSettingsからエージェント接続メッセージを取得
  let connectionMessage = '会議に接続します。';
  try {
    const agentSettings = await AgentSettings.findOne({});
    if (agentSettings) {
      const processedMessage = conversationEngine.processTemplate('agentConnection', {});
      if (processedMessage) {
        connectionMessage = processedMessage;
      }
    }
  } catch (error) {
    console.error('[Join Conference] Error getting agentConnection message:', error);
  }
  await coefontService.getTwilioPlayElement(twiml, connectionMessage);

  const dial = twiml.dial();
  dial.conference({
    statusCallback: `/api/twilio/conference/events`,
    statusCallbackEvent: 'join leave',
    statusCallbackMethod: 'POST'
  }, conferenceName);

  res.type('text/xml').send(twiml.toString());
});

// @desc    Generate handoff message TwiML
// @route   POST /api/twilio/voice/handoff-message
// @access  Public (Twilio webhook)
exports.generateHandoffMessage = asyncHandler(async (req, res) => {
  const twiml = new VoiceResponse();
  
  // AgentSettingsからエージェント接続メッセージを取得
  let handoffMessage = '担当者におつなぎいたします。少々お待ちください。';
  try {
    const agentSettings = await AgentSettings.findOne({});
    if (agentSettings) {
      const processedMessage = conversationEngine.processTemplate('agentConnection', {});
      if (processedMessage) {
        handoffMessage = processedMessage;
      }
    }
  } catch (error) {
    console.error('[Generate Handoff Message] Error getting agentConnection message:', error);
  }
  await coefontService.getTwilioPlayElement(twiml, handoffMessage);
  
  res.type('text/xml').send(twiml.toString());
});

// @desc    Handle conference events
// @route   POST /api/twilio/conference/events/:callId
// @access  Public (Twilio webhook)
exports.handleConferenceEvents = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const {
    StatusCallbackEvent,
    ConferenceSid,
    CallSid,
    Muted,
    Hold
  } = req.body;

  // CRITICAL: すべてのイベントをログ出力
  console.log(`[ConferenceEvents] Event received: ${StatusCallbackEvent}`);
  console.log(`[ConferenceEvents] CallId: ${callId}, ConferenceSid: ${ConferenceSid}, CallSid: ${CallSid}`);

  try {
    // Conference SIDを保存
    if (StatusCallbackEvent === 'conference-start' || StatusCallbackEvent === 'start') {
      console.log(`[ConferenceEvents] Conference started`);
      await CallSession.findByIdAndUpdate(callId, {
        conferenceSid: ConferenceSid
      });
    }

    // WebSocketでイベントを通知
    webSocketService.sendToCallRoom(callId, 'conference-event', {
      event: StatusCallbackEvent,
      conferenceSid: ConferenceSid,
      callSid: CallSid,
      muted: Muted,
      hold: Hold,
      timestamp: new Date()
    });

    // エージェントが参加した場合
    if ((StatusCallbackEvent === 'participant-join' || StatusCallbackEvent === 'join') && req.body.Coaching === 'false') {
      const callSession = await CallSession.findByIdAndUpdate(callId, {
        status: 'human-connected'
      }, { new: true });

      webSocketService.emitToUser(callSession?.userId, 'call-updated', {
        callId,
        status: 'human-connected'
      });
      
      // 取次完了をトランスクリプトに通知
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: '担当者が接続しました。',
        timestamp: new Date()
      });
    }

    // 参加者が退出した場合（顧客が電話を切った時の処理）
    if (StatusCallbackEvent === 'participant-leave' || StatusCallbackEvent === 'leave') {
      console.log(`[ConferenceEvents] Participant left conference for callId: ${callId}`);

      const callSession = await CallSession.findById(callId).populate('customerId');

      if (!callSession) {
        console.log(`[ConferenceEvents] CallSession not found for callId: ${callId}`);
        return res.status(200).send('OK');
      }

      // 既に完了している場合はスキップ（二重処理防止）
      if (['completed', 'failed'].includes(callSession.status)) {
        console.log(`[ConferenceEvents] Call already ended: ${callSession.status}`);
        return res.status(200).send('OK');
      }

      // 通話時間を計算
      let duration = 0;
      if (callSession.startTime) {
        const endTime = new Date();
        duration = Math.floor((endTime - new Date(callSession.startTime)) / 1000);
      }

      // ステータスを完了に更新
      const updateData = {
        status: 'completed',
        endTime: new Date(),
        duration: duration,
        callResult: callSession.callResult || '成功',
        'handoffDetails.disconnectedAt': new Date()
      };

      await CallSession.findByIdAndUpdate(callId, updateData);
      console.log(`[ConferenceEvents] CallSession updated: status=completed, duration=${duration}s`);

      // 両方の通話を終了（どちらが切断しても相手側も終了）
      try {
        const twilio = require('twilio');
        const client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );

        // 担当者通話を終了
        if (callSession.handoffDetails?.handoffCallSid) {
          try {
            await client.calls(callSession.handoffDetails.handoffCallSid)
              .update({ status: 'completed' });
            console.log(`[ConferenceEvents] Agent call terminated: ${callSession.handoffDetails.handoffCallSid}`);
          } catch (err) {
            console.log(`[ConferenceEvents] Could not terminate agent call: ${err.message}`);
          }
        }

        // 顧客通話を終了
        if (callSession.twilioCallSid) {
          try {
            await client.calls(callSession.twilioCallSid)
              .update({ status: 'completed' });
            console.log(`[ConferenceEvents] Customer call terminated: ${callSession.twilioCallSid}`);
          } catch (err) {
            console.log(`[ConferenceEvents] Could not terminate customer call: ${err.message}`);
          }
        }
      } catch (twilioError) {
        console.error(`[ConferenceEvents] Twilio client error: ${twilioError.message}`);
      }

      // WebSocketで完了通知
      if (callSession.userId) {
        webSocketService.emitToUser(callSession.userId, 'call-status', {
          callId,
          status: 'completed',
          callResult: updateData.callResult,
          duration: duration,
          endReason: 'participant-left',
          timestamp: new Date()
        });

        webSocketService.emitToUser(callSession.userId, 'call-terminated', {
          callId,
          status: 'completed',
          callResult: updateData.callResult,
          duration: duration,
          endReason: 'participant-left',
          timestamp: new Date()
        });

        webSocketService.sendTranscriptUpdate(callId, {
          speaker: 'system',
          message: '通話が終了しました。',
          timestamp: new Date()
        });
      }
    }

    // Conferenceの終了時
    if (StatusCallbackEvent === 'conference-end' || StatusCallbackEvent === 'end') {
      console.log(`[ConferenceEvents] Conference ended for callId: ${callId}`);

      // CallSessionのステータスを完了に更新
      const callSession = await CallSession.findById(callId);
      if (callSession) {
        console.log(`[ConferenceEvents] Current status: ${callSession.status}`);

        // 転送完了として扱う
        callSession.status = 'completed';
        callSession.callResult = callSession.callResult || '成功';
        callSession.endedAt = new Date();

        await callSession.save();
        console.log(`[ConferenceEvents] CallSession updated to completed`);

        // WebSocketで完了通知
        if (global.io && callSession.userId) {
          const eventData = {
            customerId: callSession.customerId?.toString() || callSession.customerId,
            phoneNumber: callSession.phoneNumber,
            status: 'completed',
            callResult: callSession.callResult,
            callId: callSession._id.toString(),
            twilioCallSid: callSession.twilioCallSid
          };
          global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', eventData);
          console.log(`[ConferenceEvents] Emitted callStatusUpdate to user ${callSession.userId}: completed`);
        }
      }

      // 通話終了をトランスクリプトに通知
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: '通話が終了しました。',
        timestamp: new Date()
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling conference event:', error);
    res.status(500).send('Error');
  }
});

// @desc    Handle call status callbacks
// @route   POST /api/twilio/call/status/:callId
// @access  Public (Twilio webhook)
exports.handleCallStatus = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { CallStatus, CallSid, Duration } = req.body;

  console.log(`\n========== TWILIO STATUS CALLBACK ==========`);
  console.log(`[handleCallStatus] CallStatus: ${CallStatus}, CallId: ${callId}, CallSid: ${CallSid}`);
  console.log(`[handleCallStatus] Timestamp: ${new Date().toISOString()}`);
  console.log(`=============================================\n`);

  try {
    const existingSession = await CallSession.findById(callId);

    const updateData = {
      twilioCallSid: CallSid
    };

    // ステータスに応じて更新
    switch (CallStatus) {
      case 'initiated':
      case 'ringing':
        updateData.status = sanitizeStatus('calling');
        break;
      case 'answered':
      case 'in-progress':
        updateData.status = sanitizeStatus('in-progress');

        if (
          !existingSession?.startTime ||
          ['queued', 'calling', 'initiating', 'initiated', 'scheduled'].includes(existingSession?.status)
        ) {
          updateData.startTime = new Date();
          updateData.duration = 0;
        }
        break;
      case 'completed':
        // CRITICAL: 転送中の場合はステータスを変更しない
        // Conference通話が継続中の可能性があるため、Conference 'end' イベントで完了扱いにする
        // ただし、Conferenceが実際に作成されていない場合（転送失敗）は完了扱いにする
        let transferFailedNoConference = false;
        if (existingSession?.status === 'transferring' || existingSession?.status === 'human-connected') {
          // Conference名が設定されている = Conferenceが実際に作成された
          const hasConference = existingSession.handoffDetails?.conferenceName;

          if (hasConference) {
            console.log(`[handleCallStatus] Call in active conference (status: ${existingSession.status}, conference: ${existingSession.handoffDetails.conferenceName}) - skipping status update`);
            console.log(`[handleCallStatus] Conference call is still in progress`);
            // Duration等の情報のみ更新
            const completedAt = new Date();
            let completedDuration = 0;
            if (existingSession?.startTime) {
              const start = new Date(existingSession.startTime);
              completedDuration = Math.max(0, Math.floor((completedAt.getTime() - start.getTime()) / 1000));
            }
            if ((!completedDuration || Number.isNaN(completedDuration)) && Duration) {
              completedDuration = parseInt(Duration);
            }
            updateData.duration = completedDuration;
            // statusは更新しない
            break;
          } else {
            // Conferenceが作成されていない = 転送失敗（例: busy）
            console.log(`[handleCallStatus] Call status is '${existingSession.status}' but no conference created - marking as completed (transfer failed)`);
            updateData.callResult = sanitizeCallResult('失敗'); // 転送失敗
            updateData.endReason = 'transfer_failed';
            transferFailedNoConference = true; // 後続の determineCallResultFromTransfer による上書きを防ぐ
          }
        }

        // 通常のAI通話の場合は完了扱い
        updateData.status = sanitizeStatus('completed');
        const completedAt = new Date();
        updateData.endTime = completedAt;

        let completedDuration = 0;
        if (existingSession?.startTime) {
          const start = new Date(existingSession.startTime);
          completedDuration = Math.max(0, Math.floor((completedAt.getTime() - start.getTime()) / 1000));
        }
        if ((!completedDuration || Number.isNaN(completedDuration)) && Duration) {
          completedDuration = parseInt(Duration);
        }
        updateData.duration = completedDuration;

        // 転送状況に基づいてcallResultを判定
        // ただし no-conference 転送失敗の場合は上書きしない（失敗 を維持）
        if (!transferFailedNoConference) {
          updateData.callResult = determineCallResultFromTransfer(existingSession);
        }

        // 会話エンジンをクリア
        conversationEngine.clearConversation(callId);
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
      case 'cancelled':
        updateData.status = sanitizeStatus('failed');
        const failedAt = new Date();
        updateData.endTime = failedAt;
        updateData.error = `Call ${CallStatus}`;

        // 詳細なエラー情報をログに記録
        console.error(`[CallStatusError] Call ${CallStatus} for session ${callId}:`);
        console.error(`[CallStatusError] Full request body:`, JSON.stringify(req.body, null, 2));
        
        // Twilioエラーコードがある場合は記録
        if (req.body.ErrorCode) {
          updateData.error = `Call ${CallStatus} - Error ${req.body.ErrorCode}: ${req.body.ErrorMessage || 'Unknown error'}`;
          console.error(`[CallStatusError] Twilio Error Code: ${req.body.ErrorCode}`);
          console.error(`[CallStatusError] Twilio Error Message: ${req.body.ErrorMessage}`);
        }

        // 失敗理由に応じたcallResultを設定
        switch (CallStatus) {
          case 'busy':
            updateData.callResult = sanitizeCallResult('拒否');
            updateData.endReason = 'customer_hangup';
            break;
          case 'no-answer':
            updateData.callResult = sanitizeCallResult('不在');
            updateData.endReason = 'timeout';
            break;
          case 'cancelled':
            updateData.callResult = sanitizeCallResult('失敗');
            updateData.endReason = 'manual';
            break;
          case 'failed':
          default:
            updateData.callResult = sanitizeCallResult('失敗');
            updateData.endReason = 'system_error';
            break;
        }

        // 失敗系のステータス（busy, no-answer, cancelled, failed）では
        // 通話が実際に接続されていないため、duration は常に 0
        // ※ 以前は startTime からフォールバック計算していたが、
        //    startTime はセッション作成時にデフォルト設定されるため、
        //    「待機時間」が誤って通話時間として記録されるバグがあった
        updateData.duration = 0;
        // 会話エンジンをクリア
        conversationEngine.clearConversation(callId);
        break;
    }

    const callSession = await CallSession.findByIdAndUpdate(callId, updateData, { new: true }).populate('customerId');

    // 通話が完了または失敗した場合、顧客の最終コール日とステータスを更新
    if (['completed', 'failed'].includes(updateData.status) && callSession?.customerId?._id) {
      const today = new Date();
      const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
      const finalResult = updateData.callResult || callSession.callResult || '失敗';

      await Customer.findByIdAndUpdate(callSession.customerId._id, {
        date: dateStr,
        result: finalResult
      });

      console.log(`[handleCallStatus] Updated customer: date=${dateStr}, result=${finalResult} for customer: ${callSession.customerId._id}`);
    }

    // WebSocketで通知（電話番号情報を含める）
    let phoneNumber = '';
    if (callSession?.customerId?.phone) {
      phoneNumber = callSession.customerId.phone;
    } else {
      // TwilioのFrom/Toから電話番号を取得
      phoneNumber = req.body.To || req.body.From || '';
      if (phoneNumber.startsWith('+81')) {
        phoneNumber = '0' + phoneNumber.substring(3);
      }
    }
    
    console.log(`[handleCallStatus] CallStatus: ${CallStatus}, CallId: ${callId}, Phone: ${phoneNumber}`);
    
    webSocketService.emitToUser(callSession?.userId, 'call-status', {
      callId,
      callSid: CallSid,
      customerId: callSession?.customerId?._id,
      phoneNumber: phoneNumber,
      status: updateData.status || CallStatus,
      callResult: updateData.callResult || callSession?.callResult,
      duration: Duration,
      timestamp: new Date()
    });

    // ダッシュボードの顧客リスト更新用にcallStatusUpdateも送信
    webSocketService.emitToUser(callSession?.userId, 'callStatusUpdate', {
      callId,
      customerId: callSession?.customerId?._id?.toString(),
      phoneNumber: phoneNumber,
      status: updateData.status || CallStatus,
      callResult: updateData.callResult || callSession?.callResult,
      twilioCallSid: CallSid
    });

    // 通話終了時（completed/failed）、callQueueManagerに即座に通知してタイムアウトをクリア
    if (['completed', 'failed'].includes(updateData.status)) {
      console.log(`[handleCallStatus] Notifying callQueueManager of call completion: ${callId}`);

      // タイムアウトハンドラーをクリア
      if (callQueueManager && callQueueManager.timeoutHandlers) {
        const timeouts = callQueueManager.timeoutHandlers.get(callId);
        if (timeouts) {
          if (timeouts.noAnswer) clearTimeout(timeouts.noAnswer);
          if (timeouts.maxDuration) clearTimeout(timeouts.maxDuration);
          callQueueManager.timeoutHandlers.delete(callId);
          console.log(`[handleCallStatus] Cleared timeout handlers for call: ${callId}`);
        }
      }

      // キューの通話完了を通知（次の通話へ進む）
      if (callQueueManager && callQueueManager.onCallCompleted) {
        callQueueManager.onCallCompleted(callId, updateData.status, callSession?.userId);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling call status:', error);
    res.status(500).send('Error');
  }
});

// @desc    Handle recording status
// @route   POST /api/twilio/recording/status/:callId
// @access  Public (Twilio webhook)
exports.handleRecordingStatus = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { RecordingUrl, RecordingSid, RecordingStatus } = req.body;

  console.log('[RecordingStatus] Webhook received:', {
    callId,
    RecordingUrl,
    RecordingSid,
    RecordingStatus
  });

  try {
    if (RecordingStatus === 'completed' && RecordingUrl) {
      console.log('[RecordingStatus] Recording completed, downloading to local storage...');
      
      // Download and save recording locally
      const recordingService = require('../services/recordingService');
      const localPath = await recordingService.downloadAndSaveRecording(
        RecordingUrl, 
        callId, 
        RecordingSid
      );

      // Generate local URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      const localUrl = `${baseUrl}/${localPath}`;

      // Update CallSession with local URL
      await CallSession.findByIdAndUpdate(callId, {
        recordingUrl: localUrl,
        twilioRecordingUrl: RecordingUrl,
        recordingSid: RecordingSid
      });

      console.log('[RecordingStatus] Recording saved locally:', localUrl);

      // WebSocketで通知
      webSocketService.sendToCallRoom(callId, 'recording-available', {
        recordingUrl: localUrl,
        recordingSid: RecordingSid
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling recording status:', error);
    res.status(500).send('Error');
  }
});

// @desc    Generate TwiML for agent joining after handoff
// @route   POST /api/twilio/voice/agent-join/:callId
// @access  Public (Twilio webhook)
exports.agentJoinCall = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const twiml = new VoiceResponse();

  try {
    console.log(`[AgentJoin] Agent joining call for callId: ${callId}`);
    
    const callSession = await CallSession.findById(callId).populate('customerId');
    if (!callSession) {
      console.error(`[AgentJoin] CallSession not found for ${callId}`);
      // AgentSettingsからシステムエラーメッセージを取得
      let errorMessage = 'システムエラーが発生しました。';
      try {
        const agentSettings = await AgentSettings.findOne({});
        if (agentSettings) {
          const processedMessage = conversationEngine.processTemplate('systemError', {});
          if (processedMessage) {
            errorMessage = processedMessage;
          }
        }
      } catch (error) {
        console.error('[AgentJoin] Error getting systemError message:', error);
      }
      twiml.say(errorMessage, { voice: 'Polly.Mizuki', language: 'ja-JP' });
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    console.log(`[AgentJoin] CallSession found:`, {
      id: callSession._id,
      status: callSession.status,
      twilioCallSid: callSession.twilioCallSid,
      customerPhone: callSession.customerId?.phone
    });

    // 担当者に接続メッセージ
    // AgentSettingsからエージェント接続メッセージを取得
    let connectionMessage = 'お客様におつなぎします。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('agentConnection', {});
        if (processedMessage) {
          connectionMessage = processedMessage;
        }
      }
    } catch (error) {
      console.error('[AgentJoin] Error getting agentConnection message:', error);
    }
    twiml.say(connectionMessage, { voice: 'Polly.Mizuki', language: 'ja-JP' });
    
    // Conference転送に対応 - 同じconferenceに参加
    console.log(`[AgentJoin] Joining conference for call ${callId}`);

    const conferenceName = `call-${callId}`;
    const dial = twiml.dial({
      callerId: process.env.TWILIO_PHONE_NUMBER,
      timeout: 30
    });

    // 同じconferenceに参加（顧客とAIが既に参加している）
    dial.conference({
      beep: false,
      statusCallback: `${process.env.BASE_URL}/api/twilio/conference/agent-events/${callId}`,
      statusCallbackEvent: 'start end join leave',
      statusCallbackMethod: 'POST'
    }, conferenceName);

    // CallSessionのステータスを更新
    await CallSession.findByIdAndUpdate(callId, {
      status: 'human-connected',
      'handoffDetails.connectedAt': new Date()
    });

    // WebSocketで通知
    webSocketService.emitToUser(callSession.userId, 'handoff-connected', {
      callId,
      timestamp: new Date()
    });

    console.log(`[AgentJoin] TwiML response sent for agent to join conference: ${conferenceName}`);
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('[AgentJoin] Error:', error);
    // AgentSettingsからシステムエラーメッセージを取得
    let errorMessage = 'システムエラーが発生しました。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('systemError', {});
        if (processedMessage) {
          errorMessage = processedMessage;
        }
      }
    } catch (getAgentError) {
      console.error('[AgentJoin] Error getting systemError message:', getAgentError);
    }
    twiml.say(errorMessage, { voice: 'Polly.Mizuki', language: 'ja-JP' });
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// @desc    Customer joins conference for handoff
// @route   POST /api/twilio/voice/customer-join-conference/:callId
// @access  Public (Twilio webhook)
exports.customerJoinConference = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const twiml = new VoiceResponse();

  try {
    console.log(`[CustomerJoin] Customer joining conference for callId: ${callId}`);
    
    const conferenceName = `handoff-${callId}`;
    
    // 顧客をConferenceに参加させる
    const dial = twiml.dial();
    dial.conference({
      startConferenceOnEnter: false,  // 顧客が参加しても会議を開始しない（担当者を待つ）
      endConferenceOnExit: false,  // 顧客が退出しても会議を終了しない
      beep: false,  // ビープ音なし
      statusCallback: `${process.env.BASE_URL}/api/twilio/conference/customer-status/${callId}`,
      statusCallbackEvent: 'join leave',
      statusCallbackMethod: 'POST'
    }, conferenceName);

    console.log(`[CustomerJoin] TwiML response sent for customer`);
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('[CustomerJoin] Error:', error);
    // AgentSettingsからシステムエラーメッセージを取得
    let errorMessage = 'システムエラーが発生しました。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('systemError', {});
        if (processedMessage) {
          errorMessage = processedMessage;
        }
      }
    } catch (getAgentError) {
      console.error('[CustomerJoin] Error getting systemError message:', getAgentError);
    }
    twiml.say(errorMessage, { voice: 'Polly.Mizuki', language: 'ja-JP' });
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});


// @desc    Generate TwiML for agent joining conference after handoff
// @route   POST /api/twilio/voice/agent-join/:callId
// @access  Public (Twilio webhook)
exports.agentJoinHandoff = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const twiml = new VoiceResponse();

  try {
    const callSession = await CallSession.findById(callId);
    if (!callSession) {
      // AgentSettingsからシステムエラーメッセージを取得
      let errorMessage = 'システムエラーが発生しました。';
      try {
        const agentSettings = await AgentSettings.findOne({});
        if (agentSettings) {
          const processedMessage = conversationEngine.processTemplate('systemError', {});
          if (processedMessage) {
            errorMessage = processedMessage;
          }
        }
      } catch (error) {
        console.error('[AgentJoinHandoff] Error getting systemError message:', error);
      }
      await coefontService.getTwilioPlayElement(twiml, errorMessage);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const conferenceName = `call-${callId}`;
    
    // 担当者に接続メッセージ
    // AgentSettingsからエージェント接続メッセージを取得
    let connectionMessage = 'お客様におつなぎします。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('agentConnection', {});
        if (processedMessage) {
          connectionMessage = processedMessage;
        }
      }
    } catch (error) {
      console.error('[AgentJoinHandoff] Error getting agentConnection message:', error);
    }
    await coefontService.getTwilioPlayElement(twiml, connectionMessage);
    
    // Conference に参加
    const dial = twiml.dial();
    dial.conference({
      startConferenceOnEnter: false,  // 既に Conference は開始済み
      endConferenceOnExit: true,  // 担当者が切ったら終了
      statusCallback: `${process.env.BASE_URL}/api/twilio/conference/agent-events/${callId}`,
      statusCallbackEvent: 'join leave',
      statusCallbackMethod: 'POST'
    }, conferenceName);

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Error in agentJoinHandoff:', error);
    // AgentSettingsからシステムエラーメッセージを取得
    let errorMessage = 'システムエラーが発生しました。';
    try {
      const agentSettings = await AgentSettings.findOne({});
      if (agentSettings) {
        const processedMessage = conversationEngine.processTemplate('systemError', {});
        if (processedMessage) {
          errorMessage = processedMessage;
        }
      }
    } catch (getAgentError) {
      console.error('[AgentJoinHandoff] Error getting systemError message:', getAgentError);
    }
    await coefontService.getTwilioPlayElement(twiml, errorMessage);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// @desc    Generate TwiML for AI bot joining conference
// @route   POST /api/twilio/voice/ai-bot/:callId
// @access  Public (Twilio webhook)
exports.aiJoinConference = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const twiml = new VoiceResponse();

  try {
    const callSession = await CallSession.findById(callId)
      .populate('customerId');

    if (!callSession) {
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const conferenceName = `call-${callId}`;
    
    // Conference に参加してAI応答を開始
    const dial = twiml.dial();
    dial.conference({
      startConferenceOnEnter: false,
      endConferenceOnExit: false,
      statusCallback: `${process.env.BASE_URL}/api/twilio/conference/ai-events/${callId}`,
      statusCallbackEvent: 'join leave mute',
      statusCallbackMethod: 'POST'
    }, conferenceName);
    
    // その後 AI 応答ループに入る
    twiml.redirect({
      method: 'POST'
    }, `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}?isFirst=true`);

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Error in aiJoinConference:', error);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// @desc    Generate wait music for conference
// @route   POST /api/twilio/voice/wait/:callId
// @access  Public (Twilio webhook)
exports.generateWaitMusic = asyncHandler(async (req, res) => {
  const twiml = new VoiceResponse();
  
  // Conference 待機中の音楽
  twiml.play({ loop: 0 }, 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical');
  
  res.type('text/xml').send(twiml.toString());
});

// @desc    Handle conference agent events
// @route   POST /api/twilio/conference/agent-events/:callId
// @access  Public (Twilio webhook)
exports.handleAgentConferenceEvents = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { StatusCallbackEvent, CallSid } = req.body;

  try {
    if (StatusCallbackEvent === 'participant-join') {
      // 担当者が参加したらAIを削除
      const callSession = await CallSession.findById(callId);
      const conferenceName = `call-${callId}`;
      
      // AIの Conference 参加者を見つけて削除
      const participants = await client
        .conferences(conferenceName)
        .participants
        .list();
      
      const aiParticipant = callSession.participants.find(p => p.type === 'ai');
      if (aiParticipant) {
        const aiConferenceParticipant = participants.find(p => p.callSid === aiParticipant.callSid);
        if (aiConferenceParticipant) {
          await client
            .conferences(conferenceName)
            .participants(aiConferenceParticipant.callSid)
            .remove();
        }
      }
      
      // 顧客の保留を解除
      const customerParticipant = callSession.participants.find(p => p.type === 'customer');
      if (customerParticipant && customerParticipant.callSid) {
        await client.calls(customerParticipant.callSid).update({
          twiml: `<Response><Say voice="Polly.Mizuki" language="ja-JP">担当者におつなぎしました。</Say></Response>`
        });
      }
      
      // ステータスを更新
      await CallSession.findByIdAndUpdate(callId, {
        status: 'human-connected',
        'handoffDetails.connectedAt': new Date(),
        $push: {
          participants: {
            type: 'agent',
            callSid: CallSid,
            joinedAt: new Date(),
            isMuted: false,
            isOnHold: false
          }
        }
      });
      
      // WebSocket通知
      webSocketService.emitToUser(callSession.userId, 'handoff-connected', {
        callId,
        agentCallSid: CallSid,
        timestamp: new Date()
      });
    }

    if (StatusCallbackEvent === 'participant-leave') {
      // 担当者が退出したら通話終了
      await CallSession.findByIdAndUpdate(callId, {
        status: 'completed',
        endTime: new Date(),
        'handoffDetails.disconnectedAt': new Date()
      });
      
      // Conference を終了
      const conferenceName = `call-${callId}`;
      try {
        await client.conferences(conferenceName).update({ status: 'completed' });
      } catch (error) {
        console.error('Failed to end conference:', error);
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling agent conference event:', error);
    res.status(500).send('Error');
  }
});

// @desc    Simple transfer function - transfers call directly to agent without conference
// @internal function
async function initiateSimpleTransfer(callId, twiml) {
  console.log(`[SimpleTransfer] Starting simple transfer for call ${callId}`);
  
  try {
    // Get call session
    const callSession = await CallSession.findById(callId).populate('assignedAgent');
    if (!callSession) {
      throw new Error('CallSession not found');
    }
    
    // Check if call is still active
    if (!['ai-responding', 'in-progress', 'initiated'].includes(callSession.status)) {
      throw new Error(`Cannot transfer call in status: ${callSession.status}`);
    }
    
    // Get user's handoff phone number
    let agentPhoneNumber = null;
    let user = null;
    
    // Check if we have an assigned agent first
    if (callSession.assignedAgent) {
      user = callSession.assignedAgent;
      console.log(`[SimpleTransfer] Using assigned agent: ${user._id}`);
    } else {
      // Get default user with handoff number
      const User = require('../models/User');
      user = await User.findOne({ 
        handoffPhoneNumber: { $exists: true, $ne: null } 
      }).sort({ createdAt: -1 }); // Get most recent user with handoff number
      
      if (!user) {
        // Use mock user for development
        user = {
          handoffPhoneNumber: '08070239355',
          getTwilioPhoneNumber: function() {
            return '+818070239355';
          }
        };
        console.log(`[SimpleTransfer] Using mock user for development`);
      } else {
        console.log(`[SimpleTransfer] Using default user: ${user._id}`);
      }
    }
    
    // Get agent phone number
    if (typeof user.getTwilioPhoneNumber === 'function') {
      agentPhoneNumber = user.getTwilioPhoneNumber();
    } else if (user.handoffPhoneNumber) {
      // Convert Japanese number to international format
      agentPhoneNumber = user.handoffPhoneNumber.startsWith('0') 
        ? `+81${user.handoffPhoneNumber.substring(1)}` 
        : `+81${user.handoffPhoneNumber}`;
    } else {
      throw new Error('No agent phone number configured');
    }
    
    // Validate phone number format
    if (!agentPhoneNumber || !agentPhoneNumber.match(/^\+81\d{9,10}$/)) {
      throw new Error(`Invalid phone number format: ${agentPhoneNumber}`);
    }
    
    console.log(`[SimpleTransfer] Agent phone number: ${agentPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`);
    
    // Get the Twilio phone number to use as caller ID
    let fromNumber = process.env.TWILIO_PHONE_NUMBER;
    
    // If user has an assigned Twilio number, use that
    if (user.twilioPhoneNumber && user.twilioPhoneNumberStatus === 'active') {
      fromNumber = user.twilioPhoneNumber;
      console.log(`[SimpleTransfer] Using user's assigned Twilio number: ${fromNumber}`);
    } else {
      console.log(`[SimpleTransfer] Using default Twilio number: ${fromNumber}`);
    }
    
    // Update call session status
    await CallSession.findByIdAndUpdate(callId, {
      status: 'transferring',
      'handoffDetails.requestedAt': new Date(),
      'handoffDetails.handoffPhoneNumber': agentPhoneNumber,
      'handoffDetails.handoffMethod': 'ai-triggered'
    });
    
    
    // Use Conference for 3-way calling to enable AI logging
    // This will connect customer, agent, and AI in the same conference
    const conferenceName = `call-${callId}`;
    const dial = twiml.dial({
      callerId: fromNumber,
      timeout: 30,
      action: `${process.env.BASE_URL}/api/twilio/transfer/status/${callId}`,
      method: 'POST'
    });

    // Connect customer to conference
    dial.conference({
      beep: false,
      statusCallback: `${process.env.BASE_URL}/api/twilio/conference/transfer-events/${callId}`,
      statusCallbackEvent: 'start end join leave',
      statusCallbackMethod: 'POST'
    }, conferenceName);

    // Separately call the agent to join the conference
    await client.calls.create({
      url: `${process.env.BASE_URL}/api/twilio/voice/agent-join/${callId}`,
      to: agentPhoneNumber,
      from: fromNumber,
      statusCallback: `${process.env.BASE_URL}/api/twilio/call/status/${callId}`,
      statusCallbackMethod: 'POST'
    });
    
    console.log(`[SimpleTransfer] Conference transfer TwiML generated - customer and agent will join conference with AI`);
    
    // Send transcript update with phone number
    const systemMessage = {
      speaker: 'system',
      message: '担当者に転送中です。少々お待ちください。',
      phoneNumber: callSession.phoneNumber, // Add phoneNumber from callSession
      timestamp: new Date()
    };
    console.log(`[SimpleTransfer] Sending system message via sendTranscriptUpdate:`, systemMessage);
    console.log(`[SimpleTransfer] Phone number from callSession: ${callSession.phoneNumber}`);
    webSocketService.sendTranscriptUpdate(callId, systemMessage);
    console.log(`[SimpleTransfer] System message sent for callId: ${callId}`);
    
    // Note: No return statement here as twiml is modified by reference
    
  } catch (error) {
    console.error(`[SimpleTransfer] Error in simple transfer:`, error);
    throw error; // Re-throw to be handled by caller
  }
}

// @desc    Handle transfer status callbacks
// @route   POST /api/twilio/transfer/status/:callId
// @access  Public (Twilio webhook)
exports.handleTransferStatus = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { DialCallStatus, DialCallDuration, CallSid } = req.body;
  
  console.log(`[TransferStatus] Transfer status for call ${callId}: ${DialCallStatus}`);
  console.log(`[TransferStatus] Request body:`, req.body);
  
  try {
    let updateData = {};
    let callResult = null;
    
    switch (DialCallStatus) {
      case 'completed':
        updateData = {
          status: 'completed',
          endTime: new Date(),
          'handoffDetails.connectedAt': new Date(),
          'handoffDetails.disconnectedAt': new Date()
        };
        callResult = '成功';

        if (DialCallDuration) {
          updateData.duration = parseInt(DialCallDuration);
        }

        // Mark as transferred but keep conversation engine for logging
        conversationEngine.updateConversationState(callId, {
          isTransferred: true,
          transferCompletedAt: new Date()
        });
        
        console.log(`[TransferStatus] Transfer completed successfully`);
        break;
        
      case 'answered':
        updateData = {
          status: 'human-connected',
          'handoffDetails.connectedAt': new Date()
        };

        // Mark as transferred but keep conversation engine for logging
        console.log(`[TransferStatus] Setting isTransferred flag for call: ${callId}`);
        conversationEngine.updateConversationState(callId, {
          isTransferred: true,
          transferCompletedAt: new Date()
        });
        console.log(`[TransferStatus] isTransferred flag set successfully for call: ${callId}`);

        console.log(`[TransferStatus] Agent answered - transfer successful`);
        break;
        
      case 'busy':
      case 'no-answer':
      case 'failed':
      case 'cancelled':
        updateData = {
          status: 'failed',
          endTime: new Date(),
          error: `Transfer failed: ${DialCallStatus}`
        };

        // 転送失敗の理由に応じて適切なcallResultを設定
        switch (DialCallStatus) {
          case 'no-answer':
            callResult = '不在';
            break;
          case 'busy':
            callResult = '拒否';
            break;
          case 'failed':
          case 'cancelled':
          default:
            callResult = '失敗';
            break;
        }

        // Mark as transfer failed but keep conversation engine for logging
        conversationEngine.updateConversationState(callId, {
          isTransferred: false,
          transferFailedAt: new Date(),
          transferFailReason: DialCallStatus
        });

        console.log(`[TransferStatus] Transfer failed: ${DialCallStatus} -> callResult: ${callResult}`);
        break;
        
      default:
        console.log(`[TransferStatus] Unknown status: ${DialCallStatus}`);
    }
    
    if (callResult) {
      updateData.callResult = callResult;
    }
    
    // Update call session
    const updatedCallSession = await CallSession.findByIdAndUpdate(callId, updateData, { new: true });
    
    
    if (DialCallStatus === 'answered') {
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: '担当者に接続されました。',
        phoneNumber: updatedCallSession?.phoneNumber, // Add phoneNumber
        timestamp: new Date()
      });
    } else if (['busy', 'no-answer', 'failed', 'cancelled'].includes(DialCallStatus)) {
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: `転送に失敗しました: ${DialCallStatus}`,
        phoneNumber: updatedCallSession?.phoneNumber, // Add phoneNumber
        timestamp: new Date()
      });
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('[TransferStatus] Error handling transfer status:', error);
    res.status(500).send('Error');
  }
});

/**
 * Fallback TwiML served to the CUSTOMER leg when a handoff fails (agent
 * did not answer, busy, or call failed). Plays the deterministic
 * handoff-fallback phrase and then hangs up.
 *
 * Wired up in twilioRoutes.js as POST /api/twilio/voice/handoff-failed/:callId.
 *
 * Why this exists:
 *   handleHandoffStatus used to call client.calls(sid).update({ status:
 *   'completed' }) which kills the customer leg cold — no apology, no
 *   acknowledgement that the transfer failed. Codex review (serious #2)
 *   flagged that as poor UX. We now redirect the customer leg to this
 *   endpoint so they hear a polite goodbye before the line goes silent.
 */
exports.handleHandoffFailedTwiML = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  console.log(`[HandoffFailedTwiML] Serving fallback TwiML for callId: ${callId}`);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // Mirror CLOSING_PHRASES.handoff_fallback from mediaStreamController so the
  // text stays in one place if someone tweaks the wording later.
  const FALLBACK_PHRASE =
    '申し訳ございません。担当者が応答できませんでした。改めてご連絡いたします。それでは失礼いたします。';

  // Verify the callId references a real session before doing anything
  // expensive (TTS generation). This shrinks the attack surface flagged by
  // Codex round-2 minor #2 — random callIds get a generic <Hangup/> and
  // never trigger Cartesia/cache lookups.
  let validSession = false;
  try {
    // Mongo ObjectId is 24 hex chars; reject obviously malformed IDs first
    // to avoid throwing a CastError into the Twilio webhook.
    if (typeof callId === 'string' && /^[0-9a-fA-F]{24}$/.test(callId)) {
      const exists = await CallSession.exists({ _id: callId });
      validSession = !!exists;
    }
  } catch (err) {
    console.error('[HandoffFailedTwiML] CallSession lookup error:', err.message);
  }

  if (!validSession) {
    console.warn(`[HandoffFailedTwiML] Unknown callId ${callId}, serving bare hangup`);
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    // Prefer Cartesia TTS for voice consistency; falls back to Polly.Mizuki
    // automatically if Cartesia is unreachable.
    await coefontService.getTwilioPlayElement(twiml, FALLBACK_PHRASE);
  } catch (err) {
    console.error('[HandoffFailedTwiML] TTS error, using Polly fallback:', err.message);
    twiml.say({ voice: 'Polly.Mizuki', language: 'ja-JP' }, FALLBACK_PHRASE);
  }

  // Hangup runs only AFTER the <Play>/<Say> finishes — this is the whole
  // point of using TwiML here instead of a raw API hangup.
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

/**
 * Handle handoff call status callback
 * Called when the agent call (handoff call) status changes
 */
exports.handleHandoffStatus = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const { CallStatus, CallSid, Duration } = req.body;

  console.log(`[HandoffStatus] callId: ${callId}, CallStatus: ${CallStatus}, CallSid: ${CallSid}`);

  try {
    const callSession = await CallSession.findById(callId);

    if (!callSession) {
      console.log(`[HandoffStatus] CallSession not found: ${callId}`);
      return res.status(200).send('OK');
    }

    // 担当者が応答しなかった場合（no-answer, busy, failed）
    if (['no-answer', 'busy', 'failed'].includes(CallStatus)) {
      console.log(`[HandoffStatus] Agent did not answer: ${CallStatus}`);

      // 既に完了している場合はスキップ
      if (['completed', 'failed'].includes(callSession.status)) {
        console.log(`[HandoffStatus] Call already ended: ${callSession.status}`);
        return res.status(200).send('OK');
      }

      // 通話時間を計算
      let duration = 0;
      if (callSession.startTime) {
        const endTime = new Date();
        duration = Math.floor((endTime - new Date(callSession.startTime)) / 1000);
      }

      // ステータスを完了に更新
      const handoffNote = `【自動記録】取次時に担当者が応答しませんでした（${CallStatus}）`;
      const existingNotes = callSession.notes || '';
      const newNotes = existingNotes
        ? `${existingNotes}\n${handoffNote}`
        : handoffNote;

      const updateData = {
        status: 'completed',
        endTime: new Date(),
        duration: duration,
        callResult: '要フォロー',
        notes: newNotes,
        'handoffDetails.disconnectedAt': new Date(),
        'handoffDetails.handoffResult': CallStatus
      };

      await CallSession.findByIdAndUpdate(callId, updateData);
      console.log(`[HandoffStatus] CallSession updated: status=completed, callResult=要フォロー, duration=${duration}s`);

      // 顧客通話を終了する前に、fallback TwiML を流して挨拶してから Hangup する。
      // 以前は status: 'completed' で無音切断していたが、Codex review (serious #2)
      // で「顧客側に挨拶も無く突然切れる」問題を指摘されたため修正。
      // /voice/handoff-failed/:callId が <Play> または <Say> + <Hangup> を返す。
      if (callSession.twilioCallSid) {
        try {
          const baseUrl = getPublicBaseUrl();
          if (!baseUrl) {
            console.warn('[HandoffStatus] No BASE_URL/BASE_URL_PROD configured — skipping graceful redirect, hard hangup only');
            throw new Error('public base URL not configured');
          }
          const fallbackUrl = `${baseUrl}/api/twilio/voice/handoff-failed/${callId}`;

          const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );

          // 顧客 leg を fallback TwiML にリダイレクト。
          // Hangup は TwiML 内の <Hangup/> が再生完了後に自然実行する。
          await client.calls(callSession.twilioCallSid).update({
            method: 'POST',
            url: fallbackUrl
          });
          console.log(`[HandoffStatus] Customer call redirected to fallback TwiML: ${callSession.twilioCallSid} → ${fallbackUrl}`);
        } catch (err) {
          console.error(`[HandoffStatus] Could not redirect customer call (falling back to hard hangup):`, err.message);
          // ネットワーク等で redirect が失敗した場合のみ、従来の hard hangup にフォールバック。
          try {
            const client = twilio(
              process.env.TWILIO_ACCOUNT_SID,
              process.env.TWILIO_AUTH_TOKEN
            );
            await client.calls(callSession.twilioCallSid).update({ status: 'completed' });
            console.log(`[HandoffStatus] Customer call hard-terminated: ${callSession.twilioCallSid}`);
          } catch (err2) {
            console.log(`[HandoffStatus] Hard hangup also failed: ${err2.message}`);
          }
        }
      }

      // WebSocketで完了通知
      if (callSession.userId) {
        webSocketService.emitToUser(callSession.userId, 'call-status', {
          callId,
          status: 'completed',
          callResult: '要フォロー',
          duration: duration,
          endReason: `agent-${CallStatus}`,
          timestamp: new Date()
        });

        webSocketService.emitToUser(callSession.userId, 'call-terminated', {
          callId,
          status: 'completed',
          callResult: '要フォロー',
          duration: duration,
          endReason: `agent-${CallStatus}`,
          timestamp: new Date()
        });

        webSocketService.sendTranscriptUpdate(callId, {
          speaker: 'system',
          message: `担当者が応答しませんでした (${CallStatus})`,
          timestamp: new Date()
        });
      }
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('[HandoffStatus] Error:', error);
    res.status(500).send('Error');
  }
});

// 単体テスト用にエクスポート（関数宣言はホイストされるため module.exports 前で問題なし）
exports.determineCallResultFromTransfer = determineCallResultFromTransfer;

module.exports = exports;
