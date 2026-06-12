const axios = require('axios');
const crypto = require('crypto');

async function testCoeFont() {
  const accessKey = 'oFkzx6sV0CRfkS89Exn6BFO1O';
  const accessSecret = 'VaxBkyYeDD1XsRtygcr06AQVuyzmGW8qPbY5ecCS';
  const voiceId = '150e5a43-d156-4c5d-ba99-f266eb52d53d'; // 普通の女性の声
  
  // Test 1: List available voices (this works based on your curl command)
  console.log('=== Test 1: List Available Voices ===');
  try {
    const date1 = Math.floor(Date.now() / 1000).toString();
    const signature1 = crypto.createHmac('sha256', accessSecret).update(date1).digest('hex');
    
    const response1 = await axios.get('https://api.coefont.cloud/v2/coefonts/pro', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': accessKey,
        'X-Coefont-Date': date1,
        'X-Coefont-Content': signature1
      }
    });
    
    const hasTargetVoice = response1.data.some(v => v.coefont === voiceId);
    console.log(`✅ Voice list retrieved. Target voice (${voiceId}) found: ${hasTargetVoice}`);
    if (hasTargetVoice) {
      const voice = response1.data.find(v => v.coefont === voiceId);
      console.log(`   Voice name: ${voice.name}`);
    }
  } catch (error) {
    console.error('❌ Failed to list voices:', error.response?.status, error.response?.data);
  }
  
  // Test 2: Generate speech with different signature methods
  console.log('\n=== Test 2: Generate Speech ===');
  
  const date2 = Math.floor(Date.now() / 1000).toString();
  const requestBody = {
    coefont: voiceId,
    text: 'テストです',
    speed: 1.0,
    pitch: 0,
    volume: 1.0,
    format: 'wav',
    kana: false
  };
  
  // Method A: Date + JSON body (current implementation)
  console.log('\nMethod A: date + JSON.stringify(body)');
  try {
    const dataA = date2 + JSON.stringify(requestBody);
    const signatureA = crypto.createHmac('sha256', accessSecret).update(dataA).digest('hex');
    console.log('Data for signature:', dataA.substring(0, 100) + '...');
    console.log('Signature:', signatureA.substring(0, 30) + '...');
    
    const responseA = await axios.post(
      'https://api.coefont.cloud/v2/text2speech',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessKey,
          'X-Coefont-Date': date2,
          'X-Coefont-Content': signatureA
        },
        responseType: 'arraybuffer',
        timeout: 10000
      }
    );
    console.log('✅ Success with method A! Response size:', responseA.data.length);
  } catch (error) {
    console.error('❌ Method A failed:', error.response?.status);
    if (error.response?.data) {
      const text = Buffer.from(error.response.data).toString('utf-8');
      console.error('   Error:', text);
    }
  }
  
  // Method B: JSON body only
  console.log('\nMethod B: JSON.stringify(body) only');
  try {
    const dataB = JSON.stringify(requestBody);
    const signatureB = crypto.createHmac('sha256', accessSecret).update(dataB).digest('hex');
    console.log('Data for signature:', dataB.substring(0, 100) + '...');
    console.log('Signature:', signatureB.substring(0, 30) + '...');
    
    const responseB = await axios.post(
      'https://api.coefont.cloud/v2/text2speech',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessKey,
          'X-Coefont-Date': date2,
          'X-Coefont-Content': signatureB
        },
        responseType: 'arraybuffer',
        timeout: 10000
      }
    );
    console.log('✅ Success with method B! Response size:', responseB.data.length);
  } catch (error) {
    console.error('❌ Method B failed:', error.response?.status);
    if (error.response?.data) {
      const text = Buffer.from(error.response.data).toString('utf-8');
      console.error('   Error:', text);
    }
  }
}

testCoeFont();