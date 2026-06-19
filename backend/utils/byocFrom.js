// BYOC（Bring Your Own Carrier）発信パラメータを返すヘルパー。
//
// ユーザーごとに byocFromNumber / byocTrunkSid が設定されている場合は
// そのユーザー専用の03/050番号＋BYOCトランク経由で発信する。
// 未設定の場合は環境変数（BYOC_FROM_NUMBER / BYOC_TRUNK_SID）にフォールバック。
// それも未設定なら従来通り fallbackFrom（Twilio PSTN番号）で発信する。
//
// @param {string} fallbackFrom BYOC未設定時に使う従来の発信元番号
// @param {Object} [user] Userドキュメント（byocFromNumber, byocTrunkSidを含む）
// @returns {{from: string, byoc?: string}} calls.create()にスプレッドするパラメータ
function getByocCallParams(fallbackFrom, user = null) {
  // ✅ 優先1：ユーザー個別のBYOC番号
  if (user && user.byocFromNumber && user.byocTrunkSid) {
    console.log(`[BYOC] Using user's BYOC number: ${user.byocFromNumber}`);
    return { from: user.byocFromNumber, byoc: user.byocTrunkSid };
  }

  // ✅ 優先2：環境変数のBYOC番号（全体共通）
  const byocFrom = process.env.BYOC_FROM_NUMBER;
  const byocTrunkSid = process.env.BYOC_TRUNK_SID;
  if (byocFrom && byocTrunkSid) {
    console.log(`[BYOC] Using global BYOC number: ${byocFrom}`);
    return { from: byocFrom, byoc: byocTrunkSid };
  }

  // ✅ 優先3：従来のTwilio PSTN番号
  console.log(`[BYOC] Using fallback number: ${fallbackFrom}`);
  return { from: fallbackFrom };
}

module.exports = { getByocCallParams };
