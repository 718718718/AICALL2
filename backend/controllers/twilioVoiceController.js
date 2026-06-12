const asyncHandler = require('../middlewares/asyncHandler');
const twilio = require('twilio');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const AgentSettings = require('../models/AgentSettings');
const User = require('../models/User');
const conversationEngine = require('../services/conversationEngine');
const coefontService = require('../services/cartesiaService');
const callTimeoutManager = require('../services/callTimeoutManager');

// TwiML Voice Response helper
const VoiceResponse = twilio.twiml.VoiceResponse;

// @desc    Handle incoming voice call from Twilio
// @route   POST /api/twilio/voice
// @access  Public (Twilio webhook)
exports.handleIncomingCall = asyncHandler(async (req, res) => {
  console.log('============================================');
  console.log('[Incoming Call] NEW CALL RECEIVED');
  console.log('[Incoming Call] From:', req.body.From);
  console.log('[Incoming Call] To:', req.body.To);
  console.log('[Incoming Call] CallSid:', req.body.CallSid);
  console.log('[Incoming Call] CallStatus:', req.body.CallStatus);
  console.log('============================================');
  
  const { From, To, CallSid } = req.body;
  const twiml = new VoiceResponse();

  // 着信を常に拒否
  console.log('[Incoming Call] ========================================');
  console.log('[Incoming Call] REJECTING CALL');
  console.log('[Incoming Call] From:', From);
  console.log('[Incoming Call] ========================================');

  twiml.reject();

  return res.type('text/xml').send(twiml.toString());

  // エラーレスポンスを返す関数
  const sendErrorResponse = async (message, error = null) => {
    console.error('[Incoming Call] ERROR:', message);
    if (error) {
      console.error('[Incoming Call] Error details:', error);
      console.error('[Incoming Call] Stack:', error.stack);
    }
    const errorTwiml = new VoiceResponse();
    // CoeFontを使用（エラー時は同期的に処理）
    try {
      await coefontService.getTwilioPlayElement(errorTwiml, message);
    } catch (e) {
      errorTwiml.say({ voice: 'Polly.Mizuki', language: 'ja-JP' }, message);
    }
    errorTwiml.hangup();
    return res.type('text/xml').send(errorTwiml.toString());
  };

  try {
    // 電話番号から顧客を検索または作成
    let phoneNumber = From;
    // 国際フォーマットから日本のフォーマットに変換
    if (phoneNumber.startsWith('+81')) {
      phoneNumber = '0' + phoneNumber.substring(3);
    }
    
    // CallSessionから会社IDを取得するため、先にCallSessionを確認
    let tempCallSession = await CallSession.findOne({ twilioCallSid: CallSid }).populate('assignedAgent');
    let defaultUserId = 'default-user'; // デフォルトユーザーID
    let defaultCompanyId = null; // デフォルト会社ID

    // CallSessionに紐づいているエージェントからユーザーIDを取得
    if (tempCallSession && tempCallSession.assignedAgent) {
      defaultUserId = tempCallSession.assignedAgent._id;
      if (tempCallSession.assignedAgent.companyId) {
        defaultCompanyId = tempCallSession.assignedAgent.companyId;
      }
    }

    let customer = await Customer.findOne({ phone: phoneNumber });
    if (!customer) {
      // 新規顧客として作成
      const now = new Date();
      customer = await Customer.create({
        userId: defaultUserId,
        customer: '新規顧客',
        company: '未設定',
        phone: phoneNumber,
        date: now.toLocaleDateString('ja-JP'),
        time: now.toLocaleTimeString('ja-JP'),
        duration: '0:00',
        result: '通話中'
      });
      console.log('[Incoming Call] New customer created:', customer._id);
    } else {
      // 既存顧客の場合、companyIdが設定されていなければ更新
      if (!customer.companyId && defaultCompanyId) {
        customer.companyId = defaultCompanyId;
        await customer.save();
      }
      console.log('[Incoming Call] Existing customer found:', customer._id);
    }
    
    // 前で取得した CallSession を使用
    let callSession = tempCallSession;
    
    // エージェント設定を取得
    let agentSettings = null;
    
    if (callSession) {
      console.log('[Incoming Call] Found existing call session:', callSession._id);
      
      // CallSessionに紐づいているユーザーのエージェント設定を取得
      if (callSession.assignedAgent) {
        console.log('[Incoming Call] Looking for agent settings for user:', callSession.assignedAgent._id);
        agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent._id });
      }
      
      // 既存のセッションを更新
      callSession.status = 'in-progress';
      
      // aiConfigurationが既に設定されている場合はそれを使用
      if (!callSession.aiConfiguration && agentSettings) {
        callSession.aiConfiguration = {
          companyName: agentSettings.conversationSettings.companyName,
          serviceName: agentSettings.conversationSettings.serviceName,
          representativeName: agentSettings.conversationSettings.representativeName,
          targetDepartment: agentSettings.conversationSettings.targetDepartment,
          serviceDescription: agentSettings.conversationSettings.serviceDescription,
          targetPerson: agentSettings.conversationSettings.targetPerson,
          salesPitch: agentSettings.conversationSettings.salesPitch
        };
      }
      await callSession.save();
    } else {
      // 新規セッションを作成（通常の着信の場合）
      console.log('[Incoming Call] Creating new call session for CallSid:', CallSid);
      
      // デフォルトのエージェント設定を取得
      if (!agentSettings) {
        console.log('[Incoming Call] Looking for default agent settings...');
        agentSettings = await AgentSettings.findOne();
      }
      
      if (!agentSettings) {
        return sendErrorResponse('エージェント設定が見つかりません。システム管理者にお問い合わせください。');
      }
      
      callSession = await CallSession.create({
        customerId: customer._id,
        userId: agentSettings.userId,  // エージェント設定からuserIdを取得
        twilioCallSid: CallSid,
        status: 'in-progress',
        transcript: [],
        phoneNumber: phoneNumber,
        aiConfiguration: {
          companyName: agentSettings.conversationSettings.companyName,
          serviceName: agentSettings.conversationSettings.serviceName,
          representativeName: agentSettings.conversationSettings.representativeName,
          targetDepartment: agentSettings.conversationSettings.targetDepartment,
          serviceDescription: agentSettings.conversationSettings.serviceDescription,
          targetPerson: agentSettings.conversationSettings.targetPerson,
          salesPitch: agentSettings.conversationSettings.salesPitch
        }
      });
      console.log('[Incoming Call] New call session created:', callSession._id);
    }

    if (!defaultCompanyId && agentSettings && agentSettings.userId) {
      try {
        const agentUser = await User.findById(agentSettings.userId).select('companyId');
        if (agentUser && agentUser.companyId) {
          defaultCompanyId = agentUser.companyId;
        }
        if (defaultUserId === 'default-user') {
          defaultUserId = agentSettings.userId;
        }
      } catch (lookupError) {
        console.error('[Incoming Call] Failed to resolve agent user information:', lookupError.message);
      }
    }
    
    console.log('[Incoming Call] Call session created:', callSession._id);
    
    // WebSocketで通話開始を通知（電話番号を正規化）
    const webSocketService = require('../services/websocket');
    
    // To番号（発信先）を日本国内形式に変換
    let toPhoneNumber = To;
    if (toPhoneNumber.startsWith('+81')) {
      toPhoneNumber = '0' + toPhoneNumber.substring(3);
    }
    
    console.log('[WebSocket] 通話開始通知を送信:', {
      callId: callSession._id.toString(),
      phoneNumber: toPhoneNumber,  // To番号（発信先）を使用
      fromPhone: customer.phone,    // From番号（発信元）も送信
      status: 'in-progress'
    });

    // Feature flag: OpenAI Realtime API vs Legacy Conference mode
    console.log('[Incoming Call] ========== FEATURE FLAG CHECK ==========');
    console.log('[Incoming Call] USE_OPENAI_REALTIME:', process.env.USE_OPENAI_REALTIME);
    console.log('[Incoming Call] Type:', typeof process.env.USE_OPENAI_REALTIME);
    console.log('[Incoming Call] Comparison result:', process.env.USE_OPENAI_REALTIME === 'true');
    console.log('[Incoming Call] ==========================================');

    if (process.env.USE_OPENAI_REALTIME === 'true') {
      // ===== OpenAI Realtime API Mode (Media Streams) =====
      console.log('[Incoming Call] Using OpenAI Realtime API with Media Streams');

      // Connect to Media Streams WebSocket (matching Python sample structure)
      // Use BASE_URL for reliable hostname in production (auto-detects environment)
      const baseUrl = process.env.BASE_URL || `https://${req.headers.host || req.hostname}`;
      const wsBaseUrl = baseUrl.replace(/^https?:/, 'wss:');

      // TEMPORARY: Use simplified endpoint for debugging
      // TODO: Revert to /api/twilio/media-stream/${callSession._id} after testing
      const useSimpleEndpoint = process.env.USE_SIMPLE_MEDIA_STREAM === 'true';
      const streamPath = useSimpleEndpoint
        ? '/api/twilio/media-stream-simple'
        : `/api/twilio/media-stream/${callSession._id}`;

      const streamUrl = `${wsBaseUrl}${streamPath}`;

      console.log('[Incoming Call] Base URL:', baseUrl);
      console.log('[Incoming Call] WS Base URL:', wsBaseUrl);
      console.log('[Incoming Call] Stream Path:', streamPath);
      console.log('[Incoming Call] Full Stream URL:', streamUrl);

      // Add voice guidance before connecting (matching Python sample line 46-54)
      twiml.say({
        voice: 'Polly.Mizuki',
        language: 'ja-JP'
      }, 'AIアシスタントに接続しています。少々お待ちください。');

      twiml.pause({ length: 1 });

      twiml.say({
        voice: 'Polly.Mizuki',
        language: 'ja-JP'
      }, 'お話しください。');

      // Create Connect and append Stream (matching Python sample line 56-58)
      const connect = twiml.connect();
      connect.stream({ url: streamUrl });

      console.log('[Incoming Call] Media Streams TwiML generated');

      // 重い処理を非同期で実行（レスポンス送信後）
      setImmediate(() => {
        // WebSocket通知
        webSocketService.emitToUser(callSession.userId, 'call-status', {
          callId: callSession._id.toString(),
          callSid: CallSid,
          phoneNumber: toPhoneNumber,
          fromPhone: customer.phone,
          status: 'in-progress',
          timestamp: new Date()
        });

        // タイムアウト監視を開始
        callTimeoutManager.startCallTimeout(callSession._id.toString(), 15); // 15分でタイムアウト
      });

    } else {
      // ===== Legacy Conference Mode =====
      console.log('[Incoming Call] Using legacy Conference mode');

      twiml.redirect({
        method: 'POST'
      }, `${process.env.BASE_URL}/api/twilio/voice/conference/${callSession._id}`);

      // 重い処理を非同期で実行（レスポンス送信後）
      setImmediate(() => {
        // WebSocket通知
        webSocketService.emitToUser(callSession.userId, 'call-status', {
          callId: callSession._id.toString(),
          callSid: CallSid,
          phoneNumber: toPhoneNumber,
          fromPhone: customer.phone,
          status: 'in-progress',
          timestamp: new Date()
        });

        // 会話エンジンを初期化
        const callIdString = callSession._id.toString();
        console.log('[Background] Initializing conversation engine');
        conversationEngine.resetConversationForNewCall(callIdString, callSession.aiConfiguration);

        // タイムアウト監視を開始
        callTimeoutManager.startCallTimeout(callIdString, 15); // 15分でタイムアウト
      });

      console.log('[Incoming Call] Conference redirect TwiML generated');
    }
    
    // TwiMLレスポンスを送信（リダイレクトは上で既に追加済み）
    const twimlString = twiml.toString();
    console.log('[Incoming Call] ========== TwiML Response ==========');
    console.log(twimlString);
    console.log('[Incoming Call] ====================================');

    // Validate TwiML before sending
    if (!twimlString || twimlString.length === 0) {
      console.error('[Incoming Call] ERROR: Empty TwiML generated!');
      return sendErrorResponse('TwiML生成エラー');
    }

    res.type('text/xml').send(twimlString);
    
  } catch (error) {
    return sendErrorResponse('システムエラーが発生しました。申し訳ございません。', error);
  }
});

module.exports = exports;
