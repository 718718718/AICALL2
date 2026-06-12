"use client"

import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function CompanyComplete() {
  const router = useRouter()

  const handleGoToList = () => {
    router.push("/companies")
  }

  return (
    <div className="p-8">
      <div className="bg-white rounded-lg p-8 max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold mb-6">登録完了</h1>
        
        <p className="text-gray-600 mb-8">企業情報の登録が完了しました。</p>
        
        <Button 
          onClick={handleGoToList}
          className="text-orange-500 hover:text-orange-600 underline bg-transparent hover:bg-transparent p-0"
        >
          企業一覧へ戻る
        </Button>
      </div>
    </div>
  )
}
