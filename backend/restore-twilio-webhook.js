require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const restorePhoneNumber = async () => {
  try {
    // 元のVercel URL
    const originalUrl = process.env.FRONTEND_URL || process.env.FRONTEND_URL_PROD;
    if (!originalUrl) { console.error('FRONTEND_URL is not set'); process.exit(1); }
    
    // 使用する電話番号
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER; // +16076956082
    
    // 電話番号リソースを取得
    const phoneNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber
    });
    
    if (phoneNumbers.length === 0) {
      console.error('電話番号が見つかりません:', phoneNumber);
      process.exit(1);
    }
    
    const phoneNumberSid = phoneNumbers[0].sid;
    console.log('電話番号SID:', phoneNumberSid);
    console.log('現在のVoice URL:', phoneNumbers[0].voiceUrl);
    
    // Webhook URLを元に戻す
    const updatedNumber = await client.incomingPhoneNumbers(phoneNumberSid).update({
      voiceUrl: `${originalUrl}/api/twilio/voice`,
      voiceMethod: 'POST',
      statusCallback: `${originalUrl}/api/twilio/status`,
      statusCallbackMethod: 'POST'
    });
    
    console.log('\n✅ Twilioの電話番号設定を元に戻しました:');
    console.log('電話番号:', updatedNumber.phoneNumber);
    console.log('復元されたVoice URL:', updatedNumber.voiceUrl);
    console.log('メソッド:', updatedNumber.voiceMethod);
    
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  }
};

restorePhoneNumber();