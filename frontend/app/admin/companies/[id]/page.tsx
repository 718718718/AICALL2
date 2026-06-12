"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Edit } from 'lucide-react'

interface Company {
  _id: string;
  companyId: string;
  name: string;
  address: string;
  url: string;
  phone: string;
  email?: string;
  postalCode?: string;
  status: string;
  createdAt: string;
}

interface User {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
}

interface CompanyDetailData {
  company: Company;
  users: {
    totalCount: number;
    userList: User[];
  };
}

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default function CompanyDetail({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CompanyDetailData | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('userData');
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    const user = JSON.parse(userData);
    if (user.role !== 'admin') {
      router.push('/admin/login');
      return;
    }
    fetchCompanyDetail();
  }, [router, id])

  const fetchCompanyDetail = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/companies/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const result = await response.json();
      console.log('API Response:', JSON.stringify(result, null, 2)); // デバッグ用
      console.log('Response data structure:', {
        success: result.success,
        hasData: !!result.data,
        hasCompany: !!result.data?.company,
        hasUsers: !!result.data?.users,
        dataKeys: result.data ? Object.keys(result.data) : null
      });
      
      if (result.success && result.data) {
        setData(result.data);
      } else {
        console.error('API Error:', result);
        toast.error('企業データの取得に失敗しました');
        router.push('/admin/companies');
      }
    } catch (error) {
      console.error('Error fetching company detail:', error);
      toast.error('企業データの取得に失敗しました');
      router.push('/admin/companies');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    router.push(`/admin/company-management/edit/${id}`)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  if (!data || !data.company) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">
          企業データが見つかりません
        </div>
      </div>
    );
  }

  const { company, users } = data;

  return (
    <div className="min-h-screen w-full p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">企業詳細</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-none">
        {/* 企業情報カラム */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">企業情報</h2>
              <span className={`inline-flex px-3 py-1 text-sm rounded-full ${
                company.status === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : company.status === 'inactive'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {company.status === 'active' ? 'アクティブ' : 
                 company.status === 'inactive' ? '非アクティブ' : company.status}
              </span>
            </div>
            <Button 
              onClick={handleEdit}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2"
            >
              編集
            </Button>
          </div>

          <div className="space-y-4">
            {/* 企業アイコンと基本情報 */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-gray-600 text-xl">👤</span>
              </div>
              <div>
                <h3 className="font-medium text-lg">{company.name}</h3>
                <p className="text-sm text-gray-500">{company.phone}</p>
              </div>
            </div>

            {/* 詳細情報テーブル */}
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">企業ID</span>
                <span className="font-mono">{company.companyId}</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">パスワード</span>
                <span className="font-mono">••••••••</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">事業者電話番号</span>
                <span>{company.phone}</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">メールアドレス</span>
                <span>{company.email || '未設定'}</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">郵便番号</span>
                <span>{company.postalCode || '未設定'}</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">住所</span>
                <span className="text-right max-w-xs">{company.address}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ユーザー管理カラム */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-6">ユーザー管理</h2>

          <div className="space-y-4">
            {/* 統計情報 */}
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">設定ユーザー数</span>
                <span className="text-gray-400">-</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">登録ユーザー数</span>
                <span className="font-semibold">{users.totalCount}</span>
              </div>
            </div>

            {/* 登録ユーザー一覧 */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3">登録ユーザー名</h3>
              {users.userList.length > 0 ? (
                <div className="space-y-2">
                  {users.userList.map((user, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded border">
                      <div className="font-medium">{user.fullName}</div>
                      <div className="text-sm text-gray-600">{user.email}</div>
                      <div className="text-xs text-gray-500">{user.phone}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-4">
                  登録ユーザーがいません
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}