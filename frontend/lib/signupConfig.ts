/** 開発・テスト環境でサインアップ時のメール認証をスキップするか */
export function isSkipEmailVerification(): boolean {
  const flag = process.env.NEXT_PUBLIC_SKIP_EMAIL_VERIFICATION;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return process.env.NODE_ENV === 'development';
}
