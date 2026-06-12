// BYOC（Bring Your Own Carrier）発信パラメータを返すヘルパー。
//
// 03番号（日本の地理的番号）は Twilio 自社番号ではないため、`from` に指定して
// 通常発信すると Twilio が Invalid 'From'（エラー 21212）で拒否する。
// 03番号を発信元として送出するには、提携キャリア(Voys)の BYOC トランク経由で
// ルーティングする必要があり、calls.create() に `byoc`（BYOC トランク SID）を
// 併せて渡さなければならない。
//
// 安全策（後方互換）:
//   BYOC_FROM_NUMBER と BYOC_TRUNK_SID の【両方】が設定されている場合のみ
//   BYOC 発信に切り替える。片方でも未設定なら従来通り（fallbackFrom を使った
//   Twilio PSTN 発信）に戻すため、設定不備による全発信停止を防げる。
//   TWILIO_PHONE_NUMBER は一切変更しない（他箇所での副作用を回避）。
//
// @param {string} fallbackFrom BYOC 未設定時に使う従来の発信元番号
// @returns {{from: string, byoc?: string}} calls.create() にスプレッドするパラメータ
function getByocCallParams(fallbackFrom) {
  const byocFrom = process.env.BYOC_FROM_NUMBER;
  const byocTrunkSid = process.env.BYOC_TRUNK_SID;

  if (byocFrom && byocTrunkSid) {
    return { from: byocFrom, byoc: byocTrunkSid };
  }
  return { from: fallbackFrom };
}

module.exports = { getByocCallParams };
