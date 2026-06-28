/**
 * Media Streams Controller for OpenAI Realtime API Integration
 * Based on: https://github.com/twilio-samples/speech-assistant-openai-realtime-api-python
 *
 * This controller bridges Twilio Media Streams and OpenAI Realtime API via WebSocket
 */

const WebSocket = require('ws');
const CallSession = require('../models/CallSession');
const AgentSettings = require('../models/AgentSettings');
const { buildOpenAIInstructions } = require('../utils/promptBuilder');

const CARTESIA_VOICE_ID_DEFAULT = process.env.CARTESIA_VOICE_ID || 'fd1ee8f5-223a-4a87-a2fe-37eb3706cd69';
const CARTESIA_MODEL_ID = process.env.CARTESIA_MODEL_ID || 'sonic-3';
const CARTESIA_API_VERSION = process.env.CARTESIA_API_VERSION || '2026-03-01';

const CARTESIA_TAIL_MS = parseInt(process.env.CARTESIA_TAIL_MS || '1500', 10);
const CARTESIA_DRAIN_TIMEOUT_MS = parseInt(process.env.CARTESIA_DRAIN_TIMEOUT_MS || '15000', 10);

const HANDOFF_ANNOUNCE_FALLBACK_MS = parseInt(process.env.HANDOFF_ANNOUNCE_FALLBACK_MS || '8000', 10);

const inflightAutoHandoffs = new Set();

const CLOSING_PHRASES = {
  rejection: '承知いたしました。お忙しいところ恐れ入ります。それでは失礼いたします。',
  absent: '承知いたしました。また改めてご連絡いたします。お忙しいところ恐れ入ります。それでは失礼いたします。',
  no_response: '承知いたしました。また改めてご連絡いたします。お忙しいところ恐れ入ります。それでは失礼いたします。',
  voicemail: null,
  handoff_fallback: '申し訳ございません。担当者が応答できませんでした。改めてご連絡いたします。それでは失礼いたします。'
};
exports.CLOSING_PHRASES = CLOSING_PHRASES;

let closingCounter = 0;
function nextClosingCtxId(tag) {
  closingCounter += 1;
  return `closing-${tag}-${Date.now()}-${closingCounter}`;
}

function handleDeterministicCallEnd({ endType, phrase, item, openaiWs, cartesiaWs, playback, executor }) {
  let args = {};
  try {
    args = JSON.parse(item.arguments || '{}');
  } catch (e) {
    console.error('[FunctionCall] Error parsing arguments:', e.message);
  }

  if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
    try {
      openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify({
            success: true,
            message: '通話を丁寧に終了します。(deterministic closing)'
          })
        }
      }));
    } catch (e) {
      console.error('[FunctionCall] function_call_output send error:', e.message);
    }
  }

  if (!phrase) {
    console.log('[AutoCallEnd] ' + endType + ' silent close — no phrase');
    playback.invalidateAll(endType + '_silent');
    setTimeout(() => {
      console.log('[AutoCallEnd] ' + endType + ' tail elapsed — executing hangup');
      Promise.resolve(executor(item.call_id, args))
        .catch(err => console.error('[AutoCallEnd] executor error:', err));
    }, CARTESIA_TAIL_MS);
    return null;
  }

  const ctxId = nextClosingCtxId(endType);
  playback.startContext(ctxId);

  sendToCartesia(cartesiaWs, phrase, ctxId, true);
  sendToCartesia(cartesiaWs, '', ctxId, false);

  playback.scheduleHangupOnDrain(ctxId, () => {
    console.log('[AutoCallEnd] ' + endType + ' audio drained — executing hangup');
    Promise.resolve(executor(item.call_id, args))
      .catch(err => console.error('[AutoCallEnd] executor error:', err));
  });

  return ctxId;
}

async function executeHandoffWithFallback(callSession, handoffData, twilioWs, getStreamSid, cartesiaWs, playback) {
  let result;
  try {
    result = await executeAutoHandoff(callSession, handoffData.callId, handoffData.args);
  } catch (e) {
    console.error('[AutoHandoff] threw:', e?.message || e);
    result = { success: false, message: e?.message || 'handoff threw' };
  }

  if (result && result.success) return result;

  console.warn('[AutoHandoff] failed — playing fallback closing phrase');
  const ctxId = nextClosingCtxId('handoff-fallback');
  playback.startContext(ctxId);
  if (CLOSING_PHRASES.handoff_fallback) {
    sendToCartesia(cartesiaWs, CLOSING_PHRASES.handoff_fallback, ctxId, true);
  }
  sendToCartesia(cartesiaWs, '', ctxId, false);
  playback.scheduleHangupOnDrain(ctxId, () => {
    console.log('[AutoHandoff] fallback closing drained — hanging up');
    executeAutoCallEnd(callSession, handoffData.callId, {
      rejection_reason: '担当者転送失敗のため終話',
    }).catch(err => console.error('[AutoHandoff fallback] executor error:', err));
  });
  return result;
}
exports.handleDeterministicCallEnd = handleDeterministicCallEnd;
exports.executeHandoffWithFallback = executeHandoffWithFallback;

const LOG_EVENT_TYPES = [
  'error',
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'session.updated',
  'response.output_item.done',
  'response.function_call_arguments.done',
  'response.text.delta',
  'response.text.done',
  'response.output_text.delta',
  'response.output_text.done'
];

async function executeAutoCallEnd(callSession, functionCallId, args) {
  try {
    console.log('[AutoCallEnd] 顧客拒否による自動切電を実行');
    console.log('[AutoCallEnd] CallSession ID:', callSession._id);
    console.log('[AutoCallEnd] Function Call ID:', functionCallId);
    console.log('[AutoCallEnd] 拒否理由:', args.rejection_reason);

    let finalCallResult = '拒否';
    let finalNotes = args.rejection_reason ? `AI判断による切電: ${args.rejection_reason}` : 'AI判断による切電';

    const absentKeywords = [
      '不在', '外出', '外出中',
      '席を外して', '席を外しております', '席を外してい',
      '会議中', '会議に', '会議で',
      '休み', '本日休', 'お休み', 'お休みを',
      '戻り', 'ただいま外',
      '退職', '離席',
      'いません', 'おりません', 'ございません',
      'でかけています', 'でかけております',
      '手が離せ', '対応できません', '出張'
    ];

    const reasonText = args.rejection_reason || '';
    let absentDetected = absentKeywords.some(keyword => reasonText.includes(keyword));

    if (!absentDetected && callSession.transcript && Array.isArray(callSession.transcript)) {
      const allCustomerMessages = callSession.transcript
        .filter(t => t.speaker === 'customer')
        .map(t => t.message || '')
        .join(' ');

      absentDetected = absentKeywords.some(keyword => allCustomerMessages.includes(keyword));

      if (absentDetected) {
        console.log('[AutoCallEnd] ⚠️ 会話履歴から不在キーワードを検出');
      }
    }

    if (absentDetected) {
      console.log('[AutoCallEnd] ⚠️ 不在キーワード検出 - ステータスを「不在」に変更します');
      finalCallResult = '不在';
      finalNotes = 'AI判断による切電';
    }

    callSession.status = 'completed';
    callSession.endTime = new Date();
    callSession.callResult = finalCallResult;
    callSession.endReason = 'ai_initiated';
    callSession.notes = finalNotes;

    await callSession.save();
    console.log('[AutoCallEnd] CallSession更新完了');

    if (callSession.twilioCallSid && callSession.twilioCallSid !== 'pending') {
      const twilioService = require('../services/twilioService');
      await twilioService.endCall(callSession.twilioCallSid);
      console.log('[AutoCallEnd] Twilio通話終了完了:', callSession.twilioCallSid);
    }

    if (global.io && callSession.userId) {
      const eventData = {
        customerId: callSession.customerId?.toString() || callSession.customerId,
        phoneNumber: callSession.phoneNumber,
        status: 'completed',
        callResult: finalCallResult,
        callId: callSession._id.toString(),
        twilioCallSid: callSession.twilioCallSid
      };
      global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', eventData);
      console.log(`[WebSocket] Emitted callStatusUpdate to user ${callSession.userId}: completed (拒否)`, JSON.stringify(eventData));
    }

    return { success: true, message: '通話を終了しました' };

  } catch (error) {
    console.error('[AutoCallEnd] エラー:', error);
    return { success: false, message: '切電処理に失敗しました', error: error.message };
  }
}

async function executeAutoCallEndOnNoResponse(callSession, functionCallId, args, type = 'no_response') {
  try {
    console.log('[AutoCallEnd-NoResponse] 顧客無応答による自動切電を実行');
    console.log('[AutoCallEnd-NoResponse] CallSession ID:', callSession._id);
    console.log('[AutoCallEnd-NoResponse] Function Call ID:', functionCallId);

    callSession.status = 'completed';
    callSession.endTime = new Date();
    callSession.callResult = '不在';
    callSession.endReason = 'ai_initiated';
    callSession.notes = type === 'voicemail'
      ? 'AI判断による切電: 留守番電話/機械応答を検出'
      : 'AI判断による切電: 顧客が応答しなくなった';

    await callSession.save();
    console.log('[AutoCallEnd-NoResponse] CallSession更新完了');

    if (callSession.twilioCallSid && callSession.twilioCallSid !== 'pending') {
      const twilioService = require('../services/twilioService');
      await twilioService.endCall(callSession.twilioCallSid);
      console.log('[AutoCallEnd-NoResponse] Twilio通話終了完了:', callSession.twilioCallSid);
    }

    if (global.io && callSession.userId) {
      const eventData = {
        customerId: callSession.customerId?.toString() || callSession.customerId,
        phoneNumber: callSession.phoneNumber,
        status: 'completed',
        callResult: '不在',
        callId: callSession._id.toString(),
        twilioCallSid: callSession.twilioCallSid
      };
      global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', eventData);
      console.log(`[WebSocket] Emitted callStatusUpdate to user ${callSession.userId}: completed (不在)`, JSON.stringify(eventData));
    }

    return { success: true, message: '通話を終了しました' };

  } catch (error) {
    console.error('[AutoCallEnd-NoResponse] エラー:', error);
    return { success: false, message: '切電処理に失敗しました', error: error.message };
  }
}

async function executeAutoCallEndOnAbsent(callSession, functionCallId, args) {
  try {
    console.log('[AutoCallEnd-Absent] 担当者不在による自動切電を実行');
    console.log('[AutoCallEnd-Absent] CallSession ID:', callSession._id);
    console.log('[AutoCallEnd-Absent] Function Call ID:', functionCallId);
    console.log('[AutoCallEnd-Absent] 不在理由:', args.absent_reason);

    callSession.status = 'completed';
    callSession.endTime = new Date();
    callSession.callResult = '不在';
    callSession.endReason = 'ai_initiated';
    callSession.notes = `AI判断による切電: 担当者不在 (${args.absent_reason})`;

    await callSession.save();
    console.log('[AutoCallEnd-Absent] CallSession更新完了');

    if (callSession.twilioCallSid && callSession.twilioCallSid !== 'pending') {
      const twilioService = require('../services/twilioService');
      await twilioService.endCall(callSession.twilioCallSid);
      console.log('[AutoCallEnd-Absent] Twilio通話終了完了:', callSession.twilioCallSid);
    }

    if (global.io && callSession.userId) {
      const eventData = {
        customerId: callSession.customerId?.toString() || callSession.customerId,
        phoneNumber: callSession.phoneNumber,
        status: 'completed',
        callResult: '不在',
        callId: callSession._id.toString(),
        twilioCallSid: callSession.twilioCallSid
      };
      global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', eventData);
      console.log(`[WebSocket] Emitted callStatusUpdate to user ${callSession.userId}: completed (不在)`, JSON.stringify(eventData));
    }

    return { success: true, message: '通話を終了しました' };

  } catch (error) {
    console.error('[AutoCallEnd-Absent] エラー:', error);
    return { success: false, message: '切電処理に失敗しました', error: error.message };
  }
}

async function executeAutoHandoff(callSession, functionCallId, args) {
  const handoffKey = String(callSession._id);
  if (inflightAutoHandoffs.has(handoffKey)) {
    console.log('[AutoHandoff] Handoff already in progress for this call — skipping duplicate');
    return { success: true, message: '転送は既に進行中です', alreadyInProgress: true };
  }
  inflightAutoHandoffs.add(handoffKey);
  try {
    console.log('[AutoHandoff] Executing automatic handoff');
    console.log('[AutoHandoff] CallSession ID:', callSession._id);
    console.log('[AutoHandoff] Function Call ID:', functionCallId);
    console.log('[AutoHandoff] Arguments:', args);

    if (args.customer_consent !== true) {
      console.log('[AutoHandoff] Customer did not consent, skipping handoff');
      return;
    }

    const userId = callSession.assignedAgent;
    if (!userId) {
      console.error('[AutoHandoff] No assigned agent for this call session');
      return;
    }

    const User = require('../models/User');
    const user = await User.findById(userId);

    if (!user) {
      console.error('[AutoHandoff] User not found:', userId);
      return;
    }

    if (!user.handoffPhoneNumber) {
      console.error('[AutoHandoff] No handoff phone number configured for user:', userId);
      return;
    }

    console.log('[AutoHandoff] User found:', user.email);
    console.log('[AutoHandoff] Handoff phone:', user.handoffPhoneNumber);

    const handoffController = require('./handoffController');

    const result = await handoffController.executeHandoffLogic(
      callSession,
      user,
      'ai-auto',
      args.reason || '顧客の承諾'
    );

    console.log('[AutoHandoff] Handoff executed successfully:', result);

    return {
      success: true,
      message: '担当者への転送を開始しました',
      handoffCallSid: result.handoffCallSid
    };

  } catch (error) {
    console.error('[AutoHandoff] Error executing handoff:', error);
    return {
      success: false,
      message: '転送に失敗しました。申し訳ございません。',
      error: error.message
    };
  } finally {
    inflightAutoHandoffs.delete(handoffKey);
  }
}

function extractTextFromContent(content) {
  if (!content || !Array.isArray(content)) return '';

  const textParts = content
    .filter(item => {
      return item.type === 'text' ||
        item.type === 'input_text' ||
        item.type === 'output_text' ||
        item.type === 'output_audio' ||
        item.type === 'audio';
    })
    .map(item => item.transcript || item.text || '')
    .filter(text => text.length > 0);

  return textParts.join(' ').trim();
}

function sendConversationUpdate(callSession, role, text, timestamp = new Date()) {
  if (!text || !global.io) return;

  const speaker = role === 'assistant' ? 'ai' : role === 'user' ? 'customer' : 'system';
  const phoneNumber = callSession.phoneNumber;
  if (!callSession.transcript) {
    callSession.transcript = [];
  }
  callSession.transcript.push({ speaker, message: text, timestamp });
  console.log('[Conversation] Stored in memory:', {
    callId: callSession._id.toString(),
    speaker,
    transcriptLength: callSession.transcript.length
  });

  if (global.io && callSession.userId) {
    global.io.to(`user-${callSession.userId}`).emit('transcript-update', {
      callId: callSession._id.toString(),
      callSid: callSession.twilioCallSid,
      phoneNumber,
      speaker,
      text,
      message: text,
      timestamp
    });
    console.log(`[WebSocket] Emitted transcript-update to user ${callSession.userId}`);
  }

  console.log('[Conversation] Sent WebSocket update:', {
    callId: callSession._id.toString(),
    speaker,
    textLength: text.length
  });
}

async function initializeSession(openaiWs, agentSettings) {
  let instructions;
  try {
    instructions = buildOpenAIInstructions(agentSettings);
    console.log('[OpenAI] ✅ instructions生成成功');
    console.log('[OpenAI] instructions長さ:', instructions.length);
    console.log('[OpenAI] instructions冒頭200文字:', instructions.substring(0, 200));
    console.log('[OpenAI] 会社名チェック:', instructions.includes(agentSettings.conversationSettings.companyName) ? '✅含まれる' : '❌含まれない');
    console.log('[OpenAI] サービス名チェック:', instructions.includes(agentSettings.conversationSettings.serviceName) ? '✅含まれる' : '❌含まれない');
  } catch (error) {
    console.error('[OpenAI] ❌ instructions生成失敗:', error);
    instructions = "You are a helpful AI assistant for making business calls.";
  }

  const temperature = agentSettings?.temperature || 0.8;

  const sessionUpdate = {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["text"],
      audio: {
        input: {
          format: { type: "audio/pcmu" },
          noise_reduction: { type: "near_field" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.2,
            prefix_padding_ms: 200,
            silence_duration_ms: 400
          },
          transcription: {
            model: "gpt-4o-transcribe",
            language: "ja"
          }
        }
      },
      instructions: instructions,
      tools: [
        {
          type: "function",
          name: "transfer_to_human",
          description: "顧客が営業担当との会話を承諾した時、人間の営業担当に電話転送する。【重要】この関数は、顧客が「はい」「お願いします」と明確に同意した発言が『会話履歴に存在する』場合のみ呼び出すことができる。AIが質問した直後（顧客の回答前）に呼び出すことは固く禁じられている。",
          parameters: {
            type: "object",
            properties: {
              customer_consent: {
                type: "boolean",
                description: "顧客の明確な同意が会話履歴にあるか（true=ある、false=なし）。推測や「これから聞く」場合はfalseとする"
              },
              reason: {
                type: "string",
                description: "転送理由（例：詳細説明希望、価格質問、技術的質問、担当者希望）",
                enum: ["詳細説明希望", "価格質問", "技術的質問", "担当者希望", "その他"]
              }
            },
            required: ["customer_consent"]
          }
        },
        {
          type: "function",
          name: "end_call_on_rejection",
          description: "顧客が明確に興味がないと表明し、会話の継続を拒否した時に使用する。「結構です」「必要ありません」「忙しいので」「間に合っています」などの明確な拒否表現を検知した時のみ呼び出す。重要：顧客が明確に拒否した時のみ使用すること。",
          parameters: {
            type: "object",
            properties: {
              rejection_reason: {
                type: "string",
                description: "顧客の拒否理由カテゴリ",
                enum: ["興味なし", "忙しい", "既存サービス利用中", "不要", "その他"]
              }
            },
            required: ["rejection_reason"]
          }
        },
        {
          type: "function",
          name: "end_call_on_voicemail",
          description: "留守番電話に転送されたことを検知した時に使用する。「留守番電話に転送されました」「発信音の後で」「メッセージを録音」などのキーワードを検知した時、または機械的な音声アナウンスを検知した時に即座に呼び出す。メッセージを残さずに通話を終了する。",
          parameters: {
            type: "object",
            properties: {
              voicemail_detected: {
                type: "boolean",
                description: "留守番電話が検出されたか"
              }
            },
            required: ["voicemail_detected"]
          }
        },
        {
          type: "function",
          name: "end_call_on_no_response",
          description: "顧客が長時間応答しなくなった場合、最後の確認後に通話を終了する時に使用する。システムから「顧客が応答しません」というメッセージを受け取り、2回確認しても応答がない場合に呼び出す。",
          parameters: {
            type: "object",
            properties: {
              no_response_confirmed: {
                type: "boolean",
                description: "顧客の無応答を確認したか"
              }
            },
            required: ["no_response_confirmed"]
          }
        },
        {
          type: "function",
          name: "end_call_on_absent",
          description: "担当者が不在・外出・会議中・休暇・退職などで電話に出られないことが確認できた時に使用する。以下のキーワードを検知した時は必ずこの関数を呼び出す（end_call_on_rejectionではなく）：「席を外しております」「外出しております」「外出中です」「会議中です」「本日は休みです」「お休みをいただいております」「退職しました」「おりません」「ございません」「でかけております」「出張中」「手が離せません」。重要：不在・外出・会議・休暇・退職は必ずこの関数を使うこと。end_call_on_rejectionと混同しないこと。",
          parameters: {
            type: "object",
            properties: {
              absent_reason: {
                type: "string",
                description: "不在の理由カテゴリ",
                enum: ["外出中", "会議中", "休暇中", "退職済", "不明", "その他"]
              }
            },
            required: ["absent_reason"]
          }
        }
      ],
      tool_choice: "auto"
    }
  };

  console.log('[OpenAI] Sending session update with instructions preview:',
    instructions.substring(0, 200) + '...');
  openaiWs.send(JSON.stringify(sessionUpdate));
}

function sendChunkMark(twilioWs, streamSid, markName, markQueue = null) {
  if (!streamSid) {
    console.warn('[Mark] Skipped: streamSid is null');
    return false;
  }
  if (!twilioWs || twilioWs.readyState !== WebSocket.OPEN) {
    console.error('[Mark] ERROR: Twilio WebSocket not open. State:', twilioWs?.readyState);
    return false;
  }
  try {
    twilioWs.send(JSON.stringify({
      event: 'mark',
      streamSid,
      mark: { name: markName }
    }));
    if (Array.isArray(markQueue)) markQueue.push(markName);
    return true;
  } catch (error) {
    console.error('[Mark] ERROR sending mark:', error.message);
    return false;
  }
}

function parseChunkMark(name) {
  if (typeof name !== 'string' || !name.startsWith('cartesia:')) return null;
  const parts = name.split(':');
  if (parts.length !== 3) return null;
  const seq = parseInt(parts[2], 10);
  if (Number.isNaN(seq)) return null;
  return { ctxId: parts[1], seq };
}

function createCartesiaContextId(responseId, itemId) {
  return `ctx-${responseId}-${itemId}`;
}

function createCartesiaWs(twilioWs, getStreamSid, callbacks = {}) {
  if (!process.env.CARTESIA_API_KEY) {
    console.error('[Cartesia] CARTESIA_API_KEY is not set');
    return null;
  }
  // ✅ 新しい接続を作る前に古い接続が残っていないか確認
  console.log('[Cartesia] Creating new WebSocket connection');
  const url = `wss://api.cartesia.ai/tts/websocket?cartesia_version=${CARTESIA_API_VERSION}`;
  const ws = new WebSocket(url, {
    headers: { 'X-API-Key': process.env.CARTESIA_API_KEY }
  });

  ws.on('open', () => console.log('[Cartesia] Connected'));
  ws.on('error', (e) => console.error('[Cartesia] Error:', e.message));
  ws.on('close', (code) => console.log('[Cartesia] Closed, code:', code));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'chunk' && msg.data) {
        if (callbacks.onChunk) {
          callbacks.onChunk({ ctxId: msg.context_id, payload: msg.data });
        } else {
          const sid = getStreamSid();
          if (twilioWs && twilioWs.readyState === WebSocket.OPEN && sid) {
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid: sid,
              media: { payload: msg.data }
            }));
          }
        }
      } else if (msg.type === 'done') {
        if (callbacks.onContextDone) {
          callbacks.onContextDone({ ctxId: msg.context_id });
        }
      } else if (msg.type === 'error') {
        console.error('[Cartesia] TTS error:', JSON.stringify(msg));
        if (callbacks.onError) callbacks.onError(msg);
      }
    } catch (e) {
      console.error('[Cartesia] Parse error:', e.message);
    }
  });

  return ws;
}

exports.parseChunkMark = parseChunkMark;
exports.sendChunkMark = sendChunkMark;
exports.createCartesiaContextId = createCartesiaContextId;

function createPlaybackTracker({ tailMs = CARTESIA_TAIL_MS, drainTimeoutMs = CARTESIA_DRAIN_TIMEOUT_MS, logger = console } = {}) {
  const contexts = new Map();
  const markQueue = [];
  let activeContextId = null;
  let aiResponseActive = false;

  function getContext(id, { create = false } = {}) {
    if (!id) return null;
    let ctx = contexts.get(id);
    if (!ctx && create) {
      ctx = {
        id,
        marks: 0,
        chunks: 0,
        markSeq: 0,
        doneFromCartesia: false,
        invalidated: false,
        pendingHangup: null,
        terminating: false,
        pendingHangupTimer: null,
        drainTimeout: null
      };
      contexts.set(id, ctx);
    }
    return ctx || null;
  }

  function startContext(id) {
    const ctx = getContext(id, { create: true });
    activeContextId = id;
    aiResponseActive = true;
    return ctx;
  }

  function endContext(id) {
    const ctx = getContext(id);
    if (!ctx) return;
    ctx.doneFromCartesia = true;
    checkDrain(id);
  }

  function canAcceptChunk(id) {
    const ctx = getContext(id);
    return !!(ctx && !ctx.invalidated);
  }

  function recordChunk(id) {
    const ctx = getContext(id);
    if (!ctx) {
      logger.log('[Playback] drop chunk (unknown ctx):', id);
      return null;
    }
    if (ctx.invalidated) {
      logger.log('[barge-in] stale cartesia chunk dropped ctx=' + id);
      return null;
    }
    ctx.chunks += 1;
    const seq = ctx.markSeq++;
    ctx.marks += 1;
    const markName = `cartesia:${id}:${seq}`;
    markQueue.push(markName);
    return markName;
  }

  function rollbackChunk(markName) {
    const parsed = parseChunkMark(markName);
    if (!parsed) return;
    const idx = markQueue.indexOf(markName);
    if (idx < 0) return;
    markQueue.splice(idx, 1);
    const ctx = getContext(parsed.ctxId);
    if (!ctx) return;
    if (ctx.marks > 0) ctx.marks -= 1;
    if (ctx.chunks > 0) ctx.chunks -= 1;
    checkDrain(parsed.ctxId);
  }

  function ackMark(markName) {
    const parsed = parseChunkMark(markName);
    if (!parsed) {
      if (markQueue.length > 0) markQueue.shift();
      return;
    }
    const idx = markQueue.indexOf(markName);
    if (idx >= 0) markQueue.splice(idx, 1);

    const ctx = getContext(parsed.ctxId);
    if (!ctx) return;
    ctx.marks = Math.max(0, ctx.marks - 1);
    checkDrain(parsed.ctxId);
  }

  function checkDrain(id) {
    const ctx = getContext(id);
    if (!ctx) return;
    if (ctx.marks === 0 && ctx.doneFromCartesia) {
      if (ctx.drainTimeout) {
        clearTimeout(ctx.drainTimeout);
        ctx.drainTimeout = null;
      }
      if (activeContextId === id) {
        aiResponseActive = false;
        activeContextId = null;
      }
      firePendingHangup(id);
    }
  }

  function firePendingHangup(id) {
    const ctx = getContext(id);
    if (!ctx || !ctx.pendingHangup) return;
    const fn = ctx.pendingHangup;
    ctx.pendingHangup = null;
    if (ctx.pendingHangupTimer) {
      clearTimeout(ctx.pendingHangupTimer);
      ctx.pendingHangupTimer = null;
    }
    ctx.pendingHangupTimer = setTimeout(() => {
      ctx.pendingHangupTimer = null;
      try {
        fn();
      } catch (e) {
        logger.error('[Playback] pending hangup error:', e?.message || e);
      }
    }, tailMs);
  }

  function scheduleHangupOnDrain(id, fn) {
    const ctx = getContext(id, { create: true });
    if (ctx.pendingHangup) {
      logger.warn('[Playback] overwriting existing pendingHangup for ctx=' + id);
    }
    ctx.pendingHangup = fn;
    ctx.terminating = true;
    if (ctx.marks === 0 && ctx.doneFromCartesia) {
      firePendingHangup(id);
      return;
    }
    if (ctx.drainTimeout) clearTimeout(ctx.drainTimeout);
    ctx.drainTimeout = setTimeout(() => {
      logger.warn('[Playback] drain timeout — forcing pending hangup ctx=' + id);
      ctx.doneFromCartesia = true;
      ctx.marks = 0;
      firePendingHangup(id);
    }, drainTimeoutMs);
  }

  function cancelScheduledHangup(id) {
    const ctx = getContext(id);
    if (!ctx) return false;
    const hadScheduledHangup = !!(
      ctx.pendingHangup ||
      ctx.pendingHangupTimer ||
      ctx.drainTimeout ||
      ctx.terminating
    );
    if (ctx.pendingHangupTimer) {
      clearTimeout(ctx.pendingHangupTimer);
      ctx.pendingHangupTimer = null;
    }
    if (ctx.drainTimeout) {
      clearTimeout(ctx.drainTimeout);
      ctx.drainTimeout = null;
    }
    ctx.pendingHangup = null;
    ctx.terminating = false;
    return hadScheduledHangup;
  }

  function invalidateAll(reason) {
    const ids = [];
    const terminatingToFire = [];
    for (const [id, ctx] of contexts) {
      if (!ctx.invalidated) {
        ctx.invalidated = true;
        ids.push(id);
        if (ctx.drainTimeout) {
          clearTimeout(ctx.drainTimeout);
          ctx.drainTimeout = null;
        }
        if (ctx.terminating && ctx.pendingHangup) {
          if (ctx.pendingHangupTimer) {
            clearTimeout(ctx.pendingHangupTimer);
            ctx.pendingHangupTimer = null;
          }
          terminatingToFire.push(id);
        } else if (ctx.terminating && ctx.pendingHangupTimer) {
          // leave in-flight timer alone
        } else {
          if (ctx.pendingHangupTimer) {
            clearTimeout(ctx.pendingHangupTimer);
            ctx.pendingHangupTimer = null;
          }
          ctx.pendingHangup = null;
        }
      }
    }
    markQueue.length = 0;
    aiResponseActive = false;
    activeContextId = null;
    logger.log(`[Playback] invalidated ${ids.length} ctx(s) reason=${reason}`);
    for (const id of terminatingToFire) {
      const ctx = getContext(id);
      if (ctx && ctx.pendingHangup) {
        firePendingHangup(id);
      }
    }
    return ids;
  }

  return {
    contexts,
    markQueue,
    getActiveContextId: () => activeContextId,
    isAiResponseActive: () => aiResponseActive,
    getContextSnapshot: (id) => {
      const c = contexts.get(id);
      if (!c) return null;
      return { marks: c.marks, chunks: c.chunks, doneFromCartesia: c.doneFromCartesia, invalidated: c.invalidated };
    },
    startContext,
    endContext,
    canAcceptChunk,
    recordChunk,
    rollbackChunk,
    ackMark,
    scheduleHangupOnDrain,
    cancelScheduledHangup,
    invalidateAll
  };
}

exports.createPlaybackTracker = createPlaybackTracker;

function sendToCartesia(cartesiaWs, text, contextId, continueFlag = false, voiceId = null, speed = null) {
  if (continueFlag && (!text || !text.trim())) return;

  const basePayload = {
    model_id: CARTESIA_MODEL_ID,
    transcript: (text || '').trim(),
    voice: { mode: 'id', id: voiceId || CARTESIA_VOICE_ID_DEFAULT },
    output_format: { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 },
    context_id: contextId,
    continue: continueFlag
  };
  if (speed !== null) basePayload.speed = speed;
  const payload = JSON.stringify(basePayload);
  if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
    console.log('[Cartesia] Sending text (' + text.length + ' chars):', text.substring(0, 80));
    cartesiaWs.send(payload);
  } else if (cartesiaWs && cartesiaWs.readyState === WebSocket.CONNECTING) {
    console.log('[Cartesia] Still connecting, queuing text:', text.substring(0, 50));
    cartesiaWs.once('open', () => {
      console.log('[Cartesia] Flushing queued text');
      cartesiaWs.send(payload);
    });
  } else {
    console.error('[Cartesia] Not connected, skipping:', text.substring(0, 50));
  }
}

exports.handleMediaStream = async (twilioWs, req) => {
  const callId = req.params.callId;
  console.log('[MediaStream] Client connected, callId:', callId);

  if (!process.env.OPENAI_REALTIME_API_KEY) {
    console.error('[MediaStream] Missing OpenAI API key');
    twilioWs.close();
    return;
  }

  let streamSid = null;
  let latestMediaTimestamp = 0;
  let lastAssistantItem = null;
  let responseStartTimestamp = null;
  let openaiWs = null;
  let cartesiaWs = null;
  let textBuffer = '';
  let currentResponseId = null;
  let cartesiaContextId = null;
  let textDeltaEventType = null;

  const playback = createPlaybackTracker();
  const markQueue = playback.markQueue;

  let pendingHandoff = null;
  let handoffAwaitingAnnouncementCtx = false;
  let handoffFallbackTimer = null;
  let scheduledHandoffCtxId = null;
  let handoffCompleted = false;
  let pendingCallEnd = null;
  let lastCompletedCtxId = null;

  let customerSilenceTimer = null;
  let customerSilenceCheckCount = 0;

  let callSession = null;
  let speechStartedAt = null;

  // ── フィラー制御用：直前に顧客が話したかどうかのフラグ ──
  let customerJustSpoke = false;
  // ── 顧客が一度でも話したかどうかのフラグ（沈黙検知タイマー制御用）──
  let customerHasSpoken = false;

  function completeHandoff(reason) {
    if (handoffCompleted) return;
    handoffCompleted = true;

    if (handoffFallbackTimer) {
      clearTimeout(handoffFallbackTimer);
      handoffFallbackTimer = null;
    }

    const handoffData = pendingHandoff ? { ...pendingHandoff } : null;
    pendingHandoff = null;
    handoffAwaitingAnnouncementCtx = false;
    scheduledHandoffCtxId = null;

    if (!handoffData) return;

    console.log('[AutoHandoff] completing handoff reason=' + reason);
    executeHandoffWithFallback(callSession, handoffData, twilioWs, () => streamSid, cartesiaWs, playback)
      .catch(err => console.error('[AutoHandoff] Error execution:', err));
  }

  twilioWs.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[Twilio→Backend] Received message:', JSON.stringify(data).substring(0, 200), 'callId:', callId);
      console.log('[Twilio→Backend] Event type:', data.event || 'NO EVENT FIELD');

      if (data.event === 'media' && openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        latestMediaTimestamp = parseInt(data.media.timestamp);
        const audioAppend = {
          type: "input_audio_buffer.append",
          audio: data.media.payload
        };
        openaiWs.send(JSON.stringify(audioAppend));
      }

      else if (data.event === 'start') {
        streamSid = data.start.streamSid;
        console.log('[MediaStream] Stream started:', streamSid);
        responseStartTimestamp = null;
        latestMediaTimestamp = 0;
        lastAssistantItem = null;

        const connection = global.activeMediaStreams.get(callId);
        if (connection) {
          connection.streamSid = streamSid;
          console.log('[MediaStream] Updated streamSid in global map:', callId);
        }
      }

      else if (data.event === 'mark') {
        const markName = data.mark && data.mark.name;
        playback.ackMark(markName);
      }

    } catch (error) {
      console.error('[MediaStream] Error processing Twilio message:', error.message);
    }
  });

  twilioWs.on('close', async () => {
    console.log('[MediaStream] Client disconnected');

    if (handoffFallbackTimer) {
      clearTimeout(handoffFallbackTimer);
      handoffFallbackTimer = null;
    }
    if (scheduledHandoffCtxId) {
      playback.cancelScheduledHangup(scheduledHandoffCtxId);
      scheduledHandoffCtxId = null;
    }
    handoffCompleted = true;

    if (global.activeMediaStreams.has(callId)) {
      global.activeMediaStreams.delete(callId);
      console.log('[MediaStream] Removed connection from global map:', callId);
    }

    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }

    if (callSession) {
      const latestSession = await CallSession.findById(callSession._id);
      const currentStatus = latestSession ? latestSession.status : callSession.status;
      console.log(`[MediaStream] Current status before disconnect (from DB): ${currentStatus}`);
      console.log(`[MediaStream] Previous in-memory status was: ${callSession.status}`);

      const isHandoffInProgress =
        currentStatus === 'transferring' ||
        currentStatus === 'human-connected' ||
        latestSession?.handoffDetails?.requestedAt;

      if (isHandoffInProgress) {
        console.log('[MediaStream] Call is being transferred or in conference - not marking as completed');
        if (latestSession && callSession.transcript && callSession.transcript.length > 0) {
          latestSession.transcript = callSession.transcript;
          await latestSession.save();
          console.log(`[MediaStream] Transcript saved, status remains: ${currentStatus}`);
        }
      } else {
        callSession.status = 'completed';
        console.log('[MediaStream] Marking call as completed (non-transfer case)');

        if (callSession.transcript && callSession.transcript.length > 0) {
          console.log('[MediaStream] Saving transcript to DB:', {
            callId: callSession._id.toString(),
            transcriptLength: callSession.transcript.length
          });
        }

        await callSession.save();
        console.log('[MediaStream] CallSession saved with transcript');

        if (global.io && callSession.userId) {
          const eventData = {
            customerId: callSession.customerId?.toString() || callSession.customerId,
            phoneNumber: callSession.phoneNumber,
            status: 'completed',
            callResult: callSession.callResult || '完了',
            callId: callSession._id.toString(),
            twilioCallSid: callSession.twilioCallSid
          };
          global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', eventData);
          console.log(`[WebSocket] Emitted callStatusUpdate to user ${callSession.userId}: completed`, JSON.stringify(eventData));
        }
      }
    }
  });

  twilioWs.on('error', (error) => {
    console.error('[MediaStream] Twilio WebSocket error:', error.message);
  });

  try {
    callSession = await CallSession.findById(callId).populate('assignedAgent');

    if (!callSession) {
      console.error('[MediaStream] CallSession not found:', callId);
      twilioWs.close();
      return;
    }

    console.log('[MediaStream] CallSession loaded:', callSession._id);

    let agentSettings = null;
    if (callSession.assignedAgent) {
      agentSettings = await AgentSettings.findOne({ userId: callSession.assignedAgent._id });
      console.log('[MediaStream] AgentSettings loaded for user:', callSession.assignedAgent._id);
      if (agentSettings && agentSettings.conversationSettings) {
        console.log('[MediaStream] AgentSettings preview:', {
          companyName: agentSettings.conversationSettings.companyName,
          serviceName: agentSettings.conversationSettings.serviceName,
          representativeName: agentSettings.conversationSettings.representativeName
        });
      } else {
        console.warn('[MediaStream] AgentSettings missing conversationSettings!');
      }
    }

    const temperature = agentSettings?.temperature || 0.8;
    const cartesiaVoiceId = agentSettings?.cartesiaVoiceId || CARTESIA_VOICE_ID_DEFAULT;
    const speechRateMap = { slow: 0.8, normal: 1.0, fast: 1.2 };
    const cartesiaSpeed = speechRateMap[agentSettings?.conversationSettings?.speechRate] || null;
    const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${temperature}`;
    console.log('[OpenAI] Connecting to:', openaiUrl);
    console.log('[OpenAI] API Key present:', !!process.env.OPENAI_REALTIME_API_KEY);

    openaiWs = new WebSocket(openaiUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_REALTIME_API_KEY}`
      }
    });

    openaiWs.on('open', async () => {
      console.log('[OpenAI] Connected to Realtime API');

      await initializeSession(openaiWs, agentSettings);

      // ✅ 古いCartesia接続が残っていればクローズ
      if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
        console.log('[Cartesia] Closing stale connection before creating new one');
        cartesiaWs.close();
        cartesiaWs = null;
      }

      cartesiaWs = createCartesiaWs(twilioWs, () => streamSid, {
        onChunk: ({ ctxId, payload }) => {
          const sid = streamSid;
          if (!sid) return;
          if (!twilioWs || twilioWs.readyState !== WebSocket.OPEN) return;
          if (!playback.canAcceptChunk(ctxId)) {
            console.log('[barge-in] stale cartesia chunk dropped ctx=' + ctxId);
            return;
          }

          try {
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid: sid,
              media: { payload }
            }));
          } catch (e) {
            console.error('[Cartesia→Twilio] media send error:', e.message);
            return;
          }

          const markName = playback.recordChunk(ctxId);
          if (!markName) return;

          const sent = sendChunkMark(twilioWs, sid, markName);
          if (!sent) {
            console.warn('[Cartesia→Twilio] mark send failed, rolling back', markName);
            playback.rollbackChunk(markName);
          }
        },
        onContextDone: ({ ctxId }) => {
          console.log('[Cartesia] context done:', ctxId);
          playback.endContext(ctxId);
        },
        onError: (msg) => {
          console.error('[Cartesia] error event:', msg);
        }
      });

      callSession.realtimeSessionId = 'session-' + Date.now();
      await callSession.save();

      if (global.io && callSession.userId) {
        const eventData = {
          customerId: callSession.customerId?.toString() || callSession.customerId,
          phoneNumber: callSession.phoneNumber,
          status: 'calling',
          callId: callSession._id.toString(),
          twilioCallSid: callSession.twilioCallSid
        };
        global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', eventData);
        console.log(`[WebSocket] Emitted callStatusUpdate to user ${callSession.userId}: calling`, JSON.stringify(eventData));
      }

      global.activeMediaStreams.set(callId, {
        twilioWs,
        openaiWs,
        streamSid: null
      });
      console.log('[MediaStream] Registered connection in global map:', callId);

      console.log('[SilenceDetection] Starting initial silence timer (30s) after connection');
      customerSilenceTimer = setTimeout(() => {
        console.log('[SilenceDetection] Initial 30 seconds of silence detected');

        if (customerSilenceCheckCount === 0) {
          console.log('[SilenceDetection] Sending first check message');
          customerSilenceCheckCount = 1;

          if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
            const systemMessage = {
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: '[システムメッセージ] 顧客が30秒間応答していません。「もしもし、おつながりでしょうか？」と確認してください。'
                }]
              }
            };
            openaiWs.send(JSON.stringify(systemMessage));

            const responseCreate = { type: 'response.create' };
            openaiWs.send(JSON.stringify(responseCreate));
          }
        }
      }, 30000);
    });

    openaiWs.on('error', (error) => {
      console.error('[OpenAI] WebSocket error:', error.message);
      console.error('[OpenAI] Error details:', error);

      if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
        cartesiaWs.close();
      }

      if (twilioWs && twilioWs.readyState === 1) {
        twilioWs.close();
      }
    });

    openaiWs.on('close', (code, reason) => {
      console.log('[OpenAI] WebSocket closed, code:', code, 'reason:', reason?.toString());

      if (handoffFallbackTimer) {
        clearTimeout(handoffFallbackTimer);
        handoffFallbackTimer = null;
      }
      if (scheduledHandoffCtxId) {
        playback.cancelScheduledHangup(scheduledHandoffCtxId);
        scheduledHandoffCtxId = null;
      }
      handoffCompleted = true;

      if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
        cartesiaWs.close();
      }

      if (twilioWs && twilioWs.readyState === 1) {
        twilioWs.close();
      }
    });

    openaiWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());

        if (response.type && response.type.includes('function') || response.type && response.type.includes('output_item')) {
          console.log('[OpenAI DEBUG] Event type:', response.type);
          console.log('[OpenAI DEBUG] Full response:', JSON.stringify(response, null, 2));
        }

        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log('[OpenAI] Event:', response.type, response);
        }

        const isDeltaCandidate = (response.type === 'response.text.delta' ||
                                  response.type === 'response.output_text.delta') && response.delta;
        if (isDeltaCandidate) {
          if (!textDeltaEventType) {
            textDeltaEventType = response.type;
            console.log('[Text] Locked delta event type:', textDeltaEventType);
          }
        }
        const isTextDelta = isDeltaCandidate && response.type === textDeltaEventType;

        if (isTextDelta) {
          if (customerSilenceTimer) {
            clearTimeout(customerSilenceTimer);
            customerSilenceTimer = null;
          }

          if (response.item_id && response.item_id !== lastAssistantItem) {
            responseStartTimestamp = latestMediaTimestamp;
            lastAssistantItem = response.item_id;
            currentResponseId = response.response_id || `resp-${Date.now()}`;
            cartesiaContextId = createCartesiaContextId(currentResponseId, response.item_id);
            playback.startContext(cartesiaContextId);
            console.log('[Text] New assistant item:', response.item_id, '→ Cartesia context:', cartesiaContextId);

            // ── フィラー挿入：顧客が直前に話した場合のみ「はい。」を挿入 ──
            if (customerJustSpoke && !pendingHandoff && !pendingCallEnd) {
              sendToCartesia(cartesiaWs, 'はい。', cartesiaContextId, true, cartesiaVoiceId, cartesiaSpeed);
              console.log('[Filler] Inserted: はい。');
              customerJustSpoke = false; // リセット
            }
            // ─────────────────────────────────────────────────────────────

            if (pendingHandoff && handoffAwaitingAnnouncementCtx) {
              if (scheduledHandoffCtxId && scheduledHandoffCtxId !== cartesiaContextId) {
                playback.cancelScheduledHangup(scheduledHandoffCtxId);
                console.log('[AutoHandoff] cancelled prior announcement ctx=' + scheduledHandoffCtxId);
              }
              pendingHandoff.ctxId = cartesiaContextId;
              scheduledHandoffCtxId = cartesiaContextId;
              playback.scheduleHangupOnDrain(cartesiaContextId, () => {
                console.log('[AutoHandoff] audio drained — executing handoff');
                completeHandoff('drain');
              });
              if (handoffFallbackTimer) {
                clearTimeout(handoffFallbackTimer);
                handoffFallbackTimer = null;
              }
              console.log('[AutoHandoff] bound and scheduled announcement ctx=' + cartesiaContextId);
            }

            if (callSession && global.io && callSession.userId) {
              global.io.to(`user-${callSession.userId}`).emit('callStatusUpdate', {
                customerId: callSession.customerId?.toString() || callSession.customerId,
                phoneNumber: callSession.phoneNumber,
                status: 'ai-responding',
                callId: callSession._id.toString(),
                twilioCallSid: callSession.twilioCallSid
              });
            }
          }

          textBuffer += response.delta;

          const sentenceEnd = /[。！？!?]\s*$/.test(textBuffer) && textBuffer.length >= 8;
          const pausePoint = /[、,]\s*$/.test(textBuffer) && textBuffer.length >= 20;
          if (sentenceEnd || pausePoint || textBuffer.length >= 60) {
            sendToCartesia(cartesiaWs, textBuffer, cartesiaContextId, true, cartesiaVoiceId, cartesiaSpeed);
            textBuffer = '';
          }
        }

        const isTextDone = response.type === 'response.text.done' ||
                           response.type === 'response.output_text.done';
        if (isTextDone && cartesiaContextId) {
          if (textBuffer.trim()) {
            sendToCartesia(cartesiaWs, textBuffer, cartesiaContextId, true);
            textBuffer = '';
          }
          sendToCartesia(cartesiaWs, '', cartesiaContextId, false);
          lastCompletedCtxId = cartesiaContextId;
          cartesiaContextId = null;
        }

        if (response.type === 'input_audio_buffer.speech_started') {
          console.log('[barge-in] speech_started');
          speechStartedAt = new Date();
          // ✅ 顧客が話し始めた瞬間にフラグをセット（transcription完了を待たない）
          customerHasSpoken = true;

          // ✅ closing phrase再生中（terminating context）はバージインを無効化
          // 挨拶の途中で切れるのを防ぐ
          const hasTerminatingContext = [...playback.contexts.values()].some(
            ctx => ctx.terminating && !ctx.invalidated
          );
          if (hasTerminatingContext) {
            console.log('[barge-in] closing phrase in progress — ignoring speech_started');
            return;
          }

          const shouldInterrupt =
            playback.isAiResponseActive() ||
            !!cartesiaContextId;

          textBuffer = '';

          if (customerSilenceTimer) {
            clearTimeout(customerSilenceTimer);
            customerSilenceTimer = null;
            customerSilenceCheckCount = 0;
          }

          if (!shouldInterrupt) {
            console.log('[barge-in] nothing to interrupt (idle)');
            return;
          }

          if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
            try {
              openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
              console.log('[barge-in] openai response.cancel sent');
            } catch (e) {
              console.error('[barge-in] openai response.cancel error:', e.message);
            }
          }

          if (cartesiaContextId) {
            try {
              sendToCartesia(cartesiaWs, '', cartesiaContextId, false);
            } catch (e) {
              console.error('[barge-in] cartesia finalize error:', e.message);
            }
          }
          playback.invalidateAll('speech_started');
          console.log('[barge-in] cartesia context invalidated');

          if (twilioWs && twilioWs.readyState === WebSocket.OPEN && streamSid) {
            try {
              twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
              console.log('[barge-in] twilio clear sent');
            } catch (e) {
              console.error('[barge-in] twilio clear error:', e.message);
            }
          }

          if (pendingHandoff) {
            if (!pendingHandoff.ctxId) {
              console.log('[barge-in] dropping pendingHandoff (announcement not started)');
              pendingHandoff = null;
              handoffAwaitingAnnouncementCtx = false;
              if (handoffFallbackTimer) {
                clearTimeout(handoffFallbackTimer);
                handoffFallbackTimer = null;
              }
            } else {
              console.log('[barge-in] handoff announcement live — terminating-guard will complete handoff, not aborting');
            }
          }
          if (pendingCallEnd) {
            console.log('[barge-in] dropping pendingCallEnd due to user speech');
            pendingCallEnd = null;
          }

          cartesiaContextId = null;
          lastAssistantItem = null;
          responseStartTimestamp = null;
        }

        if (response.type === 'input_audio_buffer.committed' && response.item_id) {
          console.log('[Conversation] User speech committed:', response.item_id);
        }

        if (response.type === 'conversation.item.input_audio_transcription.completed') {
          const transcript = response.transcript;
          const itemId = response.item_id;

          console.log('[User Transcription] Completed:', { itemId, transcript });

          if (transcript && transcript.length > 0) {
            // ── 顧客が話したフラグをセット ──
            customerJustSpoke = true;
            customerHasSpoken = true;

            callSession.realtimeConversation.push({
              type: 'message',
              role: 'user',
              content: [{ type: 'input_audio', transcript }],
              timestamp: new Date()
            });

            await callSession.save();
            console.log('[User Transcription] Saved to database');

            sendConversationUpdate(callSession, 'user', transcript, speechStartedAt || new Date());
            speechStartedAt = null;
          }
        }

        if (response.type === 'conversation.item.created' && response.item) {
          const item = response.item;
          console.log('[Conversation] Item created:', {
            id: item.id,
            type: item.type,
            role: item.role,
            hasContent: !!item.content
          });

          if (item.role && item.content && item.content.length > 0) {
            callSession.realtimeConversation.push({
              type: item.type || 'message',
              role: item.role,
              content: item.content,
              timestamp: new Date()
            });

            await callSession.save();
            console.log('[Conversation] Saved item (conversation.item.created), role:', item.role, 'total:', callSession.realtimeConversation.length);
          }
        }

        if (response.type === 'response.done' && response.response) {
          const resp = response.response;

          if (resp.output && resp.output.length > 0) {
            for (const item of resp.output) {
              if (item.role && item.content) {
                console.log('[Conversation] Saving assistant item:', {
                  role: item.role,
                  contentLength: item.content.length,
                  type: item.type
                });

                callSession.realtimeConversation.push({
                  type: item.type || 'message',
                  role: item.role,
                  content: item.content,
                  timestamp: new Date()
                });

                const text = extractTextFromContent(item.content);
                console.log('[Conversation] Extracted text:', text || '(empty)', 'from content types:', item.content.map(c => c.type).join(', '));
                if (text) {
                  sendConversationUpdate(callSession, item.role, text);
                }
              }
            }

            await callSession.save();
            console.log('[Conversation] Saved to database, total items:', callSession.realtimeConversation.length);
          }

          if (!pendingHandoff && !pendingCallEnd) {
            if (customerSilenceTimer) {
              clearTimeout(customerSilenceTimer);
              console.log('[SilenceDetection] Cleared previous timer');
            }

            // ✅ 顧客が話したことがあるかどうかでタイマーを変える
            // 初回AI発話後：8秒（相手が反応するのを待つ）
            // 会話開始後：5秒（会話中の無言検知）
            let timeoutDuration;
            if (!customerHasSpoken) {
              // 顧客がまだ一度も話していない場合
              if (customerSilenceCheckCount === 0) {
                timeoutDuration = 8000;  // 8秒：最初の反応待ち
              } else if (customerSilenceCheckCount === 1) {
                timeoutDuration = 5000;  // 5秒：2回目の確認
              } else {
                timeoutDuration = 5000;  // 5秒：通話終了
              }
            } else {
              // 顧客が一度でも話した後
              if (customerSilenceCheckCount === 0) {
                timeoutDuration = 5000;  // 5秒：通常の無言検知
              } else if (customerSilenceCheckCount === 1) {
                timeoutDuration = 5000;  // 5秒：2回目の確認
              } else {
                timeoutDuration = 5000;  // 5秒：通話終了
              }
            }

            console.log(`[SilenceDetection] customerHasSpoken=${customerHasSpoken}, Starting timer (check ${customerSilenceCheckCount + 1}, ${timeoutDuration}ms) after AI response completion`);

            customerSilenceTimer = setTimeout(() => {
              console.log(`[SilenceDetection] ${timeoutDuration / 1000} seconds of silence detected`);

              if (customerSilenceCheckCount === 0) {
                console.log('[SilenceDetection] Sending first check message');
                customerSilenceCheckCount = 1;

                if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                  const systemMessage = {
                    type: 'conversation.item.create',
                    item: {
                      type: 'message',
                      role: 'user',
                      content: [{
                        type: 'input_text',
                        text: '[システムメッセージ] 顧客が5秒間応答していません。「もしもし、おつながりでしょうか？」と確認してください。'
                      }]
                    }
                  };
                  openaiWs.send(JSON.stringify(systemMessage));
                  openaiWs.send(JSON.stringify({ type: 'response.create' }));
                }
              } else if (customerSilenceCheckCount === 1) {
                console.log('[SilenceDetection] Sending second check message');
                customerSilenceCheckCount = 2;

                if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                  const systemMessage = {
                    type: 'conversation.item.create',
                    item: {
                      type: 'message',
                      role: 'user',
                      content: [{
                        type: 'input_text',
                        text: '[システムメッセージ] 顧客がまだ応答していません。「恐れ入りますが、お電話つながっておりますでしょうか？」と確認してください。'
                      }]
                    }
                  };
                  openaiWs.send(JSON.stringify(systemMessage));
                  openaiWs.send(JSON.stringify({ type: 'response.create' }));
                }
              } else {
                console.log('[SilenceDetection] Sending final termination message');
                customerSilenceCheckCount = 0;

                if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                  const systemMessage = {
                    type: 'conversation.item.create',
                    item: {
                      type: 'message',
                      role: 'user',
                      content: [{
                        type: 'input_text',
                        text: '[システムメッセージ] 顧客が応答しません。「お電話が遠いようですので、改めてご連絡させていただきます。失礼いたします」と言って end_call_on_no_response 関数を呼び出して通話を終了してください。'
                      }]
                    }
                  };
                  openaiWs.send(JSON.stringify(systemMessage));
                  openaiWs.send(JSON.stringify({ type: 'response.create' }));
                }
              }
            }, timeoutDuration);
          }

          if (pendingHandoff) {
            const ctxId = pendingHandoff.ctxId;
            if (!ctxId || lastCompletedCtxId !== ctxId) {
              console.log('[AutoHandoff] response.done but announcement ctx not finalized yet (ctxId=' + ctxId + ', lastCompleted=' + lastCompletedCtxId + ') — waiting');
            } else {
              handoffAwaitingAnnouncementCtx = false;
              console.log('[AutoHandoff] announcement finalized — drain completion already scheduled ctx=' + ctxId);
            }
          }

          if (pendingCallEnd) {
            console.warn('[AutoCallEnd] legacy pendingCallEnd path triggered — falling back to deterministic close');
            const endData = pendingCallEnd;
            pendingCallEnd = null;
            const ctxId = lastCompletedCtxId;
            const run = async () => {
              try {
                if (endData.type === 'no_response' || endData.type === 'voicemail') {
                  await executeAutoCallEndOnNoResponse(callSession, endData.callId, endData.args, endData.type);
                } else if (endData.type === 'absent') {
                  await executeAutoCallEndOnAbsent(callSession, endData.callId, endData.args);
                } else {
                  await executeAutoCallEnd(callSession, endData.callId, endData.args);
                }
              } catch (err) {
                console.error('[AutoCallEnd] Error execution:', err);
              }
            };
            if (!ctxId) {
              run();
            } else {
              playback.scheduleHangupOnDrain(ctxId, run);
            }
          }
        }

        if (response.type === 'response.output_item.done' && response.item) {
          const item = response.item;
          console.log('[FunctionCall] Detected output_item.done:', item.type);

          if (item.type === 'function_call' && item.name === 'transfer_to_human') {
            console.log('[FunctionCall] Transfer function called by AI');
            console.log('[FunctionCall] Arguments:', item.arguments);

            try {
              const args = JSON.parse(item.arguments);
              pendingHandoff = {
                callId: item.call_id,
                args: args,
                ctxId: null
              };
              handoffAwaitingAnnouncementCtx = true;

              if (handoffFallbackTimer) clearTimeout(handoffFallbackTimer);
              handoffFallbackTimer = setTimeout(() => {
                if (!handoffCompleted) {
                  console.warn('[AutoHandoff] announcement did not complete within fallback window — executing handoff directly');
                  completeHandoff('fallback-timeout');
                }
              }, HANDOFF_ANNOUNCE_FALLBACK_MS);

              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                const functionOutput = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: item.call_id,
                    output: JSON.stringify({
                      success: true,
                      message: '転送準備が整いました。お客様にご案内後、転送を実行します。'
                    })
                  }
                };
                openaiWs.send(JSON.stringify(functionOutput));
                console.log('[FunctionCall] Sent function result to OpenAI (handoff pending)');
                openaiWs.send(JSON.stringify({ type: 'response.create' }));
              }
            } catch (error) {
              console.error('[FunctionCall] Error parsing function arguments:', error);
              pendingHandoff = null;
              handoffAwaitingAnnouncementCtx = false;
              if (handoffFallbackTimer) {
                clearTimeout(handoffFallbackTimer);
                handoffFallbackTimer = null;
              }

              if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                const functionOutput = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: item.call_id,
                    output: JSON.stringify({
                      success: false,
                      message: '転送準備に失敗しました',
                      error: error.message
                    })
                  }
                };
                openaiWs.send(JSON.stringify(functionOutput));
              }
            }
          }

          else if (item.type === 'function_call' && item.name === 'end_call_on_rejection') {
            console.log('[FunctionCall] 顧客拒否検知 - deterministic closing で切電');
            handleDeterministicCallEnd({
              endType: 'rejection',
              phrase: CLOSING_PHRASES.rejection,
              item,
              openaiWs,
              cartesiaWs,
              playback,
              executor: (callId, args) => executeAutoCallEnd(callSession, callId, args)
            });
          }

          else if (item.type === 'function_call' && item.name === 'end_call_on_voicemail') {
            console.log('[FunctionCall] 留守番電話検知 - silent close で切電');
            handleDeterministicCallEnd({
              endType: 'voicemail',
              phrase: CLOSING_PHRASES.voicemail,
              item,
              openaiWs,
              cartesiaWs,
              playback,
              executor: (callId, args) =>
                executeAutoCallEndOnNoResponse(callSession, callId, args, 'voicemail')
            });
          }

          else if (item.type === 'function_call' && item.name === 'end_call_on_no_response') {
            console.log('[FunctionCall] 顧客無応答検知 - deterministic closing で切電');
            handleDeterministicCallEnd({
              endType: 'no_response',
              phrase: CLOSING_PHRASES.no_response,
              item,
              openaiWs,
              cartesiaWs,
              playback,
              executor: (callId, args) =>
                executeAutoCallEndOnNoResponse(callSession, callId, args, 'no_response')
            });
          }

          else if (item.type === 'function_call' && item.name === 'end_call_on_absent') {
            console.log('[FunctionCall] 担当者不在検知 - deterministic closing で切電');
            handleDeterministicCallEnd({
              endType: 'absent',
              phrase: CLOSING_PHRASES.absent,
              item,
              openaiWs,
              cartesiaWs,
              playback,
              executor: (callId, args) =>
                executeAutoCallEndOnAbsent(callSession, callId, args)
            });
          }
        }

      } catch (error) {
        console.error('[OpenAI] Error processing message:', error.message);
      }
    });

  } catch (error) {
    console.error('[MediaStream] Error in handleMediaStream:', error.message);
    console.error('[MediaStream] Stack:', error.stack);

    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
      cartesiaWs.close();
    }
    twilioWs.close();
  }
};

exports.executeAutoCallEnd = executeAutoCallEnd;
exports.executeAutoCallEndOnNoResponse = executeAutoCallEndOnNoResponse;
exports.executeAutoCallEndOnAbsent = executeAutoCallEndOnAbsent;
exports.executeAutoHandoff = executeAutoHandoff;

module.exports = exports;
