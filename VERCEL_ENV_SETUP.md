# Vercel環境変数設定ガイド

## 必要な環境変数

Vercelのダッシュボードで以下の環境変数を設定してください：

### 1. Vercelダッシュボードにアクセス
- https://vercel.com にログイン
- プロジェクト「pj-ai-2t27」を選択
- Settings → Environment Variables に移動

### 2. 以下の環境変数を追加

```
NEXT_PUBLIC_APP_URL=https://pj-ai-2t27-olw2j2em4-kofsakus-projects.vercel.app
TWILIO_ACCOUNT_SID=[あなたのTwilio Account SID]
TWILIO_AUTH_TOKEN=[あなたのTwilio Auth Token]
TWILIO_PHONE_NUMBER=[あなたのTwilio電話番号]
OPENAI_API_KEY=[あなたのOpenAI APIキー]
```

### 3. 環境変数の適用
- Production、Preview、Developmentすべてに適用することを推奨
- 保存後、再デプロイが必要

### 4. 再デプロイ
- Deploymentsタブから最新のデプロイメントを選択
- 「Redeploy」ボタンをクリック
- 「Use existing Build Cache」のチェックを外す（環境変数を反映させるため）

## 確認方法

デプロイ後、以下を確認：
1. Twilioコンソールでエラーログを確認
2. Vercelのログで環境変数が正しく読み込まれているか確認
3. ブラウザの開発者ツールでネットワークリクエストを確認

## トラブルシューティング

### URLにundefinedが含まれる場合
- 環境変数`NEXT_PUBLIC_APP_URL`が正しく設定されているか確認
- 再デプロイ時にキャッシュをクリアしたか確認

### 通話がすぐ切れる場合
- Twilioのwebhook URLが正しく設定されているか確認
- APIエンドポイントが405エラーを返していないか確認