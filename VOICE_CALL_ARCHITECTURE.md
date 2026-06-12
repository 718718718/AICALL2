# 音声通話アーキテクチャ詳細

このドキュメントは、AI Call System における主要機能「音声通話」の仕組みをエンジニア向けに整理したものです。バックエンド、Twilio Webhook、会話エンジン、リアルタイム連携にフォーカスして説明します。

## 1. 全体構成

```
顧客 ↔ Twilio Voice Platform ↔ Express API (/api/twilio/*) ↔ 会話エンジン ↔ MongoDB
                                        ↘ WebSocket ↔ Next.js ダッシュボード
```

- **通話セッション管理**: `backend/models/CallSession.js` が MongoDB 上で通話状態・録音情報・ハンドオフ等を一元管理。
- **AI会話制御**: `backend/services/conversationEngine.js` がテンプレート、状態遷移、意図判定を担当。
- **音声合成**: `backend/services/coefontService.js` が CoeFont API を利用して TwiML 用の音声 URL を生成。
- **リアルタイム通知**: `backend/services/websocket.js` が Socket.IO を初期化しフロントへ通話イベントを配信。

## 2. アウトバウンド通話フロー

1. `POST /api/calls/start` (`backend/controllers/callController.js`) が発火。
   - `Customer` と `AgentSettings` を取得し、テンプレート情報を `CallSession.aiConfiguration` に格納。
   - `CallSession` を `status: initiated` で作成し、暫定的な `twilioCallSid` を設定。
2. Twilio REST API `client.calls.create` で顧客へ発信。
   - `url` に `/api/twilio/voice/conference/:callId` を指定。
   - `statusCallback` に `/api/twilio/call/status/:callId` を登録して状態更新を受領。
   - 録音開始 (`record: true`) と録音ステータスコールバック `/api/twilio/recording/status/:callId` を設定。
3. 通話生成後、Twilio からの `call.sid` で `CallSession.twilioCallSid` を確定し、`status: ai-responding` に更新。
4. WebSocket (`global.io.emit('call-started')`) でダッシュボードに通知し、UI の「通話中」表示へ反映。

## 3. インバウンド通話フロー

1. Twilio 電話番号に着信すると、Voice Webhook が `/api/twilio/voice` (`backend/controllers/twilioVoiceController.js`) を呼び出す。
2. 発信者番号 (`From`) を日本国内形式へ変換後、既存顧客を検索。存在しなければ `Customer` を自動生成。
3. `CallSession` を `status: in-progress` で作成または更新し、関連エージェントのテンプレートを `aiConfiguration` に格納。
4. 応答遅延を避けるため、TwiML は即座に `/api/twilio/voice/conference/:callId` へリダイレクト。
5. `setImmediate` で非同期に会話エンジン初期化、WebSocket 通知、通話タイムアウト監視の開始 (`callTimeoutManager.startCallTimeout`) を実行。

## 4. TwiML 生成と会議接続

- `generateConferenceTwiML` (`backend/controllers/twilioController.js`) が Twilio へ返却する TWiML を生成。
  - `<Gather>` で日本語音声認識 (`input: speech`, `language: ja-JP`) と部分結果コールバックを設定。
  - `coefontService.getTwilioPlayElement` により初回挨拶メッセージを CoeFont 音声として即時再生。
  - 会話エンジン (`conversationEngine.initializeConversation`) を非同期で起動し、通話ごとの状態を Map に保持。
- エージェント参加用エンドポイント `/api/twilio/voice/conference/agent/:conferenceName` は、CoeFont で案内後 `<Dial><Conference>` で会議に接続。エージェント退室時に `endConferenceOnExit` により会議を終了。

## 5. 音声認識と応答生成

- `<Gather action>` で呼ばれる `/api/twilio/voice/gather/:callId` (`twilioController.handleSpeechInput`) が speech-to-text 結果を処理。
  - `CallSession` を取得し、会話エンジンが未初期化なら即初期化。
  - 無音判定・聞き返し回数をカウントし、条件に応じたテンプレート発話を生成。
  - `conversationEngine.generateResponse` が意図判定（`responsePatterns`）と状態遷移（`conversationStates`）を行い、次アクションを決定。
  - 応答は再度 `<Gather>` として返し、CoeFont 音声を再生。
- 部分的な認識結果は `/api/twilio/voice/partial/:callId` で受け取り、`webSocketService.broadcastCallEvent('partial-transcript', ...)` を通じてリアルタイム表示に利用。

## 6. 通話ステータス更新と通知

- Twilio からのステータス更新は `/api/twilio/call/status/:callId`（`routes/twilioRoutes.js`）に届く。
  - `CallStatus` に応じて `CallSession.status`、`endReason`、`callResult`、`endTime` を更新し、必要に応じて顧客の最終通話日・結果を更新。
  - `webSocketService.broadcastCallEvent('call-status', ...)` で Next.js ダッシュボードへリアルタイム配信。
  - 通話終了時は `conversationEngine.clearConversation` と `callTimeoutManager.clearCallTimeout` を呼び出し状態を解放。
- 録音完了イベント `/api/twilio/recording/status/:callId` は `CallSession.recordingSid` / `recordingUrl` を保存し、ダウンロードリンクを後続処理で利用可能。

## 7. ハンドオフとカンファレンス管理

- `POST /api/calls/:callId/handoff` (`callController.js`) が人間オペレーターへの転送を開始。
  - 対象エージェントの国際電話番号を取得し、Twilio Conference にダイヤル。
  - `CallSession.handoffDetails` に理由・接続時刻・参加 SID を記録。
  - エージェント参加状況は `/api/twilio/conference/agent-events` で監視し、退室時に会議終了。
- 直接ハンドオフ用の `/api/direct/*` ルートも存在し、認証不要で特定番号に接続可能。

## 8. 音声合成 (CoeFont) の扱い

- `coefontService.getTwilioPlayElement(twiml, text)` は以下を実行：
  1. CoeFont API で音声ファイルを生成し、一時 URL を取得。
  2. TwiML の `<Play>` 要素として URL を挿入。
  3. 失敗時は Amazon Polly (`<Say voice="Polly.Mizuki">`) にフォールバック。
- 初回挨拶、無音確認、謝罪、エラー応答など全パターンをテンプレート化し、`AgentSettings.processTemplate(key)` で企業/担当者固有の文言に差し替え。

## 9. 会話エンジン詳細

- `conversationEngine` の主な責務：
  - **状態管理**: 通話ごとに `Map<callId, state>` を保持。`currentPhase` や `conversationState` を遷移させ、無音回数・聞き返し制限を管理。
  - **意図判定**: `responsePatterns` で日本語キーワードをマッチングし、`intent / confidence / nextAction` を決定。
  - **テンプレート適用**: `AgentSettings` で定義されたテンプレートを埋め込み、CoeFont に渡す文章を生成。
  - **ハンドオフ判定**: `shouldHandoff` フラグや `handoffReason` を設定し、必要に応じて人間オペレーターへ誘導。
  - **結果確定**: 通話終了時に `determineCallResult`（`twilioController.js`）を呼び出し、`CallSession.callResult` を `成功/不在/拒否/要フォロー/失敗` のいずれかに確定。

## 10. WebSocket とリアルタイム監視

- `backend/services/websocket.js` が Socket.IO を初期化し、トークン認証（開発環境ではスキップ）を実装。
- 通話イベントは以下のように分類：
  - `call-status`: 通話状態（calling / in-progress / completed 等）
  - `call-ended`: 終了詳細（duration, endReason, callResult）
  - `partial-transcript` / `full-transcript`: 逐次/最終の文字起こし
- フロント (`frontend/app/dashboard/page.tsx` 等) は `call-status` を受信して顧客行に「通話中」バッジを表示し、`CallStatusModal` で詳細モニタリングを提供。

## 11. タイムアウトとクリーンアップ

- `callTimeoutManager` が通話開始時に `setTimeout` を登録し、既定時間（例: 15分）無応答の場合に強制終了処理を行う。
- `cleanup-calls.js` と `bulkCallController.cleanupOldSessions` が定期的に古いセッションを削除し、DB とメモリの整合性を保つ。

## 12. 環境変数とセットアップ

- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, 発信用番号 (`TWILIO_PHONE_NUMBER_DEV` 等)。
- Webhook ベース URL: `BASE_URL`（ngrok や本番ドメインを指定）。
- CoeFont: `COEFONT_ACCESS_KEY`, `COEFONT_CLIENT_SECRET`。
- OpenAI や MongoDB 接続情報は `backend/.env` に設定。Twilio Console の Voice Webhook を `https://<BASE_URL>/api/twilio/voice` に設定すること。

## 13. ローカル検証手順

1. `./start-dev.sh` でバックエンド・フロントを起動（MongoDB も起動しておく）。
2. `ngrok http 5001` を実行し、表示された HTTPS URL を `backend/.env` の `BASE_URL` および Twilio コンソールに設定。
3. 管理画面 (`http://localhost:3000/admin`) から顧客を選択しアウトバウンド発信。また、Twilio 番号へ直接着信してインバウンドフローを確認。
4. ダッシュボードの WebSocket バッジや `CallStatusModal` のリアルタイム更新、録音 URL、通話結果を確認。

## 14. 留意事項・拡張ポイント

- `CallSession.twilioCallSid` は複数の `null` を許容するため `sparse: true` を付与。
- 会話状態はプロセス内メモリに保持されるため、スケールアウト時は外部ストア（Redis 等）への移行が必要。
- CoeFont API がタイムアウトする場合に備え、Polly へのフォールバックを必ずテストする。
- Twilio 側のステータス文字列が追加された場合、`/api/twilio/call/status/:callId` の判定ロジックに追随すること。
- ハンドオフ機能を利用する場合、エージェントの電話番号が国際形式で登録されていることを確認。

---

## 15. OpenAI Realtime API + Cartesia TTS アーキテクチャ（2026-05-11 更新）

### 概要

アウトバウンド通話の音声合成（TTS）エンジンを変更しました。OpenAI Realtime API の音声出力モードから、テキスト出力モード + Cartesia TTS への切り替えです。

### 変更後のデータフロー

```
[Twilio] ──音声(mulaw)──▶ [Backend WebSocket]
                               │
                               ├─▶ [OpenAI Realtime WSS]（GA）
                               │    model: gpt-realtime
                               │    output_modalities: ["text"]
                               │    audio.input.format: audio/pcmu
                               │    ↓ response.output_text.delta
                               │
                               ├─▶ textBuffer（センテンス単位で蓄積）
                               │    区切り: 。！？!? または 150文字超
                               │
                               └─▶ [Cartesia TTS WebSocket]（ストリーミング）
                                    model: sonic-3
                                    cartesia_version: 2026-03-01
                                    encoding: pcm_mulaw, 8000Hz
                                    1 OpenAI レスポンス = 1 context_id
                                    部分送信: continue: true
                                    終端送信: continue: false
                                    ↓ audio chunk (base64)
                                    ▶ [Twilio] へ転送
```

### 二重音声・音切れ防止の実装ポイント

#### 1. delta イベント名のロック（二重音声防止）

OpenAI Realtime GA は同じテキスト delta を 2 種類のイベント名で発火することがある：
- `response.output_text.delta` (GA)
- `response.text.delta` (legacy 互換)

両方を処理すると textBuffer に同じテキストが二重蓄積される。
**最初に受信したイベント名のみを採用**することで防止。

```javascript
let textDeltaEventType = null;

if (!textDeltaEventType && isDeltaCandidate) {
  textDeltaEventType = response.type;
}
const isTextDelta = isDeltaCandidate && response.type === textDeltaEventType;
```

#### 2. ストリーミング送信（音切れ防止）

文単位で別々の `context_id` + `continue: false` で送ると、
Cartesia が各文を独立した生成として処理し、文間に cold start による
空白が発生する。

**1 OpenAI レスポンス内では同一 `context_id` を維持**し、
途中の文は `continue: true`、最後だけ `continue: false` で送信することで
Cartesia がストリーミング生成として処理し、途切れなく音声が連続する。

```javascript
// 部分送信（文の途中）
sendToCartesia(ws, sentence, cartesiaContextId, true);

// 最終送信（レスポンス完了時）
sendToCartesia(ws, '', cartesiaContextId, false);
```

### 主要コンポーネント（`backend/controllers/mediaStreamController.js`）

| 関数 | 役割 |
|------|------|
| `createCartesiaWs(twilioWs, getStreamSid)` | Cartesia TTS WebSocket を生成し、受信音声をTwilioへ転送 |
| `sendToCartesia(ws, text, contextId)` | テキストをCartesiaへ送信（接続中の場合はqueue） |
| `initializeSession(openaiWs, agentSettings)` | OpenAI Realtimeセッション設定（text出力モード） |

### OpenAI Realtime セッション設定（GA フォーマット）

```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "model": "gpt-realtime",
    "output_modalities": ["text"],
    "audio": {
      "input": {
        "format": { "type": "audio/pcmu" },
        "turn_detection": { "type": "server_vad" },
        "transcription": { "model": "whisper-1", "language": "ja" }
      }
    },
    "instructions": "...",
    "tools": [ ... ],
    "tool_choice": "auto"
  }
}
```

WebSocket 接続URL（temperature は URL の query parameter として渡す）:
```
wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=0.8
```

> **注**: GA バージョンは `OpenAI-Beta: realtime=v1` ヘッダー不要。Beta バージョンとは形式が異なるので注意。
> - GA: `output_modalities`, `type: "realtime"`, ネスト形式 `audio.input`
> - Beta: `modalities`, `input_audio_format`, フラット形式

### 割り込み処理（ユーザーが発話した場合）

1. `input_audio_buffer.speech_started` イベント受信
2. `textBuffer` をクリア（未送信テキストを破棄）
3. OpenAI へ `response.cancel` を送信（生成中断）
4. Twilio へ `clear` イベントを送信（再生中音声を停止）

### Cartesia TTS 設定

| 項目 | 値 |
|------|-----|
| API バージョン | `2026-03-01`（環境変数 `CARTESIA_API_VERSION` で変更可） |
| モデル | `sonic-3`（環境変数 `CARTESIA_MODEL_ID` で変更可） |
| Voice ID | `fd1ee8f5-223a-4a87-a2fe-37eb3706cd69`（環境変数 `CARTESIA_VOICE_ID` で変更可） |
| 出力フォーマット | `pcm_mulaw`, `8000 Hz`（Twilio標準フォーマット） |
| WebSocket URL | `wss://api.cartesia.ai/tts/websocket` |

### 環境変数

```env
OPENAI_REALTIME_API_KEY=sk-...   # OpenAI Realtime API キー
CARTESIA_API_KEY=...              # Cartesia API キー（必須）
CARTESIA_VOICE_ID=...             # （省略可、デフォルトあり）
CARTESIA_MODEL_ID=...             # （省略可、デフォルト: sonic-2）
```

---

## 16. 音声トラブルシューティング（クレーム対応）

### 16.1 「男性音声に聞こえる」クレーム

顧客から「outbound が男性音声になっている」「アカウントによって性別が違う」等の指摘を受けた場合の調査手順。

**前提**：
- 2026-05-15 22:09 の `3c04b01` 以降、production 全パスは Cartesia 女性音声（`fd1ee8f5-223a-4a87-a2fe-37eb3706cd69`）に統一済。
- voice 設定はプロセス全域 env で、per-account / per-user の切替機構は存在しない。

**確認順序**：

1. **Render 稼働 commit** が `8a38f03` 以降であること（Deploys タブで確認）。
2. Render log を該当時間帯で以下キーワード検索：
   - `[CoeFont]` → 出現していたら 5/15 22:09 前の旧 deployment 稼働を疑う
   - `Using SIMPLE endpoint` → `USE_SIMPLE_MEDIA_STREAM=true` の事故を疑う
   - `[Cartesia] Sending text` → 出ていれば AI 発話は Cartesia 経由で動作中
3. 環境変数：
   - `CARTESIA_VOICE_ID=fd1ee8f5-223a-4a87-a2fe-37eb3706cd69`
   - `USE_SIMPLE_MEDIA_STREAM` は `false` または未設定
   - `BASE_URL` が稼働中の Render service URL を指している
4. **依然として「男性」と感じる場合の残存仮説**：
   - (a) 転送成功後の人間の通話部分（AI ではなく担当者の声）
   - (b) 5/15 22:09 以前に録音された旧データの再生
   - (c) 該当 callId に `[Cartesia] Sending text` がないケース（AI が実質発話していない）
   - (d) Cartesia voice 自体が低音域で androgynous に聞こえる主観差

**詳細な調査ログ**: [`docs/investigation-voice-gender-complaint-2026-05-18.md`](./docs/investigation-voice-gender-complaint-2026-05-18.md)

### 16.2 重要な note

- `mediaStreamController.simple.js` は **debug 専用**で `VOICE='alloy'`（OpenAI 内蔵の中性〜男性的 voice）を hardcode 保持。`USE_SIMPLE_MEDIA_STREAM=true` でのみ作動するため、本番では絶対に true にしないこと。
- `coefontService.js` は test script 用に残置。production controller からは require されていない。誤って production code から require した場合、CoeFont 男性 voice が再発する。
- `AgentSettings.voice` (`alloy`/`cedar`/`coral`) は dead config。OpenAI Realtime 旧構成の名残で、現行 production 動作には影響しない。

### 16.3 rollback

完全切替前の最終安定版にロールバックする場合：

```bash
git checkout v-stable-coefont-2026-05-15
# または hotfix branch
git checkout -b hotfix-rollback v-stable-coefont-2026-05-15
```

### 16.4 環境変数変更時の必須手順

本番環境の env 変更で過去にハマったポイントを記録：

#### Render `BASE_URL`
- **必ず `https://` プレフィックスを付ける**
- `pj-ai-gwps.onrender.com` のみだと Twilio が `code 21205` で全通話失敗
- 変更後は service 自動再起動 → log で `[TwilioService] Using webhook URL: https://...` を確認

#### Vercel `NEXT_PUBLIC_*` 変数
- **build 時 baked-in のため env 変更だけでは反映されない**
- 必ず Vercel dashboard → Deployments → 最新 → Redeploy
- **「Use existing Build Cache」のチェックを外す**
- クライアントには hard refresh / シークレットウィンドウ確認を依頼

#### 旧 backend service の扱い
- Render に旧 service が残っていると、Vercel env を統一しても古い書籍 / 第三者経由で旧 backend に流れる可能性がある
- 不要な旧 service は **Suspend or Delete**
- もしくは旧 backend のコードを最新と同じにしておく

詳細は [`docs/investigation-voice-gender-complaint-2026-05-18.md`](./docs/investigation-voice-gender-complaint-2026-05-18.md) § 9 を参照。

---
このドキュメントに記載されたエンドポイントやサービスの詳細なコードは、それぞれのファイル（`backend/controllers/*`, `backend/services/*`, `backend/models/*`）を参照してください。
