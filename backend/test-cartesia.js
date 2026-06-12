/**
 * Cartesia TTS WebSocket 独立テストスクリプト
 *
 * 目的: Cartesia API キー、Voice ID、モデル、音声フォーマットが正しく動作することを確認
 * 使用方法:
 *   cd backend
 *   CARTESIA_API_KEY=your_key node test-cartesia.js
 *
 * 期待される結果:
 *   - WebSocket 接続成功
 *   - "chunk" メッセージを複数受信
 *   - "done" メッセージで終了
 *   - 生成された音声を test-cartesia-output.ulaw に保存
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const WebSocket = require('ws');
const fs = require('fs');

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID || 'fd1ee8f5-223a-4a87-a2fe-37eb3706cd69';
const CARTESIA_MODEL_ID = process.env.CARTESIA_MODEL_ID || 'sonic-3';
const CARTESIA_API_VERSION = process.env.CARTESIA_API_VERSION || '2026-03-01';

const TEST_TEXT = 'こんにちは、新義豊株式会社の林と申します。本日はお時間をいただきありがとうございます。';

if (!CARTESIA_API_KEY) {
  console.error('❌ CARTESIA_API_KEY が設定されていません');
  console.error('   実行例: CARTESIA_API_KEY=sk_... node test-cartesia.js');
  process.exit(1);
}

console.log('====================================');
console.log('Cartesia TTS Test');
console.log('====================================');
console.log('Voice ID :', CARTESIA_VOICE_ID);
console.log('Model    :', CARTESIA_MODEL_ID);
console.log('Version  :', CARTESIA_API_VERSION);
console.log('Text     :', TEST_TEXT);
console.log('====================================\n');

const url = `wss://api.cartesia.ai/tts/websocket?cartesia_version=${CARTESIA_API_VERSION}`;
const ws = new WebSocket(url, {
  headers: { 'X-API-Key': CARTESIA_API_KEY }
});

let chunkCount = 0;
let totalBytes = 0;
const audioChunks = [];
const startTime = Date.now();

ws.on('open', () => {
  console.log('✅ WebSocket 接続成功');
  console.log('📤 TTS リクエスト送信中...');

  const request = {
    model_id: CARTESIA_MODEL_ID,
    transcript: TEST_TEXT,
    voice: { mode: 'id', id: CARTESIA_VOICE_ID },
    output_format: { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 },
    context_id: `test-${Date.now()}`,
    continue: false
  };

  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'chunk' && msg.data) {
      chunkCount++;
      const audioBytes = Buffer.from(msg.data, 'base64');
      audioChunks.push(audioBytes);
      totalBytes += audioBytes.length;
      const elapsed = Date.now() - startTime;

      if (chunkCount === 1) {
        console.log(`🎵 初音声受信 (TTFB): ${elapsed}ms`);
      }

      process.stdout.write(`\r📦 受信中: ${chunkCount} chunks, ${totalBytes} bytes`);
    } else if (msg.type === 'done') {
      const totalTime = Date.now() - startTime;
      console.log('\n');
      console.log('✅ TTS 生成完了');
      console.log(`   総時間    : ${totalTime}ms`);
      console.log(`   チャンク数: ${chunkCount}`);
      console.log(`   音声サイズ: ${totalBytes} bytes`);
      console.log(`   推定時間  : 約 ${(totalBytes / 8000).toFixed(2)}秒 (8kHz mulaw)`);

      const outputPath = require('path').join(__dirname, 'test-cartesia-output.ulaw');
      fs.writeFileSync(outputPath, Buffer.concat(audioChunks));
      console.log(`\n💾 音声を保存: ${outputPath}`);
      console.log('   再生方法: ffplay -f mulaw -ar 8000 -ac 1 test-cartesia-output.ulaw');
      console.log('   またはWAV変換: ffmpeg -f mulaw -ar 8000 -ac 1 -i test-cartesia-output.ulaw test-cartesia-output.wav');
      ws.close();
      process.exit(0);
    } else if (msg.type === 'error') {
      console.error('\n❌ Cartesia エラー:', JSON.stringify(msg, null, 2));
      process.exit(1);
    } else {
      console.log('\n📨 その他のメッセージ:', msg.type);
    }
  } catch (e) {
    console.error('\n❌ パースエラー:', e.message);
  }
});

ws.on('error', (err) => {
  console.error('\n❌ WebSocket エラー:', err.message);
  if (err.message.includes('401') || err.message.includes('403')) {
    console.error('   → API キーが無効か期限切れの可能性があります');
  }
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 WebSocket 切断: code=${code}, reason=${reason || '(なし)'}`);
});

setTimeout(() => {
  console.error('\n⏱  タイムアウト (30秒)');
  process.exit(1);
}, 30000);
