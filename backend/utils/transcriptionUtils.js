/**
 * Transcription関連のユーティリティ関数
 */

/**
 * TrackLabelから話者を識別
 * @param {string} trackLabel - Inbound/OutboundTrackLabel
 * @returns {string} 話者 (customer, agent, ai, unknown)
 */
function identifySpeaker(trackLabel) {
  if (!trackLabel) return 'unknown';

  const label = trackLabel.toLowerCase();

  if (label.includes('customer')) return 'customer';
  if (label.includes('agent')) return 'agent';
  if (label.includes('ai')) return 'ai';

  return 'unknown';
}

/**
 * TrackLabelから音声の方向を識別
 * @param {string} trackLabel - Inbound/OutboundTrackLabel
 * @returns {string} 方向 (inbound, outbound, unknown)
 */
function identifyTrackDirection(trackLabel) {
  if (!trackLabel) return 'unknown';

  if (trackLabel.endsWith('-in')) return 'inbound';
  if (trackLabel.endsWith('-out')) return 'outbound';

  return 'unknown';
}

/**
 * Partial結果をFinal結果で更新すべきかを判定
 * @param {string} isFinal - 'true' または 'false'
 * @param {object} existingTranscript - 既存のTranscriptエントリ
 * @returns {boolean} 更新すべきかどうか
 */
function shouldUpdateTranscript(isFinal, existingTranscript) {
  // Final結果は常に更新
  if (isFinal === 'true') return true;

  // 既存がなければPartialでも追加
  if (!existingTranscript) return true;

  // 既存がPartialでかつ新しいものもPartialの場合は更新
  if (!existingTranscript.isFinal && isFinal === 'false') return true;

  // 既存がFinalの場合はPartialで上書きしない
  return false;
}

/**
 * 転写結果を既存のtranscript配列に統合
 * @param {Array} existingTranscripts - 既存のtranscript配列
 * @param {object} newTranscript - 新しい転写結果
 * @returns {Array} 更新されたtranscript配列
 */
function mergeTranscriptResult(existingTranscripts, newTranscript) {
  const transcripts = [...existingTranscripts];
  const { speaker, message, isFinal, timestamp } = newTranscript;

  // 同一話者の直近のPartial結果を探す
  const recentPartialIndex = transcripts.findLastIndex(
    (t, index) =>
      t.speaker === speaker &&
      !t.isFinal &&
      index >= transcripts.length - 5 // 直近5件以内
  );

  if (isFinal && recentPartialIndex !== -1) {
    // Partial結果をFinalで置き換え
    transcripts[recentPartialIndex] = {
      ...transcripts[recentPartialIndex],
      message,
      isFinal: true,
      timestamp
    };
  } else {
    // 新しいエントリとして追加
    transcripts.push(newTranscript);
  }

  return transcripts;
}

/**
 * 転写イベントからトランスクリプトオブジェクトを作成
 * @param {object} transcriptionEvent - Twilioからの転写イベント
 * @returns {object} トランスクリプトオブジェクト
 */
function createTranscriptFromEvent(transcriptionEvent) {
  const {
    Transcript,
    IsFinal,
    InboundTrackLabel,
    OutboundTrackLabel,
    CallSid
  } = transcriptionEvent;

  // InboundとOutboundのどちらかからlabelを取得
  const trackLabel = InboundTrackLabel || OutboundTrackLabel;
  const speaker = identifySpeaker(trackLabel);
  const direction = identifyTrackDirection(trackLabel);

  return {
    speaker,
    message: Transcript || '',
    confidence: 1.0, // Real-time Transcriptionでは信頼度は提供されない
    isFinal: IsFinal === 'true',
    timestamp: new Date(),
    trackLabel,
    direction,
    callSid: CallSid
  };
}

/**
 * 転写エラーの詳細情報を取得
 * @param {object} errorEvent - Twilioからのエラーイベント
 * @returns {object} エラー情報
 */
function parseTranscriptionError(errorEvent) {
  return {
    event: 'transcription-error',
    callSid: errorEvent.CallSid,
    errorCode: errorEvent.ErrorCode,
    errorMessage: errorEvent.ErrorMessage,
    timestamp: new Date()
  };
}

/**
 * 転写設定の妥当性をチェック
 * @param {object} config - 転写設定
 * @returns {object} バリデーション結果
 */
function validateTranscriptionConfig(config) {
  const errors = [];

  if (!config.statusCallbackUrl) {
    errors.push('statusCallbackUrl is required');
  }

  if (!config.languageCode) {
    errors.push('languageCode is required');
  }

  if (config.track && !['inbound_track', 'outbound_track', 'both_tracks'].includes(config.track)) {
    errors.push('Invalid track value');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  identifySpeaker,
  identifyTrackDirection,
  shouldUpdateTranscript,
  mergeTranscriptResult,
  createTranscriptFromEvent,
  parseTranscriptionError,
  validateTranscriptionConfig
};