"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import Link from "next/link"

export default function SignupCompletePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-xl">登録完了しました</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            会員登録が完了しました。
            <br />
            ログインしてサービスをご利用ください。
          </p>
          <Link href="/login">
            <Button className="w-full bg-orange-500 hover:bg-orange-600">ログインページへ</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
