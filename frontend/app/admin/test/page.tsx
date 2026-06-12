'use client';

import { useEffect, useState } from 'react';

export default function TestPage() {
  const [tokenInfo, setTokenInfo] = useState<any>({});
  
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const userData = localStorage.getItem('userData');
    
    setTokenInfo({
      token: token ? token.substring(0, 20) + '...' : 'なし',
      userData: userData ? JSON.parse(userData) : 'なし',
      hasToken: !!token
    });
  }, []);

  const testApiCall = async () => {
    const token = localStorage.getItem('accessToken');
    
    try {
      console.log('Token being sent:', token);
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'}/api/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      console.log('API Response:', response.status, data);
      
      if (!response.ok) {
        alert(`Error: ${response.status} - ${data.error || 'Unknown error'}\n\nToken: ${token?.substring(0, 50)}...`);
      } else {
        alert(`Success: Found ${data.users?.length || 0} users`);
      }
    } catch (error) {
      console.error('API Error:', error);
      alert('Request failed: ' + error);
    }
  };

  const clearStorage = () => {
    localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    alert('ストレージをクリアしました。ログインページに移動してください。');
    window.location.href = '/login';
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">認証テストページ</h1>
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <h2 className="font-bold">ローカルストレージ情報:</h2>
        <p>Token: {tokenInfo.token}</p>
        <p>User Data: {JSON.stringify(tokenInfo.userData, null, 2)}</p>
        <p>Has Token: {tokenInfo.hasToken ? 'Yes' : 'No'}</p>
      </div>
      
      <div className="space-x-4">
        <button 
          onClick={testApiCall}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          API呼び出しテスト
        </button>
        
        <button 
          onClick={clearStorage}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          ストレージクリア & 再ログイン
        </button>
      </div>
    </div>
  );
}