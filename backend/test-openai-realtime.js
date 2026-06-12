/**
 * OpenAI Realtime API GA フォーマット独立テストスクリプト
 *
 * 目的: 新しい session.update フォーマット（text 出力モード）が正しく動作することを確認
 * 使用方法:
 *   cd backend
 *   OPENAI_REALTIME_API_KEY=sk_... node test-openai-realtime.js
 *
 * 期待される結果:
 *   - WebSocket 接続成功
 *   - session.created イベント受信
 *   - session.update 送信後、session.updated イベント受信
 *   - テキストメッセージを送ると response.output_text.delta が返ってくる
 *   - response.done で完了
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const WebSocket = require('ws');

const API_KEY = process.env.OPENAI_REALTIME_API_KEY;
if (!API_KEY) {
  console.error('❌ OPENAI_REALTIME_API_KEY が設定されていません');
  process.exit(1);
}

const TEMPERATURE = 0.8;
const url = `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`;

console.log('====================================');
console.log('OpenAI Realtime API GA Test');
console.log('====================================');
console.log('URL: ', url);
console.log('====================================\n');

const ws = new WebSocket(url, {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

let sessionCreated = false;
let sessionUpdated = false;
let textDeltaCount = 0;
let receivedText = '';

ws.on('open', () => {
  console.log('✅ WebSocket 接続成功 (GA, ヘッダー不要)');
});

ws.on('message', (data) => {
  try {
    const event = JSON.parse(data.toString());

    switch (event.type) {
      case 'session.created':
        sessionCreated = true;
        console.log('✅ session.created 受信');
        console.log('   Model:', event.session?.model);
        console.log('   Type :', event.session?.type);

        // 送信: GA フォーマット session.update（text 出力モード）
        const sessionUpdate = {
          type: 'session.update',
          session: {
            type: 'realtime',
            model: 'gpt-realtime',
            output_modalities: ['text'],
            audio: {
              input: {
                format: { type: 'audio/pcmu' },
                turn_detection: { type: 'server_vad' },
                transcription: { model: 'whisper-1', language: 'ja' }
              }
            },
            instructions: 'あなたは日本語で応答するアシスタントです。簡潔に答えてください。'
          }
        };
        console.log('📤 session.update 送信中 (text 出力モード)...');
        ws.send(JSON.stringify(sessionUpdate));
        break;

      case 'session.updated':
        sessionUpdated = true;
        console.log('✅ session.updated 受信 - フォーマット正常');
        console.log('   output_modalities:', event.session?.output_modalities);

        // テキスト会話を試す
        console.log('\n📤 テスト会話開始: "今日の天気は？"');
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '今日の天気は？簡潔に答えて。' }]
          }
        }));
        ws.send(JSON.stringify({ type: 'response.create' }));
        break;

      case 'response.output_text.delta':
      case 'response.text.delta':
        textDeltaCount++;
        receivedText += event.delta || '';
        process.stdout.write(event.delta || '');
        break;

      case 'response.output_text.done':
      case 'response.text.done':
        console.log('\n\n✅ response.*_text.done 受信');
        break;

      case 'response.done':
        console.log('\n====================================');
        console.log('✅ テスト完了');
        console.log('====================================');
        console.log('session.created : ', sessionCreated ? '✅' : '❌');
        console.log('session.updated : ', sessionUpdated ? '✅' : '❌');
        console.log('text delta 数   : ', textDeltaCount);
        console.log('受信テキスト    : ', receivedText.substring(0, 100));
        console.log('====================================');
        ws.close();
        process.exit(0);
        break;

      case 'error':
        console.error('\n❌ OpenAI エラー:', JSON.stringify(event.error || event, null, 2));
        process.exit(1);
        break;

      default:
        // よくあるイベントは省略表示
        if (!['response.created', 'rate_limits.updated', 'conversation.item.created',
              'response.output_item.added', 'response.content_part.added',
              'response.content_part.done', 'response.output_item.done'].includes(event.type)) {
          console.log('📨', event.type);
        }
    }
  } catch (e) {
    console.error('\n❌ パースエラー:', e.message);
  }
});

ws.on('error', (err) => {
  console.error('\n❌ WebSocket エラー:', err.message);
  if (err.message.includes('401')) {
    console.error('   → OPENAI_REALTIME_API_KEY が無効');
  } else if (err.message.includes('404')) {
    console.error('   → モデル名「gpt-realtime」が見つからない（GA バージョンを確認）');
  }
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 切断: code=${code}, reason=${reason || '(なし)'}`);
});

setTimeout(() => {
  console.error('\n⏱  タイムアウト (60秒)');
  process.exit(1);
}, 60000);
