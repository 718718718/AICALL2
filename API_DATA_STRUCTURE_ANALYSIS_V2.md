# API データ構造不一致分析 レポート (V2)
作成日: 2025-09-20

## 要約
- `/api/calls/bulk` のレスポンスに `results` フィールドが存在せず、`frontend/app/dashboard/page.tsx` が `result.results` を参照するため実行時エラーが発生する (frontend/app/dashboard/page.tsx:431, frontend/app/api/calls/bulk/route.ts:450)。
- Next.js の `app/api` 直下に 34 件の `route.ts` がありながら、「35個」と記載されているほか、Express 側の API 群は範囲に含まれておらず調査済みと誤解される (API_DATA_STRUCTURE_ANALYSIS.md:25)。
- `frontend/app/api/customers/import/route.ts` は入力配列の存在チェック以外にフィールド検証や型安全がなく、不正行データ投入時のエラーメッセージ統一ができていない (frontend/app/api/customers/import/route.ts:38-120)。
- 同一機能が Next.js API と Express(API) の二重実装になっており、型やレスポンス形式が揃わないまま放置されているため、今後の修正が分散するリスクが高い (frontend/app/api/customers/route.ts, backend/routes/customers.js 等)。

## 調査範囲
### Next.js (app/api)
- `find frontend/app/api -name 'route.ts'` で 34 件を確認。
- 重点調査対象: `/api/calls/bulk`, `/api/customers/import`, `/api/call-history`, `/api/users/sales-pitch`。
- 他 30 件はレスポンス構造・スキーマ整合の網羅的な検証が未着手。

### Express Backend (`backend/`)
- `server.js` からマウントされる主ルート: `authRoutes`, `userRoutes`, `companyRoutes`, `customers.js`, `bulkCallRoutes.js`, `callHistoryRoutes.js` など。
- ルーター単位でのレスポンス整形・型整合レビューは未完了。Next.js API 側と重複する領域が多数存在。

## 詳細な主要問題
### 1. Bulk calls API レスポンスギャップ
- 呼び出し元: `frontend/app/dashboard/page.tsx:431` で `result.results || []` を参照。実際のレスポンスには `sessions` のみが存在。
- Next.js API: `frontend/app/api/calls/bulk/route.ts:450-463` で `success/message/sessionIds/sessions` を返却、`results` は未定義。
- Express API: `backend/controllers/bulkCallController.js` でも `results` は返却せず、キー名称 (`message`, `sessions`) が異なる。
- 対応指針: (a) フロントエンドを `result.sessions` 参照に変更し UI で表示フォーマットを調整、または (b) API 側で `results` を `sessions` からマッピングして返却。どちらを正とするかを決定するため責務境界を定義する。

### 2. Customers import API 検証不足
- `frontend/app/api/customers/import/route.ts` は `customers` 配列の存在のみ確認し、各レコードの必須項目・型はデフォルト値で補完するだけで、検証エラーを呼び出し元に返さない。
- CSV 由来の欠落フィールドや型不一致時にサイレント補完され、誤った値が DB に保存される危険がある。
- 推奨対応: Zod などのスキーマバリデーション導入、CSV 解析時のフィールドマッピング共有、エラー応答の `{ success: false, errors: [...] }` 形式統一。

### 3. ID フィールドの不統一
- 呼び出し側は `_id` と `id` の両方を考慮 (`frontend/app/dashboard/page.tsx:365-375`)。API 側で `_id` を `id` に正規化して返す方針が未確定。
- `frontend/app/api/call-history/route.ts` では `id` を付与する整形が追加済みだが、他エンドポイントとの整合が取れていない。
- 推奨対応: 全 API レイヤーでレスポンス整形ユーティリティを共有し、`id` をフロント向け統一キーとする。

### 4. API 実装の二重管理リスク
- Next.js API (`frontend/app/api/customers/route.ts` ほか) と Express (`backend/routes/customers.js`) が同等機能を別実装しており、どちらが正式経路か不明。
- バリデーション・レスポンス形式がファイルごとに異なるため、仕様変更時に修正漏れが生じる。
- 推奨対応: どちらを一次 API とするか決定し、もう一方はプロキシ化 or 撤廃。移行期間中は共通 DTO/レスポンスフォーマットを共有する。

## 未調査・追加確認事項
- Twilio 関連 (`/api/twilio/*`) や WebSocket 系 (`/api/websocket`) のレスポンス整形と型整合は未検証。
- 既知問題として「修正済み」と記載されたエンドポイントについて、ステージング/本番へのデプロイ完了証跡・回帰テスト結果が整理されていない。
- Next.js API が直接 MongoDB に接続している箇所で環境変数/接続ライフサイクルの一貫性が未確認。

## 推奨修正計画
1. **即時対応 (今週内)**
   - `/api/calls/bulk` レスポンスと `dashboard` 側の扱いを統一。
   - `customers/import` にスキーマ検証とエラーレスポンス定義を追加。
2. **短期 (2 週間以内)**
   - `_id` → `id` 正規化ユーティリティを作成し、Next.js API 全体に適用。
   - Express/Next.js の重複エンドポイントを比較し、一次系の選定方針を決定。
3. **中期 (1 ヶ月以内)**
   - 主要エンドポイントに対するレスポンススキーマカタログを作成し、型定義を共有 (TypeScript 型 or JSON Schema)。
   - バリデーション/エラーハンドリングポリシーを統一し、共通ライブラリ化。

## 参考コマンド
```bash
find frontend/app/api -name 'route.ts' | wc -l
```
