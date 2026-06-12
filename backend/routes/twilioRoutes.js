const express = require('express');
const router = express.Router();
const {
  generateConferenceTwiML,
  agentJoinConference,
  handleSpeechInput,
  handlePartialSpeechResult,
  joinConference,
  generateHandoffMessage,
  handleConferenceEvents,
  handleCallStatus,
  handleRecordingStatus,
  agentJoinHandoff,
  aiJoinConference,
  generateWaitMusic,
  handleAgentConferenceEvents,
  agentJoinCall,
  customerJoinConference,
  handleTransferStatus,
  handleHandoffStatus,
  handleHandoffFailedTwiML
} = require('../controllers/twilioController');
const { handleIncomingCall } = require('../controllers/twilioVoiceController');
const { handleHandoffRedirect } = require('../controllers/handoffRedirectController');
// const { handleIncomingCallUltraSimple } = require('../controllers/twilioVoiceController.ultraSimple');

// ULTRA SIMPLE endpoint (Python sample equivalent)
// Matches Python: @app.api_route("/incoming-call", methods=["GET", "POST"])
// router.post('/incoming-call', handleIncomingCallUltraSimple);
// router.get('/incoming-call', handleIncomingCallUltraSimple);

// Main voice endpoint for incoming calls
router.post('/voice', handleIncomingCall);

// TwiML generation endpoints
router.post('/voice/conference/:callId', generateConferenceTwiML);
router.post('/voice/conference/agent/:conferenceName', agentJoinConference);
router.post('/voice/conference/join/:conferenceName', joinConference);
router.post('/voice/gather/:callId', handleSpeechInput);
router.post('/voice/partial/:callId', handlePartialSpeechResult);
router.post('/voice/handoff-message', generateHandoffMessage);
// Fallback TwiML served when handoff fails (agent no-answer / busy / failed).
// Redirected to from handleHandoffStatus via calls(sid).update({ url, method:'POST' }).
// POST only — GET was removed after Codex review flagged it as unnecessary attack surface.
router.post('/voice/handoff-failed/:callId', handleHandoffFailedTwiML);

// Webhook endpoints
router.post('/conference/events/:callId', handleConferenceEvents);
router.post('/call/status/:callId', handleCallStatus);
router.post('/recording/status/:callId', handleRecordingStatus);
router.post('/transfer/status/:callId', handleTransferStatus);
router.post('/handoff-status/:callId', handleHandoffStatus);

// Handoff redirect endpoint (for Media Streams mode)
router.post('/handoff-redirect/:callId', handleHandoffRedirect);

// General status endpoint for Twilio callbacks
router.post('/status', async (req, res) => {
  const { CallStatus, CallSid, Direction, From, To, Duration, HangupCause } = req.body;
  console.log(`[Twilio Status] CallSid: ${CallSid}, Status: ${CallStatus}, From: ${From}, To: ${To}, HangupCause: ${HangupCause}`);
  
  try {
    // CallSidからCallSessionを検索
    const CallSession = require('../models/CallSession');
    const Customer = require('../models/Customer');
    const webSocketService = require('../services/websocket');
    const conversationEngine = require('../services/conversationEngine');
    
    const callSession = await CallSession.findOne({ twilioCallSid: CallSid }).populate('customerId');
    
    if (callSession) {
      console.log(`[Twilio Status] Found CallSession: ${callSession._id}`);
      
      const updateData = {};
      let shouldBroadcast = false;
      
      // ステータスに応じて更新
      switch (CallStatus) {
        case 'initiated':
        case 'ringing':
          updateData.status = 'calling';
          shouldBroadcast = true;
          break;
        case 'answered':
        case 'in-progress':
          updateData.status = 'in-progress';

          // 実際の発信開始タイミングを記録
          if (
            !callSession.startTime ||
            ['queued', 'calling', 'initiating', 'initiated', 'scheduled'].includes(callSession.status)
          ) {
            updateData.startTime = new Date();
            updateData.duration = 0;
          }

          shouldBroadcast = true;

          // 顧客のステータスを「通話中」に更新
          if (callSession.customerId?._id) {
            await Customer.findByIdAndUpdate(callSession.customerId._id, {
              result: '通話中'
            });
            console.log(`[Twilio Status] Updated customer status to '通話中' for customer: ${callSession.customerId._id}`);
          }
          break;
        case 'completed':
          // CRITICAL: 転送中またはConference接続中の通話は完了扱いにしない
          // Media Streamからのredirect時にTwilioが'completed'を送るが、Conference通話は継続中
          // ただし、Conferenceが実際に作成されていない場合（転送失敗）は完了扱いにする
          let transferFailedNoConference = false;
          if (callSession.status === 'transferring' || callSession.status === 'human-connected') {
            // Conference名が設定されている = Conferenceが実際に作成された
            const hasConference = callSession.handoffDetails?.conferenceName;

            if (hasConference) {
              console.log(`[Twilio Status] Call is in active conference (status: ${callSession.status}, conference: ${callSession.handoffDetails.conferenceName}) - ignoring 'completed' event`);
              // statusは更新せず、Conference eventsで処理する
              break;
            } else {
              // Conferenceが作成されていない = 転送失敗（例: busy）
              // この場合は通常の完了処理を行う
              console.log(`[Twilio Status] Call status is '${callSession.status}' but no conference created - marking as completed (transfer failed)`);
              updateData.callResult = '失敗'; // 転送失敗
              updateData.endReason = 'transfer_failed';
              transferFailedNoConference = true; // 後続の HangupCause 判定による上書きを防ぐ
            }
          }

          updateData.status = 'completed';
          const completedAt = new Date();
          updateData.endTime = completedAt;

          let computedDuration = 0;
          if (callSession.startTime) {
            const start = new Date(callSession.startTime);
            computedDuration = Math.max(0, Math.floor((completedAt.getTime() - start.getTime()) / 1000));
          }
          if ((!computedDuration || Number.isNaN(computedDuration)) && Duration) {
            computedDuration = parseInt(Duration);
          }
          updateData.duration = computedDuration;
          // no-conference 転送失敗の場合は HangupCause 判定で上書きしない（失敗 を維持）
          if (!transferFailedNoConference) {
            // HangupCauseから切断理由と通話結果を判定
            console.log(`[Twilio Status] Hangup cause: ${HangupCause}`);
            if (HangupCause) {
              switch (HangupCause) {
                case 'caller-hung-up':
                  updateData.endReason = 'customer_hangup';
                  updateData.callResult = '拒否'; // 相手が電話を切った
                  break;
                case 'callee-hung-up':
                  updateData.endReason = 'agent_hangup';
                  updateData.callResult = '成功'; // こちらが切った（通話完了）
                  break;
                case 'system_hangup':
                case 'application_hangup':
                  updateData.endReason = 'ai_initiated';
                  updateData.callResult = '成功';
                  break;
                case 'timeout':
                  updateData.endReason = 'timeout';
                  updateData.callResult = '不在';
                  break;
                default:
                  updateData.endReason = 'normal';
                  updateData.callResult = '成功';
                  break;
              }
              console.log(`[Twilio Status] Hangup cause: ${HangupCause} -> endReason: ${updateData.endReason}, callResult: ${updateData.callResult}`);
            } else {
              updateData.endReason = 'normal';
              updateData.callResult = '成功';
            }
          } else {
            updateData.endReason = 'transfer_failed';
            updateData.callResult = '失敗';
          }
          // 会話エンジンをクリア
          conversationEngine.clearConversation(callSession._id.toString());
          shouldBroadcast = true;
          
          // 顧客の最終コール日とステータスを更新
          if (callSession.customerId?._id) {
            const today = new Date();
            const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
            const finalResult = updateData.callResult || callSession.callResult || '拒否';

            await Customer.findByIdAndUpdate(callSession.customerId._id, {
              date: dateStr,
              result: finalResult,
              callResult: finalResult
            });

            console.log(`[Twilio Status] Updated customer ${callSession.customerId._id}: date=${dateStr}, result=${finalResult}`);
          }
          break;
        case 'failed':
        case 'busy':
        case 'no-answer':
        case 'canceled':
        case 'cancelled':
          updateData.status = 'failed';
          const failedAt = new Date();
          updateData.endTime = failedAt;
          updateData.error = `Call ${CallStatus}`;

          let failedDuration = 0;
          if (callSession.startTime) {
            const start = new Date(callSession.startTime);
            failedDuration = Math.max(0, Math.floor((failedAt.getTime() - start.getTime()) / 1000));
          }
          if ((!failedDuration || Number.isNaN(failedDuration)) && Duration) {
            failedDuration = parseInt(Duration);
          }
          updateData.duration = failedDuration;
          // 失敗理由を設定
          switch (CallStatus) {
            case 'busy':
              updateData.endReason = 'customer_hangup';
              updateData.callResult = '失敗';
              break;
            case 'no-answer':
              updateData.endReason = 'timeout';
              updateData.callResult = '不在';
              break;
            case 'canceled':
            case 'cancelled':
              updateData.endReason = 'manual';
              updateData.callResult = '失敗';
              break;
            case 'failed':
            default:
              updateData.endReason = 'system_error';
              updateData.callResult = '失敗';
              break;
          }
          console.log(`[Twilio Status] Failed call status: ${CallStatus} -> endReason: ${updateData.endReason}`);
          // 会話エンジンをクリア
          conversationEngine.clearConversation(callSession._id.toString());
          shouldBroadcast = true;
          break;
      }
      
      let updatedSession = callSession;
      if (Object.keys(updateData).length > 0) {
        updatedSession = await CallSession.findByIdAndUpdate(
          callSession._id,
          updateData,
          { new: true }
        ).populate('customerId');
      }
      
      if (shouldBroadcast) {
        // 電話番号を正規化
        let phoneNumber = '';
        if (callSession.customerId?.phone) {
          phoneNumber = callSession.customerId.phone;
        } else {
          phoneNumber = To || From || '';
          if (phoneNumber.startsWith('+81')) {
            phoneNumber = '0' + phoneNumber.substring(3);
          }
        }

        console.log(`[Twilio Status] Broadcasting status: ${updateData.status || CallStatus}, Phone: ${phoneNumber}`);

        const finalCallResult = updateData.callResult
          || updatedSession?.callResult
          || (updateData.status === 'failed' ? '失敗' : '拒否');

        const eventData = {
          callId: (updatedSession?._id || callSession._id).toString(),
          callSid: CallSid,
          customerId: updatedSession?.customerId?._id || updatedSession?.customerId || callSession.customerId?._id || callSession.customerId,
          phoneNumber: phoneNumber,
          status: updateData.status || CallStatus,
          duration: Duration,
          endReason: updateData.endReason,
          callResult: finalCallResult,
          timestamp: new Date()
        };

        // 通常の status イベント
        webSocketService.emitToUser(callSession.userId, 'call-status', eventData);

        // 終了時は専用イベントも送信
        if (['completed', 'failed'].includes(updateData.status)) {
          webSocketService.emitToUser(callSession.userId, 'call-terminated', eventData);

          // 詳細な終了情報をトランスクリプトに追加
          const endMessage = updateData.status === 'completed' 
            ? `通話終了: ${finalCallResult} (理由: ${updateData.endReason || '不明'})`
            : `通話失敗: ${updateData.error} (理由: ${updateData.endReason || '不明'})`;
            
          webSocketService.sendTranscriptUpdate(callSession._id.toString(), {
            speaker: 'system',
            message: endMessage,
            phoneNumber: phoneNumber,
            timestamp: new Date()
          });
        }
      }
    } else {
      console.log(`[Twilio Status] No CallSession found for CallSid: ${CallSid}`);
    }
  } catch (error) {
    console.error('[Twilio Status] Error processing status callback:', error);
  }
  
  res.status(200).type('text/xml').send('<Response></Response>');
});

// Additional webhook for agent call status
router.post('/call/agent-status/:callId', async (req, res) => {
  const { CallStatus, CallSid } = req.body;
  console.log(`Agent call status: ${CallStatus} for call ${CallSid}`);
  res.status(200).send('OK');
});

// Handoff related endpoints
router.post('/voice/agent-join/:callId', agentJoinCall);
router.post('/voice/customer-join-conference/:callId', customerJoinConference);
router.post('/voice/ai-bot/:callId', aiJoinConference);
router.post('/voice/wait/:callId', generateWaitMusic);
router.post('/voice/wait-music', (req, res) => {
  const VoiceResponse = require('twilio').twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  twiml.play({ loop: 10 }, 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical');
  res.type('text/xml').send(twiml.toString());
});
router.post('/conference/agent-events/:callId', handleAgentConferenceEvents);
router.post('/conference/status/:callId', (req, res) => {
  console.log(`[Conference Status] ${req.params.callId}:`, req.body);
  res.status(200).send('OK');
});
router.post('/conference/customer-status/:callId', (req, res) => {
  console.log(`[Conference Customer Status] ${req.params.callId}:`, req.body);
  res.status(200).send('OK');
});
router.post('/conference/transfer-events/:callId', (req, res) => {
  console.log(`[Conference Transfer Events] ${req.params.callId}:`, req.body);
  res.status(200).send('OK');
});

module.exports = router;
