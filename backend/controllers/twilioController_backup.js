const asyncHandler = require('../middlewares/asyncHandler');
const twilio = require('twilio');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const AgentSettings = require('../models/AgentSettings');
const conversationEngine = require('../services/conversationEngine');
const webSocketService = require('../services/websocket');
const coefontService = require('../services/coefontService');
const CallTerminationUtils = require('../utils/callTerminationUtils');
const callTimeoutManager = require('../services/callTimeoutManager');
const { sanitizeStatus, sanitizeCallResult, sanitizeEndReason } = require('../utils/statusValidator');

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
    console.log(`[TwiML Conference] Using immediate initial message: ${initialMessage}`);
    console.log('[TwiML Conference] Testing CoeFont service...');
    
    // 顧客の発話を先に待つ（挨拶する場合 / 無音の場合の両方に対応）
    console.log(`[TwiML Conference] WAITING FOR CUSTOMER - will speak if silence detected`);

    // Real-time Transcriptionを開始
    const start = twiml.start();
    start.transcription({
      statusCallbackUrl: `${process.env.BASE_URL}/api/twilio/transcription/events/${callId}`,
      statusCallbackMethod: 'POST',
      languageCode: 'ja-JP',
      partialResults: true,
      track: 'both_tracks',
      inboundTrackLabel: 'customer-in',
      outboundTrackLabel: 'ai-out'
    });

    // 顧客の発話を待つGatherを設定（無音の場合AIが話す）
    const gather = twiml.gather({
      input: 'speech',
      language: 'ja-JP',
      speechModel: 'enhanced',
      speechTimeout: 3,  // 3秒間音声を待つ
      timeout: 5,        // 全体で5秒待つ
      action: `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}?isFirst=true`,
      method: 'POST',
      partialResultCallback: `${process.env.BASE_URL}/api/twilio/voice/partial/${callId}`,
      partialResultCallbackMethod: 'POST'
    });

    // 何も話さずに顧客の発話を待機
    // （無音の場合、gatherのtimeoutでhandleSpeechInputに空のSpeechResultが送られる）

    // フォールバック
    twiml.redirect({
      method: 'POST'
    }, `${process.env.BASE_URL}/api/twilio/voice/gather/${callId}?isFirst=true`);
    
    console.log(`[TwiML Conference] Structure: silent wait -> gather -> redirect`);

    // TwiMLを即座に返す（会話エンジン初期化は後で行う）
    const twimlResponse = twiml.toString();
    
    // 会話エンジンを非同期で初期化（レスポンス送信後）
    setImmediate(() => {
      conversationEngine.initializeConversation(callId, callSession.aiConfiguration);
      // 顧客の発話を待つため、systemSpokeFirstはまだfalseのまま
      console.log(`[TwiML Conference] Waiting for customer first - systemSpokeFirst remains false`);
    });

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

    // 初回発話判定: 初回の顧客応答かどうかを判定
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
    
    webSocketService.broadcastCallEvent('call-status', {
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
          webSocketService.broadcastCallEvent('transfer-failed', {
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

  try {
    // Conference SIDを保存
    if (StatusCallbackEvent === 'start') {
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
    if (StatusCallbackEvent === 'join' && req.body.Coaching === 'false') {
      await CallSession.findByIdAndUpdate(callId, {
        status: 'human-connected'
      });

      webSocketService.broadcastCallEvent('call-updated', {
        callId,
        status: 'human-connected'
      });

      // 取次完了をトランスクリプトに通知
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: '担当者が接続しました。',
        timestamp: new Date()
      });

      // Real-time Transcriptionを開始（エージェント用）
      try {
        const transcriptionService = require('../services/transcriptionService');
        await transcriptionService.startTranscription(CallSid, 'agent', callId);
        console.log(`[Conference Events] Started transcription for agent: ${CallSid}`);
      } catch (transcriptionError) {
        console.error('[Conference Events] Failed to start agent transcription:', transcriptionError);
      }
    }
    
    // Conferenceの終了時
    if (StatusCallbackEvent === 'end') {
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

  console.log(`[handleCallStatus] CallStatus: ${CallStatus}, CallId: ${callId}, Phone: ${CallSid}`);

  try {
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
        break;
      case 'completed':
        updateData.status = sanitizeStatus('completed');
        updateData.endTime = new Date();
        if (Duration) {
          updateData.duration = parseInt(Duration);
        }

        // 転送状況に基づいてcallResultを判定
        const callSession = await CallSession.findById(callId);
        updateData.callResult = determineCallResultFromTransfer(callSession);

        // 会話エンジンをクリア
        conversationEngine.clearConversation(callId);
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
      case 'cancelled':
        updateData.status = sanitizeStatus('failed');
        updateData.endTime = new Date();
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
        
        if (Duration) {
          updateData.duration = parseInt(Duration);
        }
        // 会話エンジンをクリア
        conversationEngine.clearConversation(callId);
        break;
    }

    const callSession = await CallSession.findByIdAndUpdate(callId, updateData, { new: true }).populate('customerId');

    // 通話が完了した場合、顧客の最終コール日を更新
    if (CallStatus === 'completed' && callSession?.customerId?._id) {
      const today = new Date();
      const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
      
      await Customer.findByIdAndUpdate(callSession.customerId._id, {
        date: dateStr,
        result: callSession.callResult || '拒否'
      });

      console.log(`[handleCallStatus] Updated customer last call date: ${dateStr} for customer: ${callSession.customerId._id}`);
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
    
    webSocketService.broadcastCallEvent('call-status', {
      callId,
      callSid: CallSid,
      customerId: callSession?.customerId?._id,
      phoneNumber: phoneNumber,
      status: updateData.status || CallStatus,
      callResult: updateData.callResult || callSession?.callResult,
      duration: Duration,
      timestamp: new Date()
    });

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
      const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
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
    webSocketService.broadcastCallEvent('handoff-connected', {
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
      webSocketService.broadcastCallEvent('handoff-connected', {
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

    // WebSocket notification for transfer start
    webSocketService.broadcastCallEvent('transfer-initiated', {
      callId,
      agentPhoneNumber: agentPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      timestamp: new Date()
    });

    // Use Conference for 3-way calling to enable AI logging
    // This will connect customer, agent, and AI in the same conference
    const conferenceName = `call-${callId}`;

    // First, set up dial to conference
    const dial = twiml.dial({
      callerId: fromNumber,
      timeout: 30,
      action: `${process.env.BASE_URL}/api/twilio/transfer/status/${callId}`,
      method: 'POST'
    });

    // Connect customer to conference with speech capture enabled
    dial.conference({
      beep: false,
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
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

    // Send transcript update
    webSocketService.sendTranscriptUpdate(callId, {
      speaker: 'system',
      message: `転送中: ${agentPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`,
      timestamp: new Date()
    });

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
    
    // WebSocket notifications
    webSocketService.broadcastCallEvent('transfer-status', {
      callId,
      status: DialCallStatus,
      callSid: CallSid,
      duration: DialCallDuration,
      timestamp: new Date()
    });
    
    if (DialCallStatus === 'answered') {
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: '担当者に接続されました。',
        timestamp: new Date()
      });
    } else if (['busy', 'no-answer', 'failed', 'cancelled'].includes(DialCallStatus)) {
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: `転送に失敗しました: ${DialCallStatus}`,
        timestamp: new Date()
      });
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('[TransferStatus] Error handling transfer status:', error);
    res.status(500).send('Error');
  }
});

// @desc    Handle Real-time Transcription events
// @route   POST /api/twilio/transcription/events/:callId
// @access  Public (Twilio webhook)
exports.handleTranscriptionEvents = asyncHandler(async (req, res) => {
  const { callId } = req.params;
  const {
    TranscriptionEvent,
    CallSid,
    Transcript,
    IsFinal,
    InboundTrackLabel,
    OutboundTrackLabel,
    ErrorCode,
    ErrorMessage
  } = req.body;

  console.log(`[TranscriptionEvent] Event: ${TranscriptionEvent}, CallId: ${callId}, CallSid: ${CallSid}`);

  try {
    const callSession = await CallSession.findById(callId);
    if (!callSession) {
      console.error(`[TranscriptionEvent] CallSession not found: ${callId}`);
      return res.status(404).send('CallSession not found');
    }

    switch (TranscriptionEvent) {
      case 'transcription-started':
        console.log(`[TranscriptionEvent] Transcription started for call: ${callId}`);
        break;

      case 'transcription-content':
        await handleTranscriptionContent(callId, {
          CallSid,
          Transcript,
          IsFinal,
          InboundTrackLabel,
          OutboundTrackLabel
        });
        break;

      case 'transcription-stopped':
        console.log(`[TranscriptionEvent] Transcription stopped for call: ${callId}`);
        break;

      case 'transcription-error':
        console.error(`[TranscriptionEvent] Transcription error for call ${callId}:`, {
          ErrorCode,
          ErrorMessage
        });
        break;

      default:
        console.warn(`[TranscriptionEvent] Unknown event type: ${TranscriptionEvent}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[TranscriptionEvent] Error handling transcription event:', error);
    res.status(500).send('Error');
  }
});

/**
 * Transcription contentイベントを処理
 * @param {string} callId - Call ID
 * @param {object} eventData - Transcription event data
 */
async function handleTranscriptionContent(callId, eventData) {
  const transcriptionUtils = require('../utils/transcriptionUtils');
  const {
    CallSid,
    Transcript,
    IsFinal,
    InboundTrackLabel,
    OutboundTrackLabel
  } = eventData;

  // 転写結果からトランスクリプトオブジェクトを作成
  const transcriptObj = transcriptionUtils.createTranscriptFromEvent({
    Transcript,
    IsFinal,
    InboundTrackLabel,
    OutboundTrackLabel,
    CallSid
  });

  console.log(`[TranscriptionContent] Speaker: ${transcriptObj.speaker}, Final: ${transcriptObj.isFinal}, Message: "${transcriptObj.message}"`);

  // 会話状態を確認（転送済みの場合でも記録）
  const conversationState = conversationEngine.getConversationState(callId);

  if (conversationState?.isTransferred) {
    console.log(`[TranscriptionContent] Call transferred - logging only: "${transcriptObj.message}"`);
  }

  // データベースに保存（Final結果のみ、またはPartialでも保存する場合）
  if (transcriptObj.isFinal) {
    await CallSession.findByIdAndUpdate(callId, {
      $push: {
        transcript: {
          speaker: transcriptObj.speaker,
          message: transcriptObj.message,
          confidence: transcriptObj.confidence,
          isFinal: transcriptObj.isFinal,
          timestamp: transcriptObj.timestamp
        }
      }
    });
  }

  // WebSocketでリアルタイム更新
  webSocketService.sendTranscriptUpdate(callId, {
    speaker: transcriptObj.speaker,
    message: transcriptObj.message,
    confidence: transcriptObj.confidence,
    isFinal: transcriptObj.isFinal,
    timestamp: transcriptObj.timestamp
  });
}

module.exports = exports;
