"use client"

import type React from "react"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>()
  const [formData, setFormData] = useState({
    name: "田中太郎",
    email: "tanaka@example.com",
    phone: "090-1234-5678",
    address: "道玄坂1-2-3",
    prefecture: "tokyo",
    city: "渋谷区",
    zipCode: "123-4567",
    company: "株式会社サンプル",
    position: "営業部長",
    notes: "重要顧客",
  })
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/customer/edit/${params.id}/complete`)
  }

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold mb-6">顧客情報編集</h1>

          <Card>
            <CardHeader>
              <CardTitle>編集</CardTitle>
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">郵便番号</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => updateFormData("zipCode", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prefecture">都道府県</Label>
                    <Select value={formData.prefecture} onValueChange={(value) => updateFormData("prefecture", value)}>
                      <SelectTrigger>
                        <SelectValue />
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
                    <Input id="city" value={formData.city} onChange={(e) => updateFormData("city", e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">住所</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => updateFormData("address", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">会社名</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => updateFormData("company", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">役職</Label>
                    <Input
                      id="position"
                      value={formData.position}
                      onChange={(e) => updateFormData("position", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">備考</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => updateFormData("notes", e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    キャンセル
                  </Button>
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                    更新する
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
