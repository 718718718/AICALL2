// シンプルなCoeFont APIテスト
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

async function testCoefont() {
  const accessKey = process.env.COE_FONT_KEY;
  const accessSecret = process.env.COE_FONT_CLIENT_SECRET;
  
  console.log('Access Key:', accessKey);
  console.log('Access Secret:', accessSecret);
  
  // いくつかのVoice IDを試す
  const voiceIds = [
    'ミリアル',  // フリー音声
    'millial',   // フリー音声（英語名）
    'アリアル',  // フリー音声
    'arial',     // フリー音声（英語名）
    null         // coefont無指定
  ];
  
  for (const voiceId of voiceIds) {
    console.log(`\n=== Testing with voice: ${voiceId || 'none'} ===`);
    
    const date = Math.floor(Date.now() / 1000).toString();
    
    const requestBody = {
      text: 'こんにちは、テストです。'
    };
    
    // voiceIdが指定されている場合のみcoefontパラメータを追加
    if (voiceId) {
      requestBody.coefont = voiceId;
    }
    
    const data = date + JSON.stringify(requestBody);
    const signature = crypto
      .createHmac('sha256', accessSecret)
      .update(data)
      .digest('hex');
    
    try {
      const response = await axios.post(
        'https://api.coefont.cloud/v2/text2speech',
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': accessKey,
            'X-Coefont-Date': date,
            'X-Coefont-Content': signature
          },
          responseType: 'arraybuffer',
          timeout: 10000
        }
      );
      
      console.log('✅ Success! Response size:', response.data.length, 'bytes');
      console.log('Voice ID that worked:', voiceId || 'none');
      break;
    } catch (error) {
      console.log('❌ Failed:', error.response?.status, error.response?.statusText);
      if (error.response?.data) {
        const errorMessage = Buffer.from(error.response.data).toString('utf-8');
        console.log('Error message:', errorMessage);
      }
    }
  }
}

testCoefont();