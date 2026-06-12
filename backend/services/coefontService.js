const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CoeFontService {
  constructor() {
    this.accessKey = process.env.COE_FONT_KEY; // Access Key
    this.accessSecret = process.env.COE_FONT_CLIENT_SECRET; // Access Secret
    this.baseUrl = 'https://api.coefont.cloud/v2';
    // デフォルトのvoice IDを設定（Alloy井上彩）
    this.voiceId = process.env.COEFONT_VOICE_ID || '0fb90028-93f2-4c10-9f07-b8c695972e7e';
    this.cacheDir = path.join(__dirname, '../cache/audio');
    this.initCache();
    
    // APIキーの状態をログ出力
    console.log('[CoeFont] Service initialized');
    console.log('[CoeFont] Access Key:', this.accessKey ? `${this.accessKey.substring(0, 10)}...` : 'Not set');
    console.log('[CoeFont] Access Secret:', this.accessSecret ? `${this.accessSecret.substring(0, 10)}...` : 'Not set');
  }

  async initCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('[CoeFont] Failed to create cache directory:', error);
    }
  }

  // HMAC-SHA256署名を生成
  generateSignature(date, requestBody) {
    const data = date + JSON.stringify(requestBody);
    return crypto
      .createHmac('sha256', this.accessSecret)
      .update(data)
      .digest('hex');
  }

  // テキストから音声URLを生成
  async generateSpeechUrl(text) {
    try {
      // キャッシュキーを生成
      const cacheKey = crypto.createHash('md5').update(text + this.voiceId).digest('hex');
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.wav`);
      
      // キャッシュが存在する場合は、そのURLを返す
      try {
        await fs.access(cacheFile);
        console.log(`[CoeFont] Using cached audio for: "${text.substring(0, 30)}..."`);
        return `${process.env.BASE_URL}/api/audio/cache/${cacheKey}.wav`;
      } catch {
        // キャッシュが存在しない場合は続行
      }

      console.log(`[CoeFont] Generating speech for: "${text}"`);
      
      // UNIXタイムスタンプ（UTC）
      const date = Math.floor(Date.now() / 1000).toString();
      
      // リクエストボディ
      const requestBody = {
        coefont: this.voiceId,
        text: text,
        speed: 1.3,  // 1.3倍速に設定（通常:1.0、範囲:0.5-2.0）
        pitch: 0,
        volume: 1.0,
        format: 'wav',
        kana: false
      };
      
      // HMAC-SHA256署名を生成
      const signature = this.generateSignature(date, requestBody);
      
      console.log('[CoeFont] Making API request to:', `${this.baseUrl}/text2speech`);
      console.log('[CoeFont] Date:', date);
      console.log('[CoeFont] Signature:', signature.substring(0, 20) + '...');
      
      const response = await axios.post(
        `${this.baseUrl}/text2speech`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.accessKey,
            'X-Coefont-Date': date,
            'X-Coefont-Content': signature
          },
          responseType: 'arraybuffer', // WAVファイルをバイナリで受け取る
          timeout: 10000 // 10秒のタイムアウト
        }
      );

      if (response.data) {
        // WAVファイルをキャッシュに保存
        await fs.writeFile(cacheFile, response.data);
        console.log(`[CoeFont] Audio cached: ${cacheFile}`);
        
        // キャッシュされたファイルのURLを返す
        return `${process.env.BASE_URL}/api/audio/cache/${cacheKey}.wav`;
      } else {
        throw new Error('No audio data returned from CoeFont API');
      }
    } catch (error) {
      console.error('[CoeFont] Error generating speech:', error.message);
      if (error.response) {
        console.error('[CoeFont] Error status:', error.response.status);
        console.error('[CoeFont] Error data:', error.response.data);
      }
      // エラーの場合はフォールバック（Polly）を使用
      return null;
    }
  }

  // Twilio用のPlay要素を生成
  async getTwilioPlayElement(twiml, text) {
    try {
      console.log(`[CoeFont] Processing text: "${text ? text.substring(0, 50) : 'empty'}..."`);
      
      if (!text || text.trim() === '') {
        console.warn('[CoeFont] WARNING: Empty or null text provided');
        return false;
      }
      
      const audioUrl = await this.generateSpeechUrl(text);
      
      if (audioUrl) {
        // CoeFontの音声URLを使用
        console.log(`[CoeFont] Using CoeFont audio URL: ${audioUrl}`);
        twiml.play(audioUrl);
        return true;
      } else {
        // フォールバック: Polly.Mizukiを使用
        console.log('[CoeFont] Falling back to Polly.Mizuki');
        twiml.say({ 
          voice: 'Polly.Mizuki', 
          language: 'ja-JP' 
        }, text);
        return false;
      }
    } catch (error) {
      console.error('[CoeFont] ERROR in getTwilioPlayElement:', error);
      // エラーの場合もフォールバック
      twiml.say({ 
        voice: 'Polly.Mizuki', 
        language: 'ja-JP' 
      }, text);
      return false;
    }
  }

  // 音声IDのリストを取得
  async getAvailableVoices() {
    try {
      // UNIXタイムスタンプ（UTC）
      const date = Math.floor(Date.now() / 1000).toString();
      
      // 空のリクエストボディでも署名が必要
      const requestBody = {};
      const signature = this.generateSignature(date, requestBody);
      
      const response = await axios.get(
        `${this.baseUrl}/voices`,
        {
          headers: {
            'Authorization': this.accessKey,
            'X-Coefont-Date': date,
            'X-Coefont-Content': signature
          }
        }
      );
      
      return response.data.voices || [];
    } catch (error) {
      console.error('[CoeFont] Error fetching voices:', error.message);
      return [];
    }
  }

  // キャッシュをクリア
  async clearCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.mp3') || file.endsWith('.wav')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      console.log('[CoeFont] Cache cleared');
    } catch (error) {
      console.error('[CoeFont] Error clearing cache:', error);
    }
  }
}

// シングルトンインスタンスをエクスポート
module.exports = new CoeFontService();