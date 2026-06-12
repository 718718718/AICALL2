"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Phone } from "lucide-react"
import { toast } from "sonner"

export default function AICallButton() {
  const [isCalling, setIsCalling] = useState(false)

  const startCall = async () => {
    try {
      setIsCalling(true)
      const response = await fetch("/api/twilio/call", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("通話の開始に失敗しました")
      }

      toast.success("通話を開始しました")
    } catch (error) {
      toast.error("通話の開始に失敗しました")
      setIsCalling(false)
    }
  }

  return (
    <Button
      onClick={startCall}
      size="sm"
      variant={isCalling ? "destructive" : "default"}
      disabled={isCalling}
    >
      <Phone className="h-4 w-4" />
      {isCalling ? "通話中..." : "電話をかける"}
    </Button>
  )
}

