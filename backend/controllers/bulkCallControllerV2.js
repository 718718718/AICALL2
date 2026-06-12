const twilioService = require('../services/twilioService');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const AgentSettings = require('../models/AgentSettings');
const webSocketService = require('../services/websocket');

// 通話タイムアウト設定（ミリ秒）
const CALL_TIMEOUT = {
  NO_ANSWER: 30000,     // 30秒: 顧客が応答しない場合
  MAX_DURATION: 300000, // 5分: 最大通話時間
  BETWEEN_CALLS: 3000   // 3秒: 次の通話までの待機時間
};

// 通話キュー管理
class CallQueueManager {
  constructor() {
    this.queue = [];
    this.currentCall = null;
    this.isProcessing = false;
    this.timeoutHandlers = new Map();
  }

  // キューに通話を追加
  addToQueue(callData) {
    this.queue.push(callData);
    if (!this.isProcessing) {
      this.processNextCall();
    }
  }

  // 次の通話を処理
  async processNextCall() {
    if (this.queue.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const callData = this.queue.shift();
    
    try {
      console.log('[CallQueue] Processing call for:', callData.phoneNumber);
      this.currentCall = callData;
      
      // 通話を開始
      await this.initiateCall(callData);
      
      // 次の通話まで待機
      setTimeout(() => {
        this.isProcessing = false;
        this.processNextCall();
      }, CALL_TIMEOUT.BETWEEN_CALLS);
      
    } catch (error) {
      console.error('[CallQueue] Error processing call:', error);
      this.isProcessing = false;
      
      // エラーがあっても次の通話を処理
      setTimeout(() => {
        this.processNextCall();
      }, CALL_TIMEOUT.BETWEEN_CALLS);
    }
  }

  // 通話を開始
  async initiateCall(callData) {
    const { phoneNumber, session, userId } = callData;
    
    try {
      // Twilioで通話を開始
      const call = await twilioService.makeCall(phoneNumber, session._id, userId);
      
      session.twilioCallSid = call.sid;
      session.status = 'calling';
      await session.save();
      
      // WebSocketで通知
      webSocketService.broadcastCallEvent('call-initiated', {
        sessionId: session._id,
        phoneNumber: phoneNumber,
        status: 'calling'
      });
      
      // タイムアウト設定
      this.setupTimeouts(session);
      
    } catch (error) {
      console.error('[CallQueue] Failed to initiate call:', error);
      session.status = 'failed';
      session.error = error.message;
      await session.save();
      
      webSocketService.broadcastCallEvent('call-failed', {
        sessionId: session._id,
        phoneNumber: phoneNumber,
        error: error.message
      });
    }
  }

  // タイムアウト設定
  setupTimeouts(session) {
    // 応答なしタイムアウト
    const noAnswerTimeout = setTimeout(async () => {
      const currentSession = await CallSession.findById(session._id);
      
      // まだcalling状態の場合は無応答として終了
      if (currentSession && currentSession.status === 'calling') {
        console.log('[CallTimeout] No answer for:', session.phoneNumber);
        await this.terminateCall(session._id, 'no-answer');
      }
    }, CALL_TIMEOUT.NO_ANSWER);
    
    // 最大通話時間タイムアウト
    const maxDurationTimeout = setTimeout(async () => {
      const currentSession = await CallSession.findById(session._id);
      
      // まだ通話中の場合は強制終了
      if (currentSession && ['in-progress', 'ai-responding'].includes(currentSession.status)) {
        console.log('[CallTimeout] Max duration reached for:', session.phoneNumber);
        await this.terminateCall(session._id, 'max-duration');
      }
    }, CALL_TIMEOUT.MAX_DURATION);
    
    this.timeoutHandlers.set(session._id.toString(), {
      noAnswer: noAnswerTimeout,
      maxDuration: maxDurationTimeout
    });
  }

  // タイムアウトクリア
  clearTimeouts(sessionId) {
    const timeouts = this.timeoutHandlers.get(sessionId.toString());
    if (timeouts) {
      clearTimeout(timeouts.noAnswer);
      clearTimeout(timeouts.maxDuration);
      this.timeoutHandlers.delete(sessionId.toString());
    }
  }

  // 通話終了処理
  async terminateCall(sessionId, reason) {
    try {
      const session = await CallSession.findById(sessionId);
      if (!session) return;
      
      // タイムアウトクリア
      this.clearTimeouts(sessionId);
      
      // Twilioで通話を終了
      if (session.twilioCallSid) {
        try {
          const client = require('twilio')(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          await client.calls(session.twilioCallSid).update({ status: 'completed' });
        } catch (twilioError) {
          console.error('[CallTerminate] Twilio error:', twilioError);
        }
      }
      
      // セッション更新
      session.status = 'completed';
      session.endTime = new Date();
      session.callResult = reason === 'no-answer' ? '不在' : '成功';
      await session.save();
      
      // WebSocketで通知
      webSocketService.broadcastCallEvent('call-terminated', {
        sessionId: session._id,
        phoneNumber: session.phoneNumber,
        customerId: session.customerId,
        callResult: session.callResult,
        reason: reason
      });
      
      console.log(`[CallTerminate] Call terminated: ${session.phoneNumber} (${reason})`);
      
    } catch (error) {
      console.error('[CallTerminate] Error:', error);
    }
  }
}

// グローバルキューマネージャー
const callQueueManager = new CallQueueManager();

// 一斉通話の開始（順次発信版）
exports.initiateBulkCalls = async (req, res) => {
  console.log('=== Bulk Call Request (Sequential) ===');
  console.log('Request Body:', req.body);
  console.log('User:', req.user);
  
  try {
    const { phoneNumbers, customerIds } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!phoneNumbers || phoneNumbers.length === 0) {
      return res.status(400).json({ 
        error: 'No phone numbers provided' 
      });
    }

    // エージェント設定を取得
    let agentSettings = null;
    if (userId) {
      agentSettings = await AgentSettings.findOne({ userId });
      console.log('[BulkCall] Agent settings:', agentSettings ? 'found' : 'not found');
    }
    
    const createdSessions = [];
    
    // セッションを作成してキューに追加
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      const customerId = customerIds ? customerIds[i] : null;

      // セッション作成
      const sessionData = {
        phoneNumber,
        customerId,
        status: 'queued', // 新しいステータス: キュー待ち
        startTime: new Date(),
        assignedAgent: userId,
      };
      
      // AI設定を追加
      if (agentSettings?.conversationSettings) {
        sessionData.aiConfiguration = {
          companyName: agentSettings.conversationSettings.companyName,
          serviceName: agentSettings.conversationSettings.serviceName,
          representativeName: agentSettings.conversationSettings.representativeName,
          targetDepartment: agentSettings.conversationSettings.targetDepartment,
          serviceDescription: agentSettings.conversationSettings.serviceDescription,
          targetPerson: agentSettings.conversationSettings.targetPerson,
          salesPitch: agentSettings.conversationSettings.salesPitch
        };
      }

      const session = new CallSession(sessionData);
      await session.save();
      createdSessions.push(session);
      
      // キューに追加（順次処理）
      callQueueManager.addToQueue({
        phoneNumber,
        session,
        userId
      });
    }

    // WebSocketで通知
    webSocketService.broadcastCallEvent('bulk-calls-queued', {
      totalCalls: createdSessions.length,
      sessions: createdSessions.map(s => ({
        id: s._id,
        phoneNumber: s.phoneNumber,
        status: s.status
      }))
    });

    res.status(200).json({
      message: `Queued ${createdSessions.length} calls for sequential processing`,
      sessions: createdSessions.map(s => ({
        id: s._id,
        phoneNumber: s.phoneNumber,
        status: s.status
      }))
    });

  } catch (error) {
    console.error('Bulk call error:', error);
    res.status(500).json({ 
      error: 'Failed to initiate bulk calls',
      details: error.message 
    });
  }
};

// 通話ステータス更新のハンドラー
exports.handleCallStatusUpdate = async (req, res) => {
  const { CallStatus, CallSid } = req.body;
  
  try {
    const session = await CallSession.findOne({ twilioCallSid: CallSid });
    if (!session) {
      return res.status(404).send('Session not found');
    }
    
    // ステータス更新
    const previousStatus = session.status;
    
    switch (CallStatus) {
      case 'in-progress':
        session.status = 'in-progress';
        // 応答があったのでno-answerタイムアウトをクリア
        const timeouts = callQueueManager.timeoutHandlers.get(session._id.toString());
        if (timeouts?.noAnswer) {
          clearTimeout(timeouts.noAnswer);
        }

        // 顧客のステータスを「通話中」に更新
        if (session.customerId) {
          try {
            await Customer.findByIdAndUpdate(session.customerId, {
              result: '通話中'
            });
            console.log(`[BulkCallV2] Updated customer status to '通話中' for customer: ${session.customerId}`);
          } catch (error) {
            console.error('[BulkCallV2] Error updating customer status:', error);
          }
        }
        break;
        
      case 'completed':
      case 'failed':
      case 'busy':
      case 'no-answer':
        session.status = 'completed';
        session.endTime = new Date();
        session.callResult = CallStatus === 'completed' ? '成功' :
                           CallStatus === 'no-answer' ? '不在' :
                           CallStatus === 'busy' ? '失敗' : '失敗';
        callQueueManager.clearTimeouts(session._id);
        break;
    }
    
    await session.save();
    
    // WebSocketで通知
    webSocketService.broadcastCallEvent('call-status-update', {
      sessionId: session._id,
      phoneNumber: session.phoneNumber,
      status: session.status,
      callResult: session.callResult
    });
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('[CallStatusUpdate] Error:', error);
    res.status(500).send('Error');
  }
};

// 手動で通話を終了
exports.terminateCall = async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    await callQueueManager.terminateCall(sessionId, 'manual');
    res.status(200).json({ success: true, message: 'Call terminated' });
  } catch (error) {
    console.error('[TerminateCall] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 古いセッションのクリーンアップ
exports.cleanupOldSessions = async (req, res) => {
  try {
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30分前
    
    // 30分以上前の未完了セッションを完了に
    const result = await CallSession.updateMany(
      {
        status: { $in: ['calling', 'queued', 'in-progress', 'ai-responding'] },
        startTime: { $lt: cutoffTime }
      },
      {
        $set: {
          status: 'completed',
          endTime: new Date(),
          callResult: '失敗'
        }
      }
    );
    
    console.log(`[Cleanup] Cleaned up ${result.modifiedCount} stale sessions`);
    
    if (res) {
      res.status(200).json({
        success: true,
        message: `Cleaned up ${result.modifiedCount} stale sessions`
      });
    }
    
    return result;
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    if (res) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
    throw error;
  }
};

module.exports = exports;