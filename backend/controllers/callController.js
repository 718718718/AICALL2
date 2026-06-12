const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const CallSession = require('../models/CallSession');
const AgentSettings = require('../models/AgentSettings');
const AgentStatus = require('../models/AgentStatus');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { getByocCallParams } = require('../utils/byocFrom');
const twilio = require('twilio');

// Twilio client initialization
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// @desc    Start a new call with Conference
// @route   POST /api/calls/start
// @access  Private
exports.startCall = asyncHandler(async (req, res, next) => {
  const { customerId, agentId } = req.body;

  // 顧客情報を取得
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return next(new ErrorResponse('Customer not found', 404));
  }

  // エージェント設定を取得
  const agentSettings = await AgentSettings.findOne({ userId: agentId || req.user._id });
  if (!agentSettings) {
    return next(new ErrorResponse('Agent settings not found. Please configure your settings first.', 404));
  }

  // ユーザーIDを取得
  const userId = agentId || req.user._id;
  
  // 通話セッションを作成
  const callSession = await CallSession.create({
    customerId,
    twilioCallSid: 'pending', // Twilioからの実際のSIDで更新される
    status: 'initiated',
    assignedAgent: userId, // ユーザーIDを設定
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

  try {
    // ユーザー情報を取得
    const user = await User.findById(userId);
    
    // ユーザーに割り当てられた電話番号を確認
    if (!user || !user.twilioPhoneNumber || user.twilioPhoneNumberStatus !== 'active') {
      // CallSessionを削除
      await CallSession.findByIdAndDelete(callSession._id);
      
      return next(new ErrorResponse(
        '電話番号が割り当てられていません。運営会社にお問い合わせください。\n' +
        'No phone number assigned to this user. Please contact the administrator.',
        400
      ));
    }
    
    const fromNumber = user.twilioPhoneNumber;
    console.log(`[CallController] Using user's assigned number: ${fromNumber}`);
    
    // Twilioで通話を開始
    // BYOC設定があれば03番号＋BYOCトランク経由に切り替え（未設定なら従来のfromNumber）
    const call = await client.calls.create({
      to: customer.phone,
      ...getByocCallParams(fromNumber),
      url: `${process.env.BASE_URL}/api/twilio/voice/conference/${callSession._id}`,
      statusCallback: `${process.env.BASE_URL}/api/twilio/call/status/${callSession._id}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${process.env.BASE_URL}/api/twilio/recording/status/${callSession._id}`
    });

    // CallSessionを更新
    callSession.twilioCallSid = call.sid;
    callSession.status = 'ai-responding';
    await callSession.save();

    // WebSocketで通話開始を通知（ユーザー専用ルームに送信）
    if (global.io) {
      global.io.to(`user-${userId}`).emit('call-started', {
        callId: callSession._id,
        customerId,
        customerName: customer.name,
        status: 'ai-responding',
        startTime: callSession.startTime
      });
      console.log(`[WebSocket] Emitted call-started to user ${userId}`);
    }

    res.status(201).json({
      success: true,
      data: {
        callId: callSession._id,
        twilioCallSid: call.sid,
        status: callSession.status
      }
    });
  } catch (error) {
    // エラー時はCallSessionを削除
    await CallSession.findByIdAndDelete(callSession._id);
    return next(new ErrorResponse(`Failed to start call: ${error.message}`, 500));
  }
});

// @desc    Get active calls
// @route   GET /api/calls/active
// @access  Private
exports.getActiveCalls = asyncHandler(async (req, res, next) => {
  const activeCalls = await CallSession.getActiveCalls();
  
  // デバッグ: transcriptの内容を確認し、サンプルデータがあれば削除
  for (const call of activeCalls) {
    console.log(`[DEBUG] Call ${call._id} transcript:`, call.transcript);
    
    // サンプルデータやテストデータが含まれている場合はクリア
    if (call.transcript && call.transcript.length > 0) {
      const hasTestData = call.transcript.some(t => 
        t.message && (
          t.message.includes('お電話ありがとうございます') ||
          t.message.includes('株式会社') ||
          t.message.includes('もしもし') ||
          t.message.includes('お世話になっています') ||
          t.message.includes('どのようなご用件')
        )
      );
      
      if (hasTestData) {
        console.log(`[DEBUG] Clearing test data from call ${call._id}`);
        await CallSession.findByIdAndUpdate(call._id, { transcript: [] });
        call.transcript = []; // メモリ上でも更新
      }
    }
  }

  // 各通話の詳細情報を取得
  const callsWithDetails = await Promise.all(
    activeCalls.map(async (call) => {
      // Twilioから最新のステータスを取得（オプション）
      let twilioStatus = null;
      try {
        if (call.twilioCallSid && call.twilioCallSid !== 'pending') {
          const twilioCall = await client.calls(call.twilioCallSid).fetch();
          twilioStatus = twilioCall.status;
        }
      } catch (error) {
        console.error(`Failed to fetch Twilio status for ${call.twilioCallSid}:`, error);
      }

      return {
        ...call.toObject(),
        twilioStatus
      };
    })
  );

  res.status(200).json({
    success: true,
    count: callsWithDetails.length,
    data: callsWithDetails
  });
});

// @desc    Handoff call to human agent
// @route   POST /api/calls/:callId/handoff
// @access  Private
exports.handoffCall = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;
  const { agentId, reason } = req.body;

  // 通話セッションを取得
  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  if (callSession.status !== 'ai-responding') {
    return next(new ErrorResponse('Call cannot be transferred in current state', 400));
  }

  // エージェントの電話番号を取得
  const agentSettings = await AgentSettings.findOne({ userId: agentId || req.user._id });
  if (!agentSettings) {
    return next(new ErrorResponse('Agent settings not found', 404));
  }

  const agentPhoneNumber = agentSettings.getInternationalPhoneNumber();

  // エージェントステータスを更新
  const agentStatus = await AgentStatus.findOne({ userId: agentId || req.user._id });
  if (agentStatus) {
    await agentStatus.updateStatus('on-call', callId);
  }

  try {
    // ユーザー情報を取得して電話番号を確認
    const userId = agentId || req.user._id;
    const user = await User.findById(userId);
    
    if (!user || !user.twilioPhoneNumber || user.twilioPhoneNumberStatus !== 'active') {
      return next(new ErrorResponse(
        '電話番号が割り当てられていません。運営会社にお問い合わせください。\n' +
        'No phone number assigned to this user. Please contact the administrator.',
        400
      ));
    }
    
    const fromNumber = user.twilioPhoneNumber;
    console.log(`[CallController] Using user's assigned number for agent transfer: ${fromNumber}`);
    
    // Conference名
    const conferenceName = `call-${callId}`;

    // エージェントをConferenceに追加
    const agentCall = await client.calls.create({
      to: agentPhoneNumber,
      from: fromNumber,
      url: `${process.env.BASE_URL}/api/twilio/voice/conference/agent/${conferenceName}`,
      statusCallback: `${process.env.BASE_URL}/api/twilio/call/agent-status/${callId}`
    });

    // 通話セッションを更新
    callSession.status = 'transferring';
    callSession.assignedAgent = agentId || req.user._id;
    callSession.handoffTime = new Date();
    callSession.handoffReason = reason || 'Manual handoff';
    await callSession.save();

    // WebSocketで引き継ぎを通知（ユーザー専用ルームに送信）
    if (global.io && callSession.userId) {
      global.io.to(`user-${callSession.userId}`).emit('call-updated', {
        callId: callSession._id,
        status: 'transferring',
        assignedAgent: agentId || req.user._id,
        handoffTime: callSession.handoffTime
      });
      console.log(`[WebSocket] Emitted call-updated to user ${callSession.userId}`);
    }

    // 引き継ぎメッセージを再生（AIから顧客へ）
    const conference = await client.conferences(conferenceName).fetch();
    if (conference) {
      // Conference内でメッセージを再生
      await client.conferences(conferenceName)
        .participants
        .create({
          call: callSession.twilioCallSid,
          announceUrl: `${process.env.BASE_URL}/api/twilio/voice/handoff-message`
        });
    }

    res.status(200).json({
      success: true,
      data: {
        callId: callSession._id,
        status: 'transferring',
        agentCallSid: agentCall.sid
      }
    });
  } catch (error) {
    // エラー時はステータスを戻す
    callSession.status = 'ai-responding';
    await callSession.save();
    
    if (agentStatus) {
      await agentStatus.updateStatus('available');
    }

    return next(new ErrorResponse(`Failed to handoff call: ${error.message}`, 500));
  }
});

// @desc    End call
// @route   POST /api/calls/:callId/end
// @access  Private
exports.endCall = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;
  const { result, notes } = req.body;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  // Twilioで通話を終了
  try {
    if (callSession.twilioCallSid && callSession.twilioCallSid !== 'pending') {
      await client.calls(callSession.twilioCallSid).update({
        status: 'completed'
      });
    }
  } catch (error) {
    console.error(`Failed to end Twilio call: ${error.message}`);
  }

  // 通話セッションを更新
  callSession.status = 'completed';
  callSession.endTime = new Date();
  callSession.callResult = result || '成功';
  callSession.notes = notes;
  callSession.calculateDuration();
  await callSession.save();

  // エージェントステータスを更新
  if (callSession.assignedAgent) {
    const agentStatus = await AgentStatus.findOne({ userId: callSession.assignedAgent });
    if (agentStatus) {
      await agentStatus.updateStatus('available');
      await agentStatus.updateCallStatistics(callSession.duration);
    }
  }

  // WebSocketで通話終了を通知（ユーザー専用ルームに送信）
  if (global.io && callSession.userId) {
    global.io.to(`user-${callSession.userId}`).emit('call-ended', {
      callId: callSession._id,
      result: callSession.callResult,
      duration: callSession.duration
    });
    console.log(`[WebSocket] Emitted call-ended to user ${callSession.userId}`);
  }

  res.status(200).json({
    success: true,
    data: {
      callId: callSession._id,
      status: 'completed',
      duration: callSession.duration,
      result: callSession.callResult
    }
  });
});

// @desc    Get call history
// @route   GET /api/calls/history
// @access  Private
exports.getCallHistory = asyncHandler(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 10, 
    status, 
    result, 
    agentId, 
    customerId,
    startDate,
    endDate 
  } = req.query;

  const query = {};

  // フィルター条件を構築
  if (status) query.status = status;
  if (result) query.callResult = result;
  if (agentId) query.assignedAgent = agentId;
  if (customerId) query.customerId = customerId;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // ページネーション
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await CallSession.countDocuments(query);

  const calls = await CallSession
    .find(query)
    .populate('customerId', 'name company phone')
    .populate('assignedAgent', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(parseInt(limit));

  // ページネーション情報
  const pagination = {
    current: parseInt(page),
    total: Math.ceil(total / limit),
    hasNext: endIndex < total,
    hasPrev: startIndex > 0
  };

  res.status(200).json({
    success: true,
    count: calls.length,
    total,
    pagination,
    data: calls
  });
});

// @desc    Get call details
// @route   GET /api/calls/:callId
// @access  Private
exports.getCallDetails = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;

  const call = await CallSession
    .findById(callId)
    .populate('customerId')
    .populate('assignedAgent', 'firstName lastName email phone');

  if (!call) {
    return next(new ErrorResponse('Call not found', 404));
  }

  res.status(200).json({
    success: true,
    data: call
  });
});

// @desc    Update call transcript
// @route   PUT /api/calls/:callId/transcript
// @access  Private
exports.updateTranscript = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;
  const { speaker, message, confidence } = req.body;

  const call = await CallSession.findById(callId);
  if (!call) {
    return next(new ErrorResponse('Call not found', 404));
  }

  // トランスクリプトに追加
  call.transcript.push({
    speaker,
    message,
    confidence: confidence || 1.0,
    timestamp: new Date()
  });

  await call.save();

  // WebSocketでトランスクリプト更新を通知（ユーザー専用ルームに送信）
  if (global.io && call.userId) {
    global.io.to(`user-${call.userId}`).emit('transcript-update', {
      callId,
      message: {
        speaker,
        message,
        timestamp: new Date()
      }
    });
    console.log(`[WebSocket] Emitted transcript-update to user ${call.userId}`);
  }

  res.status(200).json({
    success: true,
    data: {
      callId,
      transcriptLength: call.transcript.length
    }
  });
});

// @desc    Get call statistics
// @route   GET /api/calls/statistics
// @access  Private
exports.getCallStatistics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, agentId } = req.query;

  const dateRange = {};
  if (startDate) dateRange.start = new Date(startDate);
  if (endDate) dateRange.end = new Date(endDate);

  const stats = await CallSession.getCallStatistics(agentId, dateRange);

  // 追加の統計情報を計算
  const query = {};
  if (agentId) query.assignedAgent = agentId;
  if (dateRange.start || dateRange.end) {
    query.createdAt = {};
    if (dateRange.start) query.createdAt.$gte = dateRange.start;
    if (dateRange.end) query.createdAt.$lte = dateRange.end;
  }

  const totalCalls = await CallSession.countDocuments(query);
  const successfulCalls = await CallSession.countDocuments({ ...query, callResult: '成功' });
  const averageDuration = await CallSession.aggregate([
    { $match: query },
    { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalCalls,
      successfulCalls,
      successRate: totalCalls > 0 ? (successfulCalls / totalCalls * 100).toFixed(2) : 0,
      averageDuration: averageDuration[0]?.avgDuration || 0,
      resultBreakdown: stats
    }
  });
});