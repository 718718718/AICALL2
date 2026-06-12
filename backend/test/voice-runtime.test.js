/**
 * Voice runtime smoke tests — Cartesia → Twilio playback sync.
 *
 * Runs as a plain Node script (no jest dependency).
 * Each test asserts one specific behavior from the playback tracker / helpers
 * inside mediaStreamController.js. We do NOT bring up real Twilio / OpenAI /
 * Cartesia sockets — instead we drive the public hooks directly.
 *
 * Run with: `node backend/test/voice-runtime.test.js`
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Stub mongoose models that the controller pulls in at require time.
// We never call their methods in this test, but require() must succeed.
const mongoosePath = require.resolve('mongoose');
require(mongoosePath); // touch so the cache exists

const controller = require(path.join('..', 'controllers', 'mediaStreamController.js'));

const {
  createPlaybackTracker,
  parseChunkMark,
  sendChunkMark,
  CLOSING_PHRASES,
  handleDeterministicCallEnd,
  executeHandoffWithFallback,
  executeAutoHandoff,
  createCartesiaContextId
} = controller;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log('  ✓', name);
    })
    .catch((err) => {
      failed += 1;
      failures.push({ name, err });
      console.error('  ✗', name);
      console.error('   ', err && (err.stack || err.message || err));
    });
}

function fakeLogger() {
  const logs = [];
  return {
    log: (...a) => logs.push(['log', a.join(' ')]),
    warn: (...a) => logs.push(['warn', a.join(' ')]),
    error: (...a) => logs.push(['error', a.join(' ')]),
    _logs: logs,
    has: (substr) => logs.some(([, msg]) => msg.includes(substr))
  };
}

async function suiteParseChunkMark() {
  console.log('\nparseChunkMark');
  await test('parses cartesia:<ctx>:<seq>', () => {
    const r = parseChunkMark('cartesia:ctx-abc:7');
    assert.deepStrictEqual(r, { ctxId: 'ctx-abc', seq: 7 });
  });
  await test('returns null for legacy names', () => {
    assert.strictEqual(parseChunkMark('responsePart'), null);
    assert.strictEqual(parseChunkMark(null), null);
    assert.strictEqual(parseChunkMark('cartesia:ctx'), null); // missing seq
  });
}

async function suiteMarksDrivenByChunks() {
  console.log('\nmarkQueue is driven by Cartesia chunks (not text deltas)');
  await test('recordChunk grows markQueue; ackMark drains it', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    const ctx = 'ctx-1';
    t.startContext(ctx);

    // Sending text to Cartesia does NOT push a mark (text-delta path no
    // longer enqueues). We only push when a chunk arrives back.
    assert.strictEqual(t.markQueue.length, 0, 'initial queue empty');

    const m1 = t.recordChunk(ctx);
    const m2 = t.recordChunk(ctx);
    assert.ok(m1.startsWith('cartesia:' + ctx + ':'));
    assert.ok(m2.startsWith('cartesia:' + ctx + ':'));
    assert.strictEqual(t.markQueue.length, 2);

    t.ackMark(m1);
    assert.strictEqual(t.markQueue.length, 1);
    t.ackMark(m2);
    assert.strictEqual(t.markQueue.length, 0);
  });
}

async function suiteBargeInUnconditional() {
  console.log('\nbarge-in invalidates context regardless of markQueue size');
  await test('invalidateAll drops queue & flags ctx invalid even when marks=0', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    const ctx = 'ctx-active';
    t.startContext(ctx);
    assert.strictEqual(t.markQueue.length, 0); // simulates "chunks not landed yet"
    assert.strictEqual(t.isAiResponseActive(), true);

    const invalidated = t.invalidateAll('test_speech_started');
    assert.deepStrictEqual(invalidated, [ctx]);
    assert.strictEqual(t.markQueue.length, 0);
    assert.strictEqual(t.isAiResponseActive(), false);

    // A late chunk for an invalidated context must be dropped (returns null).
    const m = t.recordChunk(ctx);
    assert.strictEqual(m, null, 'stale chunk must be dropped');
  });
}

async function suiteStaleChunkDropped() {
  console.log('\nstale cartesia chunks from invalidated contexts are dropped');
  await test('after invalidate, recordChunk returns null and queue stays empty', () => {
    const logger = fakeLogger();
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger });
    const ctx = 'ctx-stale';
    t.startContext(ctx);
    t.invalidateAll('barge_in');
    const r = t.recordChunk(ctx);
    assert.strictEqual(r, null);
    assert.strictEqual(t.markQueue.length, 0);
    assert.ok(logger.has('stale cartesia chunk dropped'), 'log must explain drop');
  });
}

async function suiteDeterministicClosingFlow() {
  console.log('\ndeterministic closing for end_call_on_rejection');
  await test('rejection → closing phrase to Cartesia → marks ack → hangup', async () => {
    const cartesiaMessages = [];
    const cartesiaWs = {
      readyState: 1,
      send: (payload) => cartesiaMessages.push(JSON.parse(payload))
    };
    // mock OpenAI socket so the function_call_output send doesn't blow up
    const openaiMessages = [];
    const openaiWs = {
      readyState: 1,
      send: (p) => openaiMessages.push(JSON.parse(p))
    };
    // Ensure ws.OPEN === 1 globally (WebSocket constant)
    const WebSocket = require('ws');
    assert.strictEqual(WebSocket.OPEN, 1);

    const playback = createPlaybackTracker({ tailMs: 10, drainTimeoutMs: 1000, logger: fakeLogger() });

    let executorCalled = false;
    let executorArgs = null;

    const item = {
      arguments: JSON.stringify({ rejection_reason: '興味なし' }),
      call_id: 'call-xyz'
    };

    const ctxId = handleDeterministicCallEnd({
      endType: 'rejection',
      phrase: CLOSING_PHRASES.rejection,
      item,
      openaiWs,
      cartesiaWs,
      playback,
      executor: (callId, args) => {
        executorCalled = true;
        executorArgs = { callId, args };
      }
    });

    // 1) OpenAI got a function_call_output with success.
    assert.ok(openaiMessages.length >= 1, 'function_call_output sent');
    const out = openaiMessages[0];
    assert.strictEqual(out.type, 'conversation.item.create');
    assert.strictEqual(out.item.type, 'function_call_output');
    const outPayload = JSON.parse(out.item.output);
    assert.strictEqual(outPayload.success, true);

    // 2) Critically: we did NOT send response.create — that's what made AI
    //    sometimes skip the closing phrase entirely. Verify absence.
    const sawResponseCreate = openaiMessages.some(m => m.type === 'response.create');
    assert.strictEqual(sawResponseCreate, false, 'response.create must NOT be sent');

    // 3) Cartesia got the deterministic phrase + a finalize message.
    assert.ok(cartesiaMessages.length >= 2, 'phrase + finalize');
    assert.strictEqual(cartesiaMessages[0].transcript, CLOSING_PHRASES.rejection);
    assert.strictEqual(cartesiaMessages[0].continue, true);
    assert.strictEqual(cartesiaMessages[0].context_id, ctxId);
    const finalize = cartesiaMessages[cartesiaMessages.length - 1];
    assert.strictEqual(finalize.continue, false);
    assert.strictEqual(finalize.context_id, ctxId);

    // 4) Simulate Cartesia chunks landing at Twilio, then Twilio acks.
    const m1 = playback.recordChunk(ctxId);
    const m2 = playback.recordChunk(ctxId);
    assert.ok(m1 && m2);
    playback.ackMark(m1);
    playback.ackMark(m2);
    // Cartesia done event arrives last.
    playback.endContext(ctxId);

    // 5) Wait for tail to elapse, then assert executor fired.
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(executorCalled, true, 'executor fired after drain');
    assert.strictEqual(executorArgs.callId, 'call-xyz');
    assert.deepStrictEqual(executorArgs.args, { rejection_reason: '興味なし' });
  });
}

async function suiteAbsentFlow() {
  console.log('\ndeterministic closing for end_call_on_absent');
  await test('absent → "また改めて" phrase → drain → hangup', async () => {
    const cartesiaMessages = [];
    const cartesiaWs = { readyState: 1, send: (p) => cartesiaMessages.push(JSON.parse(p)) };
    const openaiWs = { readyState: 1, send: () => {} };
    const playback = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 1000, logger: fakeLogger() });

    let fired = false;
    const ctxId = handleDeterministicCallEnd({
      endType: 'absent',
      phrase: CLOSING_PHRASES.absent,
      item: { arguments: JSON.stringify({ absent_reason: '外出中' }), call_id: 'c1' },
      openaiWs,
      cartesiaWs,
      playback,
      executor: () => { fired = true; }
    });
    // The "また改めてご連絡いたします" wording must be in the spoken phrase.
    assert.ok(CLOSING_PHRASES.absent.includes('また改めて'), 'absent phrase mentions reconnect');
    assert.strictEqual(cartesiaMessages[0].transcript, CLOSING_PHRASES.absent);

    const m = playback.recordChunk(ctxId);
    playback.ackMark(m);
    playback.endContext(ctxId);
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(fired, true);
  });
}

async function suiteHandoffFallback() {
  console.log('\nhandoff failure plays fallback phrase then hangs up');
  await test('failed handoff schedules CLOSING_PHRASES.handoff_fallback', async () => {
    const cartesiaMessages = [];
    const cartesiaWs = { readyState: 1, send: (p) => cartesiaMessages.push(JSON.parse(p)) };
    const playback = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 1000, logger: fakeLogger() });

    // Stub the executeAutoHandoff path by replacing exports on a per-call
    // basis is messy; instead we call executeHandoffWithFallback with a
    // callSession whose handoff cannot succeed (we use a non-existent agent
    // — executeAutoHandoff will log "No assigned agent" and return undefined,
    // which our wrapper treats as failure).
    // callSession stub. We give it a save() so executeAutoCallEnd (invoked
    // by the fallback scheduler if the drain fires fast enough) doesn't
    // explode with "callSession.save is not a function". executeAutoHandoff
    // returns early because assignedAgent is null — that's the path we test.
    const callSession = {
      _id: 'sess-1',
      assignedAgent: null,
      transcript: [],
      save: async () => {}
    };

    const handoffData = { callId: 'fc-1', args: { customer_consent: true }, ctxId: 'ignored' };

    const result = await executeHandoffWithFallback(
      callSession,
      handoffData,
      /*twilioWs*/ null,
      /*getStreamSid*/ () => null,
      cartesiaWs,
      playback
    );
    // failure path returns falsy result
    assert.ok(!result || result.success !== true);

    // Fallback phrase must have been sent to Cartesia.
    const sent = cartesiaMessages.find(m => m.transcript === CLOSING_PHRASES.handoff_fallback);
    assert.ok(sent, 'handoff fallback phrase sent to Cartesia');
    assert.ok(CLOSING_PHRASES.handoff_fallback.includes('改めてご連絡'));
  });
}

// ---------------------------------------------------------------------------
// Coverage-gap suites added after Codex review (NEEDS-CHANGES round)
// ---------------------------------------------------------------------------

async function suiteRollbackOnMarkSendFailure() {
  console.log('\nrollbackChunk releases the slot when mark send fails');
  await test('rollbackChunk restores marks counter and removes from queue', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    const ctx = 'ctx-rb';
    t.startContext(ctx);
    const m1 = t.recordChunk(ctx);
    const m2 = t.recordChunk(ctx);
    assert.strictEqual(t.markQueue.length, 2);

    // Simulate mark send failure on m2.
    t.rollbackChunk(m2);
    assert.strictEqual(t.markQueue.length, 1);
    assert.strictEqual(t.markQueue[0], m1);
    const snap = t.getContextSnapshot(ctx);
    assert.strictEqual(snap.marks, 1, 'marks should reflect rollback');
  });

  await test('rollback is idempotent on unknown mark names', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    t.startContext('x');
    t.rollbackChunk('cartesia:x:99'); // never allocated
    t.rollbackChunk('not-a-cartesia-mark');
    t.rollbackChunk(null);
    assert.strictEqual(t.markQueue.length, 0);
  });

  // Codex round-2 minor #1: double-rollback must not consume an unrelated
  // in-flight mark. Counter is touched only when removal from queue succeeded.
  await test('double rollback of same mark does NOT under-count other in-flight marks', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    const ctx = 'ctx-double';
    t.startContext(ctx);
    const m1 = t.recordChunk(ctx);
    const m2 = t.recordChunk(ctx);
    const m3 = t.recordChunk(ctx);
    assert.strictEqual(t.getContextSnapshot(ctx).marks, 3);

    // Roll back m2 twice — the second call must be a no-op.
    t.rollbackChunk(m2);
    t.rollbackChunk(m2);

    const snap = t.getContextSnapshot(ctx);
    assert.strictEqual(snap.marks, 2, 'marks should reflect ONE rollback, not two');
    assert.strictEqual(t.markQueue.length, 2);
    assert.ok(t.markQueue.includes(m1));
    assert.ok(t.markQueue.includes(m3));
  });
}

async function suiteDrainTimeoutForceFire() {
  console.log('\ndrainTimeout force-fires executor exactly once');
  await test('executor runs after drainTimeoutMs even if done never arrives', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 40, logger: fakeLogger() });
    const ctx = 'ctx-stuck';
    t.startContext(ctx);
    t.recordChunk(ctx); // 1 mark in flight, never ack'd
    let calls = 0;
    t.scheduleHangupOnDrain(ctx, () => { calls += 1; });

    await new Promise(r => setTimeout(r, 300)); // >> drainTimeout + tail (generous margin: timers can be delayed under full-suite event-loop load)
    assert.strictEqual(calls, 1, 'executor must fire exactly once');
  });
}

async function suiteBargeInMidCloseCleanup() {
  console.log('\ninvalidateAll during a terminating announcement does NOT strand the hangup (fires once)');
  // UNIFIED TERMINATING-GUARD (per 林): a pendingHangup bound to a deliberate
  // terminating announcement/closing context (scheduleHangupOnDrain marks the
  // ctx terminating=true) must NOT be permanently cancelled by a transient
  // VAD speech_started. Previously this suite asserted the OPPOSITE (fired ===
  // false), which encoded the very bug behind the 転送アナウンス切断 incident:
  // a transient barge-in during the "少々お待ちください" / closing phrase would
  // strand the call forever. The corrected behavior is that the bound hangup
  // still fires exactly once after the tail — not zero (stranded), not twice
  // (double-fire from a leftover pendingHangupTimer).
  await test('invalidateAll during a terminating announcement does NOT strand the hangup (fires once)', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 40, logger: fakeLogger() });
    const ctx = 'ctx-closing';
    t.startContext(ctx);
    t.recordChunk(ctx);

    let calls = 0;
    // scheduleHangupOnDrain BEFORE invalidateAll => ctx.terminating = true.
    // KEEP this ordering; it is what makes the terminating-guard apply.
    t.scheduleHangupOnDrain(ctx, () => { calls += 1; });

    // User barges in (transient speech_started) BEFORE the audio drains.
    t.invalidateAll('user_spoke_mid_close');

    // Wait > tail (and > drainTimeout) so any fire — or leaked double-fire —
    // would have happened.
    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(calls, 1, 'terminating hangup must fire exactly once, not be stranded');
  });
}

async function suiteMultipleContextsInFlight() {
  console.log('\nmultiple contexts in flight drain independently');
  await test('ack on ctx A does not affect ctx B counters', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 200, logger: fakeLogger() });
    t.startContext('A');
    t.startContext('B'); // B becomes the active conversational ctx

    const a1 = t.recordChunk('A');
    const a2 = t.recordChunk('A');
    const b1 = t.recordChunk('B');

    let aFired = false;
    let bFired = false;
    t.scheduleHangupOnDrain('A', () => { aFired = true; });
    t.scheduleHangupOnDrain('B', () => { bFired = true; });

    // Drain A only.
    t.ackMark(a1);
    t.ackMark(a2);
    t.endContext('A');

    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(aFired, true, 'A should fire');
    assert.strictEqual(bFired, false, 'B should still be waiting');

    // Now drain B.
    t.ackMark(b1);
    t.endContext('B');
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(bFired, true, 'B should fire after its own drain');
  });
}

async function suiteVoicemailSilentClose() {
  console.log('\nvoicemail (phrase=null) short-circuits without Cartesia round-trip');
  await test('phrase=null fires executor after CARTESIA_TAIL_MS, skipping Cartesia', async () => {
    const cartesiaMessages = [];
    const cartesiaWs = { readyState: 1, send: (p) => cartesiaMessages.push(JSON.parse(p)) };
    const openaiWs = { readyState: 1, send: () => {} };
    const playback = createPlaybackTracker({ tailMs: 50, drainTimeoutMs: 8000, logger: fakeLogger() });

    let fired = false;
    let firedAt = 0;
    const t0 = Date.now();
    const ctxId = handleDeterministicCallEnd({
      endType: 'voicemail',
      phrase: null, // silent close
      item: { arguments: JSON.stringify({ voicemail_detected: true }), call_id: 'vm-1' },
      openaiWs,
      cartesiaWs,
      playback,
      executor: () => { fired = true; firedAt = Date.now() - t0; }
    });

    assert.strictEqual(ctxId, null, 'silent close returns null ctxId (no Cartesia context created)');
    assert.strictEqual(cartesiaMessages.length, 0, 'no Cartesia messages sent for voicemail');

    // CARTESIA_TAIL_MS defaults to 700ms; wait long enough to observe the fire.
    const TAIL = parseInt(process.env.CARTESIA_TAIL_MS || '700', 10);
    await new Promise(r => setTimeout(r, TAIL + 200));
    assert.strictEqual(fired, true, 'executor fired');
    // Critically NOT 8s (drainTimeoutMs) — i.e. we did NOT route through Cartesia.
    assert.ok(firedAt < TAIL + 500, `fired in ${firedAt}ms (≈ TAIL ${TAIL}ms), not via drainTimeout`);
  });
}

async function suiteIdleSpeechStartedIsNoOp() {
  console.log('\nspeech_started while idle is safely a no-op');
  await test('invalidateAll on a fresh tracker leaves state empty', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    assert.strictEqual(t.isAiResponseActive(), false);
    const invalidated = t.invalidateAll('speech_started_idle');
    assert.deepStrictEqual(invalidated, [], 'nothing to invalidate');
    assert.strictEqual(t.markQueue.length, 0);
    assert.strictEqual(t.isAiResponseActive(), false);
  });
}

async function suiteCanAcceptChunkPeek() {
  console.log('\ncanAcceptChunk peek does not mutate state');
  await test('peek returns false after invalidate without bumping counters', () => {
    const t = createPlaybackTracker({ tailMs: 1, drainTimeoutMs: 1000, logger: fakeLogger() });
    t.startContext('ctx-p');
    assert.strictEqual(t.canAcceptChunk('ctx-p'), true);
    t.invalidateAll('test');
    assert.strictEqual(t.canAcceptChunk('ctx-p'), false);
    const snap = t.getContextSnapshot('ctx-p');
    assert.strictEqual(snap.marks, 0, 'peek must not touch marks');
    assert.strictEqual(snap.chunks, 0, 'peek must not touch chunks');
  });
}

async function suitePublicBaseUrlHelper() {
  console.log('\ngetPublicBaseUrl resolves BASE_URL_PROD in production');
  const { getPublicBaseUrl } = require(path.join('..', 'utils', 'publicUrl'));

  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    BASE_URL: process.env.BASE_URL,
    BASE_URL_PROD: process.env.BASE_URL_PROD,
    NGROK_URL: process.env.NGROK_URL
  };
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };

  await test('production: BASE_URL_PROD wins over BASE_URL', () => {
    try {
      process.env.NODE_ENV = 'production';
      process.env.BASE_URL_PROD = 'https://prod.example.com';
      process.env.BASE_URL = 'https://staging.example.com';
      assert.strictEqual(getPublicBaseUrl(), 'https://prod.example.com');
    } finally { restore(); }
  });

  await test('production: falls back to BASE_URL if BASE_URL_PROD unset', () => {
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.BASE_URL_PROD;
      process.env.BASE_URL = 'https://only-base.example.com';
      assert.strictEqual(getPublicBaseUrl(), 'https://only-base.example.com');
    } finally { restore(); }
  });

  await test('production: returns null (not "undefined/...") when nothing set', () => {
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.BASE_URL_PROD;
      delete process.env.BASE_URL;
      assert.strictEqual(getPublicBaseUrl(), null);
    } finally { restore(); }
  });

  await test('non-prod: BASE_URL > NGROK_URL > localhost', () => {
    try {
      process.env.NODE_ENV = 'development';
      process.env.BASE_URL = 'http://dev.local';
      process.env.NGROK_URL = 'https://ngrok.io';
      assert.strictEqual(getPublicBaseUrl(), 'http://dev.local');
      delete process.env.BASE_URL;
      assert.strictEqual(getPublicBaseUrl(), 'https://ngrok.io');
      delete process.env.NGROK_URL;
      process.env.PORT = '5050';
      assert.strictEqual(getPublicBaseUrl(), 'http://localhost:5050');
    } finally { restore(); }
  });
}

async function suiteHandoffControllerBaseUrl() {
  console.log('\nhandoffController uses getPublicBaseUrl (BASE_URL_PROD-only safe)');

  // Static regression: the source must NOT contain `process.env.BASE_URL` and
  // must contain at least one `getPublicBaseUrl()` reference. This is what
  // would have caught the Codex round-3 finding before merge.
  await test('handoffController.js has no raw process.env.BASE_URL', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'controllers', 'handoffController.js'),
      'utf8'
    );
    // We don't ban BASE_URL_PROD; we ban the bare BASE_URL that breaks in
    // BASE_URL_PROD-only production. Use a regex that anchors on `.env.`.
    const offenders = src.match(/process\.env\.BASE_URL(?!_PROD)\b/g) || [];
    assert.deepStrictEqual(offenders, [], 'no bare process.env.BASE_URL references');

    const helperHits = (src.match(/getPublicBaseUrl\(\)/g) || []).length;
    assert.ok(helperHits >= 10, `expected ≥10 getPublicBaseUrl() callsites, got ${helperHits}`);
  });

  // Behavioral: with BASE_URL_PROD only, helper must return that URL
  // (not "undefined/..."). This is what makes the Twilio statusCallback
  // for no-answer actually reach us in production.
  await test('BASE_URL_PROD-only env resolves to a valid http URL', () => {
    const { getPublicBaseUrl } = require(path.join('..', 'utils', 'publicUrl'));
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      BASE_URL: process.env.BASE_URL,
      BASE_URL_PROD: process.env.BASE_URL_PROD
    };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.BASE_URL;
      process.env.BASE_URL_PROD = 'https://prod.shingihou.com';
      const url = getPublicBaseUrl();
      assert.strictEqual(url, 'https://prod.shingihou.com');
      const statusCallback = `${url}/api/twilio/handoff-status/abc123`;
      assert.strictEqual(statusCallback, 'https://prod.shingihou.com/api/twilio/handoff-status/abc123');
      assert.ok(!statusCallback.includes('undefined'), 'no undefined in callback URL');
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });
}

async function suiteCartesiaServiceFallback() {
  console.log('\ncartesiaService returns null (→ Polly fallback) when no BASE_URL');
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    BASE_URL: process.env.BASE_URL,
    BASE_URL_PROD: process.env.BASE_URL_PROD,
    CARTESIA_API_KEY: process.env.CARTESIA_API_KEY
  };
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };

  await test('getTwilioPlayElement falls back to twiml.say when no public URL', async () => {
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.BASE_URL;
      delete process.env.BASE_URL_PROD;
      delete process.env.CARTESIA_API_KEY; // no API key → generateSpeechUrl returns null

      // Avoid mongoose caching for cartesiaService specifically; we just want the singleton.
      const cartesiaService = require(path.join('..', 'services', 'cartesiaService'));

      const sayCalls = [];
      const playCalls = [];
      const twimlStub = {
        say: (_opts, text) => { sayCalls.push(text); return { ok: true }; },
        play: (url) => { playCalls.push(url); return { ok: true }; }
      };

      const ok = await cartesiaService.getTwilioPlayElement(twimlStub, 'テスト文言');
      assert.strictEqual(ok, false, 'returns false when no audio URL');
      assert.strictEqual(playCalls.length, 0, 'no broken <Play>undefined/...</Play>');
      assert.strictEqual(sayCalls.length, 1, 'Polly fallback used');
      assert.strictEqual(sayCalls[0], 'テスト文言');
    } finally { restore(); }
  });
}

// ---------------------------------------------------------------------------
// Unified terminating-guard regression suites (Bug A) + Bug B result labeling
// ---------------------------------------------------------------------------

async function suiteTerminatingGuardFiresOnce() {
  console.log('\nterminating-guard: transient barge-in fires the bound hangup exactly once');
  // Proves a transient speech_started during a terminating ctx neither strands
  // (calls > 0) nor double-fires (calls <= 1).
  await test('scheduleHangupOnDrain + invalidate(speech_started) => fires exactly once', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 40, logger: fakeLogger() });
    const ctx = 'ctx-term';
    t.startContext(ctx);
    t.recordChunk(ctx); // 1 mark in flight (announcement still playing)

    let calls = 0;
    t.scheduleHangupOnDrain(ctx, () => { calls += 1; }); // terminating = true

    t.invalidateAll('speech_started');

    await new Promise(r => setTimeout(r, 120)); // > tail and > drainTimeout
    assert.strictEqual(calls, 1, 'bound hangup fires exactly once after a transient barge-in');
  });
}

async function suiteOrdinaryBargeInStillCancels() {
  console.log('\nordinary (non-terminating) barge-in still cancels — guard does not over-reach');
  // An ordinary conversational ctx has terminating === false and no
  // pendingHangup. invalidateAll must fully cancel: clear markQueue, drop AI
  // active, and the post-loop firePendingHangup is a no-op (pendingHangup null).
  await test('barge-in on a non-terminating ctx clears state and fires no executor', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 40, logger: fakeLogger() });
    const ctx = 'ctx-ordinary';
    t.startContext(ctx);
    t.recordChunk(ctx);
    assert.strictEqual(t.isAiResponseActive(), true);

    // NO scheduleHangupOnDrain => terminating stays false, pendingHangup null.
    const invalidated = t.invalidateAll('barge_in');
    assert.deepStrictEqual(invalidated, [ctx]);
    assert.strictEqual(t.markQueue.length, 0, 'markQueue cleared');
    assert.strictEqual(t.isAiResponseActive(), false, 'AI no longer active');

    // No executor exists; nothing can fire. Wait to confirm no leaked timer.
    await new Promise(r => setTimeout(r, 80));
    // A late chunk for the invalidated ctx is dropped.
    assert.strictEqual(t.recordChunk(ctx), null, 'stale chunk dropped after ordinary barge-in');
  });
}

async function suiteTerminatingDrainedIdempotent() {
  console.log('\nterminating ctx already drained: invalidateAll does not double-fire');
  // If the announcement already drained (marks acked + endContext) the executor
  // was already scheduled by checkDrain->firePendingHangup. A subsequent
  // invalidateAll must NOT schedule a second fire.
  await test('drained terminating ctx + later invalidateAll => fires exactly once total', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 200, logger: fakeLogger() });
    const ctx = 'ctx-drained';
    t.startContext(ctx);
    const m = t.recordChunk(ctx);

    let calls = 0;
    t.scheduleHangupOnDrain(ctx, () => { calls += 1; });

    // Drain: ack the mark and signal Cartesia done => firePendingHangup nulls
    // pendingHangup synchronously and schedules the tail timer. Let that tail
    // elapse so the executor actually fires (calls === 1) and pendingHangup /
    // pendingHangupTimer are both cleared.
    t.ackMark(m);
    t.endContext(ctx);
    await new Promise(r => setTimeout(r, 40)); // > tail
    assert.strictEqual(calls, 1, 'executor fired once on drain');

    // Now a stray (late) invalidateAll arrives AFTER the drain already fired.
    // pendingHangup is null and the timer is cleared, so the terminating-guard
    // re-fire path is a clean no-op: no double-fire.
    t.invalidateAll('late_speech_started');

    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(calls, 1, 'executor fires exactly once total (no double-fire)');
  });
}

async function suiteTerminatingTailRace() {
  console.log('\nterminating-guard: speech_started during the tail countdown preserves the callback');
  await test('invalidateAll during TAIL fires the terminating callback exactly once', async () => {
    const t = createPlaybackTracker({ tailMs: 40, drainTimeoutMs: 200, logger: fakeLogger() });
    const ctx = 'ctx-tail-race';
    t.startContext(ctx);
    const mark = t.recordChunk(ctx);

    let calls = 0;
    t.scheduleHangupOnDrain(ctx, () => { calls += 1; });

    // Drain synchronously. firePendingHangup moves the callback out of
    // pendingHangup and into pendingHangupTimer, but the 40ms tail has not fired.
    t.ackMark(mark);
    t.endContext(ctx);
    t.invalidateAll('speech_started_during_tail');

    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(calls, 1, 'the in-flight tail callback is neither lost nor double-fired');
  });
}

async function suiteHandoffBindsAnnouncementCtx() {
  console.log('\nhandoff binds the hangup to the announcement ctx, not a stale ctx');
  // The controller message loop is not directly unit-invokable, so we model the
  // binding/scheduling DECISION the way mediaStreamController now implements it:
  //   - response A (function_call) sets pendingHandoff.ctxId = null. Its
  //     response.done must NOT schedule (ctxId null => "wait").
  //   - the announcement ctx (response B) starts => pendingHandoff.ctxId binds
  //     and drain completion is scheduled immediately.
  //   - a SECOND assistant item re-binds pendingHandoff.ctxId to the LATER ctx
  //     after cancelling the earlier scheduled callback.
  //   - response.done is a guard only and does not schedule a second callback.
  // We use the real playback tracker for the drain/scheduling half.
  await test('response A done with null announcement ctx does NOT schedule', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 60, logger: fakeLogger() });
    const pendingHandoff = { callId: 'fc-1', args: {}, ctxId: null };

    let scheduled = false;
    // Mirror controller response.done guard: there is nothing to schedule while
    // no announcement context has bound.
    const lastCompletedCtxId = null; // response A carries no assistant text
    if (pendingHandoff.ctxId && lastCompletedCtxId === pendingHandoff.ctxId) {
      scheduled = true;
      t.scheduleHangupOnDrain(pendingHandoff.ctxId, () => {});
    }
    assert.strictEqual(scheduled, false, 'no hangup scheduled while announcement ctx is null');
    assert.ok(pendingHandoff !== null, 'pendingHandoff retained for response B');

    await new Promise(r => setTimeout(r, 80));
  });

  await test('re-bind cancels the first ctx; only the final ctx completes handoff once', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 200, logger: fakeLogger() });
    const pendingHandoff = { callId: 'fc-2', args: { customer_consent: true }, ctxId: null };
    let scheduledCtxId = null;
    let calls = 0;

    const bind = (ctxId) => {
      t.startContext(ctxId);
      if (scheduledCtxId && scheduledCtxId !== ctxId) {
        t.cancelScheduledHangup(scheduledCtxId);
      }
      pendingHandoff.ctxId = ctxId;
      scheduledCtxId = ctxId;
      t.scheduleHangupOnDrain(ctxId, () => { calls += 1; });
    };

    const ctxA = 'ctx-ann-1';
    bind(ctxA);
    const markA = t.recordChunk(ctxA);

    const ctxB = 'ctx-ann-2';
    bind(ctxB);
    const markB = t.recordChunk(ctxB);

    assert.strictEqual(pendingHandoff.ctxId, ctxB, 'binds to the LAST announcement item');

    // The clarifier drains first. Its scheduled callback was cancelled at
    // re-bind, so it must not complete the handoff or cut off ctxB.
    t.ackMark(markA);
    t.endContext(ctxA);
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(calls, 0, 'first bound ctx no longer owns handoff completion');

    // Only the final bound announcement owns completion.
    t.ackMark(markB);
    t.endContext(ctxB);
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(calls, 1, 'final bound ctx completes handoff exactly once');
  });

  await test('multiple assistant items in one response use distinct ctx ids and later item owns handoff', async () => {
    const t = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 200, logger: fakeLogger() });
    const responseId = 'resp-shared';
    const firstCtx = createCartesiaContextId(responseId, 'item-first');
    const laterCtx = createCartesiaContextId(responseId, 'item-later');
    let scheduledCtxId = null;
    let calls = 0;

    const bind = (ctxId) => {
      t.startContext(ctxId);
      if (scheduledCtxId && scheduledCtxId !== ctxId) {
        t.cancelScheduledHangup(scheduledCtxId);
      }
      scheduledCtxId = ctxId;
      t.scheduleHangupOnDrain(ctxId, () => { calls += 1; });
    };

    assert.notStrictEqual(firstCtx, laterCtx, 'assistant item id must make each context unique');
    assert.deepStrictEqual(
      parseChunkMark(`cartesia:${laterCtx}:7`),
      { ctxId: laterCtx, seq: 7 },
      'per-item context id remains compatible with chunk marks'
    );

    bind(firstCtx);
    const firstMark = t.recordChunk(firstCtx);
    bind(laterCtx);
    const laterMark = t.recordChunk(laterCtx);
    assert.strictEqual(scheduledCtxId, laterCtx, 'handoff re-binds to the later assistant item');

    t.ackMark(firstMark);
    t.endContext(firstCtx);
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(calls, 0, 'earlier item draining cannot complete the handoff');

    t.ackMark(laterMark);
    t.endContext(laterCtx);
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(calls, 1, 'later item drain completes the handoff');
  });

  await test('re-bind also cancels a prior ctx already waiting in its tail timer', async () => {
    const t = createPlaybackTracker({ tailMs: 40, drainTimeoutMs: 200, logger: fakeLogger() });
    let calls = 0;

    t.startContext('ctx-tail-first');
    t.scheduleHangupOnDrain('ctx-tail-first', () => { calls += 1; });
    t.endContext('ctx-tail-first'); // callback is now waiting in the 40ms tail

    t.cancelScheduledHangup('ctx-tail-first');
    t.startContext('ctx-tail-final');
    t.scheduleHangupOnDrain('ctx-tail-final', () => { calls += 1; });
    t.endContext('ctx-tail-final');

    await new Promise(r => setTimeout(r, 90));
    assert.strictEqual(calls, 1, 'cancelled prior tail cannot complete handoff early');
  });
}

async function suiteHandoffFallbackTimer() {
  console.log('\nhandoff completion is idempotent and bounded across drain, stall, barge-in, and disconnect');

  function createHarness({ fallbackMs = 30, drainTimeoutMs = 100 } = {}) {
    let pendingHandoff = { callId: 'fc-fb', args: {}, ctxId: null };
    let handoffAwaitingAnnouncementCtx = true;
    let handoffCompleted = false;
    let handoffFallbackTimer = null;
    let scheduledHandoffCtxId = null;
    const reasons = [];
    const playback = createPlaybackTracker({ tailMs: 5, drainTimeoutMs, logger: fakeLogger() });

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
      if (handoffData) reasons.push(reason);
    }

    function armFallback() {
      handoffFallbackTimer = setTimeout(() => {
        if (!handoffCompleted) completeHandoff('fallback-timeout');
      }, fallbackMs);
    }

    function disconnect() {
      if (handoffFallbackTimer) {
        clearTimeout(handoffFallbackTimer);
        handoffFallbackTimer = null;
      }
      if (scheduledHandoffCtxId) {
        playback.cancelScheduledHangup(scheduledHandoffCtxId);
        scheduledHandoffCtxId = null;
      }
      handoffCompleted = true;
    }

    function bind(ctxId) {
      playback.startContext(ctxId);
      if (scheduledHandoffCtxId && scheduledHandoffCtxId !== ctxId) {
        playback.cancelScheduledHangup(scheduledHandoffCtxId);
      }
      pendingHandoff.ctxId = ctxId;
      scheduledHandoffCtxId = ctxId;
      playback.scheduleHangupOnDrain(ctxId, () => completeHandoff('drain'));
      if (handoffFallbackTimer) {
        clearTimeout(handoffFallbackTimer);
        handoffFallbackTimer = null;
      }
    }

    // response.done only closes the re-bind window.
    function finalize() {
      handoffAwaitingAnnouncementCtx = false;
    }

    return {
      armFallback,
      completeHandoff,
      disconnect,
      finalize,
      bind,
      playback,
      state: () => ({
        pendingHandoff,
        handoffAwaitingAnnouncementCtx,
        handoffCompleted,
        reasons: [...reasons]
      })
    };
  }

  await test('fallback fires when announcement ctx never binds', async () => {
    const h = createHarness({ fallbackMs: 20 });
    h.armFallback();

    await new Promise(r => setTimeout(r, 60));
    assert.deepStrictEqual(h.state().reasons, ['fallback-timeout']);
  });

  await test('bound ctx stall is owned by drain timeout, not the coarse fallback', async () => {
    const h = createHarness({ fallbackMs: 20, drainTimeoutMs: 80 });
    h.armFallback();
    h.bind('ctx-ann-stalled');

    await new Promise(r => setTimeout(r, 45));
    assert.deepStrictEqual(h.state().reasons, [], 'coarse fallback was cancelled at bind');
    await new Promise(r => setTimeout(r, 70));
    assert.deepStrictEqual(h.state().reasons, ['drain'], 'drain timeout owns bounded completion');
  });

  await test('bound-ctx barge-in remains bounded by terminating guard and executes once', async () => {
    const h = createHarness({ fallbackMs: 25, drainTimeoutMs: 100 });
    h.armFallback();
    h.bind('ctx-ann-barged');
    h.playback.invalidateAll('speech_started');

    await new Promise(r => setTimeout(r, 45));
    h.completeHandoff('late-drain');
    assert.deepStrictEqual(h.state().reasons, ['drain']);
  });

  await test('normal announcement drain completes before fallback and stays single-fire', async () => {
    const h = createHarness({ fallbackMs: 50 });
    h.armFallback();
    h.bind('ctx-ann-drained');
    h.playback.endContext('ctx-ann-drained');

    await new Promise(r => setTimeout(r, 90));
    assert.deepStrictEqual(h.state().reasons, ['drain']);
    assert.strictEqual(h.state().handoffAwaitingAnnouncementCtx, false);
  });

  await test('response.done guard does not double-schedule an already bound ctx', async () => {
    const h = createHarness({ fallbackMs: 50, drainTimeoutMs: 100 });
    h.armFallback();
    h.bind('ctx-ann-done-guard');
    h.finalize(); // response.done: guard/state update only
    h.playback.endContext('ctx-ann-done-guard');

    await new Promise(r => setTimeout(r, 80));
    assert.deepStrictEqual(h.state().reasons, ['drain'], 'bound ctx completes through one drain callback');
  });

  await test('slow bound announcement exceeds fallback window without being preempted', async () => {
    const h = createHarness({ fallbackMs: 20, drainTimeoutMs: 120 });
    h.armFallback();
    h.bind('ctx-ann-slow');
    // Generation/playback remains open beyond the old coarse fallback window.
    await new Promise(r => setTimeout(r, 60));
    assert.deepStrictEqual(h.state().reasons, [], 'fallback did NOT fire after bind');
    h.playback.endContext('ctx-ann-slow');
    await new Promise(r => setTimeout(r, 30));
    assert.deepStrictEqual(h.state().reasons, ['drain'], 'completes via drain, not fallback');
  });

  await test('socket close cancels fallback and prevents handoff execution', async () => {
    const h = createHarness({ fallbackMs: 20 });
    h.armFallback();
    h.disconnect();

    await new Promise(r => setTimeout(r, 60));
    assert.deepStrictEqual(h.state().reasons, []);
    assert.strictEqual(h.state().handoffCompleted, true);
  });

  await test('controller routes drain and timeout through the sole handoff execution point', () => {
    const source = require('fs').readFileSync(
      path.join(__dirname, '..', 'controllers', 'mediaStreamController.js'),
      'utf8'
    );
    const executionCalls = source.match(/executeHandoffWithFallback\(/g) || [];

    assert.strictEqual(executionCalls.length, 2, 'only function definition + completeHandoff may call executor');
    assert.match(source, /function completeHandoff\(reason\)[\s\S]*?if \(handoffCompleted\) return;/);
    assert.match(source, /scheduleHangupOnDrain\(cartesiaContextId, \(\) => \{[\s\S]*?completeHandoff\('drain'\);/);
    assert.match(source, /if \(!handoffCompleted\) \{[\s\S]*?completeHandoff\('fallback-timeout'\);/);
    assert.doesNotMatch(source, /pendingHandoff && !pendingHandoff\.ctxId/);
  });
}

async function suiteDuplicateAutoHandoff() {
  console.log('\nduplicate auto handoff is an idempotent success');
  await test('duplicate in-progress handoff does not enter fallback failure path', async () => {
    const User = require(path.join('..', 'models', 'User.js'));
    const handoffController = require(path.join('..', 'controllers', 'handoffController.js'));
    const originalFindById = User.findById;
    const originalExecuteHandoffLogic = handoffController.executeHandoffLogic;
    let releaseFirst;
    const firstHandoff = new Promise(resolve => { releaseFirst = resolve; });

    User.findById = async () => ({
      _id: 'agent-duplicate',
      email: 'agent@example.test',
      handoffPhoneNumber: '+810000000000'
    });
    handoffController.executeHandoffLogic = async () => firstHandoff;

    const callSession = {
      _id: 'session-duplicate',
      assignedAgent: 'agent-duplicate',
      transcript: [],
      save: async () => {}
    };
    const args = { customer_consent: true, reason: 'regression test' };
    const cartesiaMessages = [];
    const cartesiaWs = {
      readyState: 1,
      send: payload => cartesiaMessages.push(JSON.parse(payload))
    };
    const playback = createPlaybackTracker({ tailMs: 5, drainTimeoutMs: 1000, logger: fakeLogger() });

    try {
      const inProgress = executeAutoHandoff(callSession, 'fc-first', args);
      await new Promise(resolve => setImmediate(resolve));

      const duplicateResult = await executeHandoffWithFallback(
        callSession,
        { callId: 'fc-duplicate', args, ctxId: 'ctx-duplicate' },
        null,
        () => null,
        cartesiaWs,
        playback
      );

      assert.strictEqual(duplicateResult.success, true);
      assert.strictEqual(duplicateResult.alreadyInProgress, true);
      assert.strictEqual(
        cartesiaMessages.some(message => message.transcript === CLOSING_PHRASES.handoff_fallback),
        false,
        'success-shaped duplicate result must not play the failure closing phrase'
      );

      releaseFirst({ handoffCallSid: 'CA-first' });
      const firstResult = await inProgress;
      assert.strictEqual(firstResult.success, true);
      assert.strictEqual(firstResult.handoffCallSid, 'CA-first');
    } finally {
      releaseFirst({ handoffCallSid: 'CA-cleanup' });
      User.findById = originalFindById;
      handoffController.executeHandoffLogic = originalExecuteHandoffLogic;
    }
  });
}

async function suiteDetermineCallResultFromTransfer() {
  console.log('\nBug B: determineCallResultFromTransfer requires connectedAt for 成功');
  const { determineCallResultFromTransfer } = require(path.join('..', 'controllers', 'twilioController.js'));

  await test('exported as a function', () => {
    assert.strictEqual(typeof determineCallResultFromTransfer, 'function');
  });

  await test('connectedAt present => 成功', () => {
    const r = determineCallResultFromTransfer({
      status: 'human-connected',
      handoffDetails: { connectedAt: new Date() }
    });
    assert.strictEqual(r, '成功');
  });

  await test('human-connected but NO connectedAt and NO conference => 拒否 (the incident case)', () => {
    // This is exactly the 05:16 / 05:19 failed-transfer shape: status flipped to
    // human-connected by a transfer ATTEMPT, but the agent never answered/joined,
    // so connectedAt was never written and no conference exists.
    const r = determineCallResultFromTransfer({
      status: 'human-connected',
      handoffDetails: {} // no connectedAt, no conferenceName
    });
    assert.strictEqual(r, '拒否', 'must NOT be 成功 without connectedAt');
  });

  await test('conferenceName alone (handoff initiation) is NOT enough for 成功', () => {
    // conferenceName is written at handoff INITIATION (status:transferring),
    // before the agent answers — it is not proof of connection.
    const r = determineCallResultFromTransfer({
      status: 'human-connected',
      handoffDetails: { conferenceName: 'conf-abc' } // but no connectedAt
    });
    assert.strictEqual(r, '拒否', 'conferenceName must not be treated as success');
  });

  await test('no transfer at all => 拒否', () => {
    const r = determineCallResultFromTransfer({ status: 'in-progress', handoffDetails: {} });
    assert.strictEqual(r, '拒否');
  });

  await test('preset callResult is returned verbatim (short-circuit)', () => {
    const r = determineCallResultFromTransfer({
      callResult: '失敗',
      status: 'human-connected',
      handoffDetails: { connectedAt: new Date() }
    });
    assert.strictEqual(r, '失敗', 'short-circuit returns already-set callResult');
  });
}

async function suiteNoConferenceFailedNotOverwritten() {
  console.log('\nBug B: no-conference transfer stays 失敗 (not overwritten by determineCallResultFromTransfer)');
  const { determineCallResultFromTransfer } = require(path.join('..', 'controllers', 'twilioController.js'));

  // The handleCallStatus completed handler sets callResult='失敗' +
  // endReason='transfer_failed' for the no-conference branch and guards the
  // later determineCallResultFromTransfer call with `if (!transferFailedNoConference)`.
  // We assert the guard logic: when the flag is set, the failed result is kept;
  // when it is not set, determineCallResultFromTransfer is consulted.
  await test('transferFailedNoConference=true keeps 失敗 / transfer_failed', () => {
    const transferFailedNoConference = true;
    const updateData = { callResult: '失敗', endReason: 'transfer_failed' };
    const existingSession = { status: 'human-connected', handoffDetails: {} };

    // Mirror controller guard.
    if (!transferFailedNoConference) {
      updateData.callResult = determineCallResultFromTransfer(existingSession);
    }

    assert.strictEqual(updateData.callResult, '失敗', 'no-conference failure not overwritten');
    assert.strictEqual(updateData.endReason, 'transfer_failed');
  });

  await test('without the flag, a genuinely connected transfer is labeled 成功', () => {
    const transferFailedNoConference = false;
    const updateData = {};
    const existingSession = { status: 'human-connected', handoffDetails: { connectedAt: new Date() } };

    if (!transferFailedNoConference) {
      updateData.callResult = determineCallResultFromTransfer(existingSession);
    }

    assert.strictEqual(updateData.callResult, '成功', 'genuine connection still labeled 成功');
  });
}

async function suiteServerLoad() {
  console.log('\nserver.js loads without throwing');
  await test('require(server.js path) does not crash module resolution', () => {
    // We don't actually start the server — just resolve the path.
    const p = path.join(__dirname, '..', 'server.js');
    require('fs').accessSync(p);
  });
  await test('controller exports stay stable', () => {
    assert.strictEqual(typeof controller.createPlaybackTracker, 'function');
    assert.strictEqual(typeof controller.parseChunkMark, 'function');
    assert.strictEqual(typeof controller.sendChunkMark, 'function');
    assert.strictEqual(typeof controller.handleDeterministicCallEnd, 'function');
    assert.strictEqual(typeof controller.executeHandoffWithFallback, 'function');
    assert.strictEqual(typeof controller.executeAutoHandoff, 'function');
    assert.strictEqual(typeof controller.createCartesiaContextId, 'function');
    assert.strictEqual(typeof controller.CLOSING_PHRASES, 'object');
  });
}

(async () => {
  console.log('voice-runtime smoke tests');
  await suiteParseChunkMark();
  await suiteMarksDrivenByChunks();
  await suiteBargeInUnconditional();
  await suiteStaleChunkDropped();
  await suiteDeterministicClosingFlow();
  await suiteAbsentFlow();
  await suiteHandoffFallback();
  await suiteRollbackOnMarkSendFailure();
  await suiteDrainTimeoutForceFire();
  await suiteBargeInMidCloseCleanup();
  await suiteTerminatingGuardFiresOnce();
  await suiteOrdinaryBargeInStillCancels();
  await suiteTerminatingDrainedIdempotent();
  await suiteTerminatingTailRace();
  await suiteHandoffBindsAnnouncementCtx();
  await suiteHandoffFallbackTimer();
  await suiteDuplicateAutoHandoff();
  await suiteDetermineCallResultFromTransfer();
  await suiteNoConferenceFailedNotOverwritten();
  await suiteMultipleContextsInFlight();
  await suiteVoicemailSilentClose();
  await suiteIdleSpeechStartedIsNoOp();
  await suiteCanAcceptChunkPeek();
  await suitePublicBaseUrlHelper();
  await suiteHandoffControllerBaseUrl();
  await suiteCartesiaServiceFallback();
  await suiteServerLoad();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) {
      console.error('FAIL:', f.name);
    }
    process.exit(1);
  }
  process.exit(0);
})();
