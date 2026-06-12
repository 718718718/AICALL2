# AI Call System - 自動電話対応システム

AIを活用した自動電話対応システムです。Twilioを利用した音声通話、リアルタイム会話処理、オペレーターへのハンドオフ機能を提供します。

## 機能概要

- 🤖 AI音声対話による自動電話対応
- 📞 Twilioを利用した電話番号管理と通話制御
- 🔄 リアルタイムでの会話モニタリング
- 👥 オペレーターへのハンドオフ機能
- 📊 通話履歴と統計情報の管理
- 🏢 マルチテナント対応（企業管理機能）
- 🎯 一括発信機能

## プロジェクト構造

```
PJ_AI-/
├── backend/            # Node.js/Express バックエンドサーバー
│   ├── controllers/    # APIコントローラー
│   ├── models/        # MongoDBモデル
│   ├── routes/        # APIルート定義
│   ├── services/      # ビジネスロジック
│   └── server.js      # メインサーバーファイル
├── frontend/          # Next.js フロントエンド
│   ├── app/          # App Router
│   ├── components/   # Reactコンポーネント
│   └── lib/          # ユーティリティ関数
└── docs/             # ドキュメント
```

## 必要な要件

- Node.js 18.0.0以上
- MongoDB 4.4以上
- Twilioアカウント
- OpenAI Realtime APIキー（`OPENAI_REALTIME_API_KEY`）
- Cartesia APIキー（`CARTESIA_API_KEY`）— AI音声合成（TTS）用
- Coefont APIキー（オプション：旧TTS連携用）
- ngrok（ローカル開発用）

## ローカル環境セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd PJ_AI-
```

### 2. MongoDB のセットアップ

#### macOS の場合：
```bash
# Homebrewを使用してインストール
brew tap mongodb/brew
brew install mongodb-community

# MongoDBを起動
brew services start mongodb-community
```

#### Windows の場合：
[MongoDB公式サイト](https://www.mongodb.com/try/download/community)からインストーラーをダウンロードして実行

#### Linux の場合：
```bash
# Ubuntu/Debian
sudo apt-get install -y mongodb
sudo systemctl start mongodb
```

### 3. バックエンドのセットアップ

```bash
cd backend

# 依存関係のインストール
npm install

# 環境変数ファイルの作成
cp .env.example .env
```

#### .env ファイルの設定

`backend/.env` ファイルを編集して、以下の環境変数を設定：

```env
# 基本設定
NODE_ENV=development
PORT=5001

# MongoDB接続
MONGODB_URI=mongodb://localhost:27017/ai-call-system

# JWT認証
JWT_SECRET=your-jwt-secret-key-here

# Twilio設定
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER_DEV=+1xxxxxxxxxx  # Twilioで購入した番号

# ngrok URL（後で設定）
NGROK_URL=https://your-ngrok-url.ngrok-free.app
WEBHOOK_BASE_URL_DEV=https://your-ngrok-url.ngrok-free.app

# OpenAI Realtime API（音声通話AI用）
OPENAI_REALTIME_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Cartesia TTS（AI音声合成）
CARTESIA_API_KEY=your-cartesia-api-key
# CARTESIA_VOICE_ID は省略可（デフォルト: fd1ee8f5-223a-4a87-a2fe-37eb3706cd69）
# CARTESIA_MODEL_ID は省略可（デフォルト: sonic-2）

# Coefont API（オプション）
COEFONT_ACCESS_KEY=your-coefont-access-key
COEFONT_CLIENT_SECRET=your-coefont-secret

# AWS S3（オプション：音声ファイル保存用）
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-s3-bucket
```

### 4. フロントエンドのセットアップ

```bash
cd ../frontend

# 依存関係のインストール
npm install

# 環境変数ファイルの作成
cp .env.example .env.local
```

#### .env.local ファイルの設定

`frontend/.env.local` ファイルを編集：

```env
# 環境設定
NEXT_PUBLIC_NODE_ENV=development

# API URLs
NEXT_PUBLIC_API_URL_DEV=http://localhost:5001
NEXT_PUBLIC_API_URL_PROD=https://your-production-api.com

# WebSocket URLs
NEXT_PUBLIC_WS_URL_DEV=ws://localhost:5001
NEXT_PUBLIC_WS_URL_PROD=wss://your-production-api.com

# Twilio Phone Numbers
NEXT_PUBLIC_TWILIO_PHONE_DEV=+1xxxxxxxxxx  # 表示用の番号

# 機能フラグ
NEXT_PUBLIC_ENABLE_MULTI_TENANT=false
```

### 5. ngrok のセットアップ（Twilio Webhook用）

Twilioからローカル環境にWebhookを受信するため、ngrokが必要です。

#### ngrok のインストール：
```bash
# macOS
brew install ngrok

# その他のOS
# https://ngrok.com/download からダウンロード
```

#### ngrok の起動：
```bash
ngrok http 5001
```

表示されたHTTPS URLを `backend/.env` の `NGROK_URL` と `WEBHOOK_BASE_URL_DEV` に設定します。

例：
```
NGROK_URL=https://abc123.ngrok-free.app
WEBHOOK_BASE_URL_DEV=https://abc123.ngrok-free.app
```

### 6. Twilioの設定

1. [Twilio Console](https://console.twilio.com)にログイン
2. Phone Numbers > Manage > Active Numbers から使用する番号を選択
3. Voice Configuration セクションで：
   - "A call comes in" のWebhook URLを設定：
     ```
     https://your-ngrok-url.ngrok-free.app/api/twilio/voice
     ```
   - HTTP メソッドを `POST` に設定
4. 保存

### 7. データベースの初期設定

```bash
cd backend

# デフォルト企業の作成（マルチテナント機能を使用しない場合）
node scripts/createDefaultCompany.js

# 管理者アカウントの作成（オプション）
node setup-agent.js
```

### 8. アプリケーションの起動

#### バックエンドサーバーの起動：
```bash
cd backend
npm run dev
```

#### フロントエンドの起動：
```bash
cd frontend
npm run dev
```

### 9. アクセス

- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:5001
- 管理画面: http://localhost:3000/admin

## 初回ユーザー登録

1. http://localhost:3000/signup にアクセス
2. ユーザー情報を入力して登録
3. ログイン後、ダッシュボードから各機能にアクセス可能

## 主要な機能の使い方

### 顧客データのインポート
1. ダッシュボードから「顧客管理」を選択
2. CSVファイルで顧客データを一括インポート
3. サンプルCSVファイル: `sample_customers_single.csv`, `sample_customers_multiple.csv`

### 電話発信
1. 顧客リストから発信対象を選択
2. 「発信」ボタンをクリック
3. リアルタイムで通話状況をモニタリング

### オペレーターハンドオフ
1. 通話モニター画面で進行中の通話を確認
2. 必要に応じて「ハンドオフ」ボタンをクリック
3. オペレーターが通話に参加

## トラブルシューティング

### MongoDBに接続できない場合
```bash
# MongoDBの状態を確認
brew services list | grep mongodb

# 再起動
brew services restart mongodb-community
```

### Twilioのwebhookが受信できない場合
- ngrokが起動していることを確認
- ngrok URLが正しく設定されていることを確認
- Twilioコンソールでwebhook URLが正しく設定されていることを確認

### ポートが使用中の場合
```bash
# 使用中のポートを確認
lsof -i :5001  # バックエンド
lsof -i :3000  # フロントエンド

# プロセスを終了
kill -9 <PID>
```

### 音声が男性に聞こえる場合（2026-05-19 解決済の代表的事例）

「outbound 通話の音声が男性に聞こえる」「アカウントによって性別が違って聞こえる」というクレームを受けた場合、以下の順序で確認すること。

**確認順序**：

1. **Render dashboard で稼働 service が複数あるか確認**
   - 旧 service（例: `pj-ai.onrender.com`）が削除されず残っていると、旧コード（CoeFont 男性音声）が稼働継続する
   - 不要な service は **Suspend or Delete**

2. **Vercel フロントエンド env で backend URL 系変数を確認**
   - `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL_PROD`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_WS_URL_PROD` がすべて新 backend URL に統一されているか
   - 新旧 URL が混在していると、リクエストごとに振り分けられるため「同じシステムで男声・女声が混在」する

3. **Render backend env を確認**
   - `BASE_URL` が `https://` プレフィックス付きで設定されているか（プロトコル抜けは Twilio 21205 エラー）
   - `CARTESIA_VOICE_ID=fd1ee8f5-223a-4a87-a2fe-37eb3706cd69`（女性日本語 voice）
   - `USE_SIMPLE_MEDIA_STREAM=false` または未設定（true にすると OpenAI `alloy` 男性音声に切り替わる）
   - `USE_OPENAI_REALTIME=true`

4. **Render log を該当時間帯で検索**
   ```
   [TwiML Conference] Using PRODUCTION endpoint    ← SIMPLE が出てはいけない
   [Cartesia] Sending text                         ← 出ていれば Cartesia 経由で動作
   [CoeFont]                                       ← 出てはいけない（5/15 22:09 以降は使用停止）
   ```

5. **顧客が古い録音を再生していないか確認**
   - 2026-05-15 22:09 以前に録音されたファイルには、当時の旧音声（CoeFont 男性 / 半切替期の混在）が永久保存されている
   - 録音された日時を顧客に確認

詳細な調査ログ: [`docs/investigation-voice-gender-complaint-2026-05-18.md`](./docs/investigation-voice-gender-complaint-2026-05-18.md)

---

## 本番環境の環境変数を変更する手順（重要）

本番環境（Render + Vercel）の環境変数を変更する際は、以下の手順を**厳守すること**。`NEXT_PUBLIC_*` 変数は **build 時 baked-in** されるため、env を変えただけでは反映されない。

### Render backend の env を変更する場合

1. Render dashboard → 該当 service → **Environment**
2. 変数を編集・追加・削除
3. **保存すると自動的に service 再起動**される（10 〜 30 秒程度）
4. 起動 log で以下を確認：
   ```
   [Cartesia] Voice ID: ...
   Server running in production mode on port 10000
   ```
5. テスト通話を 1 件発信し、`[TwilioService] Using webhook URL: https://...` が正しい URL になっているか確認

**注意点**：
- `BASE_URL` は **必ず `https://` プレフィックス**を付ける。`pj-ai-gwps.onrender.com` のみだと Twilio 21205 エラー（`Url is not a valid URL`）で全通話失敗する。
- 古い env（例: `COEFONT_VOICE_ID`、`COE_FONT_KEY` 等）はそのまま残しても動作上は問題ないが、混乱の元なので不要なものは削除推奨。

### Vercel frontend の env を変更する場合

⚠️ **重要**: Next.js の `NEXT_PUBLIC_*` 変数は **build 時に JavaScript bundle に baked-in** されるため、env を変えただけでは反映されない。**必ず再 deploy が必要**。

1. Vercel dashboard → 該当 project → **Settings → Environment Variables**
2. 変数を編集・追加・削除
3. **Deployments タブに移動**
4. 最新の Live deployment → 右上「⋯」→ **Redeploy**
5. ⚠️ **「Use existing Build Cache」のチェックを外す**（外さないと古い値のまま）
6. Deploy 完了後、ブラウザで **hard refresh**（Mac: `Cmd+Shift+R` / Win: `Ctrl+F5`）
7. クライアントにも hard refresh またはシークレットウィンドウでの動作確認を依頼

**現在統一すべき URL**: すべて `https://pj-ai-gwps.onrender.com`（WS_URL_PROD のみ `wss://`）

| Env Var | 正しい値 |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://pj-ai-gwps.onrender.com` |
| `NEXT_PUBLIC_BACKEND_URL_PROD` | `https://pj-ai-gwps.onrender.com` |
| `NEXT_PUBLIC_API_URL` | `https://pj-ai-gwps.onrender.com` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://pj-ai-gwps.onrender.com` |
| `NEXT_PUBLIC_WS_URL_PROD` | `wss://pj-ai-gwps.onrender.com` |
| `NEXT_PUBLIC_WS_URL_DEV` | `ws://localhost:5000`（dev のみ） |
| `NEXT_PUBLIC_BACKEND_URL_DEV` | `http://localhost:5000`（dev のみ） |

### Twilio Phone Number の webhook を変更する場合

Twilio 番号の inbound webhook は backend env とは別管理。変更時：

1. Twilio Console → Phone Numbers → Active Numbers → 該当番号
2. **Voice Configuration → A CALL COMES IN**
3. URL を `https://pj-ai-gwps.onrender.com/api/twilio/voice` に統一
4. 保存後、Twilio に着信テストして動作確認

※ 現在 inbound は `twiml.reject()` で常時拒否しているため、この webhook が誤っていても outbound には影響しない。

### env 変更後の必須チェックリスト

| チェック項目 | 確認方法 |
|---|---|
| Render service が再起動した | 起動 log に `Server running` が出る |
| Vercel が再 deploy された | Deployments の最新 Live time が env 変更後の時刻 |
| Build Cache を使わずに rebuild した | Deployments の build log に「skipped cache」または build 時間が通常通り |
| Twilio webhook URL が正しい | テスト通話の log で `Using webhook URL: https://...` を確認 |
| ブラウザ cache がクリアされた | 自分とクライアント両方が hard refresh 済み |

## 開発コマンド

### バックエンド
```bash
npm run dev    # 開発サーバー起動（自動リロード）
npm start      # 本番サーバー起動
```

### フロントエンド
```bash
npm run dev    # 開発サーバー起動
npm run build  # 本番ビルド
npm run start  # 本番サーバー起動
npm run lint   # Lintチェック
```

## API ドキュメント

主要なAPIエンドポイント：

- `POST /api/auth/signup` - ユーザー登録
- `POST /api/auth/login` - ログイン
- `GET /api/customers` - 顧客リスト取得
- `POST /api/calls` - 電話発信
- `GET /api/calls/active` - アクティブな通話取得
- `POST /api/handoff/initiate` - ハンドオフ開始

## 変更履歴

### 2026-06-06 — 転送ハンドオフ安定化・結果判定修正

#### 変更概要
オペレーターハンドオフ時に転送案内が途中で切れる問題と、実際には転送失敗していても通話結果が「成功」と記録される問題を修正。

#### 主な修正内容
| 対象 | 変更内容 |
|---|---|
| 転送案内の再生制御 | `transfer_to_human` 実行後、案内音声の Cartesia context が drain してからハンドオフへ進むよう制御 |
| 二重実行防止 | ハンドオフ実行を idempotent 化し、fallback / drain / WebSocket close の競合で二重発信しないよう補強 |
| 結果判定 | `status === human-connected` のみでは成功扱いにせず、担当者が conference に join した実績を成功判定の条件に変更 |
| no-conference 分岐 | conference 未作成時に設定した `失敗` が後段で `成功` に上書きされないよう修正 |
| 回帰テスト | 音声 runtime / handoff 周辺のテストケースを追加・更新 |

#### 変更ファイル
- `backend/controllers/mediaStreamController.js`
- `backend/controllers/twilioController.js`
- `backend/controllers/twilioController_backup.js`
- `backend/routes/twilioRoutes.js`
- `backend/test/voice-runtime.test.js`

#### 検証
- `cd backend && npm run test:voice`
- 最終記録: **51 passed / 0 failed**

#### 注意点
- response / context / drain / fallback の状態管理は複雑なため、今後の大きな仕様変更時は `backend/test/voice-runtime.test.js` の回帰テストを先に拡充すること。
- 低頻度 edge case として、function call を含む response と転送案内 response の厳密な response_id 分離は follow-up 対象。

---

### 2026-06-05 — BYOC trunk 経由の outbound caller ID 対応

#### 変更概要
outbound 発信時の caller ID を BYOC trunk 側の 03 番号に寄せ、設定が不足している場合は既存の安全な fallback を使うよう修正。

#### 変更ファイル
- `backend/controllers/callController.js`
- `backend/controllers/conferenceController.js`
- `backend/services/twilioService.js`
- `backend/utils/byocFrom.js`

---

### 2026-05-19 — 音声性別クレーム真因解決（Vercel env 混在 + Render BASE_URL 修正）

#### 報告された問題
- 顧客 TAKA718 より複数回「outbound 通話の音声が男性に聞こえる」「アカウントによって性別が違って聞こえる」とのクレーム
- 5/15 〜 5/18 にかけて backend code、env、Cartesia API、Render log を徹底調査するも原因特定できず

#### 真因（最終特定）
1. **Vercel フロントエンド env に新旧 backend URL が混在**
   - 旧 backend `https://pj-ai.onrender.com`（5/11 以前の CoeFont 男性音声コード稼働中）
   - 新 backend `https://pj-ai-gwps.onrender.com`（現行 Cartesia 女性音声）
   - 元の開発者が「環境変数で接続先を切替可能な構成」を残しており、リクエストごとにどちらに流れるか不定だった
2. **Render backend env の `BASE_URL` がプロトコル（`https://`）抜けで設定された時期がある**
   - Twilio が「Url is not a valid URL」エラー（code 21205）を返し全 outbound 失敗
   - 通話失敗時に古い backend にフォールバックする経路が存在した可能性

#### 修正内容
| 対象 | 変更 |
|---|---|
| Vercel env | 全 backend URL 系変数を `https://pj-ai-gwps.onrender.com` に統一 |
| Vercel deployment | env 変更後に Build Cache を使わず再 deploy |
| Render env | `BASE_URL=https://pj-ai-gwps.onrender.com`（プロトコル付き）に正規化 |
| クライアント側 | ブラウザ hard refresh / シークレットウィンドウで動作確認依頼 |

#### 学び（次回以降の必須チェック）
- 「アカウントによって挙動が違う」というクレームを backend code だけで再現できない場合、**架構分裂（複数 backend / Vercel env routing split）を疑う**
- backend 単体の調査で結論を出す前に、Render dashboard の service 一覧と Vercel env の URL 系変数を必ず確認
- `NEXT_PUBLIC_*` 変数は build 時 baked-in。env 変更後は必ず Vercel を再 deploy する（Build Cache を使わない）

#### 関連ドキュメント
- 詳細調査ログ: [`docs/investigation-voice-gender-complaint-2026-05-18.md`](./docs/investigation-voice-gender-complaint-2026-05-18.md)
- アーキテクチャ補足: [`VOICE_CALL_ARCHITECTURE.md`](./VOICE_CALL_ARCHITECTURE.md) § 16 音声トラブルシューティング

---

### 2026-05-15 (22:09) — Cartesia への完全切替

#### 変更内容
5 つの controller の require 路徑を `coefontService` から `cartesiaService` に変更し、転送案内・システムエラー・fallback パスも含めて全 outbound 音声を Cartesia 女性音声に統一。

#### 変更ファイル（commit `3c04b01`）
- `backend/controllers/conferenceController.js`
- `backend/controllers/handoffController.js`
- `backend/controllers/handoffRedirectController.js`
- `backend/controllers/twilioController.js`
- `backend/controllers/twilioVoiceController.js`
- `backend/services/cartesiaService.js`（新規）

#### 半切替期間（2026-05-11 〜 2026-05-15 22:09）の注意点
- この期間に録音された通話には、主対話部分（Cartesia 女声）と転送案内部分（CoeFont 男声）が混在
- dashboard で過去録音を再生する際は、この期間以前の録音か注意

---

### 2026-05-11 (16:30) — TTS 二重音声・音切れ問題の修正

#### 報告された問題
本番環境でのテスト後、お客様より以下の不具合報告を受領：
1. **音声が重複する** — 同じ文章が2回再生される
2. **音声が途切れ途切れ** — 文と文の間に空白が入る

#### 原因
| 問題 | 原因 |
|------|------|
| 二重音声 | OpenAI Realtime GA が `response.output_text.delta` と legacy `response.text.delta` の両方を同一 delta で発火するケースがあり、両方処理していたためテキストが二重に蓄積されていた |
| 音切れ | 各文ごとに新しい `context_id` を発行し `continue: false` で送信していたため、Cartesia が各文を独立した生成として扱い cold start による空白が発生 |

#### 修正内容（`backend/controllers/mediaStreamController.js`）
1. **`textDeltaEventType` 状態変数追加** — 最初に受信した delta イベント名をロック、もう一方は無視
2. **`cartesiaContextId` 状態変数追加** — 1 OpenAI レスポンス内で同一 context を共有
3. **`sendToCartesia` に `continueFlag` パラメータ追加** — 部分送信 (true) / 終端送信 (false) を区別
4. **割り込み時に Cartesia context を即座にクローズ** — 残響防止

#### 動作
```
[修正前]
sentence1 → ctx-A → continue:false → Cartesia 生成完了 → [空白] → sentence2 → ctx-B → ...
                                                       ↑ 音切れ原因

[修正後]
sentence1 → ctx-A → continue:true  ┐
sentence2 → ctx-A → continue:true  ├→ Cartesia がストリーミング生成（途切れなし）
final     → ctx-A → continue:false ┘
```

---

### 2026-05-11 — Cartesia TTS 統合・OpenAI Realtime API 修正

#### 変更概要
音声合成（TTS）エンジンをOpenAI内蔵音声からCartesiaへ移行し、OpenAI Realtime APIのモデル設定を修正。

#### 変更ファイル
| ファイル | 変更内容 |
|--------|---------|
| `backend/controllers/mediaStreamController.js` | TTS切替・セッション設定修正 |
| `backend/config/environment.js` | Cartesia設定追加 |
| `backend/render.yaml` | 環境変数定義追加 |

#### アーキテクチャ変更

**変更前（OpenAI Realtime 音声全包）**
```
Twilio音声 → OpenAI Realtime WSS (STT + LLM + TTS 一体) → Twilio音声
```

**変更後（テキスト出力 + Cartesia TTS）**
```
Twilio音声 → OpenAI Realtime WSS (STT + LLM, テキスト出力)
           → Cartesia TTS WebSocket (pcm_mulaw 8kHz) → Twilio音声
```

#### 主な変更点
- **OpenAI Realtime API GA フォーマット維持**: `model: "gpt-realtime"`, `type: "realtime"`, `output_modalities` を採用
- **セッション出力モード**: `output_modalities: ["audio"]` → `output_modalities: ["text"]`
- **音声フォーマット**: OpenAI音声出力を廃止、Cartesiaの `pcm_mulaw 8kHz` を使用（Twilioと互換）
- **Cartesia 設定**: モデル `sonic-3`、API バージョン `2026-03-01`
- **イベント名**: `response.output_text.delta` / `response.output_text.done`（互換のため `response.text.delta` も並行サポート）
- **割り込み処理**: `conversation.item.truncate` → `response.cancel`（text modeに対応）
- **日本語センテンス区切り**: `。！？` のみ使用（`、`による誤分割を排除）

#### 必要な環境変数（Render）
```
CARTESIA_API_KEY=your-cartesia-api-key
```

#### コスト削減効果（5分通話あたり）
| | 変更前 | 変更後 |
|--|--------|--------|
| OpenAI音声出力 | $0.72 | $0.02（テキストtokenのみ） |
| TTS（Cartesia） | - | $0.09 |
| 合計 | **$0.84** | **~$0.23** |
| **削減率** | | **約73%削減** |

---

### 2026-05-22 — 音声再生同期 (Playback Sync) リファクタ

#### 解決した問題
OpenAI `response.done` と Twilio `markQueue` が「Cartesia 音声の実再生完了」を表していなかったため、以下のバグが発生していた:
1. **barge-in 不発**: `markQueue.length===0` の判定により、AI が話している途中でも割り込みが効かないケース
2. **挨拶途切れ**: closing phrase / handoff announcement が再生完了する前に `twilioService.endCall` が走り、終話挨拶が最後まで届かない
3. **handoff no-answer で死亡**: 担当者転送が失敗したとき fallback がなく、通話が無音のまま切れる

#### 修正ファイル
| ファイル | 変更内容 |
|--------|---------|
| `backend/controllers/mediaStreamController.js` | playback tracker / deterministic closing / barge-in 無条件化 / handoff fallback |
| `backend/services/conversationEngine.js` | 旧 Gather パスの 700-1200ms random timer を deterministic 2.8s に。closing phrase を統一 |
| `backend/test/voice-runtime.test.js` | 10 件の smoke test を追加 |
| `backend/package.json` | `npm test` で smoke test 実行 |

#### 新しい再生同期モデル
```
OpenAI text delta → Cartesia (continue:true)
Cartesia chunk    → Twilio media + mark "cartesia:<ctx>:<seq>"  ← marks lives here
Twilio mark ack   → playback.ackMark()  → ctx.marks--
Cartesia done     → playback.endContext() → drain check
drain + tail(700ms) → 真の hangup
```
これにより `markQueue` は「Twilio バッファ内の未再生 audio」を正確に反映する。

#### barge-in ポリシー
`input_audio_buffer.speech_started` を受信したら、`markQueue.length` に関係なく以下を実行:
1. `openai response.cancel`
2. 現在の Cartesia context を finalize + invalidate（以降の chunk は drop）
3. Twilio `clear` を送信
4. `pendingHandoff` / `pendingCallEnd` を破棄

ログは `[barge-in] speech_started` → `openai response.cancel sent` → `cartesia context invalidated` → `twilio clear sent` → 以降の stale chunk は `[barge-in] stale cartesia chunk dropped` で観測可能。

#### Deterministic Closing Phrases
拒否 / 不在 / 無応答 / handoff 失敗 の終話挨拶を AI 生成に頼らず固定文言で再生（`mediaStreamController.CLOSING_PHRASES`）:
- **拒否系**: 「承知いたしました。お忙しいところ恐れ入ります。それでは失礼いたします。」
- **不在系 / 無応答**: 「承知いたしました。また改めてご連絡いたします。お忙しいところ恐れ入ります。それでは失礼いたします。」
- **handoff fallback**: 「申し訳ございません。担当者が応答できませんでした。改めてご連絡いたします。それでは失礼いたします。」
- **voicemail**: 無音（メッセージは残さない）

#### 環境変数
| 名前 | デフォルト | 説明 |
|------|----------|------|
| `CARTESIA_TAIL_MS` | `700` | drain 後のテール待機（mid-syllable cut 防止） |
| `CARTESIA_DRAIN_TIMEOUT_MS` | `15000` | drain が来ない場合の force fire 上限 |
| `LEGACY_CLOSING_DELAY_MS` | `2800` | 旧 Gather パスの closing 待機（固定） |

#### 追加で対応した堅牢化（同じ修正シリーズ内）
- **chunk-mark ordering** (`mediaStreamController.js` onChunk): media を Twilio に送った**あとで** mark を allocate。送信失敗時は `playback.rollbackChunk(markName)` で in-flight counter を巻き戻す。「Twilio に届かなかった audio」で drain が 15 秒詰まる事象を回避。
- **rollbackChunk true idempotency**: 同一 mark の二重 rollback が別 chunk の counter を侵食しないよう、queue から実際に削除できた場合のみ counter を decrement。
- **voicemail silent close 短絡** (`handleDeterministicCallEnd`): `phrase === null` のとき Cartesia 経由を skip し、`invalidateAll` + `setTimeout(executor, CARTESIA_TAIL_MS)` で即時 hangup。空 context で drain done が来ず 15 秒詰まる問題を解消。
- **handoff no-answer 真の fallback** (`controllers/twilioController.js` handleHandoffStatus / 新 endpoint `POST /api/twilio/voice/handoff-failed/:callId`): no-answer/busy/failed 時に `calls(sid).update({status:'completed'})` の cold-cut を廃止し、`calls(sid).update({url})` で顧客 leg を fallback TwiML にリダイレクト。`<Play>fallback_phrase</Play><Hangup/>` で挨拶完了後に自然 hangup。redirect 自体が失敗したときのみ従来の hard hangup にフォールバック。
- **handoff-failed endpoint hardening**: GET route 削除（POST のみ）、`CallSession.exists` で callId 検証、無効 ID には bare `<Hangup/>` のみ返す（TTS / cache 起動なし）。
- **公開 URL helper の統一** (`utils/publicUrl.js`): Render production が `BASE_URL_PROD` のみ設定の場合に、`cartesiaService` や `handoffController` が `process.env.BASE_URL` 直参照で `undefined/api/...` を生成するバグがあった（agent call の status callback が届かず fallback が発火しない原因）。`getPublicBaseUrl()` を導入し precedence (`BASE_URL_PROD > BASE_URL > NGROK_URL > localhost`) を統一。`cartesiaService` は URL 解決不能なら `null` を返し Polly.Mizuki にフォールバック。`handoffController` 全 13 callsite を helper 化。
- **回帰テスト**: ① `handoffController.js` source に `process.env.BASE_URL`（`_PROD` 除外）が残っていないことを grep 検証、② `BASE_URL_PROD` のみの env で URL に `undefined` が混入しないことを behavioral test で検証。

#### テスト
```bash
cd backend && npm test
# 26 passed, 0 failed
```
カバー: chunk-driven marks / barge-in 無条件 / stale chunk drop / rejection・absent flow / handoff fallback / require 互換性 / rollbackChunk semantics / drainTimeout force fire / barge-in mid-close cleanup / 複数 context 同時 in-flight / voicemail silent close 短絡 / idle speech_started no-op / canAcceptChunk peek 不変 / publicUrl precedence / cartesiaService Polly fallback / handoffController BASE_URL 静的・行動回帰。

---

## ライセンス

[ライセンス情報を記載]

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
