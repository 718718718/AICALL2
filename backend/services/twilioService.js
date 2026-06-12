// Twilio service placeholder
// This file provides basic structure for Twilio integration
// Actual implementation will need valid Twilio credentials

// Get configuration lazily to ensure environment variables are loaded
function getTwilioConfig() {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  const isTwilioConfigured = twilioAccountSid && twilioAuthToken && twilioPhoneNumber;
  
  return {
    accountSid: twilioAccountSid,
    authToken: twilioAuthToken,
    phoneNumber: twilioPhoneNumber,
    isConfigured: isTwilioConfigured
  };
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
  
  console.log('Twilio Configured:', config.isConfigured);
  console.log('Account SID:', config.accountSid ? 'SET' : 'NOT SET');
  console.log('Auth Token:', config.authToken ? 'SET' : 'NOT SET');
  console.log('Phone Number:', config.phoneNumber ? config.phoneNumber : 'NOT SET');
  
  if (!config.isConfigured) {
    console.log('❌ Twilio not configured - simulating call to:', phoneNumber);
    return {
      sid: 'SIMULATED_CALL_' + sessionId,
      status: 'simulated',
      to: phoneNumber,
      from: 'SIMULATED'
    };
  }
  
  const client = initializeTwilioClient(config);

  try {
    // Format phone number for international dialing
    let formattedNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Add country code if not present (assuming Japan)
    if (!formattedNumber.startsWith('+')) {
      if (formattedNumber.startsWith('0')) {
        // Remove leading 0 and add Japan country code
        formattedNumber = '+81' + formattedNumber.substring(1);
      } else if (!formattedNumber.startsWith('81')) {
        formattedNumber = '+81' + formattedNumber;
      } else {
        formattedNumber = '+' + formattedNumber;
      }
    }
    
    console.log('[TwilioService] Formatted phone number:', formattedNumber);
    
    // Determine which phone number to use
    let fromNumber = null;
    
    if (userId) {
      try {
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        if (user && user.twilioPhoneNumber && user.twilioPhoneNumberStatus === 'active') {
          fromNumber = user.twilioPhoneNumber;
          console.log(`[TwilioService] Using user's assigned number: ${fromNumber}`);
        } else if (process.env.NODE_ENV === 'development') {
          // 開発環境では環境変数の電話番号を使用
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
      // userIdが提供されていない場合もエラー
      throw new Error(
        'ユーザー情報が提供されていません。運営会社にお問い合わせください。\n' +
        'User information not provided. Please contact the administrator.'
      );
    }
    
    // Use webhook base URL from environment
    const baseUrl = process.env.NODE_ENV === 'production'
      ? (process.env.BASE_URL_PROD || process.env.BASE_URL || (() => { throw new Error('BASE_URL_PROD or BASE_URL must be set in production'); })())
      : (process.env.BASE_URL || process.env.NGROK_URL || 'http://localhost:5000');
    // BYOC設定があれば03番号＋BYOCトランク経由に切り替え（未設定なら従来のfromNumber）
    const { getByocCallParams } = require('../utils/byocFrom');
    const callParams = getByocCallParams(fromNumber);

    console.log('[TwilioService] Making call to:', formattedNumber);
    console.log('[TwilioService] From number:', callParams.from, callParams.byoc ? `(BYOC trunk: ${callParams.byoc})` : '(Twilio PSTN)');
    console.log('[TwilioService] Using webhook URL:', `${baseUrl}/api/twilio/voice/conference/${sessionId}`);
    console.log('[TwilioService] Session ID:', sessionId);

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
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      moreInfo: error.moreInfo,
      status: error.status,
      details: error.details
    });
    
    // 特定のエラーコードに基づく詳細ログ
    if (error.code) {
      console.error(`[TwilioService] Specific error - Code: ${error.code}`);
      switch (error.code) {
        case 21215:
          console.error('[TwilioService] Account not authorized to make calls to this number');
          break;
        case 21219:
          console.error('[TwilioService] Invalid phone number format');
          break;
        case 21220:
          console.error('[TwilioService] Invalid phone number');
          break;
        case 30006:
          console.error('[TwilioService] Busy signal');
          break;
        case 30008:
          console.error('[TwilioService] Call answered by answering machine');
          break;
        case 13224:
          console.error('[TwilioService] Rate limit exceeded - too many requests');
          break;
        default:
          console.error(`[TwilioService] Unknown error code: ${error.code}`);
      }
    }
    
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
    const call = await client.calls(callSid).update({
      status: 'completed'
    });
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
    console.log('Twilio not configured - simulating get call status:', callSid);
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