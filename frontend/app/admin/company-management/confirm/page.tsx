"use client"

import { useState, useEffect, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

type CompanyData = {
  name: string;
  phone: string;
  email: string;
  url: string;
  postalCode: string;
  address: string;
  businessType: string;
  employees: string;
  annualRevenue: string;
}

function CompanyConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [companyData, setCompanyData] = useState<CompanyData>({
    name: "",
    phone: "",
    email: "",
    url: "",
    postalCode: "",
    address: "",
    businessType: "",
    employees: "",
    annualRevenue: ""
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

    // URLパラメータからデータを取得
    const data: CompanyData = {
      name: searchParams.get('name') || '',
      phone: searchParams.get('phone') || '',
      email: searchParams.get('email') || '',
      url: searchParams.get('url') || '',
      postalCode: searchParams.get('postalCode') || '',
      address: searchParams.get('address') || '',
      businessType: searchParams.get('businessType') || '',
      employees: searchParams.get('employees') || '',
      annualRevenue: searchParams.get('annualRevenue') || ''
    }

    // 必須項目のチェック
    if (!data.name || !data.phone || !data.address) {
      toast.error('入力データが不足しています');
      router.push('/admin/company-management/register');
      return;
    }

    setCompanyData(data);
  }, [router, searchParams])

  const handleRegister = async () => {
    setLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(companyData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('企業を登録しました');
        router.push('/admin/companies');
      } else {
        toast.error(data.error || '登録に失敗しました');
      }
    } catch (error) {
      console.error('Error creating company:', error);
      toast.error('登録に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = () => {
    // URLパラメータとして元のフォーム画面に戻る
    const params = new URLSearchParams(companyData);
    router.push(`/admin/company-management/register?${params.toString()}`);
  }

  return (
    <div className="p-8">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl" style={{padding: '60px'}}>
        <p className="text-black" style={{marginBottom: '3.5rem'}}>登録内容に誤りがないか確認してください。</p>
        
        <div className="space-y-6">
          <div className="flex border-b pb-3">
            <div className="w-40 text-gray-600 pr-6">事業者名</div>
            <div className="font-semibold">{companyData.name}</div>
          </div>
          
          <div className="flex border-b pb-3">
            <div className="w-40 text-gray-600 pr-6">電話番号</div>
            <div className="font-semibold">{companyData.phone}</div>
          </div>
          
          {companyData.email && (
            <div className="flex border-b pb-3">
              <div className="w-40 text-gray-600 pr-6">メールアドレス</div>
              <div className="font-semibold">{companyData.email}</div>
            </div>
          )}
          
          {companyData.url && (
            <div className="flex border-b pb-3">
              <div className="w-40 text-gray-600 pr-6">ウェブサイトURL</div>
              <div className="font-semibold">{companyData.url}</div>
            </div>
          )}
          
          {companyData.postalCode && (
            <div className="flex border-b pb-3">
              <div className="w-40 text-gray-600 pr-6">郵便番号</div>
              <div className="font-semibold">{companyData.postalCode}</div>
            </div>
          )}
          
          <div className="flex border-b pb-3">
            <div className="w-40 text-gray-600 pr-6">住所</div>
            <div className="font-semibold flex-1">{companyData.address}</div>
          </div>

          {companyData.businessType && (
            <div className="flex border-b pb-3">
              <div className="w-40 text-gray-600 pr-6">業種</div>
              <div className="font-semibold">
                {companyData.businessType === 'it' ? 'IT・通信' :
                 companyData.businessType === 'manufacturing' ? '製造業' :
                 companyData.businessType === 'retail' ? '小売業' :
                 companyData.businessType === 'service' ? 'サービス業' :
                 companyData.businessType === 'construction' ? '建設業' :
                 companyData.businessType === 'finance' ? '金融業' :
                 companyData.businessType === 'healthcare' ? '医療・福祉' :
                 companyData.businessType === 'education' ? '教育' : companyData.businessType}
              </div>
            </div>
          )}

          {companyData.employees && (
            <div className="flex border-b pb-3">
              <div className="w-40 text-gray-600 pr-6">社員数</div>
              <div className="font-semibold">
                {companyData.employees === '1-10' ? '1-10名' :
                 companyData.employees === '11-50' ? '11-50名' :
                 companyData.employees === '51-100' ? '51-100名' :
                 companyData.employees === '100+' ? '100名以上' : companyData.employees}
              </div>
            </div>
          )}

          {companyData.annualRevenue && (
            <div className="flex border-b pb-3">
              <div className="w-40 text-gray-600 pr-6">年間売上</div>
              <div className="font-semibold">
                {companyData.annualRevenue === 'under-10M' ? '1000万円未満' :
                 companyData.annualRevenue === '10M-50M' ? '1000万円〜5000万円' :
                 companyData.annualRevenue === '50M-100M' ? '5000万円〜1億円' :
                 companyData.annualRevenue === '100M-500M' ? '1億円〜5億円' :
                 companyData.annualRevenue === '500M-1B' ? '5億円〜10億円' :
                 companyData.annualRevenue === '1B+' ? '10億円以上' : companyData.annualRevenue}
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 flex gap-4">
          <Button 
            type="button" 
            variant="outline"
            className="ml-64 border-orange-500 text-orange-500"
            onClick={handleEdit}
          >
            修正する
          </Button>
          <Button 
            type="button" 
            className="ml-64 bg-orange-500 hover:bg-orange-600 text-white"
            disabled={loading}
            onClick={handleRegister}
          >
            {loading ? "登録中..." : "企業情報を登録する"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CompanyConfirm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompanyConfirmContent />
    </Suspense>
  )
}
