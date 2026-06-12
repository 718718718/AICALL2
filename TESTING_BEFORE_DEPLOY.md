# デプロイ前のテスト手順書

Render に push する前に、ローカル環境で段階的に動作確認するための手順です。

> ⚠️ **重要**: API キーは絶対に Git にコミットしないでください。`.env.local` に記載し、`.gitignore` で除外されていることを確認してください。

---

## 📋 テスト全体の流れ

```
[Phase 1] 構文チェック         ← 30秒
[Phase 2] Cartesia 単独テスト  ← 1分
[Phase 3] OpenAI 単独テスト    ← 1分
[Phase 4] ローカル統合テスト   ← 5分（ngrok 必要）
[Phase 5] 本物の電話テスト      ← 10分（実発信）
[Phase 6] Render デプロイ      ← 完了
```

各フェーズで失敗したら次に進まない。

---

## Phase 1: 構文チェック

```bash
cd backend
node --check controllers/mediaStreamController.js
node --check test-cartesia.js
node --check test-openai-realtime.js
```

期待される出力: 何も出力されなければ成功（エラーなし）

---

## Phase 2: Cartesia TTS 単独テスト

### 準備

`backend/.env.local` に以下を追加（Render dashboard から `CARTESIA_API_KEY` をコピー）:

```env
CARTESIA_API_KEY=（Render の値をコピー）
```

### 実行

```bash
cd backend
node test-cartesia.js
```

### 成功時の出力例

```
====================================
Cartesia TTS Test
====================================
Voice ID : fd1ee8f5-223a-4a87-a2fe-37eb3706cd69
Model    : sonic-3
Version  : 2026-03-01
Text     : こんにちは、新義豊株式会社の林と申します...
====================================

✅ WebSocket 接続成功
📤 TTS リクエスト送信中...
🎵 初音声受信 (TTFB): 245ms
📦 受信中: 23 chunks, 18400 bytes

✅ TTS 生成完了
   総時間    : 1840ms
   チャンク数: 23
   音声サイズ: 18400 bytes
   推定時間  : 約 2.30秒 (8kHz mulaw)

💾 音声を保存: test-cartesia-output.ulaw
```

### 失敗時の対処

| エラー | 原因 | 対処 |
|-------|------|------|
| `401` または `403` | API キー無効 | Render の値を再コピー |
| `voice not found` | Voice ID 間違い | `CARTESIA_VOICE_ID` を確認 |
| `model not found` | モデル名間違い | `CARTESIA_MODEL_ID=sonic-2` を試す |
| タイムアウト | ネットワーク問題 | 再実行 |

### 音声を聞いて確認

```bash
# ffmpeg がインストールされている場合
ffplay -f mulaw -ar 8000 -ac 1 test-cartesia-output.ulaw

# WAV に変換して聞く
ffmpeg -f mulaw -ar 8000 -ac 1 -i test-cartesia-output.ulaw test-cartesia-output.wav
# その後、test-cartesia-output.wav をダブルクリックで再生
```

期待される音声: 指定した Voice ID の日本語ナレーション

---

## Phase 3: OpenAI Realtime API 単独テスト

### 実行

```bash
cd backend
node test-openai-realtime.js
```

### 成功時の出力例

```
====================================
OpenAI Realtime API GA Test
====================================
URL:  wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=0.8
====================================

✅ WebSocket 接続成功 (GA, ヘッダー不要)
✅ session.created 受信
   Model: gpt-realtime
   Type : realtime
📤 session.update 送信中 (text 出力モード)...
✅ session.updated 受信 - フォーマット正常
   output_modalities: ['text']

📤 テスト会話開始: "今日の天気は？"
今日の天気については、リアルタイムで確認できないため...

✅ response.*_text.done 受信

====================================
✅ テスト完了
====================================
session.created :  ✅
session.updated :  ✅
text delta 数   :  42
受信テキスト    :  今日の天気については、リアルタイムで確認できないため...
====================================
```

### 失敗時の対処

| エラー | 原因 | 対処 |
|-------|------|------|
| `401` | API キー無効 | OpenAI dashboard で再発行 |
| `404 model gpt-realtime` | GA モデルにアクセス権なし | OpenAI account の tier を確認 |
| `Unknown parameter session.output_modalities` | API バージョンずれ | OpenAI サポートに確認 |
| session.updated 来ない | session.update フォーマット間違い | エラー event を確認 |

---

## Phase 4: ローカル統合テスト（バックエンド全体起動）

### 4-1. バックエンド起動

```bash
cd backend
npm install   # 初回のみ
npm run dev
```

### 4-2. ログで確認

起動時に以下のエラーが出ていないか確認：

```
✅ MongoDB connected
✅ Socket.IO initialized
✅ Twilio service ready
```

エラー例:
```
❌ CARTESIA_API_KEY is not set
   → .env.local に追加
```

### 4-3. WebSocket エンドポイントをテスト

別のターミナルで:

```bash
# ヘルスチェック
curl http://localhost:5001/health

# OK が返ってくることを確認
```

---

## Phase 5: 本物の電話で E2E テスト（最重要）

### 5-1. ngrok 起動

```bash
ngrok http 5001
```

表示されたHTTPS URL (例: `https://abc123.ngrok-free.app`) をコピー。

### 5-2. `.env.local` 更新

```env
NGROK_URL=https://abc123.ngrok-free.app
WEBHOOK_BASE_URL_DEV=https://abc123.ngrok-free.app
```

バックエンドを再起動。

### 5-3. Twilio Console 設定

[Twilio Console](https://console.twilio.com) → Phone Numbers → 該当番号 → Voice Configuration:

- **A call comes in** Webhook: `https://abc123.ngrok-free.app/api/twilio/voice`
- メソッド: `POST`

### 5-4. 発信テスト

1. http://localhost:3000 にログイン
2. ダッシュボードから顧客を選んで発信
3. **自分の携帯電話に着信させる**

### 5-5. 確認ポイント

- [ ] 電話が鳴る
- [ ] AI が話し始める（**Cartesia の Voice ID の声か確認**）
- [ ] 話しかけると AI が反応する（音声認識動作）
- [ ] AI の返答内容が自然
- [ ] ダッシュボードでリアルタイムに transcript が表示される
- [ ] 終話後、通話履歴に記録される

### 5-6. バックエンドログ確認

正常時のログパターン:
```
[OpenAI] Connecting to: wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=0.8
[OpenAI] Connected to Realtime API
[Cartesia] Connected
[Text] New assistant item: item_abc123
[Cartesia] Sending text (45 chars): こんにちは、新義豊株式会社の...
```

エラー時:
```
[Cartesia] CARTESIA_API_KEY is not set   ← .env.local 確認
[OpenAI] WebSocket error: 401             ← APIキー確認
[Cartesia] Not connected, skipping        ← Cartesia接続失敗
```

---

## Phase 6: Render デプロイ

Phase 1-5 が **全て成功** したら、初めてデプロイ:

```bash
# 自分のリポジトリに push
git push origin main

# Render が自動でデプロイを開始
# Render dashboard でデプロイログを確認
```

### Render 環境変数チェックリスト

| キー | 状態 |
|------|------|
| `OPENAI_REALTIME_API_KEY` | ✅ 既存 |
| `CARTESIA_API_KEY` | ✅ 追加済み |
| `CARTESIA_VOICE_ID` | （省略可、デフォルト値あり） |
| `CARTESIA_MODEL_ID` | （省略可、デフォルト値あり） |

### デプロイ後の確認

Twilio Console の Webhook URL を Render の本番 URL に切り替え:

- Before: `https://abc123.ngrok-free.app/api/twilio/voice`
- After: `https://ai-call-backend.onrender.com/api/twilio/voice`

本番でも実発信テストを 1 回実施。

---

## 🚨 ロールバック手順

万が一 Render デプロイ後に問題が起きた場合:

```bash
# 1つ前のコミットに戻す
git revert HEAD
git push origin main

# または Render dashboard の "Rollback to previous deploy" を使用
```

旧来の `mediaStreamController.js`（OpenAI 全包形式）に即座に戻れます。

---

## ❓ よくある質問

### Q: Phase 2-3 だけ成功すれば Phase 4-5 を飛ばしてもいい？
A: **絶対にダメ**。Phase 5（実発信）で初めて分かる問題が必ずあります。

### Q: Twilio から発信先に AI の声が聞こえない場合
A: バックエンドログで以下を確認:
- `[Cartesia] Sending text` が出ているか → 出ていれば Cartesia には届いている
- Cartesia 側でエラーが出ていないか
- Twilio に media event が送信されているか

### Q: AI の声が「途切れ途切れ」になる
A: Cartesia の `pcm_mulaw 8000Hz` 設定が正しいか確認。違う sample_rate になっていると音声が変な速度で再生される。
