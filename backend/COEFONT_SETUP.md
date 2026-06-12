# CoeFont API セットアップガイド

## 重要な注意事項

CoeFont APIを使用するには、以下の手順で正しいVoice IDを設定する必要があります。

## 1. CoeFont Voice IDの取得方法

### 方法A: CoeFont Studioから取得
1. [CoeFont Studio](https://coefont.cloud) にログイン
2. 使用したい音声を選択
3. 音声の詳細画面でUUID形式のIDを確認
   - 例: `f1d89b79-9aeb-400f-bd08-c088c8e0e01e`

### 方法B: APIから取得
1. CoeFont APIのエンドポイント `/v2/voices` を使用
2. 利用可能な音声のリストから選択

## 2. 環境変数の設定

`.env`ファイルに以下を設定:

```env
# CoeFont API認証情報
COE_FONT_KEY=あなたのアクセスキー
COE_FONT_CLIENT_SECRET=あなたのアクセスシークレット

# 使用する音声のID（UUID形式）
COEFONT_VOICE_ID=取得したVoice ID
```

## 3. フリープランで利用可能な音声

フリープランで利用可能な音声の例:
- ミリアル（女性）
- アリアル（女性）

※ 正確なIDはCoeFont Studioで確認してください

## 4. トラブルシューティング

### エラー: "Coefont not found"
- Voice IDが正しくない、またはアクセス権限がありません
- CoeFont Studioで正しいIDを確認してください

### エラー: "Unauthorized"
- API KeyまたはSecretが正しくありません
- CoeFont管理画面でAPIキーを再確認してください

## 5. テスト方法

```bash
# CoeFont APIのテスト
node test-coefont.js

# 利用可能な音声の確認
node test-coefont-voices.js
```

## 6. フォールバック

CoeFont APIが失敗した場合、システムは自動的にAmazon Polly (Mizuki)にフォールバックします。

## お問い合わせ

CoeFont Voice IDの取得でお困りの場合は、CoeFont Studioにログインして、使用可能な音声のIDを確認してください。