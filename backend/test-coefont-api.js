// CoeFont API 直接テスト - UUID形式のIDを使用
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

async function testCoefont() {
  const accessKey = process.env.COE_FONT_KEY;
  const accessSecret = process.env.COE_FONT_CLIENT_SECRET;
  
  console.log('Access Key:', accessKey ? accessKey.substring(0, 10) + '...' : 'Not set');
  console.log('Access Secret:', accessSecret ? accessSecret.substring(0, 10) + '...' : 'Not set');
  
  // APIリファレンスに記載されている形式でテスト
  const date = Math.floor(Date.now() / 1000).toString();
  
  const requestBody = {
    coefont: '0fb90028-93f2-4c10-9f07-b8c695972e7e', // Alloy井上彩のUUID
    text: 'こんにちは、テストです。',
    format: 'wav'
  };
  
  const data = date + JSON.stringify(requestBody);
  const signature = crypto
    .createHmac('sha256', accessSecret)
    .update(data)
    .digest('hex');
  
  console.log('\nRequest details:');
  console.log('Date:', date);
  console.log('Signature:', signature.substring(0, 20) + '...');
  console.log('Request body:', JSON.stringify(requestBody, null, 2));
  
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
    
    console.log('\n✅ Success!');
    console.log('Response size:', response.data.length, 'bytes');
    console.log('Response headers:', response.headers);
    
    // WAVファイルを保存
    fs.writeFileSync('test-output.wav', response.data);
    console.log('Audio saved to test-output.wav');
    
  } catch (error) {
    console.log('\n❌ Failed:', error.response?.status, error.response?.statusText);
    if (error.response?.data) {
      const errorMessage = Buffer.from(error.response.data).toString('utf-8');
      console.log('Error message:', errorMessage);
    }
    console.log('Error details:', error.message);
  }
}

testCoefont();