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
import { AlertTriangle, X, Trash2 } from "lucide-react"

interface CallRecord {
  id: string
  customer: {
    name: string
    phone: string
    company?: string
  }
  date: string
  result: string
}

interface CallHistoryDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  selectedCalls: CallRecord[]
  onDelete: () => void
  isDeleting?: boolean
}

export function CallHistoryDeleteModal({
  isOpen,
  onClose,
  selectedCalls,
  onDelete,
  isDeleting = false,
}: CallHistoryDeleteModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            コール履歴の削除
          </DialogTitle>
          <DialogDescription>
            この操作は取り消すことができません
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-900 font-semibold mb-2">
              <span className="text-lg">{selectedCalls.length}件</span>のコール履歴を削除しようとしています
            </p>
            <p className="text-xs text-red-700">
              削除されたデータは復元できません。本当に削除してよろしいですか？
            </p>
          </div>

          {selectedCalls.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-[200px] overflow-y-auto">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">削除されるコール:</h4>
              <div className="space-y-2">
                {selectedCalls.slice(0, 5).map((call) => (
                  <div key={call.id} className="text-xs text-gray-700 p-2 bg-white rounded border border-gray-200">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="font-medium">{call.customer.name}</div>
                        <div className="text-gray-500">{call.customer.phone}</div>
                      </div>
                      <div className="text-gray-400 text-xs">
                        {new Date(call.date).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  </div>
                ))}
                {selectedCalls.length > 5 && (
                  <p className="text-xs text-gray-400 italic text-center pt-2">
                    他 {selectedCalls.length - 5}件...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            <X className="h-4 w-4 mr-2" />
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? "削除中..." : "削除する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
