# 本番デプロイ完全チェックリスト

## 1. 事前準備
- [ ] `.env` や秘密鍵を Git 管理から除外し、全ての漏洩済みシークレットをローテーション
- [ ] MongoDB Atlas 本番クラスタを作成し、Render 固定 IP をホワイトリスト登録
- [ ] Twilio / OpenAI / Coefont / AWS S3 / SMTP 等の本番用認証情報を取得
- [ ] 取次や通知に利用する電話番号・メール差出人など運用値を確定
- [ ] GitHub main ブランチの最終差分を確認し、デプロイ対象を確定

## 2. リポジトリ調整
- [ ] `frontend/next.config.mjs` の `/api` リライト先を環境変数経由に変更し、開発・本番で切り替えられるようにする
- [ ] `frontend/app/api/**/*.ts` に `export const runtime = 'nodejs'` を追加し、Edge Runtime を回避
- [ ] `frontend/app/api/twilio/voice/route.ts` の ngrok 依存を削除し、Render URL へ直接フォワード
- [ ] `backend/controllers/handoffController.js` 等にベタ書きされている電話番号を環境変数化
- [ ] `.gitignore` に `backend/.env*` と `frontend/.env*` を追加し、ローカル用ファイルだけ残す

## 3. Vercel 環境変数設定 (Frontend)
- [ ] `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_API_URL`, `BACKEND_URL`, `NEXT_PUBLIC_SOCKET_URL` を Render の本番 URL (`https://<backend>.onrender.com`) に統一
- [ ] `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_OPERATOR_PHONE`, `NEXT_PUBLIC_HUMAN_REPRESENTATIVE_NUMBER` を本番値で登録
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_APP_SID` (必要なら) を保護された変数で登録
- [ ] `OPENAI_API_KEY`, `COE_FONT_KEY`, `COE_FONT_CLIENT_SECRET`, `COEFONT_VOICE_ID` を設定し、ブラウザへ露出させない値は Server Only 扱いにする
- [ ] `vercel.json` の CORS ヘッダを Twilio ドメインのみに限定し、デプロイ設定を保存

## 4. Render 環境変数設定 (Backend)
- [ ] `NODE_ENV=production`, `PORT` (空 or 5000), `FRONTEND_URL=https://<vercel>.vercel.app`
- [ ] `MONGODB_URI` に Atlas 本番接続文字列を設定
- [ ] `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` を安全な値で設定
- [ ] **`BASE_URL_PROD=https://<backend>.onrender.com`（必須）** ※ これが未設定だと取次失敗時の fallback 挨拶や Cartesia 音声 URL が壊れる
- [ ] `BASE_URL`, `WEBHOOK_BASE_URL_PROD`, `WEBHOOK_BASE_URL_DEV` を Render 本番 URL に揃える（後方互換のため引き続き設定推奨）
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER_PROD`, `TWILIO_PHONE_NUMBER` を登録
- [ ] `OPENAI_API_KEY`, `COE_FONT_KEY`, `COE_FONT_CLIENT_SECRET`, `COEFONT_VOICE_ID` を登録
- [ ] 録音保存を行う場合は `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`
- [ ] 認証メールを使う場合は `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

## 5. 外部サービス更新
- [ ] MongoDB Atlas にアプリ用ユーザーを作成し、権限を `readWriteAnyDatabase` へ
- [ ] Twilio 番号の Voice Webhook / Status Callback / Recording Callback を `https://<backend>.onrender.com/api/twilio/...` に更新
- [ ] Coefont の API キーとボイス ID が本番契約で有効か確認
- [ ] AWS S3 バケットの CORS・Lifecycle を設定 (録音保存を利用する場合)
- [ ] メール送信ドメインの SPF / DKIM を設定し、SMTP 送信が許可されていることを確認

## 6. データ移行
- [ ] ローカル MongoDB から本番へ `mongodump` / `mongorestore` でデータを移行
- [ ] 不要なテストユーザー・顧客・通話履歴を整理し、本番に持ち込むデータをクリーンアップ
- [ ] 管理者アカウントのみ先行登録する場合は `backend/config/db.js` の自動生成用 ENV を調整
- [ ] 必要な初期設定 (会社情報、エージェント設定、顧客CSV など) を本番に再インポート

## 7. デプロイ手順
1. main ブランチに本番用修正をマージし、GitHub へプッシュ
2. Vercel ダッシュボードで Production 環境変数を再確認し、`Redeploy` (キャッシュ無効化) を実行
3. Render ダッシュボードで Web Service をデプロイ（`npm install` → `npm start`）し、ENV 反映後に再デプロイ
4. 各サービスのログを監視し、ビルド・起動完了を確認
5. GitHub Actions など CI を利用する場合は、Lint / Build が成功するか確認

## 8. 検証チェックリスト
- [ ] `https://<vercel>.vercel.app` へアクセスし、管理者・会社管理者・一般ユーザーでログイン確認
- [ ] 顧客一覧/検索/作成/編集/削除、CSV インポートを実施 (API: `frontend/app/api/customers/route.ts`)
- [ ] ダッシュボードで Socket.io によるリアルタイム更新が行われるか確認 (`lib/websocket.ts`)
- [ ] Outbound 発信 → Twilio 経由で顧客が応答し、AI 会話が成立するか確認
- [ ] Inbound コール → Webhook が Render に到達し、会話・録音・ステータス更新がすべて成功するか検証
- [ ] ハンドオフ (人間転送) が期待通りに機能し、取次電話番号へ接続されるか確認
- [ ] **取次失敗 (no-answer/busy)** 時、顧客側に「申し訳ございません。担当者が応答できませんでした。改めてご連絡いたします。それでは失礼いたします。」が再生されてから切電することを確認（fallback TwiML 動作確認）
- [ ] **barge-in 動作確認**: AI が話している途中にお客様が話し始めたら、AI が即座に黙ること
- [ ] **終話挨拶**: 拒否系（「結構です」）/ 不在系（「外出中です」）の応答後、終話挨拶が最後まで再生されてから切電されること
- [ ] Coefont 音声が生成され、フォールバックが発生しないことを確認
- [ ] メール認証機能が SMTP 経由で成功するかテスト
- [ ] Render `/api/health` が 200 で応答し、UptimeRobot 等の監視を設定
- [ ] `cd backend && npm test` で 26/26 pass（音声ランタイム smoke test）

## 9. 運用開始後タスク
- [ ] Render/Vercel のログモニタリング設定と通知の整備
- [ ] ステージング (Preview) 用の環境変数も登録し、テストデプロイで検証
- [ ] Render 無料プラン利用時はスリープ対策として UptimeRobot を設定
- [ ] 変更履歴と本番構成を `DEPLOYMENT_GUIDE.md` 等に追記し、チームへ共有

---
作業完了後は、上記チェック項目をチームで確認し、未完了タスクが無いことをレビューしてから本番運用を開始してください。
