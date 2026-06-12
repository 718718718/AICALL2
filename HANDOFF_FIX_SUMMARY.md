# OpenAI Realtime API 取次機能修正サマリー

> **2026-05-22 追記**: 取次失敗時 (no-answer / busy / failed) の挙動を改善しました。
> 旧: 顧客側を `calls(sid).update({status:'completed'})` で無音切断
> 新: `POST /api/twilio/voice/handoff-failed/:callId` にリダイレクトし、
>     「申し訳ございません。担当者が応答できませんでした。改めてご連絡いたします。それでは失礼いたします。」を
>     Cartesia TTS（失敗時 Polly.Mizuki）で再生してから自然切電。
> 詳細: `VOICE_RUNTIME_PLAYBACK_SYNC.md` Round 2-B / Round 4。
> 関連 commit: e9cc4c1, 753cf5e, a78f0c3, 3a82c88。

## 問題の原因

### 旧システム（動作していた）
- 最初から**Conferenceモード**で通話開始
- 顧客とAIが同じConferenceルーム内
- 取次時：担当者を同じConferenceルームに追加
- `client.calls().update({ twiml })` が正常に動作

### 新システム（OpenAI Realtime API導入後）
- **Media Streamsモード**（`<Connect><Stream>`）で通話開始
- TwilioとOpenAIがWebSocketで直接接続
- 取次時：`client.calls().update({ twiml })` が**失敗**
- エラー: `Call is not in-progress. Cannot redirect.`

## 根本原因

Media Streams (`<Connect><Stream>`) 中の通話は、TwiMLを直接更新できません。通話が`in-progress`状態でも、`<Stream>`接続中は`update({ twiml })`が機能しません。

## 解決策

`update({ url })` を使用して**Redirectエンドポイント**に誘導する方式に変更。

### 変更内容

#### 1. handoffController.js の修正

**変更前:**
```javascript
await client.calls(callSession.twilioCallSid).update({
  twiml: customerTwiml  // ← Media Streams中は失敗
});
```

**変更後:**
```javascript
const redirectUrl = `${BASE_URL}/api/twilio/handoff-redirect/${callId}`;
await client.calls(callSession.twilioCallSid).update({
  url: redirectUrl,     // ← URL指定でRedirect
  method: 'POST'
});
```

#### 2. handoffRedirectController.js を新規作成

Media Streamsから切り替わったときに呼ばれるエンドポイント：

```javascript
exports.handleHandoffRedirect = async (req, res) => {
  const { callId } = req.params;
  const callSession = await CallSession.findById(callId);
  const conferenceName = callSession.handoffDetails?.conferenceName;

  const twiml = new VoiceResponse();
  twiml.say('担当者におつなぎします。');

  const dial = twiml.dial();
  dial.conference({
    startConferenceOnEnter: false,
    endConferenceOnExit: false
  }, conferenceName);

  res.type('text/xml');
  res.send(twiml.toString());
};
```

#### 3. twilioRoutes.js にルート追加

```javascript
router.post('/handoff-redirect/:callId', handleHandoffRedirect);
```

## 処理フロー

### 取次前（OpenAI Realtime API通話中）
```
顧客 ←通話→ Twilio ←WebSocket→ OpenAI AI
              (Media Streams)
```

### 取次開始
1. フロントエンドから`/api/direct/handoff-direct`を呼び出し
2. `handoffController.initiateHandoff()`実行
3. **OpenAI WebSocketを切断**（`global.activeMediaStreams`から削除）
4. 担当者に電話をかける（Conferenceルーム作成）
5. 顧客の通話を**Redirect**で移動

```javascript
// Step 3: OpenAI切断
const connection = global.activeMediaStreams.get(callId);
connection.openaiWs.close();
global.activeMediaStreams.delete(callId);

// Step 4: 担当者を呼び出し
const agentCall = await client.calls.create({
  to: agentPhoneNumber,
  twiml: `<Response>
    <Say>お客様からのお電話です</Say>
    <Dial><Conference>${conferenceName}</Conference></Dial>
  </Response>`
});

// Step 5: 顧客をRedirect
await client.calls(twilioCallSid).update({
  url: `${BASE_URL}/api/twilio/handoff-redirect/${callId}`,
  method: 'POST'
});
```

### Redirect実行時
```
顧客の通話が /api/twilio/handoff-redirect/:callId にリダイレクト
↓
handoffRedirectController が Conference 参加用TwiMLを返す
↓
顧客がConferenceルームに参加
```

### 取次完了（3者通話確立）
```
顧客 ←通話→ Twilio → Conference Room ← Twilio ←通話→ 担当者
                   ↓
                録音のみ
```

## 修正ファイル一覧

1. **backend/server.js**
   - `global.activeMediaStreams` Map追加

2. **backend/controllers/mediaStreamController.js**
   - WebSocket接続をグローバルMapに登録
   - 切断時にMap削除

3. **backend/controllers/handoffController.js**
   - OpenAI WebSocket切断処理追加
   - `update({ twiml })` → `update({ url })` に変更
   - `initiateHandoff()` と `initiateHandoffByPhone()` 両方修正

4. **backend/controllers/handoffRedirectController.js** ★新規作成★
   - Redirect先のエンドポイント処理
   - Conference参加用TwiML生成

5. **backend/routes/twilioRoutes.js**
   - `/handoff-redirect/:callId` ルート追加

## テスト方法

### 1. バックエンド起動
```bash
cd backend && npm start
```

### 2. フロントエンド起動
```bash
cd frontend && npm run dev
```

### 3. 通話開始
- Twilio番号に電話
- OpenAI Realtime APIが応答
- AIと会話

### 4. 取次実行
- フロントエンドで「取次」ボタンをクリック
- または `/call-monitor` 画面から操作

### 5. 確認項目
- ✅ AIの音声が停止
- ✅ 「担当者におつなぎします」メッセージ再生
- ✅ 担当者の電話が鳴る
- ✅ 担当者が応答
- ✅ 顧客と担当者が会話可能
- ✅ 通話が途切れない
- ✅ 録音が継続

### 期待されるログ
```
[Handoff] Realtime mode: true
[Handoff] Disconnecting Media Streams for OpenAI Realtime API call
[Handoff] Closing OpenAI WebSocket
[MediaStream] Removed connection from global map: 68f7...
[Handoff] Media Streams disconnected
[Handoff] Creating conference call to agent +818070239355
[Handoff] Agent call created: CA...
[Handoff] Moving customer to conference using Redirect
[Handoff] Customer redirected to: https://...ngrok.io/api/twilio/handoff-redirect/68f7...
[Handoff Redirect] Called for callId: 68f7...
[Handoff Redirect] Using conference name: handoff-68f7...
[Handoff Redirect] Generated TwiML: <Response>...
```

## トラブルシューティング

### エラー: "Call is not in-progress"
**原因**: Media Streams中に `update({ twiml })` を使用している
**解決**: `update({ url })` を使用してRedirectする（修正済み）

### エラー: "OpenAI WebSocket not closed"
**原因**: `global.activeMediaStreams` が正しく管理されていない
**確認**:
```javascript
console.log('Active streams:', Array.from(global.activeMediaStreams.keys()));
```

### 顧客の通話が切れる
**原因**: Redirect URLが間違っている or エンドポイントがエラーを返している
**確認**:
- `process.env.BASE_URL` が正しいngrok URLになっているか
- `/api/twilio/handoff-redirect/:callId` にアクセスできるか

### 担当者がConferenceに参加できない
**原因**: Conference名が一致していない
**確認**:
```javascript
// handoffController
const conferenceName = `handoff-${callId}`;

// handoffRedirectController
const conferenceName = callSession.handoffDetails?.conferenceName;
// ↑ 両方が同じ値になっているか確認
```

## 旧システムとの互換性

この修正は **Media Streamsモード専用** です。

旧システム（Conferenceモード）で通話を開始した場合は、従来通り `update({ twiml })` が動作します。

`process.env.USE_OPENAI_REALTIME === 'true'` の場合のみ、新しいRedirect方式が使用されます。

## 参考資料

- [Twilio Media Streams Documentation](https://www.twilio.com/docs/voice/twiml/stream)
- [Twilio Redirect Documentation](https://www.twilio.com/docs/voice/api/call-resource#update-a-call-resource)
- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [backend/docs/HANDOFF_OPENAI_REALTIME.md](backend/docs/HANDOFF_OPENAI_REALTIME.md)

## 今後の改善案

1. **AI farewell message**: OpenAI切断前にAIが「担当者におつなぎします」と言う
2. **Warm transfer**: 担当者とAIが先に会話してから顧客に接続
3. **Resume AI**: 担当者が切断したらAIに戻る
4. **Better error handling**: Redirect失敗時のフォールバック処理

---

**実装完了日**: 2025-10-21
**動作確認**: ローカル環境で基本動作確認済み
**本番テスト**: 実通話テスト待ち
