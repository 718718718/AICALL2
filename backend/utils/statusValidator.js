/**
 * Status Validation Utility
 * CallSessionのステータス値の検証とサニタイズを行うユーティリティ
 */

// 有効なステータス値の定義
const VALID_STATUS = [
  'initiating',      // 初期化中
  'calling',         // 発信中
  'initiated',       // 開始済み
  'ai-responding',   // AI応答中
  'transferring',    // 転送中
  'human-connected', // 人間に接続済み
  'completed',       // 完了
  'failed',          // 失敗
  'cancelled',       // キャンセル
  'in-progress',     // 進行中
  'queued'           // キュー待ち
];

// 有効な通話結果の定義
const VALID_CALL_RESULT = [
  '成功',         // 成功
  '不在',         // 不在
  '拒否',         // 拒否
  '要フォロー',   // 要フォロー
  '失敗',         // 失敗
  '通話中',       // 通話中
  'キャンセル'    // キャンセル（キュー待ち中に停止された通話）
];

// 有効な終了理由の定義
const VALID_END_REASON = [
  'normal',         // 正常終了
  'ai_initiated',   // AI側から終了
  'customer_hangup', // 顧客が電話を切った
  'agent_hangup',   // エージェントが電話を切った
  'transfer',       // 転送
  'timeout',        // タイムアウト
  'system_error',   // システムエラー
  'network_error',  // ネットワークエラー
  'manual'          // 手動終了
];

/**
 * ステータス値が有効かどうかを検証
 * @param {string} status - 検証するステータス値
 * @returns {boolean} 有効な場合true
 */
function isValidStatus(status) {
  if (status === null || status === undefined) {
    return true; // nullやundefinedは許可
  }
  return VALID_STATUS.includes(status);
}

/**
 * 通話結果値が有効かどうかを検証
 * @param {string} callResult - 検証する通話結果値
 * @returns {boolean} 有効な場合true
 */
function isValidCallResult(callResult) {
  if (callResult === null || callResult === undefined) {
    return true; // nullやundefinedは許可
  }
  return VALID_CALL_RESULT.includes(callResult);
}

/**
 * 終了理由が有効かどうかを検証
 * @param {string} endReason - 検証する終了理由
 * @returns {boolean} 有効な場合true
 */
function isValidEndReason(endReason) {
  if (endReason === null || endReason === undefined) {
    return true; // nullやundefinedは許可
  }
  return VALID_END_REASON.includes(endReason);
}

/**
 * ステータス値をサニタイズ（無効な値を安全な値に変換）
 * @param {string} status - サニタイズするステータス値
 * @param {string} defaultValue - デフォルト値（デフォルト: 'failed'）
 * @returns {string} サニタイズされたステータス値
 */
function sanitizeStatus(status, defaultValue = 'failed') {
  if (isValidStatus(status)) {
    return status;
  }
  
  console.warn(`[StatusValidator] Invalid status '${status}' detected, using default '${defaultValue}'`);
  return defaultValue;
}

/**
 * 通話結果をサニタイズ（無効な値を安全な値に変換）
 * @param {string} callResult - サニタイズする通話結果値
 * @param {string} defaultValue - デフォルト値（デフォルト: null）
 * @returns {string|null} サニタイズされた通話結果値
 */
function sanitizeCallResult(callResult, defaultValue = null) {
  if (isValidCallResult(callResult)) {
    return callResult;
  }
  
  console.warn(`[StatusValidator] Invalid callResult '${callResult}' detected, using default '${defaultValue}'`);
  return defaultValue;
}

/**
 * 終了理由をサニタイズ（無効な値を安全な値に変換）
 * @param {string} endReason - サニタイズする終了理由
 * @param {string} defaultValue - デフォルト値（デフォルト: null）
 * @returns {string|null} サニタイズされた終了理由
 */
function sanitizeEndReason(endReason, defaultValue = null) {
  if (isValidEndReason(endReason)) {
    return endReason;
  }
  
  console.warn(`[StatusValidator] Invalid endReason '${endReason}' detected, using default '${defaultValue}'`);
  return defaultValue;
}

/**
 * CallSessionオブジェクト全体を検証・サニタイズ
 * @param {Object} sessionData - CallSessionデータ
 * @returns {Object} サニタイズされたSessionデータ
 */
function validateAndSanitizeSession(sessionData) {
  const sanitized = { ...sessionData };
  
  // ステータスの検証・サニタイズ
  if (sessionData.hasOwnProperty('status')) {
    sanitized.status = sanitizeStatus(sessionData.status);
  }
  
  // 通話結果の検証・サニタイズ
  if (sessionData.hasOwnProperty('callResult')) {
    sanitized.callResult = sanitizeCallResult(sessionData.callResult);
  }
  
  // 終了理由の検証・サニタイズ
  if (sessionData.hasOwnProperty('endReason')) {
    sanitized.endReason = sanitizeEndReason(sessionData.endReason);
  }
  
  return sanitized;
}

/**
 * ステータス変更の妥当性を検証
 * @param {string} currentStatus - 現在のステータス
 * @param {string} newStatus - 新しいステータス
 * @returns {boolean} 変更が妥当な場合true
 */
function isValidStatusTransition(currentStatus, newStatus) {
  // nullやundefinedから任意のステータスへの変更は許可
  if (!currentStatus) {
    return isValidStatus(newStatus);
  }
  
  // 新しいステータスが有効でない場合は拒否
  if (!isValidStatus(newStatus)) {
    return false;
  }
  
  // 完了済み・失敗・キャンセル済みからの変更は基本的に拒否
  const finalStates = ['completed', 'failed', 'cancelled'];
  if (finalStates.includes(currentStatus)) {
    // 最終状態からの変更は同じ状態への変更のみ許可
    return currentStatus === newStatus;
  }
  
  return true;
}

/**
 * エラー詳細を含む検証結果を返す
 * @param {string} status - 検証するステータス値
 * @returns {Object} 検証結果オブジェクト
 */
function validateStatusWithDetails(status) {
  const isValid = isValidStatus(status);
  
  return {
    isValid,
    value: status,
    sanitized: isValid ? status : 'failed',
    error: isValid ? null : `Invalid status value: '${status}'. Must be one of: ${VALID_STATUS.join(', ')}`
  };
}

/**
 * ログ用のステータス情報を生成
 * @param {Object} sessionData - CallSessionデータ
 * @returns {string} ログ用文字列
 */
function getStatusLogInfo(sessionData) {
  const status = sessionData.status || 'null';
  const callResult = sessionData.callResult || 'null';
  const endReason = sessionData.endReason || 'null';
  
  return `status: ${status}, callResult: ${callResult}, endReason: ${endReason}`;
}

module.exports = {
  // 定数
  VALID_STATUS,
  VALID_CALL_RESULT,
  VALID_END_REASON,
  
  // 検証関数
  isValidStatus,
  isValidCallResult,
  isValidEndReason,
  isValidStatusTransition,
  
  // サニタイズ関数
  sanitizeStatus,
  sanitizeCallResult,
  sanitizeEndReason,
  validateAndSanitizeSession,
  
  // 詳細検証
  validateStatusWithDetails,
  
  // ユーティリティ
  getStatusLogInfo
};