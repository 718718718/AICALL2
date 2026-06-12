/**
 * API レスポンスの ID フィールドを統一するユーティリティ
 * MongoDB の _id フィールドを標準的な id フィールドに正規化します
 */

export interface IdNormalizable {
  _id?: string;
  id?: string | number;
  [key: string]: any;
}

/**
 * 単一オブジェクトのIDを正規化
 */
export function normalizeId<T extends IdNormalizable>(item: T): T & { id: string } {
  if (!item) return item as T & { id: string };

  const normalizedId = item._id || (item.id ? item.id.toString() : undefined);

  if (!normalizedId) {
    console.warn('[ID Normalizer] Object has no valid ID field:', item);
  }

  const result = {
    ...item,
    id: normalizedId || '',
    _id: undefined
  };

  // _id フィールドを削除（undefinedを設定することで削除）
  delete result._id;

  return result as T & { id: string };
}

/**
 * 配列のすべてのオブジェクトのIDを正規化
 */
export function normalizeIds<T extends IdNormalizable>(items: T[]): (T & { id: string })[] {
  if (!Array.isArray(items)) {
    console.warn('[ID Normalizer] Expected array but received:', typeof items);
    return [];
  }

  return items.map(normalizeId);
}

/**
 * API レスポンス全体を正規化（データが配列またはオブジェクトの場合に対応）
 */
export function normalizeApiResponse<T extends IdNormalizable>(response: T | T[]): any {
  if (Array.isArray(response)) {
    return normalizeIds(response);
  } else if (response && typeof response === 'object') {
    return normalizeId(response);
  }

  return response;
}

/**
 * 顧客IDを取得するヘルパー関数（後方互換性のため）
 */
export function getCustomerId(customer: IdNormalizable): string {
  return customer._id || customer.id?.toString() || '';
}

/**
 * 複数の顧客IDを取得するヘルパー関数
 */
export function getCustomerIds(customers: IdNormalizable[]): string[] {
  return customers.map(getCustomerId).filter(Boolean);
}