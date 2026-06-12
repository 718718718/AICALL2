"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Phone, Clock, User, Building, Mail, MapPin, Loader2, Save, FileText, Download } from "lucide-react"
import { format } from "date-fns"
import { ja } from "date-fns/locale"

interface CallDetailData {
  id: string
  customer: {
    id?: string
    name: string
    phone: string
    company?: string
    email?: string
    address?: string
  }
  date: string
  startTime: string
  endTime?: string
  duration: string
  durationSeconds: number
  status: string
  result: string
  notes: string
  assignedAgent?: {
    id: string
    name: string
  }
  twilioCallSid?: string
  recordingUrl?: string
  hasRecording?: boolean
  transcript?: Array<{
    timestamp: string
    speaker: string
    message: string
    confidence?: number
  }>
}

interface CallDetailModalProps {
  isOpen: boolean
  onClose: () => void
  callId: string | null
}

const statusColors: Record<string, string> = {
  成功: "bg-green-500",
  不在: "bg-yellow-500",
  要フォロー: "bg-purple-500",
  拒否: "bg-red-500",
  失敗: "bg-gray-500",
  未対応: "bg-gray-600",
  未設定: "bg-gray-400"
}

export function CallDetailModal({ isOpen, onClose, callId }: CallDetailModalProps) {
  const [callDetail, setCallDetail] = useState<CallDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newNotes, setNewNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchCallDetail = async (id: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/call-history/${id}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("accessToken")}`,
          "Content-Type": "application/json"
        }
      })

      if (!response.ok) {
        throw new Error("通話詳細の取得に失敗しました")
      }

      const data = await response.json()
      
      if (data.success) {
        setCallDetail(data.data)
        setNewNotes(data.data.notes || "")
      } else {
        throw new Error(data.error || "データの取得に失敗しました")
      }
    } catch (err) {
      console.error("Error fetching call detail:", err)
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  const saveCallRecord = async () => {
    if (!callDetail || !newNotes.trim()) {
      return
    }

    setSaving(true)
    
    try {
      const updateData: any = {}
      if (newNotes.trim()) updateData.notes = newNotes.trim()

      const response = await fetch(`/api/call-history/${callDetail.id}`, {
        method: 'PATCH',
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("accessToken")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        throw new Error("応対記録の保存に失敗しました")
      }

      await fetchCallDetail(callDetail.id)
    } catch (err) {
      console.error("Error saving call record:", err)
      setError(err instanceof Error ? err.message : "保存に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (isOpen && callId) {
      fetchCallDetail(callId)
    }
  }, [isOpen, callId])

  useEffect(() => {
    if (!isOpen) {
      setCallDetail(null)
      setNewNotes("")
      setError(null)
    }
  }, [isOpen])

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return format(date, "yyyy/MM/dd", { locale: ja })
    } catch {
      return dateString
    }
  }

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return format(date, "HH:mm", { locale: ja })
    } catch {
      return ""
    }
  }

  const normalizeStatus = (status: string | null | undefined): string => {
    if (!status) return "未設定";
    
    // "失敗: timeout" のような形式のステータスを処理
    if (status.includes("失敗")) return "失敗";
    if (status.includes("成功")) return "成功";
    if (status.includes("不在")) return "不在";
    if (status.includes("拒否")) return "拒否";
    if (status.includes("要フォロー")) return "要フォロー";
    if (status.includes("通話中")) return "通話中";
    if (status.includes("未対応")) return "未対応";
    
    const validResults = ['成功', '不在', '拒否', '要フォロー', '失敗', '未対応', '通話中'];
    if (validResults.includes(status)) return status;
    
    // 無効なステータスでもそのまま保持（警告のみ）
    console.warn(`[CallDetailModal] Unknown status: ${status}, keeping as-is`);
    return status;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>通話詳細</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg">
            {error}
          </div>
        ) : callDetail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    顧客詳細
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">名前</label>
                    <div className="text-sm">{callDetail.customer.name}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">電話番号</label>
                    <div className="text-sm">{callDetail.customer.phone}</div>
                  </div>
                  {callDetail.customer.company && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">会社名</label>
                      <div className="text-sm flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {callDetail.customer.company}
                      </div>
                    </div>
                  )}
                  {callDetail.customer.email && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">メールアドレス</label>
                      <div className="text-sm flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {callDetail.customer.email}
                      </div>
                    </div>
                  )}
                  {callDetail.customer.address && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">住所</label>
                      <div className="text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {callDetail.customer.address}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    通話詳細
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">日付</label>
                    <div className="text-sm">{formatDate(callDetail.date)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">開始時間</label>
                    <div className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(callDetail.startTime)}
                    </div>
                  </div>
                  {callDetail.endTime && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">終了時間</label>
                      <div className="text-sm flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(callDetail.endTime)}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-600">通話時間</label>
                    <div className="text-sm">{callDetail.duration}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">結果</label>
                    <div>
                      <Badge className={`${statusColors[normalizeStatus(callDetail.result)]} text-white`}>
                        {normalizeStatus(callDetail.result)}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">通話ID</label>
                    <div className="text-xs font-mono text-gray-500 select-all">{callDetail.id || '-'}</div>
                  </div>
                  {callDetail.hasRecording && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">録音</label>
                      <div className="mt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // プロキシエンドポイント経由でTwilioから録音をダウンロード
                            const token = localStorage.getItem("accessToken");
                            const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
                            const downloadUrl = `${apiUrl}/api/call-history/${callDetail.id}/recording`;

                            // 認証付きでダウンロード
                            fetch(downloadUrl, {
                              headers: {
                                'Authorization': `Bearer ${token}`
                              }
                            })
                              .then(response => {
                                if (!response.ok) {
                                  throw new Error('録音のダウンロードに失敗しました');
                                }
                                return response.blob();
                              })
                              .then(blob => {
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `recording_${callDetail.id}.wav`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              })
                              .catch(error => {
                                console.error('Download error:', error);
                                alert('録音のダウンロードに失敗しました');
                              });
                          }}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          録音をダウンロード
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  対応メモ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    メモ内容
                  </label>
                  <Textarea
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="対応内容を入力してください..."
                    rows={4}
                    className="w-full"
                  />
                </div>
                
                <Button 
                  onClick={saveCallRecord}
                  disabled={!newNotes.trim() || saving}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      保存
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {callDetail.transcript && callDetail.transcript.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>文字起こし</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {callDetail.transcript.map((item, index) => (
                      <div key={index} className="text-sm">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{formatTime(item.timestamp)}</span>
                          <Badge variant="outline" className="text-xs">
                            {item.speaker}
                          </Badge>
                        </div>
                        <div className="mt-1">{item.message}</div>
                        <Separator className="mt-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}