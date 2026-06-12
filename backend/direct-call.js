/**
 * Direct Call Script - Dashboard を経由せずに直接電話発信
 *
 * 使用方法:
 *   node direct-call.js +81929843200
 *
 * 動作:
 *   1. testlin ユーザーの AgentSettings を使用
 *   2. テスト用 Customer を一時作成
 *   3. CallSession を作成（assignedAgent = testlin）
 *   4. Twilio で発信開始
 *   5. Twilio webhook → ngrok → ローカル backend → mediaStreamController.js
 *   6. OpenAI Realtime + Cartesia TTS で AI 応答
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const mongoose = require('mongoose');
const twilio = require('twilio');
const User = require('./models/User');
const AgentSettings = require('./models/AgentSettings');
const Customer = require('./models/Customer');
const CallSession = require('./models/CallSession');

const TARGET_PHONE = process.argv[2];
if (!TARGET_PHONE) {
  console.error('❌ 電話番号を引数で指定してください');
  console.error('   例: node direct-call.js +81929843200');
  process.exit(1);
}

const AGENT_EMAIL = 'testlin@testing.com';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // === 1. testlin ユーザーを取得 ===
    const testlin = await User.findOne({ email: AGENT_EMAIL });
    if (!testlin) {
      console.error('❌ testlin が見つかりません。create-test-admin.js を先に実行してください');
      process.exit(1);
    }
    console.log('Agent:', testlin.email, '(_id:', testlin._id, ')');

    // === 2. AgentSettings を取得 ===
    const agentSettings = await AgentSettings.findOne({ userId: testlin._id });
    if (!agentSettings) {
      console.error('❌ AgentSettings が見つかりません。setup-testlin-for-calls.js を先に実行してください');
      process.exit(1);
    }
    console.log('AgentSettings:', agentSettings._id);

    // === 3. テスト用 Customer を作成 ===
    const customer = await Customer.create({
      userId: testlin._id,
      customer: 'TEST Direct Call (DELETE ME)',
      company: 'テスト株式会社',
      phone: TARGET_PHONE,
      email: 'test-direct@testing.com',
      notes: 'TEST_CLEANUP - direct call test'
    });
    console.log('Customer 作成:', customer._id);

    // === 4. CallSession を作成 ===
    const callSession = await CallSession.create({
      customerId: customer._id,
      userId: testlin._id,
      assignedAgent: testlin._id,
      twilioCallSid: 'pending',
      status: 'initiated',
      phoneNumber: TARGET_PHONE,
      aiConfiguration: {
        companyName: agentSettings.conversationSettings?.companyName || 'テスト会社',
        serviceName: agentSettings.conversationSettings?.serviceName || 'テストサービス',
        representativeName: agentSettings.conversationSettings?.representativeName || 'テスト林',
        targetDepartment: agentSettings.conversationSettings?.targetDepartment || '営業部'
      }
    });
    console.log('CallSession 作成:', callSession._id);

    // === 5. Webhook URL 確認 ===
    const baseUrl = process.env.BASE_URL || process.env.NGROK_URL;
    if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('onrender.com')) {
      console.error('⚠ BASE_URL が ngrok を指していません:', baseUrl);
      console.error('   .env.local の BASE_URL を ngrok URL に設定してください');
      process.exit(1);
    }
    const webhookUrl = `${baseUrl}/api/twilio/voice/conference/${callSession._id}`;
    console.log('Webhook URL:', webhookUrl);

    // === 6. Twilio で発信 ===
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const fromNumber = process.env.TWILIO_PHONE_NUMBER_DEV || process.env.TWILIO_PHONE_NUMBER;

    console.log('\n📞 発信中...');
    console.log('  From:', fromNumber);
    console.log('  To  :', TARGET_PHONE);

    const call = await client.calls.create({
      to: TARGET_PHONE,
      from: fromNumber,
      url: webhookUrl,
      statusCallback: `${baseUrl}/api/twilio/call/status/${callSession._id}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      method: 'POST'
    });

    callSession.twilioCallSid = call.sid;
    await callSession.save();

    console.log('\n========================================');
    console.log('✅ 発信開始');
    console.log('========================================');
    console.log('Call SID :', call.sid);
    console.log('Status   :', call.status);
    console.log('========================================');
    console.log('\n📱 あなたの携帯が鳴ります。電話に出てください。');
    console.log('   AI (Cartesia 音声) が話しかけます。');
    console.log('\n📋 backend terminal のログを見て、以下を確認:');
    console.log('   [OpenAI] Connected to Realtime API');
    console.log('   [Cartesia] Connected');
    console.log('   [Cartesia] Sending text ...');

    setTimeout(async () => {
      await mongoose.connection.close();
      process.exit(0);
    }, 3000);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.code) console.error('   Twilio code:', err.code);
    if (err.moreInfo) console.error('   More info:', err.moreInfo);
    process.exit(1);
  }
}

run();
