'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  phone: string;
  role: 'admin' | 'user';
  twilioPhoneNumber?: string;
  twilioPhoneNumberStatus?: string;
  byocFromNumber?: string;
  byocTrunkSid?: string;
}

export default function EditUserPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 基本情報
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');

  // BYOC番号
  const [byocFromNumber, setByocFromNumber] = useState('');
  const [byocTrunkSid, setByocTrunkSid] = useState('');
  const [savingByoc, setSavingByoc] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [params.id]);

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/users/${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch user');

      setUser(data.user);
      setFirstName(data.user.firstName || '');
      setLastName(data.user.lastName || '');
      setPhone(data.user.phone || '');
      setRole(data.user.role || 'user');
      setByocFromNumber(data.user.byocFromNumber || '');
      setByocTrunkSid(data.user.byocTrunkSid || '');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setLoading(false);
    }
  };

  const saveBasicInfo = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/users/${params.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ firstName, lastName, phone, role })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update user');
      setMessage({ type: 'success', text: '基本情報を保存しました' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setSaving(false);
    }
  };

  const saveByocNumber = async () => {
    setSavingByoc(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${params.id}/assign-byoc`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ byocFromNumber, byocTrunkSid })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to assign BYOC number');
      setMessage({ type: 'success', text: `BYOC番号 ${data.user.byocFromNumber} を設定しました` });
      setByocFromNumber(data.user.byocFromNumber || '');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setSavingByoc(false);
    }
  };

  const removeByocNumber = async () => {
    if (!confirm('BYOC番号の割り当てを解除しますか？')) return;
    setSavingByoc(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${params.id}/unassign-byoc`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to unassign BYOC number');
      setMessage({ type: 'success', text: 'BYOC番号の割り当てを解除しました' });
      setByocFromNumber('');
      setByocTrunkSid('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setSavingByoc(false);
    }
  };

  if (loading) return <div className="p-8">読み込み中...</div>;
  if (!user) return <div className="p-8 text-red-500">ユーザーが見つかりません</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/users" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h1 className="text-2xl font-semibold">ユーザー編集</h1>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* 基本情報 */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">基本情報</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メール</label>
            <input
              type="text"
              value={user.email}
              disabled
              className="w-full border rounded px-3 py-2 text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">役割</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="user">ユーザー</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <button
            onClick={saveBasicInfo}
            disabled={saving}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '基本情報を保存'}
          </button>
        </div>
      </div>

      {/* BYOC番号設定 */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium mb-1">BYOC番号設定</h2>
        <p className="text-sm text-gray-500 mb-4">顧客専用の03/050番号をこのユーザーに割り当てます</p>

        {user.byocFromNumber && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-green-800">現在の番号: </span>
              <span className="text-sm text-green-700">{user.byocFromNumber}</span>
            </div>
            <button
              onClick={removeByocNumber}
              disabled={savingByoc}
              className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              解除
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              03/050番号
              <span className="text-gray-400 font-normal ml-1">（例: 0368682113 または +81368682113）</span>
            </label>
            <input
              type="text"
              value={byocFromNumber}
              onChange={(e) => setByocFromNumber(e.target.value)}
              placeholder="0368682113"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BYOCトランクSID
              <span className="text-gray-400 font-normal ml-1">（例: BY9cf701873764c0b5cfdda525b19c824f）</span>
            </label>
            <input
              type="text"
              value={byocTrunkSid}
              onChange={(e) => setByocTrunkSid(e.target.value)}
              placeholder="BY9cf701873764c0b5cfdda525b19c824f"
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            onClick={saveByocNumber}
            disabled={savingByoc || !byocFromNumber || !byocTrunkSid}
            className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {savingByoc ? '設定中...' : 'BYOC番号を設定'}
          </button>
        </div>
      </div>
    </div>
  );
}
