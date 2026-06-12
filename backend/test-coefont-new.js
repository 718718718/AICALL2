require('dotenv').config();

console.log('=== CoeFont Environment Variables ===');
console.log('COE_FONT_KEY:', process.env.COE_FONT_KEY);
console.log('COE_FONT_CLIENT_SECRET:', process.env.COE_FONT_CLIENT_SECRET);
console.log('COEFONT_VOICE_ID:', process.env.COEFONT_VOICE_ID);
console.log('BASE_URL:', process.env.BASE_URL);

// Test CoeFont service
const coefontService = require('./services/coefontService');

async function testCoeFont() {
  try {
    console.log('\n=== Testing CoeFont Service ===');
    console.log('Voice ID being used:', coefontService.voiceId);
    
    const testText = 'テスト音声です';
    console.log(`\nGenerating speech for: "${testText}"`);
    
    const audioUrl = await coefontService.generateSpeechUrl(testText);
    console.log('Audio URL generated:', audioUrl);
    
  } catch (error) {
    console.error('\n=== CoeFont Error ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      // エラーレスポンスがバイナリの場合、文字列に変換
      if (error.response.data instanceof Buffer || error.response.data instanceof ArrayBuffer) {
        const text = Buffer.from(error.response.data).toString('utf-8');
        console.error('Response text:', text);
      }
    }
    
    console.error('\nFull error:', error);
  }
}

testCoeFont();
EOF < /dev/null