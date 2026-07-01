const twilio = require('twilio');
const config = require('../config/environment');

const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

class RecordingService {
  /**
   * TwilioのRecordingUrlをそのまま返す（ローカル保存しない）
   * Renderはエフェメラルストレージのためローカル保存は不可
   * TwilioのURLに認証付きでアクセスする形式に変換して返す
   */
  async downloadAndSaveRecording(recordingUrl, callId, recordingSid) {
    try {
      console.log('[RecordingService] Using Twilio URL directly (no local save)');
      console.log('[RecordingService] Recording SID:', recordingSid);

      // TwilioのRecordingUrlは認証なしでは取得できないため
      // /Recordings/{SID}.mp3 形式のURLを構築して返す
      // フロントエンドからはバックエンド経由でプロキシして取得する
      const recordingPath = `/api/twilio/recordings/${recordingSid}`;
      console.log('[RecordingService] Recording path:', recordingPath);
      return recordingPath;

    } catch (error) {
      console.error('[RecordingService] Error in downloadAndSaveRecording:', error);
      throw error;
    }
  }

  /**
   * TwilioからMP3形式で録音を取得してストリーム返却
   */
  async streamRecording(recordingSid, res) {
    try {
      const accountSid = config.twilio.accountSid;
      const authToken = config.twilio.authToken;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;

      const https = require('https');
      const authString = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      https.get(url, { headers: { 'Authorization': `Basic ${authString}` } }, (twilioRes) => {
        if (twilioRes.statusCode !== 200) {
          console.error('[RecordingService] Twilio returned:', twilioRes.statusCode);
          res.status(404).json({ error: 'Recording not found' });
          return;
        }
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="recording_${recordingSid}.mp3"`);
        twilioRes.pipe(res);
      }).on('error', (e) => {
        console.error('[RecordingService] Stream error:', e);
        res.status(500).json({ error: 'Failed to stream recording' });
      });
    } catch (error) {
      console.error('[RecordingService] Error streaming recording:', error);
      throw error;
    }
  }

  // 後方互換性のためスタブとして残す
  async deleteLocalRecording(localPath) {}
  async cleanupOldRecordings(daysOld = 30) {}
}

module.exports = new RecordingService();
