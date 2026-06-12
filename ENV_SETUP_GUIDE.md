# 環境設定ガイド

## 概要
このプロジェクトは開発環境とプロダクション環境で異なる設定を自動的に使い分けます。

## ファイル構成
```
backend/
├── .env                    # 共通設定（Gitにコミット済み）
├── .env.local             # 開発専用設定（Gitで無視）
├── .env.example           # 設定例（Gitにコミット）
└── .env.production.template # 本番設定例（Gitにコミット）
```

## セットアップ手順

### 1. 初回セットアップ（新しい開発者）
```bash
# 1. リポジトリクローン後
cd backend

# 2. 開発用設定ファイル作成
cp .env.local.example .env.local  # （まだ存在しない場合）

# 3. 必要に応じて .env.local を編集
# - NGROK_URL を自分のngrok URLに変更
# - その他の開発固有の設定
```

### 2. 開発環境での作業
```bash
# 開発環境で起動
npm run dev
# または
NODE_ENV=development npm start

# 設定優先順位:
# 1. .env.local (開発専用、Gitで無視)
# 2. .env (共通設定)
```

### 3. 本番環境デプロイ
```bash
# mainブランチへマージ
git checkout main
git merge your-feature-branch

# Render.comで以下の環境変数を設定:
NODE_ENV=production
MONGODB_URI=your_production_mongodb
TWILIO_ACCOUNT_SID=your_twilio_sid
OPENAI_REALTIME_API_KEY=your_openai_key
CARTESIA_API_KEY=your_cartesia_key
# ... その他必要な環境変数
```

## 環境変数の使い分け

### 開発環境での設定
- **ngrok URL**: 個人のngrok URL
- **データベース**: 開発用MongoDB
- **フロントエンドURL**: localhost:3000

### 本番環境での設定
- **Render URL**: デプロイ先のURL
- **データベース**: 本番MongoDB Atlas
- **フロントエンドURL**: Vercel URL

## トラブルシューティング

### Q: 開発中にローカル設定を変更したい
A: `.env.local` ファイルを編集してください。このファイルはGitで管理されません。

### Q: 本番環境用の設定を確認したい
A: `.env.production.template` ファイルを参考にしてください。

### Q: 設定が反映されない
A: 設定の優先順位を確認してください：
1. 環境変数 (最優先)
2. .env.local (開発のみ)
3. .env (共通)

## 注意事項
- `.env.local` は絶対にGitにコミットしないでください
- 本番環境の秘密情報は Render.com の環境変数で設定してください
- 新しい環境変数を追加した場合は `.env.example` も更新してください