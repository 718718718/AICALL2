'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyId: string;
  companyName: string;
  phone: string;
  twilioPhoneNumber?: string;
  twilioPhoneNumberSid?: string;
  twilioPhoneNumberStatus?: 'active' | 'inactive' | 'pending';
  role: 'admin' | 'user';
}

interface Company {
  _id: string;
  companyId: string;
  name: string;
}

interface AvailablePhoneNumber {
  _id: string;
  phoneNumber: string;
  friendlyName?: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  };
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState<string>('');
  const [assigningNumber, setAssigningNumber] = useState(false);
  const [importingNumbers, setImportingNumbers] = useState(false);
  const [purchasingNumber, setPurchasingNumber] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  useEffect(() => {
    if (userId) {
      fetchUser();
      fetchAvailableNumbers();
      fetchCompanies();
    }
  }, [userId]);

  const fetchUser = async () => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      const data = await response.json();
      const userData = data.user || data;
      setUser(userData);
      setSelectedCompanyId(userData.companyId || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableNumbers = async () => {
    try {
      const response = await fetch('/api/users/phone-numbers/available', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableNumbers(data.numbers || []);
      }
    } catch (err) {
      console.error('Failed to fetch available numbers:', err);
    }
  };

  const fetchCompanies = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('認証情報の有効期限が切れています');
        router.push('/admin/login');
        return;
      }

      const response = await fetch('/api/companies', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error('企業一覧の取得に失敗しました');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '企業一覧の取得に失敗しました');
      }

      const activeCompanies = (data.data || []).filter((company: Company & { status?: string }) => 
        !company.status || company.status === 'active'
      );
      setCompanies(activeCompanies);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
      setError(err instanceof Error ? err.message : '企業一覧の取得に失敗しました');
    }
  };

  const handleChangeCompany = async () => {
    if (!selectedCompanyId || !user) return;

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('認証情報の有効期限が切れています');
        router.push('/admin/login');
        return;
      }

      const response = await fetch(`/api/company/user/${userId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '企業の紐付けの更新に失敗しました');
      }

      setUser(data.data.user);
      alert('企業の紐付けを更新しました');
    } catch (err) {
      console.error('Failed to update company association:', err);
      setError(err instanceof Error ? err.message : '企業の紐付けの更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignPhoneNumber = async () => {
    if (!selectedNumberId || !user) return;

    setAssigningNumber(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}/assign-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          phoneNumberId: selectedNumberId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign phone number');
      }

      const data = await response.json();
      setUser(data.user);
      setSelectedNumberId('');
      await fetchAvailableNumbers(); // Refresh available numbers
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAssigningNumber(false);
    }
  };

  const handleUnassignPhoneNumber = async () => {
    if (!user?.twilioPhoneNumberSid) return;

    setAssigningNumber(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}/unassign-phone`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to unassign phone number');
      }

      const data = await response.json();
      setUser(data.user);
      await fetchAvailableNumbers(); // Refresh available numbers
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAssigningNumber(false);
    }
  };

  const handleImportFromTwilio = async () => {
    setImportingNumbers(true);
    setError(null);

    try {
      const response = await fetch('/api/users/phone-numbers/import-from-twilio', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to import phone numbers from Twilio');
      }

      const data = await response.json();
      await fetchAvailableNumbers(); // Refresh available numbers
      alert(data.message || 'Phone numbers imported successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setImportingNumbers(false);
    }
  };

  const handlePurchaseNumber = async () => {
    setPurchasingNumber(true);
    setError(null);

    try {
      const response = await fetch('/api/users/phone-numbers/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          areaCode: '607', // デフォルトのエリアコード
          capabilities: { voice: true, sms: true }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to purchase phone number from Twilio');
      }

      const data = await response.json();
      await fetchAvailableNumbers(); // Refresh available numbers
      alert(data.message || 'Phone number purchased successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setPurchasingNumber(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      router.push('/admin/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error && !user) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!user) return <div className="p-8">User not found</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">ユーザー編集</h1>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-4 max-w-2xl">
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">所属企業</label>
          <div className="flex gap-2">
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">企業を選択してください</option>
              {companies.map((company) => (
                <option key={company._id} value={company.companyId}>
                  {company.name} ({company.companyId})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleChangeCompany}
              disabled={!selectedCompanyId || selectedCompanyId === user.companyId || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              変更
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            現在の企業: {user.companyName} (ID: {user.companyId})
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">姓</label>
            <input
              type="text"
              value={user.lastName}
              onChange={(e) => setUser({ ...user, lastName: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">名</label>
            <input
              type="text"
              value={user.firstName}
              onChange={(e) => setUser({ ...user, firstName: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">電話番号</label>
          <input
            type="tel"
            value={user.phone}
            onChange={(e) => setUser({ ...user, phone: e.target.value })}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">役割</label>
          <select
            value={user.role}
            onChange={(e) => setUser({ ...user, role: e.target.value as 'admin' | 'user' })}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="user">ユーザー</option>
            <option value="admin">管理者</option>
          </select>
        </div>

        {/* Twilio電話番号セクション */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Twilio電話番号の管理</h3>
          
          {user.twilioPhoneNumber ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">現在の割り当て番号</label>
                <div className="mt-1 flex items-center space-x-2">
                  <input
                    type="text"
                    value={user.twilioPhoneNumber}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                  />
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    user.twilioPhoneNumberStatus === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {user.twilioPhoneNumberStatus === 'active' ? 'アクティブ' : user.twilioPhoneNumberStatus}
                  </span>
                </div>
              </div>
              
              <button
                type="button"
                onClick={handleUnassignPhoneNumber}
                disabled={assigningNumber}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {assigningNumber ? '処理中...' : '番号の割り当てを解除'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">電話番号を割り当て</label>
                <div className="mt-1 flex items-center space-x-2">
                  <select
                    value={selectedNumberId}
                    onChange={(e) => setSelectedNumberId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                    disabled={availableNumbers.length === 0}
                  >
                    <option value="">電話番号を選択してください</option>
                    {availableNumbers.map((number) => (
                      <option key={number._id} value={number._id}>
                        {number.phoneNumber}
                        {number.friendlyName && ` (${number.friendlyName})`}
                        {number.capabilities.voice && number.capabilities.sms ? ' - 音声・SMS対応' : 
                         number.capabilities.voice ? ' - 音声のみ' : ' - その他'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAssignPhoneNumber}
                    disabled={!selectedNumberId || assigningNumber}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {assigningNumber ? '処理中...' : '割り当て'}
                  </button>
                </div>
              </div>
              
              {availableNumbers.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                    利用可能な電話番号がありません。
                  </p>
                  
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handleImportFromTwilio}
                      disabled={importingNumbers}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 flex-1"
                    >
                      {importingNumbers ? 'インポート中...' : 'Twilioから既存番号をインポート'}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handlePurchaseNumber}
                      disabled={purchasingNumber}
                      className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 flex-1"
                    >
                      {purchasingNumber ? '購入中...' : '新しい番号を購入'}
                    </button>
                  </div>
                </div>
              )}
              
              {availableNumbers.length > 0 && (
                <div className="mt-3 flex space-x-2">
                  <button
                    type="button"
                    onClick={handleImportFromTwilio}
                    disabled={importingNumbers}
                    className="px-3 py-1 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {importingNumbers ? 'インポート中...' : 'Twilioからインポート'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handlePurchaseNumber}
                    disabled={purchasingNumber}
                    className="px-3 py-1 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    {purchasingNumber ? '購入中...' : '新しい番号を購入'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.push('/admin/users')}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
