# AI Call System - 起動手順

## 🚀 クイックスタート

```bash
# システムを起動
./start-system.sh

# システムを停止
./stop-system.sh
```

## 📋 システム要件

- Node.js 18以上
- ngrok インストール済み
- MongoDB Atlas アカウント（.envで設定済み）
- Twilio アカウント（.envで設定済み）

## 🔧 起動プロセスの詳細

### 1. start-system.sh が実行する処理

1. **既存プロセスのクリーンアップ**
   - ポート 5001, 3000, 3001, 3002 を使用中のプロセスを終了
   - 前回の異常終了プロセスをクリア

2. **ngrok トンネルの確立**
   - ngrok が起動していない場合は自動起動
   - ポート 5001 をインターネットに公開

3. **Twilio Webhook の自動設定**
   - ngrok URLを取得
   - Twilio のWebhook URLを自動更新
   - .env ファイルのNGROK_URLを更新

4. **バックエンドサーバーの起動**
   - ポート 5001 で Express サーバーを起動
   - WebSocket サーバーも同時に初期化
   - nodemon で自動リロード有効

5. **フロントエンドサーバーの起動**
   - 利用可能なポート（3000, 3001, 3002）で起動
   - Next.js 開発サーバーを起動
   - 実際のポートを検出して表示

## 🔍 ポート使用状況

| サービス | ポート | 説明 |
|---------|--------|------|
| バックエンド | 5001 | Express API + WebSocket |
| フロントエンド | 3000-3002 | Next.js（利用可能なポートを自動選択） |
| ngrok 管理画面 | 4040 | ngrok ステータス確認用 |

## 📝 環境設定ファイル

### backend/.env
```env
# MongoDB接続
MONGODB_URI=your_mongodb_uri

# サーバー設定
PORT=5001
NODE_ENV=development

# Twilio設定
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number

# ngrok URL（自動更新される）
NGROK_URL=https://xxxxx.ngrok-free.app
BASE_URL=https://xxxxx.ngrok-free.app

# CoeFont設定
COE_FONT_KEY=your_key
COE_FONT_CLIENT_SECRET=your_secret
COEFONT_VOICE_ID=your_voice_id
```

### frontend/.env.local
```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:5001
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001

# WebSocket URL  
NEXT_PUBLIC_WS_URL=ws://localhost:5001
NEXT_PUBLIC_SOCKET_URL=http://localhost:5001
```

## 🛠️ トラブルシューティング

### ポートが既に使用されている場合
```bash
# 手動でポートを解放
lsof -ti:5001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### ngrok が起動しない場合
```bash
# ngrokを手動で起動
ngrok http 5001

# 別ターミナルで
node backend/setup-ngrok-twilio.js
```

### WebSocket接続エラーの場合
1. バックエンドが5001ポートで起動していることを確認
2. フロントエンドのポートが正しく設定されているか確認
3. CORSエラーの場合はserver.jsのCORS設定を確認

### 電話がつながらない場合
1. ngrok URLが正しくTwilioに設定されているか確認
2. Twilioの電話番号設定でWebhook URLを確認：
   - Voice URL: `https://xxxxx.ngrok-free.app/api/twilio/voice`
   - Status Callback URL: `https://xxxxx.ngrok-free.app/api/twilio/status`

## 📞 デフォルトログイン情報

- Email: `admin@example.com`
- Password: `password123`

## 🔄 開発中の注意点

1. **CoeFont音声合成**: 常にCoeFontを使用（Pollyに変更しない）
2. **電話番号形式**: 国際形式（+81）と国内形式（0XX）の両方に対応
3. **WebSocket通信**: To番号（発信先）を使用してイベント送信
4. **初期応答時間**: 最大3秒以内にAIが話し始める

## 📌 重要な仕様

- 電話接続後、3秒以内にAIが名乗りを開始
- 顧客の発話を待ち、複数回の対話が可能
- 取次ボタンで通話中にオペレーターへ転送可能
- 全ての会話内容が日本語でログ出力される