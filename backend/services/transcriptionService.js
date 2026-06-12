const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const CallSession = require('../models/CallSession');

class TranscriptionService {
  /**
   * 通話レッグに対してリアルタイム転写を開始
   * @param {string} callSid - Twilio Call SID
   * @param {string} role - 参加者の役割 (customer, agent, ai)
   * @param {string} callId - アプリケーション内のCall ID
   * @returns {Promise<object>} Transcription object
   */
  async startTranscription(callSid, role, callId) {
    console.log(`[TranscriptionService] Starting transcription for ${role} call: ${callSid}`);

    try {
      const labelPrefix = this.getRoleLabelPrefix(role);

      const transcription = await client.calls(callSid).transcriptions.create({
        statusCallbackUrl: `${process.env.BASE_URL}/api/twilio/transcription/events/${callId}`,
        statusCallbackMethod: 'POST',
        languageCode: 'ja-JP',
        partialResults: true,
        track: 'both_tracks',
        inboundTrackLabel: `${labelPrefix}-in`,
        outboundTrackLabel: `${labelPrefix}-out`
      });

      console.log(`[TranscriptionService] Transcription started for ${role}: ${transcription.sid}`);

      // CallSessionにTranscription SIDを記録
      await this.updateCallSessionTranscription(callId, role, transcription.sid, 'started');

      return transcription;
    } catch (error) {
      console.error(`[TranscriptionService] Failed to start transcription for ${role}:`, error);
      await this.updateCallSessionTranscription(callId, role, null, 'failed');
      throw error;
    }
  }

  /**
   * 転写を停止
   * @param {string} callSid - Twilio Call SID
   * @param {string} transcriptionSid - Transcription SID
   * @param {string} callId - アプリケーション内のCall ID
   * @param {string} role - 参加者の役割
   */
  async stopTranscription(callSid, transcriptionSid, callId, role) {
    console.log(`[TranscriptionService] Stopping transcription: ${transcriptionSid}`);

    try {
      const result = await client.calls(callSid)
        .transcriptions(transcriptionSid)
        .update({ status: 'stopped' });

      console.log(`[TranscriptionService] Transcription stopped for ${role}: ${transcriptionSid}`);

      // CallSessionの状態を更新
      await this.updateCallSessionTranscription(callId, role, transcriptionSid, 'stopped');

      return result;
    } catch (error) {
      console.error(`[TranscriptionService] Failed to stop transcription:`, error);
      throw error;
    }
  }

  /**
   * 役割に基づいてラベルプレフィックスを取得
   * @param {string} role - 参加者の役割
   * @returns {string} ラベルプレフィックス
   */
  getRoleLabelPrefix(role) {
    switch (role) {
      case 'customer':
        return 'customer';
      case 'agent':
        return 'agent';
      case 'ai':
        return 'ai';
      default:
        return 'unknown';
    }
  }

  /**
   * CallSessionのTranscription状態を更新
   * @param {string} callId - Call ID
   * @param {string} role - 参加者の役割
   * @param {string} transcriptionSid - Transcription SID
   * @param {string} status - 状態 (started, stopped, failed)
   */
  async updateCallSessionTranscription(callId, role, transcriptionSid, status) {
    try {
      const updateData = {
        [`transcriptionStatus.${role}.sid`]: transcriptionSid,
        [`transcriptionStatus.${role}.status`]: status,
        [`transcriptionStatus.${role}.updatedAt`]: new Date()
      };

      await CallSession.findByIdAndUpdate(callId, updateData);
      console.log(`[TranscriptionService] Updated CallSession transcription status: ${role} -> ${status}`);
    } catch (error) {
      console.error(`[TranscriptionService] Failed to update CallSession transcription status:`, error);
    }
  }

  /**
   * 通話終了時に全ての転写を停止
   * @param {string} callId - Call ID
   */
  async stopAllTranscriptions(callId) {
    console.log(`[TranscriptionService] Stopping all transcriptions for call: ${callId}`);

    try {
      const callSession = await CallSession.findById(callId);
      if (!callSession || !callSession.transcriptionStatus) {
        return;
      }

      const roles = ['customer', 'agent', 'ai'];
      const stopPromises = [];

      for (const role of roles) {
        const transcriptionInfo = callSession.transcriptionStatus[role];
        if (transcriptionInfo && transcriptionInfo.sid && transcriptionInfo.status === 'started') {
          // CallSidが必要だが、CallSessionに保存されていない場合の対応
          // 実際の実装では、CallSessionにCallSidも保存する必要がある
          console.log(`[TranscriptionService] Found active transcription for ${role}: ${transcriptionInfo.sid}`);
          // stopPromises.push(this.stopTranscription(callSid, transcriptionInfo.sid, callId, role));
        }
      }

      if (stopPromises.length > 0) {
        await Promise.allSettled(stopPromises);
        console.log(`[TranscriptionService] Stopped ${stopPromises.length} transcriptions for call: ${callId}`);
      }
    } catch (error) {
      console.error(`[TranscriptionService] Error stopping all transcriptions:`, error);
    }
  }
}

module.exports = new TranscriptionService();