"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"
import { useToast } from "@/components/ui/use-toast"
import { authenticatedApiRequest } from "@/lib/apiHelper"

export default function NewCustomerPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    prefecture: "",
    city: "",
    zipCode: "",
    company: "",
    position: "",
    notes: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Prepare customer data for API
      const customerData = {
        customer: formData.name,
        address: `${formData.prefecture} ${formData.city} ${formData.address}`,
        date: new Date().toLocaleDateString('ja-JP'),
        time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        duration: "0:00",
        result: "未対応",
        notes: formData.notes,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
        position: formData.position,
        zipCode: formData.zipCode
      }

      const response = await authenticatedApiRequest('/api/customers', {
        method: 'POST',
        body: JSON.stringify(customerData),
      })

      toast({
        title: "成功",
        description: "顧客を登録しました",
      })

      // Redirect to dashboard after successful creation
      router.push("/dashboard")
    } catch (error) {
      toast({
        title: "エラー",
        description: "顧客の登録に失敗しました",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold mb-6">新規登録</h1>

          <Card>
            <CardHeader>
              <CardTitle>顧客情報</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">氏名 *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateFormData("name", e.target.value)}
                      placeholder="田中太郎"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateFormData("email", e.target.value)}
                      placeholder="tanaka@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">電話番号</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => updateFormData("phone", e.target.value)}
                      placeholder="090-1234-5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">郵便番号</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => updateFormData("zipCode", e.target.value)}
                      placeholder="123-4567"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prefecture">都道府県</Label>
                    <Select value={formData.prefecture} onValueChange={(value) => updateFormData("prefecture", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hokkaido">北海道</SelectItem>
                        <SelectItem value="aomori">青森県</SelectItem>
                        <SelectItem value="iwate">岩手県</SelectItem>
                        <SelectItem value="miyagi">宮城県</SelectItem>
                        <SelectItem value="akita">秋田県</SelectItem>
                        <SelectItem value="yamagata">山形県</SelectItem>
                        <SelectItem value="fukushima">福島県</SelectItem>
                        <SelectItem value="ibaraki">茨城県</SelectItem>
                        <SelectItem value="tochigi">栃木県</SelectItem>
                        <SelectItem value="gunma">群馬県</SelectItem>
                        <SelectItem value="saitama">埼玉県</SelectItem>
                        <SelectItem value="chiba">千葉県</SelectItem>
                        <SelectItem value="tokyo">東京都</SelectItem>
                        <SelectItem value="kanagawa">神奈川県</SelectItem>
                        <SelectItem value="niigata">新潟県</SelectItem>
                        <SelectItem value="toyama">富山県</SelectItem>
                        <SelectItem value="ishikawa">石川県</SelectItem>
                        <SelectItem value="fukui">福井県</SelectItem>
                        <SelectItem value="yamanashi">山梨県</SelectItem>
                        <SelectItem value="nagano">長野県</SelectItem>
                        <SelectItem value="gifu">岐阜県</SelectItem>
                        <SelectItem value="shizuoka">静岡県</SelectItem>
                        <SelectItem value="aichi">愛知県</SelectItem>
                        <SelectItem value="mie">三重県</SelectItem>
                        <SelectItem value="shiga">滋賀県</SelectItem>
                        <SelectItem value="kyoto">京都府</SelectItem>
                        <SelectItem value="osaka">大阪府</SelectItem>
                        <SelectItem value="hyogo">兵庫県</SelectItem>
                        <SelectItem value="nara">奈良県</SelectItem>
                        <SelectItem value="wakayama">和歌山県</SelectItem>
                        <SelectItem value="tottori">鳥取県</SelectItem>
                        <SelectItem value="shimane">島根県</SelectItem>
                        <SelectItem value="okayama">岡山県</SelectItem>
                        <SelectItem value="hiroshima">広島県</SelectItem>
                        <SelectItem value="yamaguchi">山口県</SelectItem>
                        <SelectItem value="tokushima">徳島県</SelectItem>
                        <SelectItem value="kagawa">香川県</SelectItem>
                        <SelectItem value="ehime">愛媛県</SelectItem>
                        <SelectItem value="kochi">高知県</SelectItem>
                        <SelectItem value="fukuoka">福岡県</SelectItem>
                        <SelectItem value="saga">佐賀県</SelectItem>
                        <SelectItem value="nagasaki">長崎県</SelectItem>
                        <SelectItem value="kumamoto">熊本県</SelectItem>
                        <SelectItem value="oita">大分県</SelectItem>
                        <SelectItem value="miyazaki">宮崎県</SelectItem>
                        <SelectItem value="kagoshima">鹿児島県</SelectItem>
                        <SelectItem value="okinawa">沖縄県</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">市区町村</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => updateFormData("city", e.target.value)}
                      placeholder="渋谷区"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">住所</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => updateFormData("address", e.target.value)}
                    placeholder="道玄坂1-2-3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">会社名</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => updateFormData("company", e.target.value)}
                      placeholder="株式会社サンプル"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">役職</Label>
                    <Input
                      id="position"
                      value={formData.position}
                      onChange={(e) => updateFormData("position", e.target.value)}
                      placeholder="営業部長"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">備考</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => updateFormData("notes", e.target.value)}
                    placeholder="その他の情報"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    キャンセル
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-orange-500 hover:bg-orange-600"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "登録中..." : "登録する"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
