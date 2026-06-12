const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const User = require('../models/User');
const twilio = require('twilio');
const webSocketService = require('../services/websocket');
const coefontService = require('../services/cartesiaService');
const { getPublicBaseUrl } = require('../utils/publicUrl');

// Twilio client initialization
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Execute handoff logic (shared between manual and auto handoff)
 * @param {Object} callSession - CallSession document
 * @param {Object} user - User document with handoff phone number
 * @param {String} handoffMethod - 'manual' or 'ai-auto'
 * @param {String} handoffReason - Reason for handoff (optional)
 * @returns {Object} Result with handoffCallSid, conferenceName, etc.
 */
exports.executeHandoffLogic = async (callSession, user, handoffMethod = 'manual', handoffReason = null) => {
  const callId = callSession._id.toString();

  console.log('[Handoff] Executing handoff logic');
  console.log('[Handoff] Method:', handoffMethod);
  console.log('[Handoff] Call ID:', callId);

  try {
    // Check if this is an OpenAI Realtime API call (Media Streams mode)
    const isRealtimeMode = process.env.USE_OPENAI_REALTIME === 'true';
    console.log('[Handoff] Realtime mode:', isRealtimeMode);

    // Note: In Realtime mode, we will disconnect Media Streams AFTER redirect succeeds
    // Disconnecting before redirect causes call to drop

    // ユーザーの取次用電話番号を使用（さらに安全な処理）
    let agentPhoneNumber;
    try {
      if (user.getTwilioPhoneNumber && typeof user.getTwilioPhoneNumber === 'function') {
        agentPhoneNumber = user.getTwilioPhoneNumber();
      } else if (user.handoffPhoneNumber) {
        // 日本の番号を国際形式に変換
        agentPhoneNumber = user.handoffPhoneNumber.startsWith('0')
          ? `+81${user.handoffPhoneNumber.substring(1)}`
          : `+81${user.handoffPhoneNumber}`;
      } else {
        throw new Error('取次用電話番号が設定されていません');
      }
      console.log(`[Handoff] Using user handoff number: ${agentPhoneNumber}`);
    } catch (phoneError) {
      console.error('[Handoff] Error processing phone number:', phoneError);
      return next(new ErrorResponse('取次用電話番号の処理に失敗しました。', 400));
    }

    // 通話セッションを更新（取次開始）
    // モックユーザーの場合はrequestByをnullにする
    const updateData = {
      status: 'transferring',
      'handoffDetails.requestedAt': new Date(),
      'handoffDetails.handoffPhoneNumber': agentPhoneNumber,
      'handoffDetails.handoffMethod': handoffMethod
    };
    
    // モックユーザーでない場合のみrequestByを設定
    const userIdStr = user._id.toString();
    if (!['dev-user-id', 'direct-user-id', 'test-user-id'].includes(userIdStr)) {
      updateData['handoffDetails.requestedBy'] = user._id;
    }
    
    await CallSession.findByIdAndUpdate(callId, updateData);

    // 担当者に電話をかけて、Conference経由で接続
    console.log(`[Handoff] Creating conference call to agent ${agentPhoneNumber}`);
    
    const conferenceName = `handoff-${callId}`;
    
    // 1. 担当者に電話をかける（CoeFont音声を使用）
    const agentMessage = 'お客様からのお電話です。接続します。';
    const agentAudioUrl = await coefontService.generateSpeechUrl(agentMessage);
    
    let agentTwiml;
    if (agentAudioUrl) {
      // CoeFontの音声URLを使用
      agentTwiml = `<Response>
        <Play>${agentAudioUrl}</Play>
        <Dial>
          <Conference
            startConferenceOnEnter="true"
            endConferenceOnExit="true"
            record="record-from-start"
            recordingStatusCallback="${getPublicBaseUrl()}/api/twilio/recording/status/${callId}"
            recordingStatusCallbackMethod="POST"
            statusCallback="${getPublicBaseUrl()}/api/twilio/conference/events/${callId}"
            statusCallbackMethod="POST"
            statusCallbackEvent="start end join leave mute hold">${conferenceName}</Conference>
        </Dial>
      </Response>`;
    } else {
      // フォールバック: Polly.Mizukiを使用
      agentTwiml = `<Response>
        <Say voice="Polly.Mizuki" language="ja-JP">${agentMessage}</Say>
        <Dial>
          <Conference
            startConferenceOnEnter="true"
            endConferenceOnExit="true"
            record="record-from-start"
            recordingStatusCallback="${getPublicBaseUrl()}/api/twilio/recording/status/${callId}"
            recordingStatusCallbackMethod="POST"
            statusCallback="${getPublicBaseUrl()}/api/twilio/conference/events/${callId}"
            statusCallbackMethod="POST"
            statusCallbackEvent="start end join leave mute hold">${conferenceName}</Conference>
        </Dial>
      </Response>`;
    }
    
    // CallSessionからユーザーIDを取得して番号を確認
    if (!callSession.assignedAgent) {
      throw new Error('エージェントが割り当てられていません。運営会社にお問い合わせください。');
    }
    
    const assignedAgentUser = await User.findById(callSession.assignedAgent);
    if (!assignedAgentUser || !assignedAgentUser.twilioPhoneNumber || assignedAgentUser.twilioPhoneNumberStatus !== 'active') {
      throw new Error(
        '電話番号が割り当てられていません。運営会社にお問い合わせください。\n' +
        'No phone number assigned to this user. Please contact the administrator.'
      );
    }
    
    const fromNumber = assignedAgentUser.twilioPhoneNumber;
    console.log(`[Handoff] Using user's assigned number: ${fromNumber}`);
    
    const agentCall = await client.calls.create({
      to: agentPhoneNumber,
      from: fromNumber,
      twiml: agentTwiml,
      timeout: 30,
      statusCallback: `${getPublicBaseUrl()}/api/twilio/handoff-status/${callId}`,
      statusCallbackEvent: ['no-answer', 'busy', 'failed', 'completed']
    });
    
    console.log(`[Handoff] Agent call created: ${agentCall.sid}`);
    
    // 2. 顧客をConferenceに移動
    // Media Streams mode (<Connect><Stream>) では直接TwiML更新できないため、
    // Redirectを使って新しいエンドポイントに誘導する
    if (callSession.twilioCallSid && callSession.twilioCallSid.startsWith('CA')) {
      console.log(`[Handoff] Moving customer to conference using Redirect`);

      // Redirectエンドポイントを使用（Media Streams互換）
      const redirectUrl = `${getPublicBaseUrl()}/api/twilio/handoff-redirect/${callId}`;

      try {
        await client.calls(callSession.twilioCallSid).update({
          url: redirectUrl,
          method: 'POST'
        });
        console.log(`[Handoff] Customer redirected to: ${redirectUrl}`);
      } catch (updateError) {
        console.error(`[Handoff] Error updating call:`, updateError.message);

        // Redirectが失敗した場合でもConference URLを保存（webhook経由で処理）
        await CallSession.findByIdAndUpdate(callId, {
          'handoffDetails.pendingConferenceName': conferenceName,
          'handoffDetails.redirectUrl': redirectUrl
        });

        console.log(`[Handoff] Saved conference details for webhook processing`);
      }
    } else {
      // 担当者への通話をキャンセル
      await client.calls(agentCall.sid).update({ status: 'completed' });
      throw new Error('Invalid call session');
    }

    // 取次詳細を更新
    await CallSession.findByIdAndUpdate(callId, {
      status: 'transferring',
      'handoffDetails.handoffCallSid': agentCall.sid,
      'handoffDetails.conferenceName': conferenceName
    });

    // WebSocketで通知
    webSocketService.emitToUser(callSession.userId, 'handoff-initiated', {
      callId,
      agentId: user._id,
      agentCallSid: agentCall.sid,
      timestamp: new Date()
    });

    // 取次開始時の案内メッセージをトランスクリプトに追加
    const customer = callSession.customerId;
    webSocketService.sendTranscriptUpdate(callId, {
      speaker: 'system',
      message: '担当者に接続中...',
      phoneNumber: customer ? customer.phone : '',
      timestamp: new Date()
    });

    // Return result data
    return {
      callId,
      handoffCallSid: agentCall.sid,
      status: 'connecting',
      conferenceName,
      agentPhoneNumber: agentPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')  // マスク表示
    };

  } catch (error) {
    // エラー時は状態を戻す
    await CallSession.findByIdAndUpdate(callId, {
      status: 'ai-responding',
      $unset: { handoffDetails: 1 }
    });

    throw new Error(`Failed to initiate handoff: ${error.message}`);
  }
};

// @desc    Initiate handoff to human agent
// @route   POST /api/calls/:callId/handoff
// @access  Private
exports.initiateHandoff = asyncHandler(async (req, res, next) => {
  console.log('[Handoff] Starting handoff process');
  console.log('[Handoff] Call ID:', req.params.callId);
  console.log('[Handoff] User:', req.user);

  const { callId } = req.params;

  // req.userが存在することを確認
  if (!req.user || !req.user.id) {
    console.error('[Handoff] req.user or req.user.id is undefined');
    return next(new ErrorResponse('ユーザー認証情報が無効です。', 401));
  }

  const userId = req.user.id;
  console.log('[Handoff] User ID:', userId);

  // 通話セッションを取得
  const callSession = await CallSession.findById(callId)
    .populate('customerId');

  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  // ステータスチェック
  if (!['ai-responding', 'initiated', 'in-progress'].includes(callSession.status)) {
    return next(new ErrorResponse('Cannot handoff call in current status', 400));
  }

  // 既に取次中または人間が対応中の場合
  if (callSession.status === 'transferring' || callSession.status === 'human-connected') {
    return next(new ErrorResponse('Handoff already in progress or completed', 400));
  }

  // ユーザー情報を取得（確実に初期化）
  let user = null;

  try {
    // モックユーザーIDの場合はデータベース検索をスキップ
    if (userId === 'dev-user-id' || userId === 'direct-user-id' || userId === 'test-user-id') {
      console.log('[Handoff] Using mock user for development');
      user = {
        _id: userId,
        handoffPhoneNumber: '08070239355', // 開発環境用の固定番号
        getTwilioPhoneNumber: function() {
          return '+818070239355';
        }
      };
    } else {
      console.log('[Handoff] Looking up real user from database');
      user = await User.findById(userId);
      if (!user) {
        console.error('[Handoff] User not found in database:', userId);
        return next(new ErrorResponse('ユーザーが見つかりません。', 404));
      }
      if (!user.handoffPhoneNumber) {
        console.error('[Handoff] User has no handoff phone number:', userId);
        return next(new ErrorResponse('取次用電話番号が設定されていません。ユーザー情報画面で設定してください。', 400));
      }
    }

    // userが正しく設定されていることを確認
    if (!user) {
      console.error('[Handoff] User initialization failed');
      return next(new ErrorResponse('ユーザー情報の取得に失敗しました。', 500));
    }

    console.log('[Handoff] User successfully initialized:', user._id);
  } catch (userError) {
    console.error('[Handoff] Error during user initialization:', userError);
    return next(new ErrorResponse('ユーザー情報の取得中にエラーが発生しました。', 500));
  }

  try {
    // 共通ロジックを実行
    const result = await exports.executeHandoffLogic(callSession, user, 'manual', null);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Get handoff status
// @route   GET /api/calls/:callId/handoff-status
// @access  Private
exports.getHandoffStatus = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;

  const callSession = await CallSession.findById(callId)
    .populate('handoffDetails.requestedBy', 'firstName lastName email');

  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  const isHandoffAvailable = ['ai-responding', 'initiated', 'in-progress'].includes(callSession.status);
  const handoffInProgress = callSession.status === 'transferring';
  const humanConnected = callSession.status === 'human-connected';

  res.status(200).json({
    success: true,
    data: {
      isHandoffAvailable,
      handoffInProgress,
      humanConnected,
      currentStatus: callSession.status,
      handoffDetails: callSession.handoffDetails
    }
  });
});

// @desc    Cancel handoff
// @route   DELETE /api/calls/:callId/handoff
// @access  Private
exports.cancelHandoff = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  if (callSession.status !== 'transferring') {
    return next(new ErrorResponse('No handoff in progress', 400));
  }

  try {
    // 担当者への通話を終了
    if (callSession.handoffDetails?.handoffCallSid) {
      await client.calls(callSession.handoffDetails.handoffCallSid).update({
        status: 'completed'
      });
    }

    // 顧客の保留を解除してAI対応に戻す
    if (callSession.twilioCallSid) {
      const twiml = `<Response>
        <Say voice="Polly.Mizuki" language="ja-JP">お待たせいたしました。引き続きAIが対応させていただきます。</Say>
        <Redirect method="POST">${getPublicBaseUrl()}/api/twilio/voice/gather/${callId}</Redirect>
      </Response>`;
      
      await client.calls(callSession.twilioCallSid).update({
        twiml: twiml
      });
    }

    // ステータスを戻す
    await CallSession.findByIdAndUpdate(callId, {
      status: 'ai-responding',
      'handoffDetails.disconnectedAt': new Date()
    });

    // WebSocketで通知
    webSocketService.emitToUser(callSession.userId, 'handoff-cancelled', {
      callId,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Handoff cancelled successfully'
    });

  } catch (error) {
    return next(new ErrorResponse(`Failed to cancel handoff: ${error.message}`, 500));
  }
});

// @desc    Update user handoff settings
// @route   PUT /api/users/handoff-settings
// @access  Private
exports.updateHandoffSettings = asyncHandler(async (req, res, next) => {
  const { phoneNumber } = req.body;
  const userId = req.user.id;

  const updateData = {};
  
  if (phoneNumber !== undefined) {
    // 電話番号のバリデーション
    const cleanedNumber = phoneNumber.replace(/[-\s]/g, '');
    if (cleanedNumber && !/^0\d{9,10}$/.test(cleanedNumber)) {
      return next(new ErrorResponse('Invalid Japanese phone number format', 400));
    }
    updateData.handoffPhoneNumber = cleanedNumber;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    updateData,
    { new: true, runValidators: true }
  ).select('handoffPhoneNumber');

  res.status(200).json({
    success: true,
    data: {
      handoffPhoneNumber: user.handoffPhoneNumber ? 
        user.handoffPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null
    }
  });
});

// @desc    Get user handoff settings
// @route   GET /api/users/handoff-settings
// @access  Private
exports.getHandoffSettings = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const user = await User.findById(userId).select('handoffPhoneNumber');

  res.status(200).json({
    success: true,
    data: {
      handoffPhoneNumber: user.handoffPhoneNumber ? 
        user.handoffPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null
    }
  });
});

// @desc    Initiate handoff by phone number
// @route   POST /api/calls/handoff-by-phone
// @access  Private
exports.initiateHandoffByPhone = asyncHandler(async (req, res, next) => {
  const { phoneNumber, callSid } = req.body;
  
  console.log(`[Handoff Debug] Raw request data:`, {
    hasUser: !!req.user,
    userId: req.user ? req.user.id : 'no user',
    userObject: req.user
  });
  
  // In development, create a mock user if not authenticated
  if (!req.user && process.env.NODE_ENV === 'development') {
    console.log(`[Handoff Debug] Creating dev user for development mode`);
    req.user = {
      id: 'dev-user-id',
      _id: 'dev-user-id',
      email: 'dev@example.com'
    };
  }
  
  if (!req.user || !req.user.id) {
    console.log(`[Handoff Debug] Error: User not authenticated`);
    return next(new ErrorResponse('User not authenticated', 401));
  }
  
  const userId = req.user.id;

  console.log(`[Handoff Debug] Request received:`, {
    phoneNumber,
    callSid,
    userId,
    body: req.body
  });

  if (!phoneNumber && !callSid) {
    console.log(`[Handoff Debug] Error: Phone number or callSid is required`);
    return next(new ErrorResponse('Phone number or callSid is required', 400));
  }

  let customer;
  
  // CallSidが提供された場合、それを使って検索
  if (callSid) {
    console.log(`[Handoff Debug] Searching for call session with CallSid: ${callSid}`);
    const sessionByCallSid = await CallSession.findOne({
      twilioCallSid: callSid
    }).populate('customerId');
    
    if (sessionByCallSid && sessionByCallSid.customerId) {
      customer = sessionByCallSid.customerId;
      console.log(`[Handoff Debug] Customer found via CallSid:`, { 
        id: customer._id, 
        phone: customer.phone 
      });
    }
  }
  
  // 電話番号で顧客を検索（CallSidで見つからない場合）
  if (!customer && phoneNumber) {
    // 電話番号を正規化
    let normalizedPhone = phoneNumber;
    if (normalizedPhone.startsWith('+81')) {
      normalizedPhone = '0' + normalizedPhone.substring(3);
    }

    console.log(`[Handoff Debug] Normalized phone: ${normalizedPhone}`);

    // まず顧客を探す
    console.log(`[Handoff Debug] Searching for customer with phone: ${normalizedPhone}`);
    customer = await Customer.findOne({ phone: normalizedPhone });
  }
  
  if (!customer) {
    console.log(`[Handoff Debug] Error: Customer not found`);
    return next(new ErrorResponse('Customer not found', 404));
  }

  console.log(`[Handoff Debug] Customer found:`, { id: customer._id, phone: customer.phone });

  // 進行中の通話セッションを検索（より広い範囲で検索）
  console.log(`[Handoff Debug] Searching for call sessions for customer ${customer._id}...`);
  
  // まず最新のセッションを取得
  let callSession = await CallSession.findOne({
    customerId: customer._id,
    status: { $in: ['ai-responding', 'initiated', 'in-progress', 'calling'] }
  }).sort({ createdAt: -1 }).populate('customerId');
  
  // アクティブなセッションが見つからない場合、最近のcompletedセッションも確認
  if (!callSession) {
    const recentSession = await CallSession.findOne({
      customerId: customer._id,
      status: 'completed',
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // 5分以内
    }).sort({ createdAt: -1 }).populate('customerId');
    
    if (recentSession) {
      console.log(`[Handoff Debug] Found recent completed session, will use it for handoff`);
      callSession = recentSession;
      // ステータスを更新してアクティブにする
      callSession.status = 'in-progress';
      await callSession.save();
    }
  }

  console.log(`[Handoff Debug] Call session search result:`, {
    found: !!callSession,
    callSession: callSession ? {
      id: callSession._id,
      status: callSession.status,
      customerId: callSession.customerId ? callSession.customerId._id : null,
      customerPhone: callSession.customerId ? callSession.customerId.phone : null,
      createdAt: callSession.createdAt
    } : null
  });

  if (!callSession) {
    console.log(`[Handoff Debug] Error: No active call session found for customer`);
    return next(new ErrorResponse('現在進行中の通話がありません。通話中にのみ取次が可能です。', 404));
  }

  // ユーザー情報を取得（開発環境のモックユーザーをスキップ）
  console.log(`[Handoff Debug] Getting user info for userId: ${userId}`);
  
  let user = null;
  // モックユーザーIDの場合はデータベース検索をスキップ
  if (userId === 'dev-user-id' || userId === 'direct-user-id' || userId === 'test-user-id') {
    console.log(`[Handoff Debug] Using mock user for development`);
    user = {
      _id: userId,
      handoffPhoneNumber: '08070239355', // 開発環境用の固定番号
      getTwilioPhoneNumber: function() {
        return '+818070239355';
      }
    };
  } else {
    user = await User.findById(userId);
    if (!user || !user.handoffPhoneNumber) {
      console.log(`[Handoff Debug] Error: User does not have handoff phone number configured`);
      return next(new ErrorResponse('取次用電話番号が設定されていません。ユーザー情報画面で設定してください。', 400));
    }
  }
  
  console.log(`[Handoff Debug] User found:`, {
    found: !!user,
    userId: user ? user._id : null,
    hasHandoffPhone: user ? !!user.handoffPhoneNumber : null,
    handoffPhone: user && user.handoffPhoneNumber ? user.handoffPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null
  });

  // userが正しく設定されていることを確認
  if (!user) {
    console.error('[Handoff Debug] CRITICAL: User is null after initialization');
    return next(new ErrorResponse('ユーザー情報の取得に失敗しました。', 500));
  }

  // 取次先電話番号の確認（モックユーザー以外）
  if (!['dev-user-id', 'direct-user-id', 'test-user-id'].includes(userId) && !user.handoffPhoneNumber) {
    console.log(`[Handoff Debug] Error: User does not have handoff phone number configured`);
    return next(new ErrorResponse('取次用電話番号が設定されていません。ユーザー情報画面で設定してください。', 400));
  }

  try {
    // Note: In Realtime mode, we will disconnect Media Streams AFTER redirect succeeds
    // (in handoffRedirectController). Disconnecting before redirect causes call to drop

    // ユーザーの取次用電話番号を使用（安全な処理）
    let agentPhoneNumber;
    if (user.getTwilioPhoneNumber && typeof user.getTwilioPhoneNumber === 'function') {
      agentPhoneNumber = user.getTwilioPhoneNumber();
    } else if (user.handoffPhoneNumber) {
      // 日本の番号を国際形式に変換
      agentPhoneNumber = user.handoffPhoneNumber.startsWith('0')
        ? `+81${user.handoffPhoneNumber.substring(1)}`
        : `+81${user.handoffPhoneNumber}`;
    } else {
      throw new Error('取次用電話番号が設定されていません');
    }
    console.log(`[Handoff] Using user handoff number: ${agentPhoneNumber}`);

    // 通話セッションを更新（取次開始）
    // モックユーザーの場合はrequestByをnullにする
    const updateData = {
      status: 'transferring',
      'handoffDetails.requestedAt': new Date(),
      'handoffDetails.handoffPhoneNumber': agentPhoneNumber,
      'handoffDetails.handoffMethod': 'manual'
    };
    
    // モックユーザーでない場合のみrequestByを設定
    const userIdStr = user._id.toString();
    if (!['dev-user-id', 'direct-user-id', 'test-user-id'].includes(userIdStr)) {
      updateData['handoffDetails.requestedBy'] = user._id;
    }
    
    await CallSession.findByIdAndUpdate(callSession._id, updateData);

    // 担当者に電話をかけて、Conference経由で接続
    console.log(`[Handoff] Creating conference call to agent ${agentPhoneNumber}`);
    
    const conferenceName = `handoff-${callSession._id}`;
    
    // 1. 担当者に電話をかける（CoeFont音声を使用）
    const agentMessage = 'お客様からのお電話です。接続します。';
    const agentAudioUrl = await coefontService.generateSpeechUrl(agentMessage);
    
    let agentTwiml;
    if (agentAudioUrl) {
      // CoeFontの音声URLを使用
      agentTwiml = `<Response>
        <Play>${agentAudioUrl}</Play>
        <Dial>
          <Conference
            startConferenceOnEnter="true"
            endConferenceOnExit="true"
            record="record-from-start"
            recordingStatusCallback="${getPublicBaseUrl()}/api/twilio/recording/status/${callSession._id}"
            recordingStatusCallbackMethod="POST"
            statusCallback="${getPublicBaseUrl()}/api/twilio/conference/events/${callSession._id}"
            statusCallbackMethod="POST"
            statusCallbackEvent="start end join leave mute hold">${conferenceName}</Conference>
        </Dial>
      </Response>`;
    } else {
      // フォールバック: Polly.Mizukiを使用
      agentTwiml = `<Response>
        <Say voice="Polly.Mizuki" language="ja-JP">${agentMessage}</Say>
        <Dial>
          <Conference
            startConferenceOnEnter="true"
            endConferenceOnExit="true"
            record="record-from-start"
            recordingStatusCallback="${getPublicBaseUrl()}/api/twilio/recording/status/${callSession._id}"
            recordingStatusCallbackMethod="POST"
            statusCallback="${getPublicBaseUrl()}/api/twilio/conference/events/${callSession._id}"
            statusCallbackMethod="POST"
            statusCallbackEvent="start end join leave mute hold">${conferenceName}</Conference>
        </Dial>
      </Response>`;
    }
    
    // CallSessionからユーザーIDを取得して番号を確認
    if (!callSession.assignedAgent) {
      throw new Error('エージェントが割り当てられていません。運営会社にお問い合わせください。');
    }
    
    const assignedAgentUser = await User.findById(callSession.assignedAgent);
    if (!assignedAgentUser || !assignedAgentUser.twilioPhoneNumber || assignedAgentUser.twilioPhoneNumberStatus !== 'active') {
      throw new Error(
        '電話番号が割り当てられていません。運営会社にお問い合わせください。\n' +
        'No phone number assigned to this user. Please contact the administrator.'
      );
    }
    
    const fromNumber = assignedAgentUser.twilioPhoneNumber;
    console.log(`[Handoff] Using user's assigned number: ${fromNumber}`);
    
    const agentCall = await client.calls.create({
      to: agentPhoneNumber,
      from: fromNumber,
      twiml: agentTwiml,
      timeout: 30,
      statusCallback: `${getPublicBaseUrl()}/api/twilio/handoff-status/${callSession._id}`,
      statusCallbackEvent: ['no-answer', 'busy', 'failed', 'completed']
    });

    console.log(`[Handoff] Agent call created: ${agentCall.sid}`);

    // 2. 顧客をConferenceに移動
    // Media Streams mode (<Connect><Stream>) では直接TwiML更新できないため、
    // Redirectを使って新しいエンドポイントに誘導する
    if (callSession.twilioCallSid && callSession.twilioCallSid.startsWith('CA')) {
      console.log(`[Handoff] Moving customer to conference using Redirect`);

      // Redirectエンドポイントを使用（Media Streams互換）
      const redirectUrl = `${getPublicBaseUrl()}/api/twilio/handoff-redirect/${callSession._id}`;

      try {
        await client.calls(callSession.twilioCallSid).update({
          url: redirectUrl,
          method: 'POST'
        });
        console.log(`[Handoff] Customer redirected to: ${redirectUrl}`);
      } catch (updateError) {
        console.error(`[Handoff] Error updating call:`, updateError.message);

        // Redirectが失敗した場合でもConference URLを保存（webhook経由で処理）
        await CallSession.findByIdAndUpdate(callSession._id, {
          'handoffDetails.pendingConferenceName': conferenceName,
          'handoffDetails.redirectUrl': redirectUrl
        });

        console.log(`[Handoff] Saved conference details for webhook processing`);
      }
    } else {
      console.log(`[Handoff] Invalid or missing Twilio CallSid: ${callSession.twilioCallSid}`);
      // 担当者への通話をキャンセル
      try {
        await client.calls(agentCall.sid).update({ status: 'completed' });
      } catch (cancelError) {
        console.error(`[Handoff] Error cancelling agent call:`, cancelError.message);
      }
      throw new Error('Invalid call session');
    }

    // 取次詳細を更新
    await CallSession.findByIdAndUpdate(callSession._id, {
      status: 'transferring',
      'handoffDetails.handoffCallSid': agentCall.sid,
      'handoffDetails.conferenceName': conferenceName
    });

    // WebSocketで通知
    webSocketService.emitToUser(callSession.userId, 'handoff-initiated', {
      callId: callSession._id,
      agentId: userId,
      agentCallSid: agentCall.sid,
      conferenceName: conferenceName,
      timestamp: new Date()
    });

    // 取次開始時の案内メッセージをトランスクリプトに追加
    webSocketService.sendTranscriptUpdate(callSession._id, {
      speaker: 'system',
      message: '担当者に接続中...',
      phoneNumber: customer.phone,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      data: {
        callId: callSession._id,
        handoffCallSid: agentCall.sid,
        status: 'connecting',
        agentPhoneNumber: agentPhoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      }
    });

  } catch (error) {
    // エラー時は状態を戻す
    await CallSession.findByIdAndUpdate(callSession._id, {
      status: 'ai-responding',
      $unset: { handoffDetails: 1 }
    });

    return next(new ErrorResponse(`Failed to initiate handoff: ${error.message}`, 500));
  }
});

module.exports = exports;