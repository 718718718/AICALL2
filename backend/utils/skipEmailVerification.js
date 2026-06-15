/**
 * 開発・テスト環境でメール認証をスキップするかどうか。
 * SKIP_EMAIL_VERIFICATION=true で明示的に有効化、false で無効化。
 * 未設定時は development / test 環境では有効。
 */
function isSkipEmailVerification() {
  const flag = process.env.SKIP_EMAIL_VERIFICATION;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

module.exports = { isSkipEmailVerification };
