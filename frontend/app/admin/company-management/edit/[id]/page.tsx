"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default function CompanyEdit({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    url: "",
    postalCode: "",
    status: "active"
  })

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
    fetchCompany();
  }, [router, id])

  const fetchCompany = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('認証情報の有効期限が切れています');
        router.push('/admin/login');
        return;
      }

      const response = await fetch(`/api/companies/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const data = await response.json();
      console.log('Edit page API Response:', data); // デバッグ用
      
      if (data.success && data.data) {
        // 新しいレスポンス構造に対応
        const company = data.data.company || data.data;
        
        setFormData({
          name: company.name || "",
          address: company.address || "",
          phone: company.phone || "",
          email: company.email || "",
          url: company.url || "",
          postalCode: company.postalCode || "",
          status: company.status || "active"
        });
      } else {
        toast.error('企業データの取得に失敗しました');
        router.push('/admin/companies');
      }
    } catch (error) {
      console.error('Error fetching company:', error);
      toast.error('企業データの取得に失敗しました');
      router.push('/admin/companies');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.address || !formData.phone) {
      toast.error('必須項目を入力してください');
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('認証情報の有効期限が切れています');
        router.push('/admin/login');
        return;
      }

      const response = await fetch(`/api/companies/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('企業情報を更新しました');
        router.push(`/admin/companies/${id}`);
      } else {
        toast.error(data.error || '更新に失敗しました');
      }
    } catch (error) {
      console.error('Error updating company:', error);
      toast.error('更新に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">企業情報編集</h1>
      
      <div className="bg-white rounded-lg p-6 max-w-2xl">
        <p className="mb-6 text-gray-600">企業情報を編集してください。</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name">企業名 *</Label>
            <Input
              id="name"
              placeholder="株式会社○○"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>

          <div>
            <Label htmlFor="phone">電話番号 *</Label>
            <Input
              id="phone"
              placeholder="03-1234-5678"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              required
            />
          </div>

          <div>
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              placeholder="info@example.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div>
            <Label htmlFor="url">ウェブサイトURL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={formData.url}
              onChange={(e) => setFormData({...formData, url: e.target.value})}
            />
          </div>

          <div>
            <Label htmlFor="postalCode">郵便番号</Label>
            <Input
              id="postalCode"
              placeholder="100-0001"
              value={formData.postalCode}
              onChange={(e) => setFormData({...formData, postalCode: e.target.value})}
            />
          </div>

          <div>
            <Label htmlFor="address">住所 *</Label>
            <Input
              id="address"
              placeholder="東京都新宿区..."
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              required
            />
          </div>

          <div>
            <Label htmlFor="status">ステータス</Label>
            <select
              id="status"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
            >
              <option value="active">アクティブ</option>
              <option value="inactive">非アクティブ</option>
            </select>
          </div>

          <div className="pt-4 flex gap-4">
            <Button 
              type="button" 
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/admin/companies')}
            >
              キャンセル
            </Button>
            <Button 
              type="submit" 
              className="ml-64 bg-orange-500 hover:bg-orange-600 text-white"
              disabled={loading}
            >
              {loading ? "更新中..." : "企業情報を更新する"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
