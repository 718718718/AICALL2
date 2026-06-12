const axios = require('axios');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const NGROK_API_URL = 'http://localhost:4040/api/tunnels';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+819062660207';

async function getNgrokUrl() {
  try {
    // ngrokのAPIからトンネル情報を取得
    const response = await axios.get(NGROK_API_URL);
    const tunnels = response.data.tunnels;
    
    // httpsのトンネルを探す
    const httpsTunnel = tunnels.find(t => t.proto === 'https');
    if (!httpsTunnel) {
      throw new Error('No HTTPS tunnel found');
    }
    
    return httpsTunnel.public_url;
  } catch (error) {
    // ngrokが起動していない場合は起動を促す
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ ngrokが起動していません。以下のコマンドを実行してください:');
      console.error('   ngrok http 5000');
      return null;
    }
    throw error;
  }
}

async function updateEnvFile(ngrokUrl) {
  // .envと.env.localの両方を更新
  const envFiles = ['.env', '.env.local'];

  for (const envFile of envFiles) {
    const envPath = path.join(__dirname, envFile);

    if (!fs.existsSync(envPath)) {
      console.log(`   ⚠️ ${envFile}が見つかりません（スキップ）`);
      continue;
    }

    let envContent = fs.readFileSync(envPath, 'utf-8');

    // BASE_URLを更新
    envContent = envContent.replace(
      /BASE_URL=.*/,
      `BASE_URL=${ngrokUrl}`
    );

    // NGROK_URLも更新（存在する場合）
    envContent = envContent.replace(
      /NGROK_URL=.*/,
      `NGROK_URL=${ngrokUrl}`
    );

    // WEBHOOK_BASE_URL_DEVも更新（.env.localの場合）
    envContent = envContent.replace(
      /WEBHOOK_BASE_URL_DEV=.*/,
      `WEBHOOK_BASE_URL_DEV=${ngrokUrl}`
    );

    fs.writeFileSync(envPath, envContent);
    console.log(`   ✅ ${envFile}を更新しました`);
  }
}

async function updateTwilioWebhook(ngrokUrl) {
  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    
    // 電話番号の設定を取得
    const phoneNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: TWILIO_PHONE_NUMBER
    });
    
    if (phoneNumbers.length === 0) {
      console.error('❌ Twilio電話番号が見つかりません:', TWILIO_PHONE_NUMBER);
      return false;
    }
    
    const phoneNumberSid = phoneNumbers[0].sid;
    
    // Webhook URLを更新
    await client.incomingPhoneNumbers(phoneNumberSid).update({
      voiceUrl: `${ngrokUrl}/api/twilio/voice`,
      voiceMethod: 'POST',
      statusCallbackUrl: `${ngrokUrl}/api/twilio/status`,
      statusCallbackMethod: 'POST'
    });
    
    console.log('✅ Twilio Webhook URLを更新しました');
    console.log(`   Voice URL: ${ngrokUrl}/api/twilio/voice`);
    console.log(`   Status URL: ${ngrokUrl}/api/twilio/status`);
    
    return true;
  } catch (error) {
    console.error('❌ Twilioの更新に失敗しました:', error.message);
    return false;
  }
}

async function setupNgrokAndTwilio() {
  console.log('🚀 ngrok URLの取得とTwilio設定を開始します...\n');
  
  try {
    // 1. ngrok URLを取得
    console.log('1️⃣ ngrok URLを取得中...');
    const ngrokUrl = await getNgrokUrl();
    
    if (!ngrokUrl) {
      process.exit(1);
    }
    
    console.log(`   URL: ${ngrokUrl}\n`);
    
    // 2. .envファイルを更新
    console.log('2️⃣ .envファイルを更新中...');
    await updateEnvFile(ngrokUrl);
    console.log();
    
    // 3. Twilio Webhookを更新
    console.log('3️⃣ Twilio Webhookを更新中...');
    const twilioUpdated = await updateTwilioWebhook(ngrokUrl);
    console.log();
    
    if (twilioUpdated) {
      console.log('✨ セットアップが完了しました！');
      console.log('\n📞 テスト用の電話番号:', TWILIO_PHONE_NUMBER);
      console.log('🌐 ngrok URL:', ngrokUrl);
      console.log('\n💡 サーバーを再起動してください:');
      console.log('   npm run dev');
    } else {
      console.log('⚠️ Twilioの更新に失敗しましたが、ngrok URLは設定されました');
      console.log('手動でTwilioコンソールから以下のURLを設定してください:');
      console.log(`Voice URL: ${ngrokUrl}/api/twilio/voice`);
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

// 実行
setupNgrokAndTwilio();