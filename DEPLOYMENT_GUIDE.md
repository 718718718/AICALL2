# デプロイ手順書

## 概要
このガイドでは、AI電話システムを本番環境にデプロイする手順を説明します。
ngrokの動的URL問題を解決するため、静的URLを持つクラウドサービスを使用します。

## 必要なアカウント
1. **MongoDB Atlas** (無料プラン利用可能)
2. **Render** (バックエンド用、無料プラン利用可能)
3. **Vercel** (フロントエンド用、無料プラン利用可能)
4. **Twilio** (既に取得済み)

---

## 1. MongoDB Atlasのセットアップ

### 1.1 アカウント作成とクラスター作成
1. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)にアクセス
2. 無料アカウントを作成
3. 新しいクラスターを作成（M0 Sandbox - 無料）
4. リージョンを選択（東京推奨）

### 1.2 データベースユーザー作成
1. Database Access > Add New Database User
2. ユーザー名とパスワードを設定
3. 権限は「Read and write to any database」を選択

### 1.3 ネットワークアクセス設定
1. Network Access > Add IP Address
2. 「Allow Access from Anywhere」を選択（0.0.0.0/0）
   - 本番環境では、Renderの固定IPを設定することを推奨

### 1.4 接続文字列の取得
1. Clusters > Connect > Connect your application
2. 接続文字列をコピー：
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/<database>?retryWrites=true&w=majority
   ```
3. `<username>`, `<password>`, `<database>`を実際の値に置き換え

---

## 2. バックエンドのデプロイ (Render)

### 2.1 GitHubリポジトリの準備
```bash
git add .
git commit -m "Add deployment configuration"
git push origin main
```

### 2.2 Renderでのセットアップ
1. [Render](https://render.com)にサインアップ
2. Dashboard > New > Web Service
3. GitHubリポジトリを接続
4. 以下の設定を入力：
   - **Name**: ai-call-backend
   - **Root Directory**: backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 2.3 環境変数の設定
Renderダッシュボードで以下の環境変数を追加：

```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/call_system?retryWrites=true&w=majority
JWT_SECRET=[安全なランダム文字列を生成]
PORT=5000
TWILIO_ACCOUNT_SID=[TwilioコンソールからACで始まるSIDを取得]
TWILIO_AUTH_TOKEN=[Twilioコンソールから認証トークンを取得]
TWILIO_PHONE_NUMBER=[Twilioで購入した電話番号]
NGROK_URL=[デプロイ後にRenderのURLに更新]
OPENAI_REALTIME_API_KEY=[OpenAI APIキー]
CARTESIA_API_KEY=[Cartesia APIキー - https://cartesia.ai から取得]
```

> **注意**: `CARTESIA_VOICE_ID` と `CARTESIA_MODEL_ID` は省略可能です（デフォルト値あり）。

### 2.4 デプロイ
1. 「Create Web Service」をクリック
2. デプロイが完了するまで待機（約5-10分）
3. デプロイ完了後、URLをコピー（例：https://ai-call-backend.onrender.com）

---

## 3. フロントエンドのデプロイ (Vercel)

### 3.1 Vercelアカウント作成
1. [Vercel](https://vercel.com)にサインアップ
2. GitHubアカウントと連携

### 3.2 プロジェクトのインポート
1. Dashboard > Add New > Project
2. GitHubリポジトリをインポート
3. 以下の設定を行う：
   - **Framework Preset**: Next.js
   - **Root Directory**: frontend
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### 3.3 環境変数の設定
プロジェクト設定で以下の環境変数を追加：

```
NEXT_PUBLIC_BACKEND_URL=https://ai-call-backend.onrender.com
BACKEND_URL=https://ai-call-backend.onrender.com
```

### 3.4 デプロイ
1. 「Deploy」をクリック
2. デプロイ完了後、URLをコピー（例：https://your-app.vercel.app）

---

## 4. Twilioの設定更新

### 4.1 Webhook URLの更新
1. Twilio Console > Phone Numbers > Manage > Active Numbers
2. 使用している電話番号をクリック
3. Voice & Fax セクションで以下を設定：
   - **A CALL COMES IN**: 
     - Webhook: `https://ai-call-backend.onrender.com/api/twilio/voice`
     - HTTP Method: POST
   - **CALL STATUS CHANGES**:
     - Webhook: `https://ai-call-backend.onrender.com/api/twilio/status`
     - HTTP Method: POST

### 4.2 バックエンドの環境変数更新
1. Renderダッシュボードに戻る
2. Environment > NGROK_URLを以下に更新：
   ```
   NGROK_URL=https://ai-call-backend.onrender.com
   ```
3. サービスが自動的に再デプロイされる

---

## 5. 動作確認

### 5.1 システムチェック
1. フロントエンドURL（Vercel）にアクセス
2. 管理画面にログイン
3. 各機能を確認：
   - エージェント設定
   - コールモニター
   - レポート機能

### 5.2 通話テスト
1. Twilioの電話番号に電話をかける
2. 音声応答が正常に動作することを確認
3. フロントエンドのコールモニターでリアルタイム更新を確認

---

## 6. トラブルシューティング

### Renderのスリープ問題（無料プラン）
- 無料プランでは15分間アクセスがないとスリープ状態になります
- 解決策：
  1. UptimeRobotなどで5分おきにping送信
  2. 有料プラン（$7/月）にアップグレード

### CORS エラー
バックエンドのCORS設定を確認：
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://your-app.vercel.app',
  credentials: true
}));
```

### MongoDB接続エラー
- IP Whitelistの設定を確認
- 接続文字列のユーザー名/パスワードを確認
- クラスターがアクティブか確認

---

## 7. 本番環境のセキュリティ設定

### 推奨事項
1. **JWT_SECRET**: 強力なランダム文字列を使用
2. **MongoDB**: IPホワイトリストを設定
3. **HTTPS**: 常に使用（Render/Vercelは自動設定）
4. **環境変数**: 絶対にコードにハードコーディングしない
5. **Twilio認証**: Webhook署名の検証を実装

### 監視とログ
1. Renderのログを定期的に確認
2. MongoDBのパフォーマンスメトリクスを監視
3. Vercelのアナリティクスを活用

---

## デプロイ完了チェックリスト

- [ ] MongoDB Atlasのセットアップ完了
- [ ] バックエンドがRenderにデプロイ済み
- [ ] フロントエンドがVercelにデプロイ済み
- [ ] Twilioのwebhook URLが更新済み
- [ ] 通話テスト成功
- [ ] フロントエンドから管理機能にアクセス可能
- [ ] リアルタイム通信（Socket.io）が動作

## サポート

問題が発生した場合は、各サービスのドキュメントを参照してください：
- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Twilio Documentation](https://www.twilio.com/docs)