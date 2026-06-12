# リファクタリングロードマップ

## 方針
- 既存機能の挙動を変えないことを最優先し、インターフェースやAPIレスポンスを一切変更しない
- プルリク単位で小さく進め、変更範囲ごとにロールバック容易な構成にする
- 作業前後で主要ユースケース（顧客 CRUD、発信/着信、ハンドオフ、WebSocket 更新）を手動確認

## 優先度サマリ
| ID | 領域 | ゴール | 期待効果 | 影響度 | 優先度 |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Frontend API ルート | 共通ヘルパーでベース URL・ヘッダー処理を一元化 | バグ混入防止 / コード量削減 | 中 | 高 |
| FR-02 | Frontend 設定値 | API ルートと UI の ENV 参照を `lib/config` に統一 | 環境変数の齟齬防止 | 中 | 中 |
| FR-03 | Backend Twilio URL | Twilio コールバック URL 生成をユーティリティ化 | 変更漏れ防止 / 仕様明確化 | 中 | 中 |
| FR-04 | CORS & Socket 設定 | CORS 許可ドメインを単一モジュールで管理 | セキュリティ / 保守性向上 | 低 | 中 |

---

## FR-01: Frontend API ルートの共通化
**現状**
- `frontend/app/api/admin/users/route.ts:7-113` や `frontend/app/api/customers/route.ts:1-170` など、多数の API ルートで
  - ベース URL 判定 (`process.env.NEXT_PUBLIC_API_URL` / `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL`) が重複
  - エラーハンドリングやヘッダー付与ロジックがコピー&ペーストされている
- ENV の使い分けがルートごとに異なり、Vercel 上での接続先ミスが起きやすい

**改善案**
1. `frontend/lib/serverApi.ts`（仮）を新設し、以下を提供
   - `resolveBackendUrl()`：サーバー環境変数から単一のベース URL を決定
   - `forwardJson<T>()`：fetch をラップし、Authorization など共通ヘッダーを合成
2. 既存 API ルートを段階的にヘルパー利用へ置き換え（1 ルートずつ PR を切る）
3. ログ出力は `debug` フラグで制御し、通常は抑制（本番のログノイズ削減）

**実装ステップ**
1. `lib/serverEnv.ts` を作成し、`BACKEND_URL` 系 ENV を単一メソッドで参照
2. `serverApi.ts` で `forwardJson` / `forwardStream` / `forwardForm` など現状用途に合わせたヘルパーを定義
3. 代表的なルート（例: `app/api/customers/route.ts`）から移行 → レビュー通過後、他ルートに横展開
4. 変換後もレスポンス構造・ステータスコードは変えないことを確認

**テスト**
- Next.js Dev サーバーを起動し、全 API ルートについて 200/4xxケースを手動確認
- `curl` で Vercel 上の Preview デプロイにアクセスし、`DNS_HOSTNAME_RESOLVED_PRIVATE` が再発しないことを確認

---

## FR-02: Frontend 設定値の一本化
**現状**
- UI 側は `frontend/lib/config.ts:1-27` で `NEXT_PUBLIC_*` を集約する一方、App Router API は直接 `process.env` を参照
- `NEXT_PUBLIC_API_URL`・`NEXT_PUBLIC_BACKEND_URL`・`BACKEND_URL` が場面ごとに使い分けられ、設定ミスの要因

**改善案**
1. `lib/config.ts` を拡張し、サーバーサイド専用の `server.api.baseUrl` を追加
2. App Router API は `import { serverConfig } from '@/lib/config'` などで共通値を参照
3. 既存の `process.env.*` 直参照を段階的に削除

**実装ステップ**
1. `config.ts` に `export const server = { apiBaseUrl: ..., wsUrl: ... }` を追加
2. `app/api/...` 系ファイルで `process.env` 参照を `server.apiBaseUrl` に置き換え
3. `NEXT_PUBLIC_` を必要としない箇所（サーバーオンリー値）は dotenv (e.g. `BACKEND_URL`) に集約

**テスト**
- `.env.local` と Vercel Production で値が正しく反映されるかを確認
- `npm run build` / `next start` でビルド時警告が出ないことを確認

---

## FR-03: Backend の Twilio URL 生成ユーティリティ化
**現状**
- `backend/controllers/twilioController.js:168-188` など多数の箇所で `process.env.BASE_URL` を手動連結
- `NGROK_URL`/`BASE_URL`/`WEBHOOK_BASE_URL_PROD` の優先順位がファイルごとに異なり、メンテナンスが困難

**改善案**
1. `backend/config/environment.js` の `twilio.webhookBaseUrl` を唯一の参照元にする
2. `utils/twilioUrls.js`（仮）を作成し、`voiceGather(callId)`, `statusCallback(callId)` などの関数を提供
3. コントローラーから直接 `process.env` を参照しないよう統一

**実装ステップ**
1. `config/environment.js` を `module.exports` から import するユーティリティを作成
2. `controllers/twilioController.js`, `handoffController.js`, `bulkCallController.js` 等でユーティリティを利用
3. 既存ルーティング（`/api/twilio/...`）のパスは一切変更しない

**テスト**
- Render 上で Twilio Webhook / Status Callback / Recording Callback を実行し、HTTP 200 とログ出力を確認
- Jest 等の自動テストがないため、Postman & Twilio Console を用いたエンドツーエンド確認を実施

---

## FR-04: CORS / WebSocket 設定の共通化
**現状**
- `backend/server.js:38-60` と `backend/services/websocket.js:17-34` で許可オリジン配列を別々に定義
- 新しいフロントエンド URL の追加時に、両方のファイルを更新する必要がありミスが起きやすい

**改善案**
1. `backend/config/cors.js` を新設し、許可オリジンと CORS オプションを一元管理
2. Express と Socket.IO 初期化時に同モジュールを参照
3. 本番では `process.env.FRONTEND_URL` と Vercel ドメインのみ許可（開発時はワイルドカード可）

**実装ステップ**
1. `config/cors.js` を作成し `getAllowedOrigins()`, `buildCorsOptions()` を定義
2. `server.js` と `services/websocket.js` でモジュールを import し差し替え
3. 既存の `callback(null, true)` など挙動を維持しつつ、開発モードのみワイルドカード許可

**テスト**
- ローカル (`NODE_ENV=development`) と Render (`NODE_ENV=production`) の両方で CORS エラーが出ないことを手動確認
- Socket.io の接続ログでフロントからの接続が成功することを確認

---

## 推奨進行手順
1. **FR-01** を実装し、API ルートの fetch パターンを統一
2. 続いて **FR-02** で `lib/config` を強化し、ENV 参照を一本化
3. **FR-03** に着手し、Twilio Webhook 周りのベース URL 形成を整理
4. 最後に **FR-04** で CORS 周辺を共通化し、セキュリティ設定を更新

各ステップで PR を分割し、影響範囲を小さく保ちながらコードベースの可読性・保守性向上を目指してください。
