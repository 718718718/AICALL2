"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Trash2 } from 'lucide-react'

export default function CompanyDashboard() {
  const [activeTab, setActiveTab] = useState("company")
  const [userLimit, setUserLimit] = useState("10")

  const users = [
    "ユーザー1",
    "ユーザー2", 
    "ユーザー3",
    "ユーザー4",
    "ユーザー5"
  ]

  return (
    <div className="p-8">
      <div className="flex gap-8">
        {/* Company Information Section */}
        <div className="flex-1">
          <div className="flex gap-4 mb-6">
            <Button
              variant={activeTab === "company" ? "default" : "outline"}
              onClick={() => setActiveTab("company")}
              className={activeTab === "company" ? "bg-orange-500 hover:bg-orange-600" : "border-orange-500 text-orange-500"}
            >
              編集
            </Button>
            <h2 className="text-xl font-bold py-2">企業情報</h2>
          </div>

          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <h3 className="font-bold">企業名1</h3>
                <p className="text-sm text-gray-600">（キギョウメイ）</p>
                <p className="text-sm text-gray-600">📞 03-123-4567</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">企業ID</div>
                <div>XXXXXX</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">アカウント名</div>
                <div>kigyou_1</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">パスワード</div>
                <div>XXXXXXXX</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">事業者電話番号</div>
                <div>03-123-4567</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">メールアドレス</div>
                <div>XXXXXXX@aicall.com</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">郵便番号</div>
                <div>000-0000</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">住所</div>
                <div>東京都新宿区新宿０丁目０番地０号新宿ビル１</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">業種1</div>
                <div>情報通信業</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">業種2</div>
                <div>通信業</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">社員数</div>
                <div>〜50名</div>
              </div>
              
              <div className="flex border-b pb-2">
                <div className="w-32 text-gray-600">年間売上</div>
                <div>〜5000万</div>
              </div>
            </div>
          </div>
        </div>

        {/* User Management Section */}
        <div className="w-80">
          <div className="flex gap-4 mb-6">
            <Button
              variant="outline"
              className="border-orange-500 text-orange-500"
            >
              編集
            </Button>
            <h2 className="text-xl font-bold py-2">ユーザー管理</h2>
            <Button
              variant="outline"
              className="border-orange-500 text-orange-500 ml-auto"
            >
              ユーザー追加
            </Button>
          </div>

          <div className="bg-white rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>設定ユーザー数</span>
                <Select value={userLimit} onValueChange={setUserLimit}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-between">
                <span>登録ユーザー数</span>
                <span>5/10</span>
              </div>
              
              <div>
                <div className="mb-2">登録ユーザー名</div>
                <div className="space-y-2">
                  {users.map((user, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>{user}</span>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
