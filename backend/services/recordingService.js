const fs = require('fs');
const path = require('path');
const https = require('https');
const twilio = require('twilio');
const config = require('../config/environment');

const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

class RecordingService {
  constructor() {
    this.recordingsDir = path.join(__dirname, '..', 'uploads', 'recordings');
    this.ensureRecordingsDirectory();
  }

  ensureRecordingsDirectory() {
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
      console.log('[RecordingService] Created recordings directory:', this.recordingsDir);
    }
  }

  /**
   * Download recording from Twilio and save locally
   * @param {string} recordingUrl - Twilio recording URL
   * @param {string} callId - Call session ID
   * @param {string} recordingSid - Twilio recording SID
   * @returns {Promise<string>} Local file path
   */
  async downloadAndSaveRecording(recordingUrl, callId, recordingSid) {
    try {
      console.log('[RecordingService] Downloading recording from Twilio...');
      console.log('[RecordingService] Recording URL:', recordingUrl);
      console.log('[RecordingService] Call ID:', callId);
      console.log('[RecordingService] Recording SID:', recordingSid);

      // Generate local filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `call_${callId}_${timestamp}.wav`;
      const localPath = path.join(this.recordingsDir, filename);

      // Download file from Twilio with authentication
      const authString = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
      
      return new Promise((resolve, reject) => {
        const request = https.get(recordingUrl, {
          headers: {
            'Authorization': `Basic ${authString}`
          }
        }, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download recording: ${response.statusCode}`));
            return;
          }

          const writeStream = fs.createWriteStream(localPath);
          response.pipe(writeStream);

          writeStream.on('finish', () => {
            writeStream.close();
            console.log('[RecordingService] Recording saved locally:', localPath);
            
            // Return relative path for URL generation
            const relativePath = `uploads/recordings/${filename}`;
            resolve(relativePath);
          });

          writeStream.on('error', (error) => {
            console.error('[RecordingService] Error writing file:', error);
            reject(error);
          });
        });

        request.on('error', (error) => {
          console.error('[RecordingService] Error downloading recording:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('[RecordingService] Error in downloadAndSaveRecording:', error);
      throw error;
    }
  }

  /**
   * Delete local recording file
   * @param {string} localPath - Local file path
   */
  async deleteLocalRecording(localPath) {
    try {
      const fullPath = path.join(__dirname, '..', localPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log('[RecordingService] Deleted local recording:', fullPath);
      }
    } catch (error) {
      console.error('[RecordingService] Error deleting local recording:', error);
    }
  }

  /**
   * Clean up old recording files (older than specified days)
   * @param {number} daysOld - Files older than this many days will be deleted
   */
  async cleanupOldRecordings(daysOld = 30) {
    try {
      const files = fs.readdirSync(this.recordingsDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

      for (const file of files) {
        const filePath = path.join(this.recordingsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          console.log('[RecordingService] Cleaned up old recording:', file);
        }
      }
    } catch (error) {
      console.error('[RecordingService] Error during cleanup:', error);
    }
  }
}

module.exports = new RecordingService();