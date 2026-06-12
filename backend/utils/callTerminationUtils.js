const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const conversationEngine = require('../services/conversationEngine');
const webSocketService = require('../services/websocket');

/**
 * 通話終了処理の共通ユーティリティ
 */
class CallTerminationUtils {
  /**
   * 通話を正常終了させる
   * @param {string} callId - 通話セッションID
   * @param {string} callResult - 通話結果
   * @param {number} duration - 通話時間（秒）
   * @param {string} reason - 終了理由
   */
  static async terminateCall(callId, callResult = '成功', duration = null, reason = 'normal') {
    try {
      const updateData = {
        status: 'completed',
        endTime: new Date(),
        callResult: callResult
      };

      if (duration !== null) {
        updateData.duration = parseInt(duration);
      }

      if (reason) {
        updateData.endReason = reason;
      }

      // CallSessionを更新
      const callSession = await CallSession.findByIdAndUpdate(
        callId, 
        updateData, 
        { new: true }
      ).populate('customerId');

      if (!callSession) {
        console.error(`[CallTermination] CallSession not found: ${callId}`);
        return false;
      }

      // 顧客の最終コール日を更新
      if (callSession.customerId?._id) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
        
        await Customer.findByIdAndUpdate(callSession.customerId._id, {
          date: dateStr,
          result: callResult
        });

        console.log(`[CallTermination] Updated customer last call date: ${dateStr} for customer: ${callSession.customerId._id}`);
      }

      // 会話エンジンをクリア
      conversationEngine.clearConversation(callId);
      console.log(`[CallTermination] Cleared conversation engine for call: ${callId}`);

      // タイムアウト監視をクリア
      const callTimeoutManager = require('../services/callTimeoutManager');
      callTimeoutManager.clearCallTimeout(callId);

      // WebSocketで終了通知
      const phoneNumber = callSession.phoneNumber || callSession.customerId?.phone || '';
      webSocketService.emitToUser(callSession.userId, 'call-terminated', {
        callId: callId,
        callSid: callSession.twilioCallSid,
        customerId: callSession.customerId?._id || callSession.customerId,
        phoneNumber: phoneNumber,
        status: 'completed',
        callResult: callResult,
        duration: duration,
        endTime: updateData.endTime,
        reason: reason,
        timestamp: new Date()
      });

      // トランスクリプトに終了メッセージを追加
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: `通話終了: ${callResult} (理由: ${reason})`,
        phoneNumber: phoneNumber,
        timestamp: new Date()
      });

      console.log(`[CallTermination] Successfully terminated call ${callId} with result: ${callResult}`);
      return true;

    } catch (error) {
      console.error(`[CallTermination] Error terminating call ${callId}:`, error);
      return false;
    }
  }

  /**
   * 通話を失敗として終了させる
   * @param {string} callId - 通話セッションID
   * @param {string} error - エラーメッセージ
   * @param {string} failureType - 失敗タイプ
   * @param {number} duration - 通話時間（秒）
   */
  static async terminateCallWithFailure(callId, error, failureType = 'unknown', duration = null) {
    try {
      const updateData = {
        status: 'failed',
        endTime: new Date(),
        error: error,
        callResult: `失敗: ${failureType}`
      };

      if (duration !== null) {
        updateData.duration = parseInt(duration);
      }

      // CallSessionを更新
      const callSession = await CallSession.findByIdAndUpdate(
        callId, 
        updateData, 
        { new: true }
      ).populate('customerId');

      if (!callSession) {
        console.error(`[CallTermination] CallSession not found: ${callId}`);
        return false;
      }

      // 顧客の最終コール日を更新（失敗として記録）
      if (callSession.customerId?._id) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
        
        await Customer.findByIdAndUpdate(callSession.customerId._id, {
          date: dateStr,
          result: updateData.callResult
        });
      }

      // 会話エンジンをクリア
      conversationEngine.clearConversation(callId);
      console.log(`[CallTermination] Cleared conversation engine for call: ${callId}`);

      // タイムアウト監視をクリア
      const callTimeoutManager = require('../services/callTimeoutManager');
      callTimeoutManager.clearCallTimeout(callId);

      // WebSocketで失敗通知
      const phoneNumber = callSession.phoneNumber || callSession.customerId?.phone || '';
      webSocketService.emitToUser(callSession.userId, 'call-terminated', {
        callId: callId,
        callSid: callSession.twilioCallSid,
        customerId: callSession.customerId?._id || callSession.customerId,
        phoneNumber: phoneNumber,
        status: 'failed',
        callResult: updateData.callResult,
        error: error,
        failureType: failureType,
        duration: duration,
        endTime: updateData.endTime,
        timestamp: new Date()
      });

      // トランスクリプトに終了メッセージを追加
      webSocketService.sendTranscriptUpdate(callId, {
        speaker: 'system',
        message: `通話失敗: ${error}`,
        phoneNumber: phoneNumber,
        timestamp: new Date()
      });

      console.log(`[CallTermination] Call ${callId} terminated with failure: ${failureType} - ${error}`);
      return true;

    } catch (terminationError) {
      console.error(`[CallTermination] Error terminating call ${callId} with failure:`, terminationError);
      return false;
    }
  }

  /**
   * 転送関連の通話終了処理
   * @param {string} callId - 通話セッションID
   * @param {string} transferResult - 転送結果
   * @param {number} duration - 通話時間（秒）
   */
  static async terminateTransferCall(callId, transferResult, duration = null) {
    const callResultMap = {
      'transfer_success': '成功',
      'transfer_failed': '失敗',
      'transfer_no_answer': '不在',
      'transfer_busy': '失敗',
      'transfer_cancelled': '失敗'
    };

    const callResult = callResultMap[transferResult] || '成功';
    return await this.terminateCall(callId, callResult, duration, 'transfer');
  }

  /**
   * 通話の強制終了（タイムアウト等）
   * @param {string} callId - 通話セッションID
   * @param {string} reason - 強制終了理由
   */
  static async forceTerminateCall(callId, reason = 'timeout') {
    try {
      const callSession = await CallSession.findById(callId);
      if (!callSession) {
        console.error(`[CallTermination] CallSession not found for force termination: ${callId}`);
        return false;
      }

      // 通話時間を計算（実際に接続された場合のみ）
      // ※ startTime はセッション作成時にデフォルト設定されるため、
      //    接続前（initiating, calling, initiated）の場合は 0 にする
      const connectedStatuses = ['in-progress', 'transferring', 'human-connected', 'ai-responding'];
      const wasConnected = connectedStatuses.includes(callSession.status);
      const duration = wasConnected && callSession.startTime
        ? Math.floor((new Date() - callSession.startTime) / 1000)
        : 0;

      const reasonMap = {
        'timeout': 'タイムアウト',
        'system_error': 'システムエラー',
        'manual': '手動終了',
        'network_error': 'ネットワークエラー'
      };

      const displayReason = reasonMap[reason] || reason;
      
      return await this.terminateCallWithFailure(
        callId, 
        `通話が強制終了されました: ${displayReason}`,
        reason,
        duration
      );

    } catch (error) {
      console.error(`[CallTermination] Error in force terminate call ${callId}:`, error);
      return false;
    }
  }
}

module.exports = CallTerminationUtils;