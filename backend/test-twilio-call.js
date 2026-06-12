require('dotenv').config();
const mongoose = require('mongoose');
const twilio = require('twilio');
const CallSession = require('./models/CallSession');
const Customer = require('./models/Customer');
const AgentSettings = require('./models/AgentSettings');

// Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// MongoDB接続
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// テスト通話を開始
const makeTestCall = async () => {
  try {
    await connectDB();
    
    // テスト用の顧客を取得（最初の顧客を使用）
    let customer = await Customer.findOne({ phone: '09062660207' });
    if (!customer) {
      // 既存の顧客が見つからない場合は作成
      customer = await Customer.create({
        name: 'テスト顧客',
        company: 'テスト会社',
        phone: '09062660207', // 実際のテスト番号
        email: 'test@example.com'
      });
    }
    
    // 電話番号を国際フォーマットに変換
    let phoneNumber = customer.phone;
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '+81' + phoneNumber.substring(1);
    }
    console.log('通話先番号:', phoneNumber);
    
    // デフォルトのエージェント設定を取得
    const agentSettings = await AgentSettings.findOne();
    if (!agentSettings) {
      console.error('エージェント設定が見つかりません。先に設定してください。');
      process.exit(1);
    }
    
    // 通話セッションを作成
    const callSession = await CallSession.create({
      customerId: customer._id,
      twilioCallSid: 'pending',
      status: 'initiated',
      aiConfiguration: {
        companyName: agentSettings.conversationSettings.companyName,
        serviceName: agentSettings.conversationSettings.serviceName,
        representativeName: agentSettings.conversationSettings.representativeName,
        targetDepartment: agentSettings.conversationSettings.targetDepartment
      }
    });
    
    console.log('作成された通話セッション:', callSession._id);
    console.log('ngrok URL:', process.env.BASE_URL);
    console.log('Webhook URL:', `${process.env.BASE_URL}/api/twilio/voice/conference/${callSession._id}`);
    
    // Twilioで通話を開始
    const call = await client.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${process.env.BASE_URL}/api/twilio/voice/conference/${callSession._id}`,
      statusCallback: `${process.env.BASE_URL}/api/twilio/call/status/${callSession._id}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      method: 'POST'
    });
    
    console.log('通話が開始されました:');
    console.log('- Call SID:', call.sid);
    console.log('- From:', call.from);
    console.log('- To:', call.to);
    console.log('- Status:', call.status);
    
    // CallSessionを更新
    callSession.twilioCallSid = call.sid;
    callSession.status = 'initiated';
    await callSession.save();
    
    console.log('\n通話が正常に開始されました！');
    console.log('サーバーのログを確認して、会話の流れを追跡してください。');
    
    // 5秒待ってから終了
    setTimeout(async () => {
      await mongoose.connection.close();
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// 実行
makeTestCall();