const axios = require('axios');
const crypto = require('crypto');

async function testAllMethods() {
  const accessKey = 'oFkzx6sV0CRfkS89Exn6BFO1O';
  const accessSecret = 'VaxBkyYeDD1XsRtygcr06AQVuyzmGW8qPbY5ecCS';
  const voiceId = '150e5a43-d156-4c5d-ba99-f266eb52d53d';
  
  const requestBody = {
    coefont: voiceId,
    text: 'テスト',
    speed: 1,
    pitch: 0,
    volume: 1,
    format: 'wav',
    kana: false
  };
  
  const date = Math.floor(Date.now() / 1000).toString();
  
  // Test different signature combinations
  const tests = [
    {
      name: 'Method 1: POST + path + date + body',
      data: 'POST/v2/text2speech' + date + JSON.stringify(requestBody)
    },
    {
      name: 'Method 2: path + date + body',
      data: '/v2/text2speech' + date + JSON.stringify(requestBody)
    },
    {
      name: 'Method 3: Sorted JSON body + date',
      data: JSON.stringify(requestBody, Object.keys(requestBody).sort()) + date
    },
    {
      name: 'Method 4: Body with newlines',
      data: date + '\n' + JSON.stringify(requestBody)
    },
    {
      name: 'Method 5: Raw body string',
      data: `${date}{"coefont":"${voiceId}","text":"テスト","speed":1,"pitch":0,"volume":1,"format":"wav","kana":false}`
    },
    {
      name: 'Method 6: URL encoded body',
      data: date + new URLSearchParams(requestBody).toString()
    }
  ];
  
  for (const test of tests) {
    console.log(`\nTesting ${test.name}`);
    console.log('Signature data:', test.data.substring(0, 80) + '...');
    
    const signature = crypto.createHmac('sha256', accessSecret).update(test.data).digest('hex');
    console.log('Signature:', signature.substring(0, 30) + '...');
    
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
          timeout: 5000
        }
      );
      console.log('✅ SUCCESS! Audio size:', response.data.length);
      console.log('\n🎉 WORKING METHOD FOUND:', test.name);
      console.log('Signature generation:', test.data);
      break;
    } catch (error) {
      console.log('❌ Failed:', error.response?.status, error.response?.statusText);
    }
  }
}

testAllMethods();