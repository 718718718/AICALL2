# ローカル環境セットアップガイド

このドキュメントでは、本アプリケーションをローカル環境で起動する手順を説明します。

## 前提条件

以下のソフトウェアがインストールされている必要があります：

- Node.js (v18以上推奨)
- npm または pnpm
- MongoDB (ローカルまたはクラウドサービス)

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone [リポジトリURL]
cd PJ_AI-
```

### 2. バックエンドのセットアップ

#### 2.1 依存関係のインストール

```bash
cd backend
npm install
```

#### 2.2 環境変数の設定

`.env.example`ファイルをコピーして`.env`ファイルを作成します：

```bash
cp .env.example .env
```

`.env`ファイルを編集して、以下の環境変数を設定します：

```
MONGODB_URI=mongodb://localhost:27017/call_system
JWT_SECRET=your_jwt_secret_key_here
PORT=3000
```

**注意**: `JWT_SECRET`は本番環境では安全なランダムな文字列に変更してください。

#### 2.3 MongoDBの起動

ローカルでMongoDBを使用する場合：

```bash
mongod
```

または、MongoDB Atlasなどのクラウドサービスを使用する場合は、接続文字列を`MONGODB_URI`に設定してください。

#### 2.4 バックエンドサーバーの起動

開発モード（自動リロード付き）：

```bash
npm run dev
```

本番モード：

```bash
npm start
```

バックエンドサーバーは`http://localhost:3000`で起動します。

### 3. フロントエンドのセットアップ

新しいターミナルウィンドウを開いて以下を実行：

#### 3.1 依存関係のインストール

```bash
cd frontend
npm install
```

または pnpm を使用する場合：

```bash
pnpm install
```

#### 3.2 環境変数の設定

`.env.example`ファイルをコピーして`.env.local`ファイルを作成します：

```bash
cp .env.example .env.local
```

`.env.local`ファイルを編集して、以下の環境変数を設定します：

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
```

#### 3.3 フロントエンドサーバーの起動

開発モード：

```bash
npm run dev
```

フロントエンドサーバーは`http://localhost:3000`（Next.jsのデフォルトポート）で起動します。

**注意**: バックエンドと同じポートを使用する場合、Next.jsは自動的に別のポート（通常は3001）を使用します。

### 4. アプリケーションへのアクセス

ブラウザで以下のURLにアクセスします：

- フロントエンド: `http://localhost:3000`（または`http://localhost:3001`）
- バックエンドAPI: `http://localhost:3000`

## 利用可能なスクリプト

### バックエンド

- `npm start` - 本番モードでサーバーを起動
- `npm run dev` - 開発モード（nodemon使用）でサーバーを起動
- `npm test` - テストを実行（未実装）

### フロントエンド

- `npm run dev` - 開発サーバーを起動
- `npm run build` - 本番用ビルドを作成
- `npm start` - 本番モードでサーバーを起動
- `npm run lint` - ESLintでコードをチェック

## トラブルシューティング

### ポートが既に使用されている場合

```bash
# 使用中のポートを確認（Mac/Linux）
lsof -i :3000

# プロセスを終了
kill -9 [PID]
```

### MongoDBに接続できない場合

1. MongoDBサービスが起動していることを確認
2. 接続文字列が正しいことを確認
3. ファイアウォール設定を確認

### 依存関係のインストールでエラーが発生する場合

```bash
# node_modulesとlockファイルを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

## 開発のヒント

1. **同時起動**: 両方のサーバーを同時に起動するには、2つのターミナルウィンドウを使用するか、`concurrently`などのツールを使用します。

2. **APIテスト**: PostmanやcURLを使用してバックエンドAPIを直接テストできます。

3. **デバッグ**: Node.jsのデバッグ機能を使用するには、`--inspect`フラグを追加します：
   ```bash
   node --inspect server.js
   ```

4. **ホットリロード**: フロントエンドは自動的にホットリロードが有効になっています。バックエンドでは`nodemon`が使用されています。

## その他の情報

- バックエンドはExpress.jsフレームワークを使用
- フロントエンドはNext.js 15とReact 19を使用
- データベースはMongoDBとMongooseを使用
- 認証にはJWT（JSON Web Token）を使用
- UIコンポーネントはRadix UIとTailwind CSSを使用