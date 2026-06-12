"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings, Users, FileText, BarChart3 } from "lucide-react"
import { Sidebar } from "@/components/sidebar"

export default function ManagementPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6">
        <h1 className="text-2xl font-bold mb-6">管理</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <Users className="h-6 w-6 text-blue-600" />
              <CardTitle className="ml-2">ユーザー管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">システムユーザーの追加・編集・削除を行います</p>
              <Button className="w-full bg-orange-500 hover:bg-orange-600">管理画面へ</Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <Settings className="h-6 w-6 text-blue-600" />
              <CardTitle className="ml-2">システム設定</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">システム全体の設定を変更します</p>
              <Button className="w-full bg-orange-500 hover:bg-orange-600">設定画面へ</Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <FileText className="h-6 w-6 text-blue-600" />
              <CardTitle className="ml-2">データ管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">データのバックアップ・復元を行います</p>
              <Button className="w-full bg-orange-500 hover:bg-orange-600">管理画面へ</Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              <CardTitle className="ml-2">レポート</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">各種レポートの生成・ダウンロードを行います</p>
              <Button className="w-full bg-orange-500 hover:bg-orange-600">レポート画面へ</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
