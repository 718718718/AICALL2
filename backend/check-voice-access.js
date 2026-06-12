const axios = require('axios');
const crypto = require('crypto');

async function checkVoiceAccess() {
  const accessKey = 'oFkzx6sV0CRfkS89Exn6BFO1O';
  const accessSecret = 'VaxBkyYeDD1XsRtygcr06AQVuyzmGW8qPbY5ecCS';
  
  console.log('=== CoeFont Voice Access Check ===');
  console.log('API Key:', accessKey);
  console.log('');
  
  // Get all available voices
  const date = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', accessSecret).update(date).digest('hex');
  
  try {
    const response = await axios.get('https://api.coefont.cloud/v2/coefonts/pro', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': accessKey,
        'X-Coefont-Date': date,
        'X-Coefont-Content': sig
      }
    });
    
    console.log(`Total voices available: ${response.data.length}`);
    console.log('\nTesting each voice for actual access...\n');
    
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    // Test first 5 voices to avoid rate limiting
    const voicesToTest = response.data.slice(0, 10);
    
    for (const voice of voicesToTest) {
      const testDate = Math.floor(Date.now() / 1000).toString();
      const testBody = {
        coefont: voice.coefont,
        text: 'テスト',
        speed: 1,
        pitch: 0,
        volume: 1,
        format: 'wav',
        kana: false
      };
      
      const testSig = crypto.createHmac('sha256', accessSecret)
        .update(testDate + JSON.stringify(testBody))
        .digest('hex');
      
      try {
        const testResponse = await axios.post(
          'https://api.coefont.cloud/v2/text2speech',
          testBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': accessKey,
              'X-Coefont-Date': testDate,
              'X-Coefont-Content': testSig
            },
            responseType: 'arraybuffer',
            timeout: 5000,
            maxRedirects: 0,
            validateStatus: (status) => status < 500
          }
        );
        
        if (testResponse.status === 302 || testResponse.status === 200) {
          console.log(`✅ ${voice.name.padEnd(30)} - ACCESSIBLE`);
          results.push({ voice: voice.name, id: voice.coefont, status: 'accessible' });
          successCount++;
        } else if (testResponse.status === 403) {
          console.log(`❌ ${voice.name.padEnd(30)} - NO ACCESS (403)`);
          results.push({ voice: voice.name, id: voice.coefont, status: 'no_access' });
          failCount++;
        } else {
          console.log(`⚠️  ${voice.name.padEnd(30)} - Status: ${testResponse.status}`);
          results.push({ voice: voice.name, id: voice.coefont, status: `error_${testResponse.status}` });
          failCount++;
        }
      } catch (error) {
        const status = error.response?.status || 'network_error';
        console.log(`❌ ${voice.name.padEnd(30)} - Error: ${status}`);
        results.push({ voice: voice.name, id: voice.coefont, status: `error_${status}` });
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n=== Summary ===');
    console.log(`Tested: ${voicesToTest.length} voices`);
    console.log(`Accessible: ${successCount}`);
    console.log(`No Access: ${failCount}`);
    
    console.log('\n=== Voice ID 150e5a43-d156-4c5d-ba99-f266eb52d53d ===');
    const targetVoice = results.find(r => r.id === '150e5a43-d156-4c5d-ba99-f266eb52d53d');
    if (targetVoice) {
      console.log(`Status: ${targetVoice.status}`);
      if (targetVoice.status === 'no_access') {
        console.log('\n⚠️ This voice appears in your Pro list but you don\'t have usage rights.');
        console.log('You may need to:');
        console.log('1. Purchase this specific voice on CoeFont platform');
        console.log('2. Check if your subscription plan includes this voice');
        console.log('3. Contact CoeFont support to enable API access for this voice');
      }
    } else {
      console.log('Not tested (not in first 10 voices)');
    }
    
    console.log('\n=== Accessible Voice IDs ===');
    results.filter(r => r.status === 'accessible').forEach(r => {
      console.log(`${r.id} - ${r.voice}`);
    });
    
  } catch (error) {
    console.error('Failed to get voice list:', error.message);
  }
}

checkVoiceAccess();