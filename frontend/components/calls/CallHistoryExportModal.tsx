"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, X, FileText } from "lucide-react"

interface CallRecord {
  id: string
  customer: {
    name: string
    phone: string
    company?: string
  }
  date: string
  startTime: string
  duration: string
  result: string
  notes: string
}

interface CallHistoryExportModalProps {
  isOpen: boolean
  onClose: () => void
  selectedCalls: CallRecord[]
  onExport: () => void
}

export function CallHistoryExportModal({
  isOpen,
  onClose,
  selectedCalls,
  onExport,
}: CallHistoryExportModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CSVエクスポート
          </DialogTitle>
          <DialogDescription>
            選択されたコール履歴をCSVファイルでエクスポートします
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">{selectedCalls.length}件</span>のコール履歴が選択されています
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">エクスポート項目:</h4>
            <ul className="text-sm text-gray-600 space-y-1 ml-4">
              <li>• 顧客名</li>
              <li>• 電話番号</li>
              <li>• 会社名</li>
              <li>• 日付</li>
              <li>• 開始時刻</li>
              <li>• 終了時刻</li>
              <li>• 通話時間</li>
              <li>• 結果</li>
              <li>• メモ</li>
            </ul>
          </div>

          {selectedCalls.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-[200px] overflow-y-auto">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">選択されたコール:</h4>
              <div className="space-y-1">
                {selectedCalls.slice(0, 5).map((call) => (
                  <div key={call.id} className="text-xs text-gray-600 flex justify-between">
                    <span className="truncate">{call.customer.name}</span>
                    <span className="text-gray-400 ml-2">{call.customer.phone}</span>
                  </div>
                ))}
                {selectedCalls.length > 5 && (
                  <p className="text-xs text-gray-400 italic">
                    他 {selectedCalls.length - 5}件...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            キャンセル
          </Button>
          <Button onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            エクスポート
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
