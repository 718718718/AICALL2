/**
 * Simplified Media Streams Controller - Python Sample Equivalent
 * NO DATABASE DEPENDENCIES - For testing and debugging
 * Based on: https://github.com/twilio-samples/speech-assistant-openai-realtime-api-python
 */

const WebSocket = require('ws');

// Configuration (matching Python sample)
const TEMPERATURE = 0.8;
const SYSTEM_MESSAGE = `あなたは親切で明るいAIアシスタントです。ユーザーが興味を持っていることについて何でも話し、
役立つ情報を提供する準備ができています。常に日本語で応答してください。
ポジティブな態度を保ち、適切な場面でユーモアを交えてください。`;
const VOICE = 'alloy';

// Event types to log (Python sample line 24-29)
const LOG_EVENT_TYPES = [
  'error',
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'session.updated'
];

/**
 * Initialize OpenAI session (Python sample line 208-230)
 */
async function initializeSession(openaiWs) {
  const sessionUpdate = {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          turn_detection: { type: "server_vad" },
          transcription: {
            model: "whisper-1",
            language: "ja"
          }
        },
        output: {
          format: { type: "audio/pcmu" },
          voice: VOICE
        }
      },
      instructions: SYSTEM_MESSAGE
    }
  };

  console.log('[Simple] Sending session update:', JSON.stringify(sessionUpdate, null, 2));
  openaiWs.send(JSON.stringify(sessionUpdate));
}

/**
 * Send mark event (Python sample line 177-185)
 */
function sendMark(twilioWs, streamSid, markQueue) {
  if (!streamSid) {
    console.warn('[Simple Mark] Skipped: streamSid is null');
    return;
  }

  if (!twilioWs || twilioWs.readyState !== 1) { // 1 = OPEN
    console.error('[Simple Mark] ERROR: Twilio WebSocket not open. State:', twilioWs?.readyState);
    return;
  }

  const markEvent = {
    event: "mark",
    streamSid: streamSid,
    mark: { name: "responsePart" }
  };

  try {
    twilioWs.send(JSON.stringify(markEvent));
    markQueue.push('responsePart');
  } catch (error) {
    console.error('[Simple Mark] ERROR sending mark:', error.message);
  }
}

/**
 * Handle speech started - interrupt AI (Python sample line 147-175)
 */
async function handleSpeechStarted(
  twilioWs,
  openaiWs,
  streamSid,
  latestMediaTimestamp,
  responseStartTimestamp,
  lastAssistantItem,
  markQueue
) {
  console.log('[Simple] Handling speech started event');

  if (markQueue.length > 0 && responseStartTimestamp !== null) {
    const elapsedTime = latestMediaTimestamp - responseStartTimestamp;
    console.log('[Simple] Elapsed time:', elapsedTime, 'ms');

    if (lastAssistantItem) {
      // Truncate OpenAI response (Python line 160-166)
      if (openaiWs && openaiWs.readyState === 1) { // 1 = OPEN
        const truncateEvent = {
          type: "conversation.item.truncate",
          item_id: lastAssistantItem,
          content_index: 0,
          audio_end_ms: elapsedTime
        };
        try {
          openaiWs.send(JSON.stringify(truncateEvent));
          console.log('[Simple] ✓ Sent truncate to OpenAI');
        } catch (error) {
          console.error('[Simple] ERROR sending truncate:', error.message);
        }
      } else {
        console.error('[Simple] ERROR: OpenAI WebSocket not open');
      }
    }

    // Clear Twilio buffer (Python line 168-171)
    if (twilioWs && twilioWs.readyState === 1) { // 1 = OPEN
      try {
        twilioWs.send(JSON.stringify({
          event: "clear",
          streamSid: streamSid
        }));
        console.log('[Simple] ✓ Cleared Twilio buffer');
      } catch (error) {
        console.error('[Simple] ERROR clearing buffer:', error.message);
      }
    } else {
      console.error('[Simple] ERROR: Twilio WebSocket not open');
    }

    // Clear queue
    markQueue.length = 0;
  }
}

/**
 * Handle WebSocket connection - SIMPLIFIED VERSION
 * Matches Python sample structure exactly
 */
exports.handleSimpleMediaStream = async (twilioWs, req) => {
  console.log('[Simple] Client connected');

  // Connection state (Python sample line 76-80)
  let streamSid = null;
  let latestMediaTimestamp = 0;
  let lastAssistantItem = null;
  let markQueue = [];
  let responseStartTimestamp = null;
  let openaiWs = null;

  try {
    // Connect to OpenAI (Python sample line 67-72)
    // NOTE: Removed OpenAI-Beta header (not in Python sample)
    const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`;
    console.log('[Simple] Connecting to:', openaiUrl);

    openaiWs = new WebSocket(openaiUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_REALTIME_API_KEY}`
        // NO OpenAI-Beta header - Python sample doesn't use it
      }
    });

    // OpenAI WebSocket opened (Python sample line 73)
    openaiWs.on('open', async () => {
      console.log('[Simple] Connected to OpenAI Realtime API');
      await initializeSession(openaiWs);
    });

    // OpenAI WebSocket error
    openaiWs.on('error', (error) => {
      console.error('[Simple] OpenAI WebSocket error:', error.message);
    });

    // OpenAI WebSocket close
    openaiWs.on('close', () => {
      console.log('[Simple] OpenAI WebSocket closed');
    });

    // Receive from OpenAI → Send to Twilio (Python sample line 109-145)
    openaiWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Log events (Python line 115-116)
        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log('[Simple] OpenAI event:', response.type, response);
        }

        // Audio delta (Python line 118-128)
        if (response.type === 'response.output_audio.delta' && response.delta) {
          // Verify Twilio WebSocket is ready
          if (!twilioWs) {
            console.error('[Simple Audio] ERROR: twilioWs is null/undefined');
            return;
          }

          if (twilioWs.readyState !== 1) { // 1 = OPEN
            console.error('[Simple Audio] ERROR: Twilio WebSocket not open. State:', twilioWs.readyState);
            return;
          }

          if (!streamSid) {
            console.error('[Simple Audio] ERROR: streamSid is null');
            return;
          }

          // Re-encode base64 (Python line 119)
          const audioPayload = Buffer.from(
            Buffer.from(response.delta, 'base64')
          ).toString('base64');

          const audioEvent = {
            event: "media",
            streamSid: streamSid,
            media: {
              payload: audioPayload
            }
          };

          try {
            twilioWs.send(JSON.stringify(audioEvent));
            console.log('[Simple Audio] ✓ Sent audio chunk, size:', audioPayload.length);
          } catch (error) {
            console.error('[Simple Audio] ERROR sending to Twilio:', error.message);
          }

          // Track response timing (Python line 130-134)
          if (response.item_id && response.item_id !== lastAssistantItem) {
            responseStartTimestamp = latestMediaTimestamp;
            lastAssistantItem = response.item_id;
          }

          // Send mark (Python line 136)
          sendMark(twilioWs, streamSid, markQueue);
        }

        // Speech started - interrupt (Python line 139-143)
        if (response.type === 'input_audio_buffer.speech_started') {
          console.log('[Simple] Speech started detected');
          if (lastAssistantItem) {
            console.log('[Simple] Interrupting response:', lastAssistantItem);
            await handleSpeechStarted(
              twilioWs,
              openaiWs,
              streamSid,
              latestMediaTimestamp,
              responseStartTimestamp,
              lastAssistantItem,
              markQueue
            );
            // Reset state
            lastAssistantItem = null;
            responseStartTimestamp = null;
          }
        }

      } catch (error) {
        console.error('[Simple] Error processing OpenAI message:', error.message);
      }
    });

    // Receive from Twilio → Send to OpenAI (Python sample line 82-107)
    twilioWs.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        // Media event (Python line 88-94)
        if (data.event === 'media' && openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          latestMediaTimestamp = parseInt(data.media.timestamp);
          const audioAppend = {
            type: "input_audio_buffer.append",
            audio: data.media.payload
          };
          openaiWs.send(JSON.stringify(audioAppend));
        }

        // Start event (Python line 95-100)
        else if (data.event === 'start') {
          streamSid = data.start.streamSid;
          console.log('[Simple] Stream started:', streamSid);
          responseStartTimestamp = null;
          latestMediaTimestamp = 0;
          lastAssistantItem = null;
        }

        // Mark event (Python line 101-103)
        else if (data.event === 'mark') {
          if (markQueue.length > 0) {
            markQueue.shift();
          }
        }

      } catch (error) {
        console.error('[Simple] Error processing Twilio message:', error.message);
      }
    });

    // Twilio WebSocket close (Python line 104-107)
    twilioWs.on('close', () => {
      console.log('[Simple] Twilio disconnected');
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

    // Twilio WebSocket error
    twilioWs.on('error', (error) => {
      console.error('[Simple] Twilio WebSocket error:', error.message);
    });

  } catch (error) {
    console.error('[Simple] Error in handleSimpleMediaStream:', error.message);
    console.error('[Simple] Stack:', error.stack);

    // Cleanup
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    twilioWs.close();
  }
};

module.exports = exports;
