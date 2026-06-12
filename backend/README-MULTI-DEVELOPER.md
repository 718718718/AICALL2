# マルチ開発者環境セットアップガイド

## 問題の背景
現在のシステムでは、複数の開発者が同時に開発すると以下の問題が発生します：
- TwilioのWebhook URLが競合する（最後に起動した人のURLで上書きされる）
- 同じポートを使用するため、同じマシンで複数の環境を起動できない
- データベースが競合する可能性がある

## 解決策

### 方法1: 開発者ごとに別のTwilio電話番号を使用（推奨）

各開発者が独自のTwilio電話番号を持つことで、Webhook URLの競合を防ぎます。

#### セットアップ手順

1. **Twilioで開発者用の電話番号を購入**
   ```bash
   # Twilio CLIを使用
   twilio phone-numbers:buy:local --country-code US --area-code 607
   ```

2. **開発者環境をセットアップ**
   ```bash
   cd backend
   node setup-developer-env.js
   # プロンプトで開発者名を入力
   ```

3. **環境変数を設定**
   `.env.local`ファイルが自動生成されます：
   ```env
   DEVELOPER_NAME=kt
   PORT=5001
   MONGODB_URI=mongodb://localhost:27017/ai-agent
   TWILIO_PHONE_NUMBER=+16076956082
   FRONTEND_URL=http://localhost:3001
   ```

4. **開発環境を起動**
   ```bash
   ./start-kt.sh  # 開発者名に応じたスクリプトが生成される
   ```

### 方法2: ローカルモックサーバーを使用（Twilio不要）

開発時はTwilioを使わず、ローカルのモックサーバーで電話機能をシミュレートします。

```bash
# モックモードで起動
MOCK_TWILIO=true npm run dev
```

### 方法3: 開発者キューシステム

Twilioの電話番号を共有し、使用権をキューで管理します。

```bash
# 使用権を取得
curl -X POST http://localhost:5001/api/dev/acquire-twilio

# 使用権を解放
curl -X POST http://localhost:5001/api/dev/release-twilio
```

## 設定ファイルの構成

### backend/config/multi-developer.js
```javascript
const DEVELOPER_CONFIGS = {
  kt: {
    twilioNumber: '+16076956082',
    mongoDbName: 'ai-agent',
    backendPort: 5001,
    frontendPort: 3001
  },
  // 他の開発者の設定を追加
};
```

## ポート割り当て表

| 開発者 | Backend | Frontend | ngrok | MongoDB Database |
|--------|---------|----------|-------|-----------------|
| kt     | 5001    | 3001     | 4040  | ai-agent        |
| dev2   | 5002    | 3002     | 4041  | ai-agent-dev2   |
| dev3   | 5003    | 3003     | 4042  | ai-agent-dev3   |
| test   | 5099    | 3099     | 4099  | ai-agent-test   |

## トラブルシューティング

### ポートが既に使用されている場合
```bash
# ポートを使用しているプロセスを確認
lsof -i :5001

# プロセスを終了
kill -9 [PID]
```

### Twilioの設定が反映されない場合
```bash
# Twilio設定を手動で更新
node setup-ngrok-twilio.js
```

### MongoDBの接続エラー
```bash
# MongoDB接続を確認
mongosh mongodb://localhost:27017/ai-agent
```

## ベストプラクティス

1. **開発者名を明確にする**
   - GitのユーザーIDやイニシャルを使用
   - 例: `kt`, `john`, `dev-sarah`

2. **環境変数は.env.localに保存**
   - `.env`はテンプレートとして使用
   - `.env.local`は`.gitignore`に追加

3. **定期的な同期**
   - 本番環境の設定と定期的に同期
   - 共有設定は`.env.example`で管理

4. **リソースの解放**
   - 開発終了時は必ず環境を停止
   - `./stop-system.sh`を実行

## CI/CD環境での対応

GitHub ActionsやJenkinsなどのCI環境では、専用のTwilio番号とテスト用DBを使用：

```yaml
# .github/workflows/test.yml
env:
  DEVELOPER_NAME: ci
  TWILIO_PHONE_NUMBER: ${{ secrets.CI_TWILIO_NUMBER }}
  MONGODB_URI: mongodb://localhost:27017/ai-agent-ci
```

## まとめ

複数の開発者が同時に開発する場合は、**方法1（開発者ごとのTwilio番号）**が最も確実です。
コストを抑えたい場合は、**方法2（モックサーバー）**を併用することをお勧めします。