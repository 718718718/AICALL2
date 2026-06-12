# Vercel API ルーティング実装ルール

## 問題の背景

2025年9月18日に発生した `DNS_HOSTNAME_RESOLVED_PRIVATE` エラーの根本原因と対策をまとめる。

## 発生した問題

### エラー詳細
- **エラーコード**: `DNS_HOSTNAME_RESOLVED_PRIVATE`
- **発生場所**: Vercel（フロントエンド）から Render（バックエンド）への API 接続
- **影響範囲**: 顧客詳細、ステータス更新、通話履歴、顧客更新・削除機能

### 具体的な症状
```javascript
// これらのエンドポイントで 404 エラーが発生
/api/customers/[id]
/api/customers/[id]/call-history
```

## 根本原因

### 1. Vercel Edge Runtime の制限
- Vercel の Edge Runtime では外部サービス（Render）への接続に制限がある
- `DNS_HOSTNAME_RESOLVED_PRIVATE` エラーは接続がブロックされることを示す

### 2. APIルートの分散
- 個別の動的ルート `/api/customers/[id]/` を使用していた
- これらが Edge Runtime で実行され、外部接続が失敗

## 解決策

### 1. API エンドポイントの統合
動作している `/api/customers` エンドポイントに全ての機能を集約：

```javascript
// 統合前（問題あり）
/api/customers/[id]                    // 404
/api/customers/[id]/call-history       // 404

// 統合後（解決）
/api/customers?id={customerId}                        // ✅
/api/customers?id={customerId}&call-history=true      // ✅
```

### 2. Node.js Runtime の明示的指定
```javascript
// API ルートファイルに追加
export const runtime = 'nodejs'
```

## 実装ルール

### ✅ 推奨パターン

1. **既存の動作するエンドポイントを拡張**
   ```javascript
   // /api/customers/route.ts
   const url = new URL(request.url)
   const customerId = url.searchParams.get('id')
   const action = url.searchParams.get('action')
   ```

2. **クエリパラメータでの機能分岐**
   ```javascript
   // 顧客詳細取得
   /api/customers?id=123
   
   // 通話履歴取得
   /api/customers?id=123&call-history=true
   
   // ステータス更新
   /api/customers?id=123 (PATCH)
   ```

3. **Node.js Runtime の使用**
   ```javascript
   export const runtime = 'nodejs'  // Edge Runtime を回避
   ```

### ❌ 避けるべきパターン

1. **動的ルートの乱用**
   ```javascript
   // 避ける：多数の動的ルートファイル
   /api/customers/[id]/route.ts
   /api/customers/[id]/call-history/route.ts
   /api/customers/[id]/update/route.ts
   ```

2. **Edge Runtime での外部API呼び出し**
   ```javascript
   // 避ける：Edge Runtime（デフォルト）で外部API
   export async function GET() {
     await fetch('https://external-api.com')  // 失敗する可能性
   }
   ```

## 検証方法

### 1. 本番環境でのテスト
```bash
# 正常なエンドポイント
curl https://your-app.vercel.app/api/customers

# 新しい個別顧客取得
curl https://your-app.vercel.app/api/customers?id=123
```

### 2. エラーログの確認
- Vercel ログで `DNS_HOSTNAME_RESOLVED_PRIVATE` エラーを監視
- バックエンドログで認証リクエストの到達を確認

## 今後の開発指針

### 1. API設計の原則
- **集約化**: 関連機能は単一エンドポイントに集約
- **パラメータ化**: クエリパラメータで機能を分岐
- **Runtime明示**: 外部API呼び出しには `nodejs` runtime を指定

### 2. 新機能追加時のチェックリスト
- [ ] 既存のAPIエンドポイントを拡張できるか検討
- [ ] 新しい動的ルートが本当に必要か確認
- [ ] Node.js Runtime を明示的に指定
- [ ] 本番環境での接続テストを実施

### 3. 定期的な監視
- Vercel ログでの接続エラー監視
- バックエンドでのAPIアクセスパターン分析

## まとめ

この問題は Vercel の制限に起因するものであり、適切なAPI設計とRuntime指定により回避可能。今後は既存エンドポイントの拡張を優先し、動的ルートの新規作成は慎重に判断する。