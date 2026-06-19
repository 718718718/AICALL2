function getTwilioConfig() {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const isTwilioConfigured = twilioAccountSid && twilioAuthToken && twilioPhoneNumber;
  return { accountSid: twilioAccountSid, authToken: twilioAuthToken, phoneNumber: twilioPhoneNumber, isConfigured: isTwilioConfigured };
}

console.log('[Twilio Init] Loading configuration on first call...');

let twilioClient = null;

function initializeTwilioClient(config) {
  if (!twilioClient && config.isConfigured) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(config.accountSid, config.authToken);
      console.log('[Twilio] Client initialized successfully');
    } catch (error) {
      console.log('[Twilio] Client initialization failed:', error.message);
    }
  }
  return twilioClient;
}

exports.makeCall = async (phoneNumber, sessionId, userId = null) => {
  console.log('=== Twilio Service - makeCall ===');
  console.log('Phone Number:', phoneNumber);
  console.log('Session ID:', sessionId);
  console.log('User ID:', userId);

  const config = getTwilioConfig();

  if (!config.isConfigured) {
    console.log('❌ Twilio not configured - simulating call to:', phoneNumber);
    return { sid: 'SIMULATED_CALL_' + sessionId, status: 'simulated', to: phoneNumber, from: 'SIMULATED' };
  }

  const client = initializeTwilioClient(config);

  try {
    let formattedNumber = phoneNumber.replace(/[^\d+]/g, '');
    if (!formattedNumber.startsWith('+')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '+81' + formattedNumber.substring(1);
      } else if (!formattedNumber.startsWith('81')) {
        formattedNumber = '+81' + formattedNumber;
      } else {
        formattedNumber = '+' + formattedNumber;
      }
    }
    console.log('[TwilioService] Formatted phone number:', formattedNumber);

    let fromNumber = null;
    let userDoc = null;

    if (userId) {
      try {
        const User = require('../models/User');
        userDoc = await User.findById(userId);

        if (userDoc && userDoc.twilioPhoneNumber && userDoc.twilioPhoneNumberStatus === 'active') {
          fromNumber = userDoc.twilioPhoneNumber;
          console.log(`[TwilioService] Using user's assigned number: ${fromNumber}`);
        } else if (process.env.NODE_ENV === 'development') {
          fromNumber = process.env.TWILIO_PHONE_NUMBER;
          console.log(`[TwilioService] Development mode: Using default number: ${fromNumber}`);
        } else {
          throw new Error(
            '電話番号が割り当てられていません。運営会社にお問い合わせください。\n' +
            'No phone number assigned to this user. Please contact the administrator.'
          );
        }
      } catch (userError) {
        console.error('[TwilioService] Error:', userError);
        throw userError;
      }
    } else {
      throw new Error(
        'ユーザー情報が提供されていません。運営会社にお問い合わせください。\n' +
        'User information not provided. Please contact the administrator.'
      );
    }

    const baseUrl = process.env.NODE_ENV === 'production'
      ? (process.env.BASE_URL_PROD || process.env.BASE_URL || (() => { throw new Error('BASE_URL_PROD or BASE_URL must be set in production'); })())
      : (process.env.BASE_URL || process.env.NGROK_URL || 'http://localhost:5000');

    // ✅ ユーザー個別のBYOC番号を優先して使用
    const { getByocCallParams } = require('../utils/byocFrom');
    const callParams = getByocCallParams(fromNumber, userDoc);

    console.log('[TwilioService] Making call to:', formattedNumber);
    console.log('[TwilioService] From number:', callParams.from, callParams.byoc ? `(BYOC trunk: ${callParams.byoc})` : '(Twilio PSTN)');
    console.log('[TwilioService] Using webhook URL:', `${baseUrl}/api/twilio/voice/conference/${sessionId}`);

    const call = await client.calls.create({
      to: formattedNumber,
      ...callParams,
      url: `${baseUrl}/api/twilio/voice/conference/${sessionId}`,
      statusCallback: `${baseUrl}/api/twilio/call/status/${sessionId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no-answer', 'cancelled'],
      statusCallbackMethod: 'POST',
      method: 'POST',
      record: true,
      recordingStatusCallback: `${baseUrl}/api/twilio/recording/status/${sessionId}`,
      recordingStatusCallbackMethod: 'POST'
    });

    console.log(`[TwilioService] Call created successfully:`);
    console.log(`[TwilioService] Call SID: ${call.sid}`);
    console.log(`[TwilioService] Call Status: ${call.status}`);
    return call;

  } catch (error) {
    console.error('Twilio call error:', error);
    throw error;
  }
};

exports.endCall = async (callSid) => {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    console.log('Twilio not configured - simulating end call:', callSid);
    return { status: 'completed' };
  }
  const client = initializeTwilioClient(config);
  try {
    const call = await client.calls(callSid).update({ status: 'completed' });
    console.log('[TwilioService] Call ended successfully:', callSid);
    return call;
  } catch (error) {
    console.error('Twilio end call error:', error);
    throw error;
  }
};

exports.getCallStatus = async (callSid) => {
  const config = getTwilioConfig();
  if (!config.isConfigured) {
    return { status: 'completed', duration: 60 };
  }
  const client = initializeTwilioClient(config);
  try {
    const call = await client.calls(callSid).fetch();
    return call;
  } catch (error) {
    console.error('Twilio get call status error:', error);
    throw error;
  }
};
