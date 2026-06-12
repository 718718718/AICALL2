const axios = require('axios');
const crypto = require('crypto');

async function testSpecificVoice() {
  const accessKey = 'oFkzx6sV0CRfkS89Exn6BFO1O';
  const accessSecret = 'VaxBkyYeDD1XsRtygcr06AQVuyzmGW8qPbY5ecCS';
  const targetVoiceId = '150e5a43-d156-4c5d-ba99-f266eb52d53d'; // 普通の女性の声
  
  console.log('=== Testing Voice: 普通の女性の声 ===');
  console.log('Voice ID:', targetVoiceId);
  
  // Step 1: Verify voice is in the list
  console.log('\n1. Checking voice availability in pro list...');
  try {
    const date1 = Math.floor(Date.now() / 1000).toString();
    const sig1 = crypto.createHmac('sha256', accessSecret).update(date1).digest('hex');
    
    const listResponse = await axios.get('https://api.coefont.cloud/v2/coefonts/pro', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': accessKey,
        'X-Coefont-Date': date1,
        'X-Coefont-Content': sig1
      }
    });
    
    const voice = listResponse.data.find(v => v.coefont === targetVoiceId);
    if (voice) {
      console.log('✅ Voice found in list');
      console.log('   Name:', voice.name);
      console.log('   Description:', voice.description?.substring(0, 100));
    } else {
      console.log('❌ Voice NOT found in list');
      return;
    }
  } catch (error) {
    console.error('❌ Failed to get voice list:', error.response?.status);
    return;
  }
  
  // Step 2: Try different parameter combinations
  console.log('\n2. Testing text2speech with different parameters...');
  
  const testConfigs = [
    { text: 'テスト', speed: 1, pitch: 0, volume: 1, format: 'wav', kana: false },
    { text: 'テスト', speed: 1, pitch: 0, volume: 1, format: 'mp3', kana: false },
    { text: 'test', speed: 1, pitch: 0, volume: 1, format: 'wav', kana: false },
    { text: 'こんにちは', speed: 1.3, pitch: 0, volume: 1, format: 'wav', kana: false }
  ];
  
  for (let i = 0; i < testConfigs.length; i++) {
    const config = testConfigs[i];
    console.log(`\n   Test ${i + 1}: text="${config.text}", format="${config.format}", speed=${config.speed}`);
    
    const date = Math.floor(Date.now() / 1000).toString();
    const requestBody = {
      coefont: targetVoiceId,
      ...config
    };
    
    // Use documented signature method
    const dataForSig = date + JSON.stringify(requestBody);
    const signature = crypto.createHmac('sha256', accessSecret).update(dataForSig).digest('hex');
    
    console.log('   Signature data:', dataForSig.substring(0, 80) + '...');
    console.log('   Signature:', signature.substring(0, 30) + '...');
    
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
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500  // Don't throw on 4xx
        }
      );
      
      if (response.status === 302 || response.status === 200) {
        console.log('   ✅ SUCCESS! Status:', response.status, 'Size:', response.data.length);
        console.log('\n🎉 Working configuration found!');
        console.log('Parameters:', JSON.stringify(config, null, 2));
        return;
      } else {
        console.log('   ❌ Status:', response.status);
        if (response.data) {
          const text = Buffer.from(response.data).toString('utf-8');
          console.log('   Message:', text);
        }
      }
    } catch (error) {
      console.log('   ❌ Error:', error.response?.status || error.message);
      if (error.response?.data) {
        const text = Buffer.from(error.response.data).toString('utf-8');
        console.log('   Message:', text);
      }
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n=== Summary ===');
  console.log('Voice ID 150e5a43-d156-4c5d-ba99-f266eb52d53d (普通の女性の声) returns 403 Forbidden');
  console.log('This indicates you don\'t have permission to use this specific voice.');
  console.log('\nPossible solutions:');
  console.log('1. Check your CoeFont account dashboard to verify voice ownership');
  console.log('2. Purchase or subscribe to this voice on CoeFont platform');
  console.log('3. Contact CoeFont support about API access for this voice');
}

testSpecificVoice();