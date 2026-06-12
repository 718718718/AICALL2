'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  phone: string;
  twilioPhoneNumber?: string;
  twilioPhoneNumberStatus?: 'active' | 'inactive' | 'pending';
  role: 'admin' | 'user';
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const userData = localStorage.getItem('userData');
      
      console.log('=== Frontend Fetching Users ===');
      console.log('Token exists:', !!token);
      console.log('Token value:', token?.substring(0, 50) + '...');
      console.log('UserData exists:', !!userData);
      
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('User role from localStorage:', parsedUser.role);
        console.log('User email:', parsedUser.email);
      }
      
      // Use the admin API endpoint with proper authentication
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      console.log('Frontend response status:', response.status);
      
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        console.error('Error details:', data);
        throw new Error(data.error || 'Failed to fetch users');
      }

      console.log('Users received:', data.users?.length || 0);
      setUsers(data.users || data);
    } catch (err) {
      console.error('=== Frontend Error ===');
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status || status === 'pending') {
      return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">Pending</span>;
    }
    if (status === 'active') {
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Active</span>;
    }
    return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">Inactive</span>;
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">ユーザー管理</h1>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名前
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                メール
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                会社名
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                電話番号
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Twilio番号
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ステータス
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                役割
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                アクション
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user._id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.lastName} {user.firstName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">{user.companyName}</td>
                <td className="px-6 py-4 whitespace-nowrap">{user.phone}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.twilioPhoneNumber || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(user.twilioPhoneNumberStatus)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded ${
                    user.role === 'admin' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {user.role === 'admin' ? '管理者' : 'ユーザー'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link 
                    href={`/admin/users/${user._id}/edit`}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            ユーザーがいません
          </div>
        )}
      </div>
    </div>
  );
}