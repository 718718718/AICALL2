"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sidebar } from "@/components/sidebar"
import { User, Mail, Building, Calendar, Shield, Edit2, Save, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { authenticatedApiRequest } from "@/lib/apiHelper"

export default function UserInfoPage() {
  const [userData, setUserData] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedData, setEditedData] = useState<any>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        // トークンがない場合はLocalStorageから取得
        const storedUserData = localStorage.getItem('userData')
        if (storedUserData) {
          const data = JSON.parse(storedUserData)
          const user = data.user || data.data || data
          setUserData(user)
          setEditedData(user)
        }
        return
      }

      // APIから最新のユーザー情報を取得
      const result = await authenticatedApiRequest('/api/auth/me')
      const user = result.data || result.user || result
        
      // LocalStorageも更新
      localStorage.setItem('userData', JSON.stringify({ user }))
        
      setUserData(user)
      setEditedData(user)
    } catch (error) {
      console.error("Error fetching user data:", error)
      // エラーの場合もLocalStorageから取得
      const storedUserData = localStorage.getItem('userData')
      if (storedUserData) {
        try {
          const data = JSON.parse(storedUserData)
          const user = data.user || data.data || data
          setUserData(user)
          setEditedData(user)
        } catch (parseError) {
          console.error("Error parsing stored user data:", parseError)
        }
      }
    }
  }

  const handleSave = async () => {
    try {
      // APIに送信
      const responseData = await authenticatedApiRequest('/api/auth/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: `${editedData.lastName || ''} ${editedData.firstName || ''}`.trim() || editedData.name || editedData.fullName,
          email: editedData.email,
          phone: editedData.phone,
          handoffPhoneNumber: editedData.handoffPhoneNumber
        })
      })
      const updatedUser = responseData.data || responseData.user || responseData
      
      // Update LocalStorage with the response data
      localStorage.setItem('userData', JSON.stringify({ user: updatedUser }))
      setUserData(updatedUser)
      setEditedData(updatedUser)
      setEditMode(false)
      
      // 最新データを再取得して確実に反映
      await fetchUserData()
      
      toast({
        title: "保存完了",
        description: "ユーザー情報が更新されました。",
      })
    } catch (error) {
      console.error('Failed to save user data:', error)
      toast({
        title: "保存エラー",
        description: "ユーザー情報の保存に失敗しました。",
        variant: "destructive"
      })
    }
  }

  const handleCancel = () => {
    setEditedData(userData)
    setEditMode(false)
  }

  const handleInputChange = (field: string, value: string) => {
    setEditedData({ ...editedData, [field]: value })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">ユーザー情報</h1>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </Button>
                <Button onClick={handleCancel} variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  キャンセル
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditMode(true)} className="bg-blue-600 hover:bg-blue-700">
                <Edit2 className="h-4 w-4 mr-2" />
                編集
              </Button>
            )}
          </div>
        </div>

        {userData ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  基本情報
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm text-gray-500">氏名</Label>
                  {editMode ? (
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={editedData?.lastName || ""}
                        onChange={(e) => handleInputChange("lastName", e.target.value)}
                        placeholder="姓"
                      />
                      <Input
                        value={editedData?.firstName || ""}
                        onChange={(e) => handleInputChange("firstName", e.target.value)}
                        placeholder="名"
                      />
                    </div>
                  ) : (
                    <p className="text-lg font-medium">
                      {userData.firstName && userData.lastName 
                        ? `${userData.lastName} ${userData.firstName}`
                        : userData.name || userData.fullName || "未設定"}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-gray-500">会社名</Label>
                  <p className="text-lg font-medium">{userData.companyName || "未設定"}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500">会社ID</Label>
                  <p className="text-lg font-medium text-gray-400">{userData.companyId || "未設定"}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500">ユーザーID</Label>
                  <p className="text-lg font-medium text-gray-400">{userData.id || userData._id || "未設定"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  連絡先情報
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm text-gray-500">メールアドレス</Label>
                  {editMode ? (
                    <Input
                      type="email"
                      value={editedData?.email || ""}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-lg font-medium">{userData.email || "未設定"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-gray-500">電話番号</Label>
                  {editMode ? (
                    <Input
                      type="tel"
                      value={editedData?.phone || ""}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-lg font-medium">{userData.phone || "未設定"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-gray-500">取次用電話番号</Label>
                  {editMode ? (
                    <Input
                      type="tel"
                      value={editedData?.handoffPhoneNumber || ""}
                      onChange={(e) => handleInputChange("handoffPhoneNumber", e.target.value)}
                      className="mt-1"
                      placeholder="090-1234-5678"
                    />
                  ) : (
                    <p className="text-lg font-medium">{userData.handoffPhoneNumber || "未設定"}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  権限情報
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">ロール</p>
                  <p className="text-lg font-medium">
                    {userData.role === "admin" ? "管理者" : userData.role === "user" ? "一般ユーザー" : userData.role || "未設定"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ステータス</p>
                  <p className="text-lg font-medium">
                    <span className={`px-2 py-1 rounded text-sm ${userData.isActive !== false ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {userData.isActive !== false ? "アクティブ" : "非アクティブ"}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  アカウント情報
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">作成日</p>
                  <p className="text-lg font-medium">
                    {userData.createdAt ? new Date(userData.createdAt).toLocaleDateString('ja-JP') : "未設定"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">ユーザー情報を読み込み中...</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}