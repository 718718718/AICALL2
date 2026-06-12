# Voice Runtime — Playback Sync Refactor (2026-05-22)

## TL;DR
`backend/controllers/mediaStreamController.js` の再生同期を作り直した。
これまで `markQueue` は「OpenAI text delta を Cartesia に送ったタイミング」で増えていたが、
今は「Cartesia chunk が Twilio に届いた瞬間」で増え、「Twilio mark ack」で減る。
これによって barge-in / polite closing / handoff timing が正しく動くようになる。

委託人へ: 巻き戻したい場合は **このコミット 1 本** を `git revert` するだけで戻る（疎結合に保ってある）。

---

## なぜ直したか

### 問題
プロダクション経路:
```
Twilio Media Stream → OpenAI Realtime STT/VAD + text response → Cartesia TTS → Twilio audio
```

旧コードの `sendMark()` は **text delta を Cartesia に送るとき** に発火していた。
これは Cartesia が実際に音声を返す前のタイミング。

結果として:
1. `markQueue.length === 0` を「Twilio が全部再生し終えた」と誤解 → 早すぎる hangup
2. barge-in を `markQueue.length > 0` で gate → markQueue が早く空になると割り込み不発
3. handoff / call_end が AI 生成挨拶途中で `twilioService.endCall` → 挨拶が途切れる
4. handoff 失敗時に fallback がなく、無音で切断

### 直し方
**Single source of truth = playback tracker**
```js
const playback = createPlaybackTracker(); // markQueue, contexts, drain scheduling
```

- **chunk → mark**: Cartesia ws の `onChunk` callback で audio を Twilio に流した直後に `cartesia:<ctxId>:<seq>` 形式の mark を enqueue
- **mark ack → drain**: Twilio mark event で `playback.ackMark(name)` → 該当 ctx の `marks--`
- **Cartesia done → final drain check**: Cartesia の `done` メッセージで `playback.endContext(ctxId)`
- **drain + 700ms tail → 真の hangup**: `playback.scheduleHangupOnDrain(ctxId, fn)` 経由

---

## ファイル別変更点

### backend/controllers/mediaStreamController.js
- `CLOSING_PHRASES` 定数 (rejection / absent / no_response / handoff_fallback / voicemail) を追加
- `parseChunkMark()` / `sendChunkMark()` — chunk-level mark を扱うヘルパー
- `createCartesiaWs()` のシグネチャ拡張: `onChunk` / `onContextDone` / `onError` callback を受け取る
- `createPlaybackTracker()` — context 単位の `marks` / `doneFromCartesia` / `invalidated` を管理。`invalidateAll(reason)` / `recordChunk` / `ackMark` / `scheduleHangupOnDrain` を提供
- `handleDeterministicCallEnd()` — `end_call_on_*` 用ヘルパー。`response.create` を **送らず** Cartesia に決まった挨拶を流し、ctx drain 後に executor を fire
- `executeHandoffWithFallback()` — `executeAutoHandoff` を呼び、success!==true なら fallback closing phrase を再生 → drain → `executeAutoCallEnd`
- `input_audio_buffer.speech_started` ハンドラ: `markQueue.length` で gate するのを廃止。`aiResponseActive || cartesiaContextId || markQueue.length > 0 || pendingHandoff || pendingCallEnd` のいずれかが true なら無条件で割り込み
- 旧 `handleSpeechStarted()` 関数を削除（orphan）
- `pendingActionOnQueueEmpty` を削除。代わりに `pendingHandoff` は `response.done` 時に `lastCompletedCtxId` にバインドして `scheduleHangupOnDrain` へ
- `pendingCallEnd` は function_call 時点で deterministic flow へ移行（response.done パスは safety net のみ残置）

### backend/services/conversationEngine.js
- `handleClosingWithDelay()`: `Math.random()*500+700` → `LEGACY_CLOSING_DELAY_MS`（default 2800ms）の deterministic 値に
- フォールバック closing phrase を新しい標準文言に統一（「お忙しいところ恐れ入ります。それでは失礼いたします。」で終わる）

### backend/test/voice-runtime.test.js (新規)
Node `assert` ベースの smoke test、10 件すべて pass:
1. `parseChunkMark` 正常系 / 異常系
2. recordChunk が markQueue を増やし、ackMark が減らす（text delta では増えない）
3. barge-in は markQueue.length に関係なく context を invalidate する
4. invalidate 後の chunk は drop され、queue は空のまま
5. rejection: 固定文言 → Cartesia → mark ack → executor fire（`response.create` が送られないことも検証）
6. absent: 「また改めて」固定文言 → drain → executor
7. handoff failed → fallback phrase が Cartesia に送られる
8. controller exports の安定性

### backend/package.json
- `npm test` で smoke test を実行
- `npm run test:voice` も同じ

---

## 環境変数

| 名前 | デフォルト | 説明 |
|------|----------|------|
| `CARTESIA_TAIL_MS` | `700` | drain 検知後にさらに待つ ms（最終音節の cut 防止） |
| `CARTESIA_DRAIN_TIMEOUT_MS` | `15000` | Cartesia done が来ない場合の force fire 上限 |
| `LEGACY_CLOSING_DELAY_MS` | `2800` | 旧 Gather パスの closing 待機（固定） |

---

## 触っていない範囲（明示）

- ✅ frontend（一切変更なし）
- ✅ MongoDB models（CallSession など、スキーマ変更なし）
- ✅ billing / 課金関連
- ✅ Twilio outbound 発信ロジック (`twilioService.makeCall`)
- ✅ handoffController の `executeHandoffLogic` 内部
- ✅ socket.io (`services/websocket.js`)
- ✅ AI prompt (`utils/promptBuilder.js`)

唯一の挙動変更点は **音声再生の同期** と **closing phrase の文言統一**。

---

## ロールバック手順

```bash
git log --oneline | head -5
git revert <THIS_COMMIT_SHA>
```

playback tracker は新規追加なので revert で副作用なし。
`conversationEngine.js` の closing phrase 統一は文言変更だけなので revert しても DB / API に影響なし。

---

## 確認方法

### 単体テスト
```bash
cd backend && npm test
# expect: 10 passed, 0 failed
```

### 手動確認 (production相当)
1. 通常通り `npm start` (`backend/`)
2. 1 通発信 → AI が話している途中で発話 → 観察ログ:
   - `[barge-in] speech_started`
   - `[barge-in] openai response.cancel sent`
   - `[barge-in] cartesia context invalidated`
   - `[barge-in] twilio clear sent`
3. 顧客が「結構です」→ AI が `end_call_on_rejection` → 観察ログ:
   - `[FunctionCall] 顧客拒否検知 - deterministic closing で切電`
   - `[Cartesia] context done: closing-rejection-...`
   - `[AutoCallEnd] rejection audio drained — executing hangup`
4. handoff no-answer → 観察ログ:
   - `[AutoHandoff] failed — playing fallback closing phrase`
   - 顧客に「申し訳ございません。担当者が応答できませんでした...」が再生される

---

## Round 4 修正 (2026-05-22) — handoffController BASE_URL_PROD 安全化

### 症状（再発時の見分け方）
- Render production で「お客様の取次先が出ない時、無音で切断される」
- ログに `[HandoffStatus]` が一切出ない（agent call の status callback が届いていない）
- 旧コード: `${process.env.BASE_URL}/api/twilio/handoff-status/${callId}` が `undefined/api/...` になる

### 原因
Render は本番で `BASE_URL_PROD` のみ設定する運用。`BASE_URL` は未設定。
`handoffController.js` は agent call を `client.calls.create()` する際の `statusCallback` を
`process.env.BASE_URL` で組み立てており、結果 `undefined/api/twilio/handoff-status/:callId` を
Twilio に渡していた → Twilio はそんな URL に POST できないため status callback 自体が来ない
→ Round 2 で追加した fallback 挨拶も発火しない。

### 修正
`handoffController.js` 全 13 callsite を `getPublicBaseUrl()` に置換（`utils/publicUrl.js`）。
precedence は production=`BASE_URL_PROD > BASE_URL`、非 prod=`BASE_URL > NGROK_URL > localhost`。

### 回帰テスト
- 静的: `handoffController.js` source に `process.env.BASE_URL`（`_PROD` 除外）が残っていないことを grep で検証
- 行動: `BASE_URL_PROD` のみの env で `getPublicBaseUrl()` が正しい URL を返し、組み合わせた statusCallback URL に `undefined` 文字列が混入しないことを assert

### 関係ファイル
- `backend/controllers/handoffController.js` (13 callsites: 行 95, 97, 111, 113, 141, 154, 369, 667, 669, 683, 685, 713, 726)
- `backend/utils/publicUrl.js`
- `backend/test/voice-runtime.test.js` (suiteHandoffControllerBaseUrl)

---

## Round 3 修正 (2026-05-22) — BASE_URL helper / rollback idempotency / endpoint hardening

### Round 3-A: cartesiaService の BASE_URL 不整合

#### 症状
Round 2 で追加した handoff-failed TwiML が production で無音になる。
ログ: `<Play>undefined/api/audio/cache/...wav</Play>` を Twilio に返している。

#### 原因
`cartesiaService.generateSpeechUrl()` が `${process.env.BASE_URL}/api/audio/cache/...` を返していたが、
Render は `BASE_URL_PROD` のみ設定する想定で `BASE_URL` 未設定 → `undefined/...` URL を生成。

#### 修正
- `backend/utils/publicUrl.js` を新規追加（`getPublicBaseUrl()`）
- `cartesiaService` を helper 化、解決不能時は `null` を返す（`getTwilioPlayElement` が自動で `twiml.say` Polly.Mizuki にフォールバック）

### Round 3-B: rollbackChunk true idempotency

#### 症状（潜在）
mark send が失敗して rollback された後、何らかの再試行で同じ mark name に対して二度目の rollback が走った場合、別 chunk の counter を誤って巻き戻していた → 早すぎる drain → 早すぎる hangup。

#### 修正
`rollbackChunk` は markQueue から実際に削除できた場合のみ ctx.marks / ctx.chunks を decrement。
unknown / null / すでに ack 済み mark は完全 no-op。

### Round 3-C: handoff-failed endpoint hardening

#### 修正
- GET route 削除（POST のみ）
- ObjectId 24 hex 形式の callId のみ受け付け、`CallSession.exists()` で実在チェック
- 無効 callId には bare `<Hangup/>` のみ返す（TTS / Cartesia cache 起動なし、攻撃面縮小）

---

## Round 2 修正 (2026-05-22) — chunk-mark ordering / handoff fallback / voicemail short-circuit

Codex review で「方向性は正しいが production 投入前に直すべき serious が残る」との指摘を受け、以下を追加修正:

### Round 2-A: chunk-mark ordering 修正
`onChunk` callback で `recordChunk()` を media 送信より先に呼ぶと、Twilio に audio が届かなかった場合でも mark が in-flight 扱いになり drain が `CARTESIA_DRAIN_TIMEOUT_MS` (15s) まで詰まる。

**修正**:
- `recordChunk()` は media 送信成功後に呼ぶように onChunk を再構成
- `playback.canAcceptChunk(ctxId)` を peek 用に追加（counter を触らない）
- `playback.rollbackChunk(markName)` を追加し、mark send が失敗したケースで in-flight counter を巻き戻す
- 順序: peek → media send → recordChunk → sendChunkMark → 失敗時 rollbackChunk

### Round 2-B: handoff no-answer 真の fallback
旧 `executeHandoffWithFallback` は `executeAutoHandoff` が同期失敗 (assigned agent なし等) のときしか fallback を発火しない。実際の no-answer は Twilio status callback (`/api/twilio/handoff-status/:callId`) 経由で非同期に来るが、そこでは `calls(sid).update({status: 'completed'})` で顧客通話を冷酷に切断していた。

**修正**:
- 新 endpoint: `POST/GET /api/twilio/voice/handoff-failed/:callId`
  - `CLOSING_PHRASES.handoff_fallback` と同じ文言を `<Play>` (Cartesia) / `<Say>Polly.Mizuki</Say>` (fallback) で再生
  - `<Hangup/>` を再生後に自然実行
- `handleHandoffStatus` の no-answer/busy/failed 分岐:
  - `calls(sid).update({status: 'completed'})` → `calls(sid).update({url: handoff-failed-url, method: 'POST'})` に変更
  - redirect 自体が API エラーで失敗した場合のみ、従来の hard hangup にフォールバック

### Round 2-C: voicemail silent close の短絡
`handleDeterministicCallEnd` で `phrase === null` のとき、空 transcript で Cartesia context を finalize しても Cartesia は `done` を返さない可能性があり、15 秒の force fire 待ちになる。留守電は「即時切断」が要件。

**修正**: `phrase === null` の場合は Cartesia 経由を完全に skip し、`playback.invalidateAll('voicemail_silent')` で in-flight audio を全 drop した上で `setTimeout(executor, CARTESIA_TAIL_MS)` で即時 hangup。

### Round 2-D: コメント追記
`handleDeterministicCallEnd` で `response.create` を意図的に送らない判断について、コードコメントで「直後に session を閉じるので OpenAI tool-call state は問題にならない」と明記。

### Round 2 追加テスト (smoke test 8 件 → 計 18 件)
- `rollbackChunk` が marks と markQueue を正しく巻き戻す
- 不明な mark 名や null での rollback が idempotent
- `drainTimeout` 経由の force fire が executor を 1 回だけ呼ぶ
- barge-in mid-closing で `pendingHangup` / `pendingHangupTimer` / `drainTimeout` が確実に cleanup される
- 複数 context が同時 in-flight でも独立 drain
- voicemail silent close が Cartesia を経由せず `CARTESIA_TAIL_MS` で executor 発火
- 通話開始直後の `speech_started` が idle no-op になる
- `canAcceptChunk` peek が counter を変更しない

---

## 既知の残課題

- Cartesia が `done` メッセージを送らない異常系では `CARTESIA_DRAIN_TIMEOUT_MS` (15s) 後に force fire する。長すぎる場合は環境変数で短縮可能。
- Handoff fallback executor は `executeAutoCallEnd` を再利用しており、CallSession の `callResult` は「拒否」になる（コメントの `notes` に「担当者転送失敗のため終話」を残す）。本来は `callResult: '失敗'` を新設するべきだが、DB スキーマ変更を避けるため今回は流用。
