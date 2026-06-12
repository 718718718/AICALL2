// Direct Twilio test script
const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

console.log('=== Twilio Direct Test ===');
console.log('Account SID:', accountSid);
console.log('Auth Token:', authToken ? '***' + authToken.slice(-4) : 'NOT SET');
console.log('From Number:', fromNumber);
console.log('Ngrok URL:', process.env.NGROK_URL);

// Create Twilio client
const client = twilio(accountSid, authToken);

// Test function
async function testCall() {
  try {
    // Test phone number (use a test number)
    const testNumber = '+819062660207'; // Replace with your test number
    
    console.log('\n=== Making Test Call ===');
    console.log('To:', testNumber);
    console.log('From:', fromNumber);
    console.log('Voice URL:', `${process.env.NGROK_URL}/api/twilio/voice`);
    
    const call = await client.calls.create({
      to: testNumber,
      from: fromNumber,
      url: `${process.env.NGROK_URL}/api/twilio/voice`,
      method: 'POST',
      statusCallback: `${process.env.NGROK_URL}/api/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    });
    
    console.log('\n✅ Call created successfully!');
    console.log('Call SID:', call.sid);
    console.log('Status:', call.status);
    console.log('Direction:', call.direction);
    console.log('Created:', call.dateCreated);
    
  } catch (error) {
    console.error('\n❌ Error making call:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('More info:', error.moreInfo);
    
    if (error.code === 20003) {
      console.error('\nAuthentication error - check your Account SID and Auth Token');
    } else if (error.code === 21211) {
      console.error('\nInvalid phone number format');
    } else if (error.code === 21608) {
      console.error('\nThe phone number is not verified or is invalid');
    }
  }
}

// Check account status
async function checkAccount() {
  try {
    console.log('\n=== Checking Account Status ===');
    const account = await client.api.accounts(accountSid).fetch();
    console.log('Account Status:', account.status);
    console.log('Account Type:', account.type);
    console.log('Account Name:', account.friendlyName);
    
    // Check phone numbers
    console.log('\n=== Checking Phone Numbers ===');
    const phoneNumbers = await client.incomingPhoneNumbers.list({ limit: 5 });
    phoneNumbers.forEach(number => {
      console.log(`- ${number.phoneNumber} (${number.friendlyName})`);
    });
    
  } catch (error) {
    console.error('Error checking account:', error.message);
  }
}

// Run tests
async function runTests() {
  await checkAccount();
  await testCall();
}

runTests();