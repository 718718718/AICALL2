"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"

export default function NewCustomerCompletePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6 flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-xl">登録完了</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">顧客情報の登録が完了しました。</p>
            <div className="space-y-2">
              <Link href="/dashboard">
                <Button className="w-full bg-orange-500 hover:bg-orange-600">顧客一覧に戻る</Button>
              </Link>
              <Link href="/customer/new">
                <Button variant="outline" className="w-full bg-transparent">
                  続けて登録する
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
