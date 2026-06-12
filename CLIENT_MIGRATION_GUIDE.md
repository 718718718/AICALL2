# クライアント環境移行ガイド

本ドキュメントは、AI Call System を開発環境からクライアントのインフラ環境（Vercel / Render / MongoDB Atlas）に移行するための全作業項目をまとめたものです。

---

## 前提条件

クライアント側で以下のアカウント・サービスが用意されていること。

| サービス | 用途 | 必須 |
|---|---|---|
| GitHub | リポジトリホスティング | 必須 |
| Vercel | フロントエンドホスティング | 必須 |
| Render | バックエンドホスティング | 必須 |
| MongoDB Atlas | データベース | 必須 |
| Twilio | 電話発着信・音声通話 | 必須 |
| OpenAI | AI会話エンジン | 必須 |
| Coefont | 日本語音声合成 | 必須 |
| AWS S3 | 録音ファイル保存 | 録音機能を使う場合 |
| SMTP サーバー | メール認証・通知 | メール機能を使う場合 |

---

## Phase 1: クライアントインフラの準備

### 1-1. GitHub リポジトリ

- [ ] クライアントのGitHubアカウントにリポジトリを作成（またはフォーク）
- [ ] `feature/client-migration` ブランチの内容を `main` にマージしたコードをプッシュ
- [ ] `.env` ファイルがコミットされていないことを確認

### 1-2. MongoDB Atlas

- [ ] クラスタを作成（推奨: M10以上、リージョンはクライアントの利用地域に近いもの）
- [ ] データベースユーザーを作成（権限: `readWriteAnyDatabase`）
- [ ] Network Access でRenderのIPアドレスをホワイトリストに追加
  - Render固定IPが無い場合は `0.0.0.0/0`（全許可）を設定し、後から制限する
- [ ] 接続文字列を控えておく: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority`

### 1-3. Twilio

- [ ] クライアントのTwilioアカウントで Account SID / Auth Token を取得
- [ ] 電話番号を購入（日本番号 or US番号、用途に応じて）
- [ ] Voice Webhook の設定は Phase 3 で実施

### 1-4. OpenAI

- [ ] APIキーを取得
- [ ] リアルタイム音声を使用する場合は、Realtime API対応のキーも取得

### 1-5. Coefont

- [ ] Access Key / Client Secret を取得
- [ ] 使用するボイスIDを確認

### 1-6. AWS S3（録音保存を使う場合）

- [ ] S3バケットを作成
- [ ] IAMユーザーを作成し、Access Key / Secret Key を取得
- [ ] バケットのCORSポリシーを設定:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["https://<vercel-url>"],
    "ExposeHeaders": []
  }
]
```

### 1-7. SMTP（メール認証を使う場合）

- [ ] SMTPサーバーの情報を取得（Host / Port / User / Password）
- [ ] 送信元ドメインのSPF / DKIMレコードを設定

---

## Phase 2: 環境変数の設定

### 2-1. Render（バックエンド）

Renderダッシュボード > Web Service > Environment から設定。

#### 必須

| 変数名 | 設定値 | 説明 |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `5000` | |
| `MONGODB_URI` | `mongodb+srv://...` | Phase 1-2 で取得した接続文字列 |
| `FRONTEND_URL` | `https://<app>.vercel.app` | VercelのURL（CORS許可用） |
| `FRONTEND_URL_PROD` | `https://<app>.vercel.app` | 同上 |
| `BASE_URL` | `https://<app>.onrender.com` | RenderのURL |
| `BASE_URL_PROD` | `https://<app>.onrender.com` | 同上 |
| `WEBHOOK_BASE_URL_PROD` | `https://<app>.onrender.com` | 同上 |
| `JWT_SECRET` | ランダムな文字列（32文字以上） | `openssl rand -hex 32` で生成 |
| `JWT_REFRESH_SECRET` | ランダムな文字列（32文字以上） | 同上（JWT_SECRETとは別の値） |
| `TWILIO_ACCOUNT_SID` | `AC...` | TwilioのAccount SID |
| `TWILIO_AUTH_TOKEN` | Twilioの Auth Token | |
| `TWILIO_PHONE_NUMBER` | `+1...` | Twilio電話番号 |
| `TWILIO_PHONE_NUMBER_PROD` | `+1...` | 同上 |
| `OPENAI_API_KEY` | `sk-...` | OpenAI APIキー |
| `COE_FONT_KEY` | Coefont Access Key | |
| `COE_FONT_CLIENT_SECRET` | Coefont Client Secret | |
| `COEFONT_VOICE_ID` | ボイスID | |

#### 条件付き

| 変数名 | 条件 | 説明 |
|---|---|---|
| `OPENAI_REALTIME_API_KEY` | リアルタイム音声を使う場合 | |
| `AWS_ACCESS_KEY_ID` | 録音保存を使う場合 | |
| `AWS_SECRET_ACCESS_KEY` | 録音保存を使う場合 | |
| `AWS_S3_BUCKET` | 録音保存を使う場合 | |
| `AWS_REGION` | 録音保存を使う場合 | |
| `SMTP_HOST` | メール認証を使う場合 | |
| `SMTP_PORT` | メール認証を使う場合 | |
| `SMTP_USER` | メール認証を使う場合 | |
| `SMTP_PASS` | メール認証を使う場合 | |
| `EMAIL_FROM` | メール認証を使う場合 | |
| `ADMIN_EMAIL` | 初期管理者を自動作成する場合 | |
| `ADMIN_PASSWORD` | 初期管理者を自動作成する場合 | |

### 2-2. Vercel（フロントエンド）

Vercelダッシュボード > Project > Settings > Environment Variables から設定。

**重要: `NEXT_PUBLIC_` プレフィックスの変数はビルド時にコードに埋め込まれるため、設定変更後は必ず再デプロイが必要。**

#### 必須

| 変数名 | 設定値 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://<app>.onrender.com` | RenderのURL（クライアント側コンポーネント用） |
| `NEXT_PUBLIC_BACKEND_URL_PROD` | `https://<app>.onrender.com` | RenderのURL（サーバー側APIルート用） |
| `NEXT_PUBLIC_API_URL_PROD` | `https://<app>.onrender.com` | 同上 |
| `NEXT_PUBLIC_WS_URL_PROD` | `wss://<app>.onrender.com` | WebSocket URL |
| `NEXT_PUBLIC_SOCKET_URL` | `https://<app>.onrender.com` | Socket.io URL |
| `NEXT_PUBLIC_APP_URL` | `https://<app>.vercel.app` | フロントエンド自身のURL |

#### 任意

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_TWILIO_PHONE_PROD` | 画面表示用の電話番号 |
| `NEXT_PUBLIC_ENABLE_MULTI_TENANT` | マルチテナント機能 (`true` / `false`) |

---

## Phase 3: 外部サービスの設定

### 3-1. Twilio Webhook の設定

Twilioコンソール > Phone Numbers > 対象番号 の設定画面で以下を更新。

| 設定項目 | URL |
|---|---|
| Voice Configuration > A Call Comes In | `https://<app>.onrender.com/api/twilio/voice` (HTTP POST) |
| Voice Configuration > Call Status Changes | `https://<app>.onrender.com/api/twilio/status` (HTTP POST) |

**この設定を忘れるとインバウンド通話がクライアント環境に届かなくなります。**

### 3-2. MongoDB Atlas のセキュリティ

- [ ] Renderのデプロイが完了したら、実際に接続できることをログで確認
- [ ] 可能であればNetwork AccessをRenderのIPに限定

---

## Phase 4: デプロイ

### 4-1. Render（バックエンド）

1. [ ] RenderダッシュボードでGitHubリポジトリを接続
2. [ ] Build Command: `cd backend && npm install`
3. [ ] Start Command: `cd backend && npm start`
4. [ ] Root Directory: （空のまま or `/`）
5. [ ] 環境変数が全て設定されていることを確認
6. [ ] デプロイを実行
7. [ ] ログで `MongoDB connected` と表示されることを確認
8. [ ] `https://<app>.onrender.com/api/health` にアクセスして200が返ることを確認

### 4-2. Vercel（フロントエンド）

1. [ ] VercelダッシュボードでGitHubリポジトリを接続
2. [ ] Framework Preset: Next.js
3. [ ] Root Directory: `frontend`
4. [ ] 環境変数が全て設定されていることを確認
5. [ ] デプロイを実行
6. [ ] ビルドログでエラーがないことを確認
7. [ ] `https://<app>.vercel.app` にアクセスしてページが表示されることを確認

**注意: Vercelのデプロイ時に `NEXT_PUBLIC_` 変数がビルドに反映されるため、環境変数は必ずデプロイ前に設定する。**

---

## Phase 5: データ移行（必要な場合）

既存データをクライアント環境に移す場合のみ実施。

### 5-1. エクスポート

```bash
mongodump --uri="<移行元のMongoDB URI>" --out=./dump
```

### 5-2. クリーンアップ

移行前に以下のデータを整理:
- [ ] テスト用ユーザーアカウント
- [ ] テスト用顧客データ
- [ ] テスト用通話履歴
- [ ] 不要なエージェント設定

### 5-3. インポート

```bash
mongorestore --uri="<クライアントのMongoDB URI>" ./dump
```

### 5-4. 初期管理者の作成

データ移行しない場合は、管理者アカウントを作成:
```bash
# Render上で、またはMONGODB_URIを設定した上でローカルから
node backend/create-admin.js
```

---

## Phase 6: 動作確認

### 6-1. 基本動作

- [ ] ログインページが表示される
- [ ] 管理者アカウントでログインできる
- [ ] 会社管理者アカウントでログインできる
- [ ] 一般ユーザーアカウントでログインできる

### 6-2. 顧客管理

- [ ] 顧客一覧が表示される
- [ ] 顧客の新規作成ができる
- [ ] 顧客の編集・削除ができる
- [ ] CSVインポートができる

### 6-3. 通話機能

- [ ] アウトバウンド発信ができる（Twilio経由で相手に着信する）
- [ ] AI会話が成立する（音声認識 + 応答生成）
- [ ] Coefont音声合成が正常に動作する
- [ ] 通話の録音が保存される（S3使用時）
- [ ] 通話ステータスがリアルタイム更新される（WebSocket）

### 6-4. インバウンド通話

- [ ] Twilio番号に電話をかけるとWebhookがRenderに到達する
- [ ] AI応答が開始される

### 6-5. ハンドオフ（人間転送）

- [ ] AI会話中に人間オペレーターへの転送ができる
- [ ] 転送先電話番号に着信する

### 6-6. ダッシュボード

- [ ] コール履歴が表示される
- [ ] リアルタイムでステータスが更新される
- [ ] 統計サマリーが正しく表示される

### 6-7. メール機能（SMTP使用時）

- [ ] ユーザー登録時の確認メールが送信される
- [ ] パスワードリセットメールが送信される

---

## トラブルシューティング

### Vercelでページが500エラー

- `NEXT_PUBLIC_BACKEND_URL_PROD` が未設定の可能性
- Vercelのログで `NEXT_PUBLIC_BACKEND_URL_PROD is not configured` が出ていないか確認
- 環境変数設定後、再デプロイが必要

### RenderでMongoDB接続エラー

- `MONGODB_URI` の接続文字列を確認（ユーザー名・パスワード・DB名）
- MongoDB AtlasのNetwork AccessにRenderのIPが追加されているか確認

### Twilio Webhook が届かない

- Twilioコンソールの Voice Webhook URL がRenderのURLになっているか確認
- RenderのURLが `https://` で始まっているか確認
- Renderのサービスが起動しているか確認（無料プランはスリープする）

### WebSocket / リアルタイム更新が動かない

- `NEXT_PUBLIC_SOCKET_URL` がRenderのURLに設定されているか確認
- Renderがwebsocket接続を許可しているか確認

### CORSエラー

- Renderの `FRONTEND_URL` / `FRONTEND_URL_PROD` がVercelのURLと一致しているか確認
- URLの末尾にスラッシュ `/` が付いていないか確認（付けない）

---

## 環境変数クイックリファレンス

すべての `<app>` を実際のクライアントURLに置き換えてください。

```
# === Render (Backend) ===
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
FRONTEND_URL=https://<frontend>.vercel.app
FRONTEND_URL_PROD=https://<frontend>.vercel.app
BASE_URL=https://<backend>.onrender.com
BASE_URL_PROD=https://<backend>.onrender.com
WEBHOOK_BASE_URL_PROD=https://<backend>.onrender.com
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
TWILIO_PHONE_NUMBER=<number>
TWILIO_PHONE_NUMBER_PROD=<number>
OPENAI_API_KEY=<key>
COE_FONT_KEY=<key>
COE_FONT_CLIENT_SECRET=<secret>
COEFONT_VOICE_ID=<voice-id>

# === Vercel (Frontend) ===
NEXT_PUBLIC_BACKEND_URL=https://<backend>.onrender.com
NEXT_PUBLIC_BACKEND_URL_PROD=https://<backend>.onrender.com
NEXT_PUBLIC_API_URL_PROD=https://<backend>.onrender.com
NEXT_PUBLIC_WS_URL_PROD=wss://<backend>.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://<backend>.onrender.com
NEXT_PUBLIC_APP_URL=https://<frontend>.vercel.app
```
