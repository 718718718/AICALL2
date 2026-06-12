const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const CallSession = require('../models/CallSession');
const twilio = require('twilio');
const { getByocCallParams } = require('../utils/byocFrom');
const webSocketService = require('../services/websocket');
const coefontService = require('../services/cartesiaService');

// Twilio client initialization
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// @desc    Get conference participants
// @route   GET /api/calls/:callId/conference/participants
// @access  Private
exports.getConferenceParticipants = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  try {
    const conferenceName = `call-${callId}`;
    const conference = await client.conferences(conferenceName).fetch();
    
    if (!conference) {
      return res.status(200).json({
        success: true,
        data: {
          participants: [],
          status: 'no-conference'
        }
      });
    }

    const participants = await client
      .conferences(conferenceName)
      .participants
      .list();

    const participantDetails = participants.map(participant => ({
      callSid: participant.callSid,
      muted: participant.muted,
      hold: participant.hold,
      startConferenceOnEnter: participant.startConferenceOnEnter,
      endConferenceOnExit: participant.endConferenceOnExit,
      coaching: participant.coaching,
      callSidToCoach: participant.callSidToCoach
    }));

    res.status(200).json({
      success: true,
      data: {
        conferenceSid: conference.sid,
        status: conference.status,
        participants: participantDetails,
        participantCount: participants.length
      }
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to get conference participants: ${error.message}`, 500));
  }
});

// @desc    Mute/unmute conference participant
// @route   PUT /api/calls/:callId/conference/participants/:participantSid/mute
// @access  Private
exports.muteParticipant = asyncHandler(async (req, res, next) => {
  const { callId, participantSid } = req.params;
  const { muted = true } = req.body;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  try {
    const conferenceName = `call-${callId}`;
    
    const participant = await client
      .conferences(conferenceName)
      .participants(participantSid)
      .update({ muted });

    // WebSocketで通知
    webSocketService.sendToCallRoom(callId, 'participant-updated', {
      participantSid,
      muted,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      data: {
        participantSid,
        muted: participant.muted
      }
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to mute participant: ${error.message}`, 500));
  }
});

// @desc    Hold/unhold conference participant
// @route   PUT /api/calls/:callId/conference/participants/:participantSid/hold
// @access  Private
exports.holdParticipant = asyncHandler(async (req, res, next) => {
  const { callId, participantSid } = req.params;
  const { hold = true, holdUrl } = req.body;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  try {
    const conferenceName = `call-${callId}`;
    
    const updateParams = { hold };
    if (holdUrl) {
      updateParams.holdUrl = holdUrl;
    }

    const participant = await client
      .conferences(conferenceName)
      .participants(participantSid)
      .update(updateParams);

    // WebSocketで通知
    webSocketService.sendToCallRoom(callId, 'participant-updated', {
      participantSid,
      hold,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      data: {
        participantSid,
        hold: participant.hold
      }
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to hold participant: ${error.message}`, 500));
  }
});

// @desc    Remove participant from conference
// @route   DELETE /api/calls/:callId/conference/participants/:participantSid
// @access  Private
exports.removeParticipant = asyncHandler(async (req, res, next) => {
  const { callId, participantSid } = req.params;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  try {
    const conferenceName = `call-${callId}`;
    
    await client
      .conferences(conferenceName)
      .participants(participantSid)
      .remove();

    // WebSocketで通知
    webSocketService.sendToCallRoom(callId, 'participant-removed', {
      participantSid,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Participant removed from conference'
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to remove participant: ${error.message}`, 500));
  }
});

// @desc    Add participant to conference
// @route   POST /api/calls/:callId/conference/participants
// @access  Private
exports.addParticipant = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;
  const { 
    phoneNumber, 
    startConferenceOnEnter = false,
    endConferenceOnExit = false,
    muted = false,
    coaching = false,
    callSidToCoach
  } = req.body;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  if (!phoneNumber) {
    return next(new ErrorResponse('Phone number is required', 400));
  }

  try {
    const conferenceName = `call-${callId}`;
    
    // 新しい参加者を追加
    // BYOC設定があれば03番号＋BYOCトランク経由に切り替え（未設定なら従来のTWILIO_PHONE_NUMBER）
    const call = await client.calls.create({
      to: phoneNumber,
      ...getByocCallParams(process.env.TWILIO_PHONE_NUMBER),
      url: `${process.env.BASE_URL}/api/twilio/voice/conference/join/${conferenceName}`,
      statusCallback: `${process.env.BASE_URL}/api/twilio/call/participant-status/${callId}`
    });

    // Conference参加設定を保存（必要に応じて）
    // これはTwiMLエンドポイントで処理される

    // WebSocketで通知
    webSocketService.sendToCallRoom(callId, 'participant-adding', {
      phoneNumber,
      callSid: call.sid,
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      data: {
        callSid: call.sid,
        phoneNumber,
        status: 'calling'
      }
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to add participant: ${error.message}`, 500));
  }
});

// @desc    Play audio to conference
// @route   POST /api/calls/:callId/conference/play
// @access  Private
exports.playAudioToConference = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;
  const { audioUrl, message } = req.body;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  if (!audioUrl && !message) {
    return next(new ErrorResponse('Either audioUrl or message is required', 400));
  }

  try {
    const conferenceName = `call-${callId}`;
    
    // Conference内でオーディオを再生
    const participants = await client
      .conferences(conferenceName)
      .participants
      .list();

    if (participants.length === 0) {
      return next(new ErrorResponse('No participants in conference', 400));
    }

    // 最初の参加者のCallSidを使用
    const participantCallSid = participants[0].callSid;

    if (message) {
      // CoeFontを使用して音声URLを生成
      const audioUrl = await coefontService.generateSpeechUrl(message);
      if (audioUrl) {
        // CoeFontの音声URLを使用
        await client.calls(participantCallSid).update({
          twiml: `<Response><Play>${audioUrl}</Play></Response>`
        });
      } else {
        // フォールバック: Polly.Mizukiを使用
        await client.calls(participantCallSid).update({
          twiml: `<Response><Say voice="Polly.Mizuki" language="ja-JP">${message}</Say></Response>`
        });
      }
    } else if (audioUrl) {
      // オーディオファイルを再生
      await client.calls(participantCallSid).update({
        twiml: `<Response><Play>${audioUrl}</Play></Response>`
      });
    }

    // WebSocketで通知
    webSocketService.sendToCallRoom(callId, 'audio-played', {
      audioUrl,
      message,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Audio played to conference'
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to play audio: ${error.message}`, 500));
  }
});

// @desc    Start/stop conference recording
// @route   PUT /api/calls/:callId/conference/recording
// @access  Private
exports.manageRecording = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;
  const { action } = req.body; // 'start', 'stop', 'pause', 'resume'

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  if (!['start', 'stop', 'pause', 'resume'].includes(action)) {
    return next(new ErrorResponse('Invalid action. Use start, stop, pause, or resume', 400));
  }

  try {
    const conferenceName = `call-${callId}`;
    const conference = await client.conferences(conferenceName).fetch();

    if (!conference) {
      return next(new ErrorResponse('Conference not found', 404));
    }

    let result;
    
    if (action === 'start') {
      // 録音を開始
      const recording = await client
        .conferences(conferenceName)
        .recordings
        .create({
          recordingStatusCallback: `${process.env.BASE_URL}/api/twilio/recording/status/${callId}`,
          recordingStatusCallbackEvent: ['completed']
        });
      
      result = {
        recordingSid: recording.sid,
        status: 'recording'
      };
    } else {
      // 既存の録音を取得
      const recordings = await client
        .conferences(conferenceName)
        .recordings
        .list({ limit: 1 });

      if (recordings.length === 0) {
        return next(new ErrorResponse('No active recording found', 404));
      }

      const recordingSid = recordings[0].sid;

      if (action === 'stop') {
        await client.recordings(recordingSid).update({ status: 'stopped' });
        result = { status: 'stopped' };
      } else if (action === 'pause') {
        await client.recordings(recordingSid).update({ status: 'paused' });
        result = { status: 'paused' };
      } else if (action === 'resume') {
        await client.recordings(recordingSid).update({ status: 'in-progress' });
        result = { status: 'resumed' };
      }
    }

    // WebSocketで通知
    webSocketService.sendToCallRoom(callId, 'recording-status', {
      action,
      ...result,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(new ErrorResponse(`Failed to manage recording: ${error.message}`, 500));
  }
});

// @desc    Get conference status
// @route   GET /api/calls/:callId/conference/status
// @access  Private
exports.getConferenceStatus = asyncHandler(async (req, res, next) => {
  const { callId } = req.params;

  const callSession = await CallSession.findById(callId);
  if (!callSession) {
    return next(new ErrorResponse('Call session not found', 404));
  }

  try {
    const conferenceName = `call-${callId}`;
    const conference = await client.conferences(conferenceName).fetch();

    if (!conference) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          status: 'not-found'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        exists: true,
        conferenceSid: conference.sid,
        status: conference.status,
        dateCreated: conference.dateCreated,
        dateUpdated: conference.dateUpdated,
        friendlyName: conference.friendlyName,
        region: conference.region
      }
    });
  } catch (error) {
    // Conference not found is not an error
    if (error.status === 404) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          status: 'not-found'
        }
      });
    }
    return next(new ErrorResponse(`Failed to get conference status: ${error.message}`, 500));
  }
});

module.exports = exports;