const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const CallSession = require('../models/CallSession');
const coefontService = require('../services/cartesiaService');
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Handoff Redirect Endpoint
 * This endpoint is called when a customer's call is redirected during handoff
 * It generates TwiML to move the customer into the Conference room
 *
 * @route POST /api/twilio/handoff-redirect/:callId
 * @access Public (Twilio webhook)
 */
exports.handleHandoffRedirect = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;

  console.log('[Handoff Redirect] Called for callId:', callId);
  console.log('[Handoff Redirect] Request body:', req.body);

  try {
    // CRITICAL: Disconnect Media Streams WebSocket NOW (after redirect succeeded)
    // This is safe because Twilio has already moved to this new endpoint
    // Disconnecting BEFORE redirect causes call to drop
    if (global.activeMediaStreams && global.activeMediaStreams.has(callId)) {
      console.log('[Handoff Redirect] Disconnecting Media Streams');
      const connection = global.activeMediaStreams.get(callId);

      // Close OpenAI WebSocket
      if (connection.openaiWs && connection.openaiWs.readyState === 1) { // 1 = OPEN
        console.log('[Handoff Redirect] Closing OpenAI WebSocket');
        connection.openaiWs.close();
      }

      // Remove from global map
      global.activeMediaStreams.delete(callId);
      console.log('[Handoff Redirect] Media Streams disconnected successfully');
    }

    // Load CallSession
    const callSession = await CallSession.findById(callId);

    if (!callSession) {
      console.error('[Handoff Redirect] CallSession not found:', callId);
      return next(new ErrorResponse('Call session not found', 404));
    }

    console.log('[Handoff Redirect] CallSession found:', {
      id: callSession._id,
      status: callSession.status,
      conferenceName: callSession.handoffDetails?.conferenceName
    });

    // Get conference name from handoffDetails
    const conferenceName = callSession.handoffDetails?.conferenceName
                        || callSession.handoffDetails?.pendingConferenceName
                        || `handoff-${callId}`;

    console.log('[Handoff Redirect] Using conference name:', conferenceName);

    // Generate TwiML to join Conference
    const twiml = new VoiceResponse();

    // Removed duplicate announcement message (AI already announces handoff)
    // The OpenAI Realtime API handles the handoff announcement naturally

    // Add customer to Conference with recording enabled
    const dial = twiml.dial();
    dial.conference({
      startConferenceOnEnter: false,
      endConferenceOnExit: false,
      record: 'record-from-start', // Enable recording of the conference
      recordingStatusCallback: `${process.env.BASE_URL}/api/twilio/conference/recording/${callId}`,
      recordingStatusCallbackMethod: 'POST',
      statusCallback: `${process.env.BASE_URL}/api/twilio/conference/events/${callId}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: 'start end join leave mute hold'
    }, conferenceName);

    console.log('[Handoff Redirect] Generated TwiML:', twiml.toString());

    // Send TwiML response
    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Handoff Redirect] Error:', error.message);
    console.error('[Handoff Redirect] Stack:', error.stack);

    // Send error TwiML
    const errorTwiml = new VoiceResponse();
    errorTwiml.say(
      { voice: 'Polly.Mizuki', language: 'ja-JP' },
      '申し訳ございません。接続に失敗しました。'
    );
    errorTwiml.hangup();

    res.type('text/xml');
    res.send(errorTwiml.toString());
  }
});

module.exports = exports;
