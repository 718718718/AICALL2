"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"

export default function ImportCompletePage() {
  const [importResult, setImportResult] = useState<{
    totalImported: number;
    message: string;
    timestamp: string;
  } | null>(null)

  useEffect(() => {
    // Get import result from localStorage
    const result = localStorage.getItem('importResult')
    if (result) {
      try {
        const parsed = JSON.parse(result)
        setImportResult(parsed)
        // Clear the result from localStorage after use
        localStorage.removeItem('importResult')
      } catch (error) {
        console.error('Failed to parse import result:', error)
      }
    }
  }, [])

  const totalImported = importResult?.totalImported || 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6 flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-xl">インポート完了</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center justify-center space-x-2 text-green-800">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">成功: {totalImported}件</span>
              </div>
            </div>

            {/* Remove the skip section for now since we don't have that data from backend */}

            <Link href="/dashboard">
              <Button className="w-full bg-orange-500 hover:bg-orange-600">顧客一覧を確認</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
