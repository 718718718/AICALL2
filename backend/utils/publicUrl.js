/**
 * Returns the public-facing base URL of the backend, used to build webhook
 * URLs and audio cache URLs that Twilio/Cartesia must be able to reach.
 *
 * Precedence (matches the convention already in twilioService.makeCall):
 *   production: BASE_URL_PROD > BASE_URL
 *   non-prod  : BASE_URL > NGROK_URL > http://localhost:<PORT>
 *
 * Returns `null` if no URL can be derived (rather than `"undefined/..."`)
 * so callers can fall back gracefully.
 *
 * This helper exists because BASE_URL alone was used in many places
 * (services/cartesiaService.js, controllers/*) and Render production
 * deployments only set BASE_URL_PROD — see Codex review round-2 serious #1
 * which caught a broken <Play> URL in the handoff-failed TwiML for that
 * exact reason.
 */
function getPublicBaseUrl() {
  if (process.env.NODE_ENV === 'production') {
    return process.env.BASE_URL_PROD || process.env.BASE_URL || null;
  }
  return (
    process.env.BASE_URL ||
    process.env.NGROK_URL ||
    `http://localhost:${process.env.PORT || 5001}`
  );
}

module.exports = { getPublicBaseUrl };
