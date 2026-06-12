"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Phone, Volume2, Mic } from "lucide-react";

interface CallHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  callSession: any;
}

interface TranscriptEntry {
  speaker: "AI" | "Customer" | "System";
  text: string;
  timestamp: string;
}

export function CallHistoryModal({
  isOpen,
  onClose,
  callSession,
}: CallHistoryModalProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && callSession) {
      // CallSessionのトランスクリプトを変換
      const convertedTranscript: TranscriptEntry[] = callSession.transcript?.map((entry: any) => ({
        speaker: entry.speaker === "ai" ? "AI" : entry.speaker === "customer" ? "Customer" : "System",
        text: entry.message || "",
        timestamp: new Date(entry.timestamp).toLocaleTimeString("ja-JP"),
      })) || [];

      setTranscript(convertedTranscript);
    }
  }, [isOpen, callSession]);

  useEffect(() => {
    // Auto-scroll to bottom when modal opens
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, isOpen]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (callSession?.status) {
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "in-progress":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (callSession?.status) {
      case "completed":
        return "完了";
      case "failed":
        return "失敗";
      case "in-progress":
        return "進行中";
      default:
        return "不明";
    }
  };

  if (!callSession) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              通話履歴詳細
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-white text-sm ${getStatusColor()}`}>
                {getStatusText()}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Call Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">通話日時:</span>{" "}
                {new Date(callSession.createdAt).toLocaleString("ja-JP")}
              </div>
              <div>
                <span className="font-semibold">通話時間:</span>{" "}
                {callSession.duration ? formatDuration(callSession.duration) : "不明"}
              </div>
              <div>
                <span className="font-semibold">結果:</span>{" "}
                <span className={`px-2 py-1 rounded text-xs ${
                  callSession.callResult === "成功" ? "bg-green-100 text-green-800" :
                  callSession.callResult === "拒否" ? "bg-red-100 text-red-800" :
                  callSession.callResult === "不在" ? "bg-yellow-100 text-yellow-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {callSession.callResult || "未設定"}
                </span>
              </div>
              <div>
                <span className="font-semibold">電話番号:</span>{" "}
                <span className="text-blue-600 font-mono">{callSession.phoneNumber}</span>
              </div>
            </div>
            {callSession.notes && (
              <div className="mt-2">
                <span className="font-semibold">メモ:</span> {callSession.notes}
              </div>
            )}
          </div>

          {/* Conversation Transcript */}
          <div className="border rounded-lg h-[60vh]">
            <div className="bg-gray-100 px-4 py-3 border-b">
              <h3 className="font-semibold">会話内容</h3>
            </div>
            <ScrollArea className="h-[calc(60vh-50px)] p-4" ref={scrollRef}>
              <div className="space-y-3">
                {transcript.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    会話記録がありません
                  </div>
                ) : (
                  transcript.map((entry, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        entry.speaker === "System" ? "justify-center" :
                        entry.speaker === "AI" ? "justify-start" : "justify-end"
                      }`}
                    >
                      {entry.speaker === "System" ? (
                        <div className="max-w-[80%] text-center">
                          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                            <Phone className="h-3 w-3" />
                            <span>{entry.timestamp}</span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{entry.text}</p>
                        </div>
                      ) : (
                        <div className={`max-w-[60%] ${
                          entry.speaker === "Customer" ? "ml-auto" : "mr-auto"
                        }`}>
                          <div className={`flex items-start gap-2 ${
                            entry.speaker === "Customer" ? "flex-row-reverse" : ""
                          }`}>
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                              entry.speaker === "AI" 
                                ? "bg-blue-100" 
                                : "bg-green-100"
                            }`}>
                              {entry.speaker === "AI" ? (
                                <Volume2 className="h-5 w-5 text-blue-600" />
                              ) : (
                                <Mic className="h-5 w-5 text-green-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className={`flex items-center gap-2 mb-1 ${
                                entry.speaker === "Customer" ? "justify-end" : ""
                              }`}>
                                <span className={`text-xs font-semibold ${
                                  entry.speaker === "AI" ? "text-blue-600" : "text-green-600"
                                }`}>
                                  {entry.speaker === "AI" ? "AI" : "顧客"}
                                </span>
                                <span className="text-xs text-gray-500">{entry.timestamp}</span>
                              </div>
                              <div className={`rounded-2xl px-4 py-3 ${
                                entry.speaker === "AI"
                                  ? "bg-blue-50 text-blue-900 border border-blue-200"
                                  : "bg-white text-gray-900 border border-gray-300"
                              }`}>
                                <p className="text-sm leading-relaxed">{entry.text}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}