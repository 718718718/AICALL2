// CoeFont利用可能ボイスの取得テスト
require('dotenv').config();
const coefontService = require('./services/coefontService');

async function testVoices() {
  console.log('=== CoeFont 利用可能ボイスの取得 ===');
  
  try {
    const voices = await coefontService.getAvailableVoices();
    console.log('利用可能なボイス:', voices);
    
    if (voices && voices.length > 0) {
      console.log('\n利用可能なボイスID:');
      voices.forEach(voice => {
        console.log(`- ${voice.id || voice.coefont}: ${voice.name || 'No name'}`);
      });
    }
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

testVoices();