# 開発環境の起動方法

## 🚀 推奨：一括起動（簡単）

プロジェクトルートで以下のコマンドを実行：

```bash
./start-dev.sh
```

これで両方のサーバーが自動的に起動します。

## 📝 個別起動（手動）

### ターミナル1: バックエンド

```bash
cd backend
npm run dev
```

- **URL**: http://localhost:5001
- **ポート**: 5001
- **MongoDB**: ローカルのMongoDBが必要

### ターミナル2: フロントエンド

**別のターミナルウィンドウ/タブを開いて**：

```bash
cd frontend
npm run dev
```

- **URL**: http://localhost:3000
- **ポート**: 3000

## ⚠️ 注意事項

1. **必ず別々のターミナルで実行してください**
2. バックエンドを先に起動することを推奨
3. MongoDBが起動していることを確認

## 🔧 トラブルシューティング

### ポートが使用中の場合

```bash
# ポート5001を解放
lsof -ti:5001 | xargs kill -9

# ポート3000を解放
lsof -ti:3000 | xargs kill -9
```

### すべてのNode.jsプロセスを終了

```bash
pkill -f node
```

## 📱 アクセスURL

- **フロントエンド**: http://localhost:3000
- **バックエンドAPI**: http://localhost:5001
- **管理者ログイン**:
  - Email: `admin@example.com`
  - Password: `password123`