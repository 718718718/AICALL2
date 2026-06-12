const CallSession = require('../models/CallSession');
const CallTerminationUtils = require('../utils/callTerminationUtils');

class CallTimeoutManager {
  constructor() {
    this.timeouts = new Map(); // callId -> timeoutId mapping
    this.defaultTimeoutMinutes = 15; // デフォルト15分でタイムアウト
    this.maxCallDurationMinutes = 30; // 最大30分で強制終了
  }

  /**
   * 通話のタイムアウト監視を開始
   * @param {string} callId - 通話セッションID
   * @param {number} timeoutMinutes - タイムアウト時間（分）
   */
  startCallTimeout(callId, timeoutMinutes = null) {
    const timeout = timeoutMinutes || this.defaultTimeoutMinutes;
    const timeoutMs = timeout * 60 * 1000;

    console.log(`[CallTimeoutManager] Starting timeout monitoring for call ${callId}, timeout: ${timeout}min`);

    // 既存のタイムアウトをクリア
    this.clearCallTimeout(callId);

    // 新しいタイムアウトを設定
    const timeoutId = setTimeout(async () => {
      console.log(`[CallTimeoutManager] Call ${callId} timed out after ${timeout} minutes`);
      await this.handleCallTimeout(callId, 'inactive_timeout');
    }, timeoutMs);

    // 最大通話時間のタイムアウトも設定
    const maxTimeoutId = setTimeout(async () => {
      console.log(`[CallTimeoutManager] Call ${callId} reached maximum duration of ${this.maxCallDurationMinutes} minutes`);
      await this.handleCallTimeout(callId, 'max_duration_exceeded');
    }, this.maxCallDurationMinutes * 60 * 1000);

    this.timeouts.set(callId, {
      inactive: timeoutId,
      maxDuration: maxTimeoutId,
      startTime: Date.now(),
      timeoutMinutes: timeout
    });
  }

  /**
   * 通話のタイムアウト監視を停止
   * @param {string} callId - 通話セッションID
   */
  clearCallTimeout(callId) {
    const timeout = this.timeouts.get(callId);
    if (timeout) {
      clearTimeout(timeout.inactive);
      clearTimeout(timeout.maxDuration);
      this.timeouts.delete(callId);
      console.log(`[CallTimeoutManager] Cleared timeout for call ${callId}`);
    }
  }

  /**
   * 通話活動を更新（タイムアウトをリセット）
   * @param {string} callId - 通話セッションID
   */
  updateCallActivity(callId) {
    const timeout = this.timeouts.get(callId);
    if (timeout) {
      // 非活動タイムアウトのみリセット（最大時間制限はリセットしない）
      clearTimeout(timeout.inactive);
      
      const newTimeoutId = setTimeout(async () => {
        console.log(`[CallTimeoutManager] Call ${callId} timed out after ${timeout.timeoutMinutes} minutes of inactivity`);
        await this.handleCallTimeout(callId, 'inactive_timeout');
      }, timeout.timeoutMinutes * 60 * 1000);

      timeout.inactive = newTimeoutId;
      console.log(`[CallTimeoutManager] Activity updated for call ${callId}, timeout reset`);
    }
  }

  /**
   * タイムアウト発生時の処理
   * @param {string} callId - 通話セッションID
   * @param {string} timeoutType - タイムアウトタイプ
   */
  async handleCallTimeout(callId, timeoutType) {
    try {
      // タイムアウト記録をクリア
      this.clearCallTimeout(callId);

      // 通話セッションの状態を確認
      const callSession = await CallSession.findById(callId);
      if (!callSession) {
        console.log(`[CallTimeoutManager] CallSession ${callId} not found for timeout`);
        return;
      }

      // アクティブな通話のみタイムアウト処理を実行
      const activeStatuses = [
        'initiating', 'calling', 'initiated', 'ai-responding', 
        'in-progress', 'transferring', 'human-connected'
      ];

      if (!activeStatuses.includes(callSession.status)) {
        console.log(`[CallTimeoutManager] Call ${callId} already completed (${callSession.status}), skipping timeout`);
        return;
      }

      // 通話時間を計算（実際に接続された場合のみ）
      // ※ startTime はセッション作成時にデフォルト設定されるため、
      //    接続前（initiating, calling, initiated）の場合は 0 にする
      const connectedStatuses = ['in-progress', 'transferring', 'human-connected', 'ai-responding'];
      const wasConnected = connectedStatuses.includes(callSession.status);
      const duration = wasConnected && callSession.startTime
        ? Math.floor((new Date() - callSession.startTime) / 1000)
        : 0;

      console.log(`[CallTimeoutManager] Processing timeout for call ${callId}, type: ${timeoutType}, duration: ${duration}s`);

      // タイムアウトタイプに応じた処理
      const timeoutReasons = {
        'inactive_timeout': 'タイムアウト（無活動）',
        'max_duration_exceeded': 'タイムアウト（最大時間超過）',
        'system_timeout': 'システムタイムアウト'
      };

      const reason = timeoutReasons[timeoutType] || 'タイムアウト';

      // 通話を失敗として終了
      await CallTerminationUtils.terminateCallWithFailure(
        callId,
        `通話が${reason}により自動終了されました`,
        'timeout',
        duration
      );

      // Twilioの通話も終了させる
      if (callSession.twilioCallSid) {
        try {
          const twilio = require('twilio');
          const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          
          await client.calls(callSession.twilioCallSid).update({
            status: 'completed'
          });
          
          console.log(`[CallTimeoutManager] Twilio call ${callSession.twilioCallSid} terminated`);
        } catch (twilioError) {
          console.error(`[CallTimeoutManager] Failed to terminate Twilio call:`, twilioError);
        }
      }

    } catch (error) {
      console.error(`[CallTimeoutManager] Error handling timeout for call ${callId}:`, error);
    }
  }

  /**
   * 全ての通話のタイムアウト状況を取得
   */
  getAllTimeoutStatus() {
    const status = [];
    for (const [callId, timeout] of this.timeouts.entries()) {
      const elapsed = Math.floor((Date.now() - timeout.startTime) / 1000 / 60); // 分
      const remaining = timeout.timeoutMinutes - elapsed;
      
      status.push({
        callId,
        elapsedMinutes: elapsed,
        remainingMinutes: Math.max(0, remaining),
        timeoutMinutes: timeout.timeoutMinutes
      });
    }
    return status;
  }

  /**
   * 古い通話セッションを一括クリーンアップ
   */
  async cleanupStaleTimeouts() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // 1時間以上前に開始された進行中の通話を検索
      const staleCalls = await CallSession.find({
        status: { 
          $in: ['initiating', 'calling', 'initiated', 'ai-responding', 'in-progress', 'transferring', 'human-connected'] 
        },
        startTime: { $lt: oneHourAgo }
      });

      console.log(`[CallTimeoutManager] Found ${staleCalls.length} stale calls for cleanup`);

      for (const call of staleCalls) {
        await this.handleCallTimeout(call._id.toString(), 'system_timeout');
      }

    } catch (error) {
      console.error('[CallTimeoutManager] Error during cleanup:', error);
    }
  }

  /**
   * 定期的なクリーンアップタスクを開始
   */
  startCleanupTask() {
    // 10分ごとにクリーンアップを実行
    const cleanupInterval = 10 * 60 * 1000;
    
    setInterval(() => {
      console.log('[CallTimeoutManager] Running periodic cleanup...');
      this.cleanupStaleTimeouts();
    }, cleanupInterval);

    console.log('[CallTimeoutManager] Cleanup task started (every 10 minutes)');
  }
}

module.exports = new CallTimeoutManager();