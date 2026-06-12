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
    // ユーザーごとのキュー状態を保持（グローバルキューから変更）
    this.userQueues = new Map(); // Map<userId, { queue, currentCall, isProcessing, isStopped }>
    this.timeoutHandlers = new Map();
    this.callCompletionHandlers = new Map(); // 通話完了待機用
    this.recentCalls = new Map(); // 最近の発信記録 {phoneNumber: timestamp}
  }

  // ユーザーごとのキュー状態を取得/初期化
  getUserQueue(userId) {
    const userIdStr = userId?.toString() || 'unknown';
    if (!this.userQueues.has(userIdStr)) {
      this.userQueues.set(userIdStr, {
        queue: [],
        currentCall: null,
        isProcessing: false,
        isStopped: false
      });
    }
    return this.userQueues.get(userIdStr);
  }

  // キューに通話を追加
  addToQueue(callData, userId) {
    const userQueue = this.getUserQueue(userId);
    userQueue.queue.push(callData);
    console.log(`[CallQueue] User ${userId}: Added to queue. Queue size: ${userQueue.queue.length}, Processing: ${userQueue.isProcessing}`);
    if (!userQueue.isProcessing) {
      this.processNextCall(userId);
    }
  }

  // 一括でキューに追加（新規メソッド）
  addBulkToQueue(callDataArray, userId) {
    if (!Array.isArray(callDataArray) || callDataArray.length === 0) {
      console.log('[CallQueue] No data to add to queue');
      return;
    }

    const userQueue = this.getUserQueue(userId);
    const previousSize = userQueue.queue.length;
    userQueue.queue.push(...callDataArray);
    console.log(`[CallQueue] User ${userId}: Bulk added ${callDataArray.length} calls. Queue size: ${previousSize} -> ${userQueue.queue.length}`);

    // 処理中でない場合は処理を開始
    if (!userQueue.isProcessing) {
      console.log(`[CallQueue] User ${userId}: Starting queue processing...`);
      this.processNextCall(userId);
    } else {
      console.log(`[CallQueue] User ${userId}: Already processing, new calls will be processed after current call`);
    }
  }

  // 次の通話を処理
  async processNextCall(userId) {
    const userQueue = this.getUserQueue(userId);

    if (userQueue.isProcessing) {
      console.log(`[CallQueue] User ${userId}: Already processing a call, skipping`);
      return;
    }

    // 停止要求がある場合は処理しない
    if (userQueue.isStopped) {
      console.log(`[CallQueue] User ${userId}: Stopped by user - not processing next call`);
      userQueue.isProcessing = false;
      userQueue.currentCall = null;
      userQueue.isStopped = false; // フラグをリセット

      // WebSocketでキュー停止を通知（ユーザー専用）
      webSocketService.emitToUser(userId, 'bulk-queue-update', {
        remaining: 0,
        processing: false
      });
      return;
    }

    if (userQueue.queue.length === 0) {
      console.log(`[CallQueue] User ${userId}: No more calls in queue - all calls completed`);
      userQueue.currentCall = null;
      userQueue.isProcessing = false;

      // WebSocketでキュー更新を通知（完了）（ユーザー専用）
      webSocketService.emitToUser(userId, 'bulk-queue-update', {
        remaining: 0,
        processing: false
      });
      return;
    }

    userQueue.isProcessing = true;
    const callData = userQueue.queue.shift();

    // 【追加】処理開始をもってstartTimeを更新（ここから5分のカウントダウン開始）
    if (callData.session) {
      try {
        callData.session.startTime = new Date();
        await callData.session.save();
        console.log(`[CallQueue] User ${userId}: Updated startTime for session ${callData.session._id}`);
      } catch (e) {
        console.error(`[CallQueue] Failed to update startTime for ${callData.session._id}`, e);
      }
    }

    try {
      console.log(`[CallQueue] User ${userId}: ========== Processing Call ==========`);
      console.log(`[CallQueue] User ${userId}: Phone: ${callData.phoneNumber}`);
      console.log(`[CallQueue] User ${userId}: Remaining in queue: ${userQueue.queue.length}`);
      userQueue.currentCall = callData;

      // WebSocketでキュー更新を通知（ユーザー専用）
      webSocketService.emitToUser(userId, 'bulk-queue-update', {
        remaining: userQueue.queue.length,
        processing: true
      });

      // 通話を開始して完了を待つ
      await this.initiateCall(callData);

      // この通話の完了を待つためのPromiseを作成
      await this.waitForCallCompletion(callData.session._id);

    } catch (error) {
      console.error(`[CallQueue] User ${userId}: Error processing call:`, error);
      // エラーが発生した通話のセッションを失敗状態に更新
      try {
        if (callData && callData.session) {
          callData.session.status = 'failed';
          callData.session.endTime = new Date();
          callData.session.error = error.message;
          await callData.session.save();

          // ユーザー専用で通知
          webSocketService.emitToUser(userId, 'call-failed', {
            sessionId: callData.session._id,
            phoneNumber: callData.phoneNumber,
            error: error.message
          });
        }
      } catch (updateError) {
        console.error(`[CallQueue] User ${userId}: Failed to update error status:`, updateError);
      }
    } finally {
      // 通話が完了したら次の通話まで3秒待機
      console.log(`[CallQueue] User ${userId}: Call completed. Queue has ${userQueue.queue.length} calls remaining`);

      if (userQueue.queue.length > 0) {
        console.log(`[CallQueue] User ${userId}: Waiting 3 seconds before next call...`);
      } else {
        console.log(`[CallQueue] User ${userId}: No more calls in queue`);
      }

      setTimeout(() => {
        userQueue.isProcessing = false;
        userQueue.currentCall = null;
        // キューに残りがある限り処理を継続
        if (userQueue.queue.length > 0) {
          this.processNextCall(userId);
        } else {
          // キューが空になったので完了通知を送る（ユーザー専用）
          console.log(`[CallQueue] User ${userId}: Queue empty after call completion`);
          webSocketService.emitToUser(userId, 'bulk-queue-update', {
            remaining: 0,
            processing: false
          });
        }
      }, CALL_TIMEOUT.BETWEEN_CALLS);
    }
  }

  // 通話完了を待つ
  waitForCallCompletion(sessionId) {
    return new Promise((resolve) => {
      const sessionIdStr = sessionId.toString();

      const checkCompletion = async () => {
        try {
          const session = await CallSession.findById(sessionId);
          if (!session || ['completed', 'failed', 'cancelled'].includes(session.status)) {
            console.log(`[CallQueue] Call ${sessionId} completed with status: ${session?.status}`);
            this.cleanupCompletionHandler(sessionIdStr);
            resolve();
          }
        } catch (dbError) {
          console.error(`[CallQueue] Database error while checking completion for ${sessionId}:`, dbError);
          // DB接続エラーの場合は一時的にスキップし、次回チェックを続行
        }
      };

      // 1秒ごとに通話状態をチェック
      const intervalId = setInterval(checkCompletion, 1000);

      // 最大待機時間後は強制的に次へ
      const timeoutId = setTimeout(() => {
        console.log(`[CallQueue] Call ${sessionId} timeout, moving to next`);
        this.cleanupCompletionHandler(sessionIdStr);
        resolve();
      }, CALL_TIMEOUT.MAX_DURATION + 10000); // 少し余裕を持たせる

      // ハンドラーとresolve関数を保存（onCallCompletedから解決できるようにする）
      this.callCompletionHandlers.set(sessionIdStr, {
        intervalId,
        timeoutId,
        resolve
      });
    });
  }

  // 完了待機ハンドラーのクリーンアップ
  cleanupCompletionHandler(sessionIdStr) {
    const handlers = this.callCompletionHandlers.get(sessionIdStr);
    if (handlers) {
      clearInterval(handlers.intervalId);
      clearTimeout(handlers.timeoutId);
      this.callCompletionHandlers.delete(sessionIdStr);
    }
  }

  // Twilioからのステータスコールバックで通話完了を即座に通知
  // 注: processNextCallはfinallyブロックから呼ばれるため、ここではPromiseを解決するのみ
  onCallCompleted(sessionId, status, userId) {
    const sessionIdStr = sessionId.toString();
    console.log(`[CallQueue] User ${userId}: onCallCompleted called: ${sessionIdStr}, status: ${status}`);

    const userQueue = this.getUserQueue(userId);

    // 現在の通話でなければ無視
    if (!userQueue.currentCall || userQueue.currentCall.session._id.toString() !== sessionIdStr) {
      console.log(`[CallQueue] User ${userId}: Not current call, ignoring: ${sessionIdStr}`);
      return;
    }

    // タイムアウトをクリア
    this.clearTimeouts(sessionId);

    // 待機中のPromiseを解決してfinallyブロックへ制御を移す
    const handlers = this.callCompletionHandlers.get(sessionIdStr);
    if (handlers && handlers.resolve) {
      console.log(`[CallQueue] User ${userId}: Resolving wait promise via callback for ${sessionIdStr}`);
      handlers.resolve();
    }

    // 完了ハンドラーをクリーンアップ（ポーリングを停止）
    this.cleanupCompletionHandler(sessionIdStr);

    console.log(`[CallQueue] User ${userId}: Call ${sessionIdStr} completed via Twilio callback with status: ${status}`);
    // processNextCallはfinallyブロックから呼ばれるため、ここでは呼ばない
  }

  // 通話を開始
  async initiateCall(callData) {
    const { phoneNumber, session, userId } = callData;

    try {
      // 同一番号への短時間発信チェック
      const lastCallTime = this.recentCalls.get(phoneNumber);
      const now = Date.now();
      const MIN_INTERVAL = 30000; // 30秒間隔を強制

      if (lastCallTime && (now - lastCallTime) < MIN_INTERVAL) {
        const waitTime = MIN_INTERVAL - (now - lastCallTime);
        console.log(`[CallQueue] Same number called recently. Waiting ${Math.ceil(waitTime / 1000)} seconds for ${phoneNumber}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // 発信記録を更新
      this.recentCalls.set(phoneNumber, Date.now());

      // 古い記録をクリーンアップ（1時間以上前の記録を削除）
      for (const [phone, timestamp] of this.recentCalls.entries()) {
        if (Date.now() - timestamp > 3600000) { // 1時間
          this.recentCalls.delete(phone);
        }
      }

      // Twilioで通話を開始
      const call = await twilioService.makeCall(phoneNumber, session._id, userId);

      session.twilioCallSid = call.sid;
      session.status = 'calling';
      await session.save();

      // WebSocketで通知（ユーザー専用）
      if (userId) {
        webSocketService.emitToUser(userId, 'call-initiated', {
          callId: session._id,
          sessionId: session._id,
          phoneNumber: phoneNumber,
          customerId: session.customerId, // 顧客IDを追加
          status: 'initiated'
        });
      }

      // タイムアウト設定
      this.setupTimeouts(session);

    } catch (error) {
      console.error('[CallQueue] Failed to initiate call:', error);
      session.status = 'failed';
      session.error = error.message;
      await session.save();

      // ユーザー専用で通知
      if (userId) {
        webSocketService.emitToUser(userId, 'call-failed', {
          sessionId: session._id,
          phoneNumber: phoneNumber,
          error: error.message
        });
      }
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

  // 全ての通話を停止（現在の通話は完了させ、次以降を停止）
  async stopAllCalls(userId) {
    console.log(`[CallQueue] User ${userId}: Stopping future calls...`);

    const userQueue = this.getUserQueue(userId);

    // 停止フラグを立てる
    userQueue.isStopped = true;

    // キューをクリア（未発信の通話のみ）
    const queuedCalls = [...userQueue.queue];
    userQueue.queue = [];

    // キュー中の通話をキャンセル（顧客データは更新しない）
    for (const callData of queuedCalls) {
      try {
        callData.session.status = 'cancelled';
        callData.session.endTime = new Date();
        callData.session.callResult = 'キャンセル';
        await callData.session.save();

        console.log(`[StopAll] User ${userId}: Cancelled queued call: ${callData.session.phoneNumber} (customer data not updated)`);

      } catch (error) {
        console.error(`[StopAll] User ${userId}: Error cancelling queued call:`, error);
      }
    }

    // 現在の通話は継続（terminateCallを呼ばない）
    if (userQueue.currentCall) {
      console.log(`[StopAll] User ${userId}: Current call will continue until completion: ${userQueue.currentCall.phoneNumber}`);
    } else {
      console.log(`[StopAll] User ${userId}: No current call to continue`);
    }

    return {
      cancelledInQueue: queuedCalls.length,
      currentCallContinuing: !!userQueue.currentCall
    };
  }

  // 通話終了処理
  async terminateCall(sessionId, reason) {
    try {
      const session = await CallSession.findById(sessionId);
      if (!session) return;

      // CRITICAL: 転送中の通話は強制終了しない
      // Conference通話が継続中の可能性があるため
      if (session.status === 'transferring') {
        console.log(`[CallTerminate] Call is being transferred - skipping termination`);
        console.log(`[CallTerminate] Conference call will be handled by Conference events`);
        // タイムアウトのみクリア
        this.clearTimeouts(sessionId);
        return;
      }

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

      // 理由に応じた結果を設定
      if (reason === 'no-answer') {
        session.callResult = '不在';
        session.duration = 0; // 不在の場合は通話時間0
      } else if (reason === 'stopped') {
        session.callResult = '拒否';
        session.duration = 0; // 停止（呼び出し中に中断）の場合は通話時間0
      } else {
        session.callResult = '成功';
        // 成功の場合のみ startTime から計算（接続済みの場合）
        if (session.startTime) {
          session.duration = Math.floor((session.endTime - session.startTime) / 1000);
        }
      }

      await session.save();

      // 顧客データを更新
      if (session.customerId) {
        try {
          const today = new Date();
          const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

          await Customer.findByIdAndUpdate(session.customerId, {
            date: dateStr,
            result: session.callResult
          });
          console.log(`[CallTerminate] Updated customer result: ${session.callResult} for customer: ${session.customerId}`);
        } catch (customerUpdateError) {
          console.error('[CallTerminate] Error updating customer:', customerUpdateError);
        }
      }

      // WebSocketで通知（callStatusUpdateイベントとして発行）（ユーザー専用）
      console.log(`[CallTerminate] Emitting callStatusUpdate to user ${session.userId}: ${session.phoneNumber} -> ${session.callResult} (reason: ${reason})`);
      if (session.userId) {
        webSocketService.emitToUser(session.userId, 'callStatusUpdate', {
          callId: session._id.toString(),
          customerId: session.customerId?.toString() || session.customerId,
          phoneNumber: session.phoneNumber,
          status: 'completed',
          callResult: session.callResult,
          reason: reason
        });
      }

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
  console.log('\n========================================');
  console.log('=== BULK CALL POST REQUEST RECEIVED ===');
  console.log('========================================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Request Body:', JSON.stringify(req.body, null, 2));
  console.log('User:', req.user);
  console.log('========================================\n');

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
    const queueData = [];

    // まず全てのセッションを作成
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      const customerId = customerIds ? customerIds[i] : null;

      // セッション作成
      const sessionData = {
        phoneNumber,
        customerId,
        userId: req.user._id, // userIdを追加
        status: 'queued', // 新しいステータス: キュー待ち
        startTime: new Date(),
        assignedAgent: userId,
      };

      // AI設定を追加（salesPitchも含める）
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

      // キューデータを準備
      queueData.push({
        phoneNumber,
        session,
        userId
      });
    }

    // WebSocketで通知（キュー追加前に通知して、フロントエンドの初期化を確実にする）（ユーザー専用）
    if (userId) {
      webSocketService.emitToUser(userId, 'bulk-calls-queued', {
        totalCalls: createdSessions.length,
        sessions: createdSessions.map(s => ({
          id: s._id,
          phoneNumber: s.phoneNumber,
          customerId: s.customerId, // 顧客IDを追加
          status: s.status
        }))
      });
    }

    // 全てのセッションを作成後、一括でキューに追加（修正済み）
    if (queueData.length > 0) {
      console.log(`[BulkCall] ========================================`);
      console.log(`[BulkCall] Adding ${queueData.length} calls to queue`);
      console.log(`[BulkCall] Phone numbers: ${queueData.map(d => d.phoneNumber).join(', ')}`);

      // 全ての通話データを一括でキューに追加（ユーザーIDで分離）
      callQueueManager.addBulkToQueue(queueData, userId);

      console.log(`[BulkCall] All calls added to queue successfully`);
      console.log(`[BulkCall] ========================================`);
    }

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
  const { CallStatus, CallSid, HangupCause } = req.body;

  try {
    const session = await CallSession.findOne({ twilioCallSid: CallSid });
    if (!session) {
      return res.status(404).send('Session not found');
    }

    console.log(`[CallStatusUpdate] CallSid: ${CallSid}, Status: ${CallStatus}, HangupCause: ${HangupCause}`);

    // ステータス更新
    const previousStatus = session.status;

    switch (CallStatus) {
      case 'in-progress':
        session.status = 'in-progress';
        session.callResult = '通話中';

        // 応答があったのでno-answerタイムアウトをクリア
        const timeouts = callQueueManager.timeoutHandlers.get(session._id.toString());
        if (timeouts?.noAnswer) {
          clearTimeout(timeouts.noAnswer);
        }

        // 顧客ステータスを「通話中」に即座更新
        if (session.customerId) {
          try {
            const Customer = require('../models/Customer');
            await Customer.findByIdAndUpdate(session.customerId, {
              result: '通話中',
              callResult: '通話中'
            });
            console.log(`[CallStatusUpdate] Updated customer ${session.customerId} to '通話中'`);
          } catch (error) {
            console.error('[CallStatusUpdate] Error updating customer to 通話中:', error);
          }
        }
        break;

      case 'completed':
      case 'failed':
      case 'busy':
      case 'no-answer':
        session.status = 'completed';
        session.endTime = new Date();

        // 詳細な終了理由判定
        if (CallStatus === 'completed') {
          // HangupCauseで詳細判定
          if (HangupCause === 'caller-hung-up') {
            session.callResult = '拒否'; // 相手が電話を切った
          } else if (HangupCause === 'callee-hung-up') {
            session.callResult = '成功'; // こちらが切った（通話完了）
          } else {
            session.callResult = '成功'; // その他の正常終了
          }
        } else {
          session.callResult = CallStatus === 'no-answer' ? '不在' :
            CallStatus === 'busy' ? '不在' : '失敗';
        }

        // 顧客ステータスを即座更新
        if (session.customerId) {
          try {
            const Customer = require('../models/Customer');
            const today = new Date();
            const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

            await Customer.findByIdAndUpdate(session.customerId, {
              result: session.callResult,
              callResult: session.callResult,
              date: dateStr
            });
            console.log(`[CallStatusUpdate] Updated customer ${session.customerId} to '${session.callResult}'`);
          } catch (error) {
            console.error('[CallStatusUpdate] Error updating customer status:', error);
          }
        }

        callQueueManager.clearTimeouts(session._id);
        break;
    }

    await session.save();

    // WebSocketで通知（ユーザー専用）
    if (session.userId) {
      webSocketService.emitToUser(session.userId, 'call-status-update', {
        sessionId: session._id,
        phoneNumber: session.phoneNumber,
        customerId: session.customerId, // 顧客IDを追加
        status: session.status,
        callResult: session.callResult
      });
    }

    // 通話終了時はcall-terminatedイベントも送信
    if (['completed', 'failed', 'busy', 'no-answer'].includes(CallStatus)) {
      if (session.userId) {
        webSocketService.emitToUser(session.userId, 'call-terminated', {
          sessionId: session._id,
          phoneNumber: session.phoneNumber,
          customerId: session.customerId,
          callResult: session.callResult,
          reason: `${CallStatus}${HangupCause ? ` (${HangupCause})` : ''}`,
          timestamp: new Date()
        });
      }
      console.log(`[CallStatusUpdate] Call terminated: ${session.phoneNumber} -> ${session.callResult}`);
    }

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

// 全ての一斉通話を停止（現在の通話は完了させる）
exports.stopAllBulkCalls = async (req, res) => {
  try {
    const userId = req.user._id; // ユーザーIDを一度だけ宣言
    const result = await callQueueManager.stopAllCalls(userId);

    console.log(`[StopAllBulkCalls] Stopped calls: ${result.cancelledInQueue} cancelled, current call continuing: ${result.currentCallContinuing}`);

    // WebSocketで通知（ユーザー専用）
    if (userId) {
      webSocketService.emitToUser(userId, 'bulk-calls-stopped', {
        ...result,
        totalStopped: result.cancelledInQueue,
        currentCallContinuing: result.currentCallContinuing
      });
    }

    res.status(200).json({
      success: true,
      message: result.currentCallContinuing
        ? 'Future calls stopped, current call will continue'
        : 'All bulk calls stopped',
      ...result
    });
  } catch (error) {
    console.error('[StopAllCalls] Error:', error);
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

// Get bulk call status
exports.getBulkCallStatus = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const companyId = req.user.companyId;

    console.log('[BulkCallStatus] Request from user:', userId, 'companyId:', companyId);

    // Get active sessions for this user/company
    const query = {
      assignedAgent: userId,
      status: { $in: ['queued', 'calling', 'in-progress', 'ai-responding', 'completed'] }
    };

    const sessions = await CallSession.find(query)
      .populate('customerId', 'customer phone')
      .sort('-createdAt')
      .limit(100);

    console.log('[BulkCallStatus] Found', sessions.length, 'sessions');

    const sessionData = sessions.map(s => ({
      id: s._id,
      phoneNumber: s.phoneNumber,
      customer: s.customerId,
      status: s.status,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      twilioCallSid: s.twilioCallSid,
      callResult: s.callResult
    }));

    res.status(200).json({
      success: true,
      sessions: sessionData
    });
  } catch (error) {
    console.error('[BulkCallStatus] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// callQueueManagerをエクスポート（twilioControllerから使用）
exports.callQueueManager = callQueueManager;

module.exports = exports;