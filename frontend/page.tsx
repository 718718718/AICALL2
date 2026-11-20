"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, ChevronLeft, ChevronRight, Phone, Calendar, Clock, User, FileText, Loader2 } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { CallDetailModal } from "@/components/CallDetailModal"
import { CallHistoryExportModal } from "@/components/calls/CallHistoryExportModal"
import { CallHistoryDeleteModal } from "@/components/calls/CallHistoryDeleteModal"
import { authenticatedApiRequest } from "@/lib/apiHelper"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { toast } from "sonner"

interface Customer {
  id?: string
  name: string
  customer?: string
  phone: string
  company?: string
  email?: string
  address?: string
}

interface CallRecord {
  id: string
  customer: Customer
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
  hasTranscript: boolean
  transcriptCount: number
}

interface Pagination {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  hasNext: boolean
  hasPrev: boolean
}

interface Statistics {
  totalCalls: number
  successRate: number
  avgDuration: string
  pendingCount: number
}

// 定義されているステータス値
const VALID_CALL_RESULTS = ['成功', '不在', '担当者不在', '拒否', '要フォロー', '失敗', '通話中', '未対応'];

const statusColors: Record<string, string> = {
  成功: "bg-green-500",
  不在: "bg-yellow-500",
  担当者不在: "bg-orange-500",
  要フォロー: "bg-purple-500",
  拒否: "bg-red-500",
  失敗: "bg-gray-500",
  通話中: "bg-blue-500",
  未対応: "bg-gray-600",
  未設定: "bg-gray-400"
}

// ステータス値を正規化する関数
const normalizeStatus = (status: string | null | undefined): string => {
  if (!status) return "未設定";
  
  // "失敗: timeout" のような形式のステータスを処理
  if (status.includes("失敗")) return "失敗";
  if (status.includes("成功")) return "成功";
  if (status.includes("担当者不在")) return "担当者不在";
  if (status.includes("不在")) return "不在";
  if (status.includes("拒否")) return "拒否";
  if (status.includes("要フォロー")) return "要フォロー";
  if (status.includes("通話中")) return "通話中";
  
  // 完全一致のチェック
  if (VALID_CALL_RESULTS.includes(status)) return status;
  
  // 無効なステータスでもそのまま保持（警告のみ）
  console.warn(`[CallHistory] Unknown status: ${status}, keeping as-is`);
  return status;
}

const statusOptions = [
  { value: "all", label: "すべて" },
  { value: "成功", label: "成功" },
  { value: "不在", label: "不在" },
  { value: "担当者不在", label: "担当者不在" },
  { value: "要フォロー", label: "要フォロー" },
  { value: "拒否", label: "拒否" },
  { value: "失敗", label: "失敗" }
]

export default function CallHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set())
  const [pagination, setPagination] = useState<Pagination>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    hasNext: false,
    hasPrev: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statistics, setStatistics] = useState<Statistics>({
    totalCalls: 0,
    successRate: 0,
    avgDuration: "0秒",
    pendingCount: 0
  })
  const [statsLoading, setStatsLoading] = useState(false)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 統計情報を取得
  const fetchStatistics = async () => {
    setStatsLoading(true)
    try {
      const data = await authenticatedApiRequest('/api/call-history/stats/summary')
      
      if (data.success) {
        setStatistics(data.data)
      } else {
        throw new Error(data.error || "統計情報の取得に失敗しました")
      }
    } catch (err) {
      console.error("Error fetching statistics:", err)
    } finally {
      setStatsLoading(false)
    }
  }

  // コール履歴を取得
  const fetchCallHistory = async (page: number = 1) => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        sortBy: "createdAt",
        sortOrder: "desc"
      })

      if (searchTerm) {
        params.append("search", searchTerm)
      }

      if (selectedStatus !== "all") {
        params.append("result", selectedStatus)
      }

      const data = await authenticatedApiRequest(`/api/call-history?${params}`)
      
      if (data.success) {
        const callsData = Array.isArray(data.data) ? data.data : []
        console.log('[Call History] Received data:', callsData)
        setCalls(callsData)
        setPagination(data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          itemsPerPage: 10,
          hasNext: false,
          hasPrev: false
        })
      } else {
        console.error('[Call History] API returned error:', data.error)
        throw new Error(data.error || "データの取得に失敗しました")
      }
    } catch (err) {
      console.error("Error fetching call history:", err)
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  // 初回読み込みと検索条件変更時
  useEffect(() => {
    fetchCallHistory(1)
  }, [searchTerm, selectedStatus])

  // 統計情報の初回読み込み
  useEffect(() => {
    fetchStatistics()
  }, [])

  // チェックボックスの全選択/解除
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCalls(new Set(calls.map(call => call.id)))
    } else {
      setSelectedCalls(new Set())
    }
  }

  // 個別チェックボックスの選択
  const handleSelectCall = (callId: string, checked: boolean) => {
    const newSelected = new Set(selectedCalls)
    if (checked) {
      newSelected.add(callId)
    } else {
      newSelected.delete(callId)
    }
    setSelectedCalls(newSelected)
  }

  // ページ変更
  const handlePageChange = (newPage: number) => {
    fetchCallHistory(newPage)
  }

  // 日時フォーマット
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


  // 通話詳細表示
  const handleCallDetails = (callId: string) => {
    setSelectedCallId(callId)
    setIsDetailModalOpen(true)
  }

  // 詳細モーダルを閉じる
  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false)
    setSelectedCallId(null)
    // データの更新があった可能性があるため、履歴を再取得
    fetchCallHistory(pagination.currentPage)
  }

  // CSVエクスポートモーダルを開く
  const handleOpenExportModal = () => {
    if (selectedCalls.size === 0) {
      toast.error("エクスポートするコールを選択してください")
      return
    }
    setIsExportModalOpen(true)
  }

  // CSVエクスポート処理
  const handleExportCSV = () => {
    try {
      // 選択されたコールデータを取得
      const selectedCallData = calls.filter(call => selectedCalls.has(call.id))

      if (selectedCallData.length === 0) {
        toast.error("エクスポートするデータがありません")
        return
      }

      // CSV形式に変換
      const headers = ["顧客名", "電話番号", "会社名", "日付", "開始時刻", "終了時刻", "通話時間", "結果", "メモ"]
      const csvRows = [
        headers.join(","),
        ...selectedCallData.map(call => {
          const row = [
            `"${call.customer?.name || call.customer?.customer || '不明'}"`,
            `"${call.customer?.phone || '不明'}"`,
            `"${call.customer?.company || ''}"`,
            `"${formatDate(call.date)}"`,
            `"${formatTime(call.startTime)}"`,
            `"${call.endTime ? formatTime(call.endTime) : ''}"`,
            `"${call.duration}"`,
            `"${call.result || '未設定'}"`,
            `"${(call.notes || '').replace(/"/g, '""')}"` // ダブルクォートをエスケープ
          ]
          return row.join(",")
        })
      ]

      const csvContent = "\uFEFF" + csvRows.join("\n") // BOM付きUTF-8

      // Blobを作成してダウンロード
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.style.display = "none"
      link.href = url
      link.download = `call-history-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)

      toast.success(`${selectedCallData.length}件のコール履歴をエクスポートしました`)
      setIsExportModalOpen(false)
    } catch (error) {
      console.error("CSV export error:", error)
      toast.error("CSVエクスポートに失敗しました")
    }
  }

  // 削除モーダルを開く
  const handleOpenDeleteModal = () => {
    if (selectedCalls.size === 0) {
      toast.error("削除するコールを選択してください")
      return
    }
    setIsDeleteModalOpen(true)
  }

  // 削除処理
  const handleDeleteCalls = async () => {
    setIsDeleting(true)
    try {
      const callIds = Array.from(selectedCalls)

      if (callIds.length === 0) {
        toast.error("削除するコールがありません")
        return
      }

      const data = await authenticatedApiRequest('/api/call-history/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ callIds }),
      })

      if (data.success) {
        toast.success(`${data.deletedCount}件のコール履歴を削除しました`)
        setIsDeleteModalOpen(false)
        setSelectedCalls(new Set()) // 選択をクリア
        // データを再取得
        await fetchCallHistory(pagination.currentPage)
        await fetchStatistics() // 統計情報も更新
      } else {
        throw new Error(data.error || "削除に失敗しました")
      }
    } catch (error) {
      console.error("Delete error:", error)
      toast.error(error instanceof Error ? error.message : "コール履歴の削除に失敗しました")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main className="ml-64 p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">コール履歴</h1>
        </div>

        {/* 統計情報カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* 総コール件数 */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 mb-1">総コール件数</div>
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              ) : (
                `${statistics.totalCalls.toLocaleString()}件`
              )}
            </div>
          </div>

          {/* 成功率 */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 mb-1">成功率</div>
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              ) : (
                `${statistics.successRate}%`
              )}
            </div>
          </div>

          {/* 平均通話時間 */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 mb-1">平均通話時間</div>
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              ) : (
                statistics.avgDuration
              )}
            </div>
          </div>

          {/* 未対応件数 */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 mb-1">未対応件数</div>
            <div className="text-2xl font-bold text-orange-600">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              ) : (
                `${statistics.pendingCount}件`
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="顧客名・電話番号で検索"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="結果で絞り込み" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : calls.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Phone className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>コール履歴がありません</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">
                      <Checkbox 
                        checked={selectedCalls.size === calls.length && calls.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="p-3 text-left">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        顧客名
                      </div>
                    </th>
                    <th className="p-3 text-left">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        日付
                      </div>
                    </th>
                    <th className="p-3 text-left">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        時間
                      </div>
                    </th>
                    <th className="p-3 text-left">通話時間</th>
                    <th className="p-3 text-left">結果</th>
                    <th className="p-3 text-left">
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        メモ
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(calls) && calls.length > 0 ? calls.map((call) => call && (
                    <tr 
                      key={call.id} 
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleCallDetails(call.id)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedCalls.has(call.id)}
                          onCheckedChange={(checked) => handleSelectCall(call.id, checked as boolean)}
                        />
                      </td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{call.customer?.name || call.customer?.customer || '不明'}</div>
                          <div className="text-xs text-gray-500">{call.customer?.phone || '電話番号なし'}</div>
                          {call.customer?.company && (
                            <div className="text-xs text-gray-400">{call.customer.company}</div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">{formatDate(call.date)}</td>
                      <td className="p-3">{formatTime(call.startTime)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {call.duration}
                          {call.hasTranscript && (
                            <span className="text-xs text-blue-600" title="文字起こしあり">
                              📝
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {(() => {
                          const normalizedResult = normalizeStatus(call.result);
                          return (
                            <Badge className={`${statusColors[normalizedResult]} text-white`}>
                              {normalizedResult}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <div className="max-w-xs truncate" title={call.notes}>
                          {call.notes || "-"}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
                        データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {!loading && calls.length > 0 && (
            <div className="p-4 flex justify-between items-center border-t">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrev}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                前へ
              </Button>
              <span className="text-sm text-gray-600">
                {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1}-
                {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)}件 
                (全{pagination.totalItems}件)
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNext}
              >
                次へ
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {selectedCalls.size > 0 && (
          <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-4 border">
            <p className="text-sm text-gray-600 mb-2">
              {selectedCalls.size}件選択中
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleOpenExportModal}>
                CSVエクスポート
              </Button>
              <Button size="sm" variant="destructive" onClick={handleOpenDeleteModal}>
                削除
              </Button>
            </div>
          </div>
        )}

        {/* 詳細表示モーダル */}
        <CallDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
          callId={selectedCallId}
        />

        {/* CSVエクスポートモーダル */}
        <CallHistoryExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          selectedCalls={calls.filter(call => selectedCalls.has(call.id))}
          onExport={handleExportCSV}
        />

        {/* 削除確認モーダル */}
        <CallHistoryDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          selectedCalls={calls.filter(call => selectedCalls.has(call.id))}
          onDelete={handleDeleteCalls}
          isDeleting={isDeleting}
        />
      </main>
    </div>
  )
}