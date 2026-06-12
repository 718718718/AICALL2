// CoeFontサービスのテストスクリプト
require('dotenv').config();
const coefontService = require('./services/coefontService');

async function testCoeFont() {
  console.log('=== CoeFont API テスト開始 ===');
  console.log('API Key:', process.env.COE_FONT_KEY ? 'Set' : 'Not set');
  console.log('Client Secret:', process.env.COE_FONT_CLIENT_SECRET ? 'Set' : 'Not set');
  
  try {
    const testText = 'こんにちは、テストです。';
    console.log('\nテストテキスト:', testText);
    
    // 音声URLを生成
    const audioUrl = await coefontService.generateSpeechUrl(testText);
    console.log('生成された音声URL:', audioUrl);
    
    if (audioUrl) {
      console.log('✅ CoeFont APIが正常に動作しています');
      
      // Twilio用のテスト
      const twilio = require('twilio');
      const twiml = new twilio.twiml.VoiceResponse();
      const success = await coefontService.getTwilioPlayElement(twiml, testText);
      console.log('Twilio統合:', success ? '✅ 成功' : '❌ 失敗（Pollyにフォールバック）');
      console.log('生成されたTwiML:', twiml.toString());
    } else {
      console.log('❌ CoeFont APIが失敗しました（nullが返されました）');
    }
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error('詳細:', error);
  }
}

testCoeFont();