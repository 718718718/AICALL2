"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, UserPlus, Phone, Mic, Volume2, Loader2 } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { getWsUrl } from "@/lib/config";

interface CallStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  companyName?: string;
}

interface TranscriptEntry {
  speaker: "AI" | "Customer" | "System";
  text: string;
  timestamp: string;
}

// 電話番号を正規化（ハイフンを除去し、0906... 形式に統一）
const normalizePhoneNumber = (phone: string) => {
  if (!phone) return '';
  // ハイフンとスペースを削除
  let normalized = phone.replace(/[-\s]/g, '');
  // +81を0に変換
  if (normalized.startsWith('+81')) {
    normalized = '0' + normalized.substring(3);
  }
  return normalized;
};

// トークンリフレッシュ試行
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const response = await fetch('/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        return data.accessToken;
      }
    }
  } catch (error) {
    console.error('[WebSocket] Token refresh failed:', error);
  }
  return null;
}

export function CallStatusModal({
  isOpen,
  onClose,
  phoneNumber,
  companyName,
}: CallStatusModalProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [callStatus, setCallStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [callSid, setCallSid] = useState<string | null>(null);
  const callSidRef = useRef<string | null>(null);
  const callStatusRef = useRef<"connecting" | "connected" | "ended">("connecting");
  const existingDataReceivedRef = useRef<boolean>(false);
  const isCheckingStatusRef = useRef<boolean>(false);
  const [modalOpenTime, setModalOpenTime] = useState<Date | null>(null);
  const [processedMessages, setProcessedMessages] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    callSidRef.current = callSid;
  }, [callSid]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    if (isOpen && phoneNumber) {
      // モーダルを開いた時刻を記録
      const openTime = new Date();
      setModalOpenTime(openTime);

      // existing-call-dataの受信フラグをリセット
      existingDataReceivedRef.current = false;

      // 新しい通話/顧客に切り替わったため、以前のデータを完全にクリア
      setTranscript([]);
      setCallSid(null);
      setProcessedMessages(new Set());
      setCallStatus("connecting");

      // 電話番号を正規化（ハイフンを除去し、0906... 形式に統一）
      // normalizePhoneNumberはコンポーネント外に移動しました

      const normalizedPhone = normalizePhoneNumber(phoneNumber);

      // Initialize socket connection
      const initializeSocket = async () => {
        const wsUrl = getWsUrl();
        let token = localStorage.getItem('accessToken');

        if (!token) {
          token = await refreshAccessToken();
          if (!token) {
            window.location.href = '/login';
            return;
          }
        }

        const newSocket = io(wsUrl, {
          transports: ["websocket"],
          auth: { token }
        });

        newSocket.on("connect", () => {
          retryCountRef.current = 0;
          // Join room for this specific call
        newSocket.emit("join-call", { phoneNumber: normalizedPhone });

        // 接続時に現在の通話状況を要求
        newSocket.emit("get-call-status", { phoneNumber: normalizedPhone });

        // 少し遅延してから既存の通話情報を要求
        setTimeout(() => {
          newSocket.emit("get-existing-call-data", { phoneNumber: normalizedPhone });
        }, 500);
      });

      // join-call成功確認
      newSocket.on("joined-call-room", (data) => {
        // 接続確認完了
      });

      newSocket.on("connect_error", async (error) => {
        console.error("Socket connection error:", error);
        
        // 認証エラーの場合はトークンリフレッシュ試行
        if (error.message.includes('認証') || error.message.includes('token') || error.message.includes('authorized')) {
          const newToken = await refreshAccessToken();
          if (newToken) {
            newSocket.auth = { token: newToken };
            newSocket.connect();
            return;
          }
        }

        if (retryCountRef.current < MAX_RETRIES) {
          const delay = Math.pow(2, retryCountRef.current) * 1000;
          
          setTranscript((prev) => [
            ...prev,
            {
              speaker: "System",
              text: `接続に失敗しました。再接続を試みています... (${retryCountRef.current + 1}/${MAX_RETRIES})`,
              timestamp: new Date().toLocaleTimeString("ja-JP"),
            },
          ]);
          
          setTimeout(() => {
            retryCountRef.current += 1;
            newSocket.connect();
          }, delay);
        } else {
          setTranscript((prev) => [
            ...prev,
            {
              speaker: "System",
              text: "バックエンドへの接続に失敗しました。ページを更新するか、再ログインしてください。",
              timestamp: new Date().toLocaleTimeString("ja-JP"),
            },
          ]);
        }
      });

      // Listen for bulk calls started event
      newSocket.on("bulk-calls-started", (data) => {
        if (data.sessions && Array.isArray(data.sessions)) {
          const session = data.sessions.find((s: any) => {
            const normalizedSessionPhone = s.phoneNumber?.startsWith('+81')
              ? '0' + s.phoneNumber.substring(3)
              : s.phoneNumber;
            const normalizedTargetPhone = normalizedPhone;
            return normalizedSessionPhone === normalizedTargetPhone;
          });

          if (session) {
            setCallSid(session.twilioCallSid || session.id);
            setCallStatus("connecting");
          }
        }
      });

      // Listen for call initiated event (explicit new call start)
      newSocket.on("call-initiated", (data) => {
        const normalizedDataPhone = normalizePhoneNumber(data.phoneNumber);
        const normalizedTargetPhone = normalizedPhone;

        if (normalizedDataPhone === normalizedTargetPhone) {
          console.log("[CallStatusModal] Call initiated, resetting transcript");
          setTranscript([]);
          setProcessedMessages(new Set());
          setCallSid(data.callId || data.sessionId);
          setCallStatus("connecting");
        }
      });

      const handleCallStatus = (data: any) => {
        const normalizedDataPhone = normalizePhoneNumber(data.phoneNumber);
        const normalizedTargetPhone = normalizedPhone;


        if (normalizedDataPhone === normalizedTargetPhone || data.callSid === callSidRef.current || data.callId === callSidRef.current) {
          if (data.status === "in-progress" || data.status === "calling" || data.status === "ai-responding" || data.status === "initiated" || data.status === "human-connected") {
            setCallStatus("connected");
            const newCallSid = data.callSid || data.callId || data.twilioCallSid;

            // 新しい通話が始まった場合（CallSidが変わった場合）
            if (newCallSid && callSidRef.current && newCallSid !== callSidRef.current) {
              console.log("[CallStatusModal] New call detected (CallSid changed), resetting transcript");
              setTranscript([]);
              setProcessedMessages(new Set());
            }

            setCallSid(newCallSid);

            // 新しい通話では既存のトランスクリプトを取得しない
            // リアルタイムの更新のみに依存
          } else if (data.status === "completed" || data.status === "failed" || data.status === "ended" || data.status === "cancelled") {
            setCallStatus("ended");
          }

          // 手動ステータス確認のレスポンス処理
          if (isCheckingStatusRef.current) {
            isCheckingStatusRef.current = false;
            let statusText = "不明";

            // より詳細なステータスマッピング
            switch (data.status) {
              case "initiating":
              case "queued":
                statusText = "待機中";
                break;
              case "initiated":
              case "calling":
              case "connecting":
                statusText = "発信中";
                break;
              case "in-progress":
              case "ai-responding":
              case "connected":
                statusText = "通話中";
                break;
              case "human-connected":
              case "transferring":
                statusText = "通話中";
                break;
              case "completed":
                statusText = "終了";
                break;
              case "failed":
                statusText = "終了";
                break;
              case "cancelled":
                statusText = "終了";
                break;
              case "ended":
                statusText = "終了";
                break;
              default:
                statusText = `不明（${data.status}）`;
            }

            setTranscript((prev) => [
              ...prev,
              {
                speaker: "System",
                text: `現在の状況: ${statusText}`,
                timestamp: new Date().toLocaleTimeString("ja-JP"),
              },
            ]);
          }
        }
      };

      newSocket.on("call-status", handleCallStatus);

      const handleCallTerminated = (data: any) => {
        const normalizedDataPhone = normalizePhoneNumber(data.phoneNumber || "");
        const normalizedTargetPhone = normalizePhoneNumber(phoneNumber);

        if (
          normalizedDataPhone === normalizedTargetPhone ||
          data.callSid === callSidRef.current ||
          data.callId === callSidRef.current
        ) {
          if (callStatusRef.current !== "ended") {
            setCallStatus("ended");
            setTranscript((prev) => [
              ...prev,
              {
                speaker: "System",
                text: "通話が終了しました。",
                timestamp: new Date().toLocaleTimeString("ja-JP"),
              },
            ]);

            // 500ms後にモーダルを閉じる（電話通信切断タイミングベース）
            setTimeout(() => {
              onClose();
            }, 500);
          }
        }
      };

      newSocket.on("call-terminated", handleCallTerminated);

      // Listen for existing call data response
      newSocket.on("existing-call-data", (data) => {
        existingDataReceivedRef.current = true;
        console.log("[CallStatusModal] existing-call-data received:", data);

        if (data && data.transcript && Array.isArray(data.transcript) && data.transcript.length > 0) {
          // 既存の会話履歴がある場合、それを表示
          const existingTranscript = data.transcript.map((entry: any) => {
            // speakerの正しいマッピング（transcript-updateと同じロジック）
            let speakerType: "AI" | "Customer" | "System" = "System";
            if (entry.speaker === "ai" || entry.speaker === "AI") {
              speakerType = "AI";
            } else if (entry.speaker === "customer" || entry.speaker === "Customer") {
              speakerType = "Customer";
            } else if (entry.speaker === "system" || entry.speaker === "System") {
              speakerType = "System";
            }

            return {
              speaker: speakerType,
              text: entry.text || entry.message,
              timestamp: entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("ja-JP") : new Date().toLocaleTimeString("ja-JP"),
            };
          });

          console.log("[CallStatusModal] Restoring existing transcript:", existingTranscript.length, "entries");

          // 既存の履歴をprocessedMessagesに登録（重複防止のため）
          const newProcessedMessages = new Set<string>();
          existingTranscript.forEach(entry => {
            const messageId = `${entry.speaker}-${entry.text}-${entry.timestamp}`;
            newProcessedMessages.add(messageId);
          });
          setProcessedMessages(newProcessedMessages);
          console.log("[CallStatusModal] Registered", newProcessedMessages.size, "messages as processed");

          setTranscript(existingTranscript);
          setCallStatus(data.status === "completed" || data.status === "failed" ? "ended" : "connected");
          if (data.callSid) {
            setCallSid(data.callSid);
          }
        } else {
          // 既存の会話履歴がない場合、新しい通話として初期化
          console.log("[CallStatusModal] No existing transcript, initializing new call");
          setTranscript([{
            speaker: "System",
            text: "会話が開始されると、ここに表示されます",
            timestamp: new Date().toLocaleTimeString("ja-JP"),
          }]);
          setCallSid(null);
          setProcessedMessages(new Set());
        }
      });

      // タイムアウト：1秒経ってもexisting-call-dataが返ってこない場合、新しい通話として扱う
      const existingDataTimeout = setTimeout(() => {
        // refを使用してクロージャの問題を回避
        if (!existingDataReceivedRef.current) {
          console.log("[CallStatusModal] No existing-call-data received within timeout, initializing new call");
          setTranscript([{
            speaker: "System",
            text: "会話が開始されると、ここに表示されます",
            timestamp: new Date().toLocaleTimeString("ja-JP"),
          }]);
          setCallSid(null);
          setProcessedMessages(new Set());
        } else {
          console.log("[CallStatusModal] existing-call-data received, timeout cancelled");
        }
      }, 1000);

      // Listen for transcript updates
      newSocket.on("transcript-update", (data) => {
        console.log("[CallStatusModal] transcript-update received:", data);
        const normalizedDataPhone = normalizePhoneNumber(data.phoneNumber || '');
        const normalizedTargetPhone = normalizedPhone;

        // より柔軟な判定: CallSidが一致するか、電話番号が一致する場合
        const isCurrentCall = (callSid && data.callSid === callSid) ||
          (normalizedDataPhone === normalizedTargetPhone);

        console.log("[CallStatusModal] isCurrentCall check:", {
          callSid,
          data_callSid: data.callSid,
          normalizedDataPhone,
          normalizedTargetPhone,
          isCurrentCall
        });

        if (isCurrentCall) {
          // 重複チェック：秒単位で同じメッセージをチェック（ミリ秒の違いは無視）
          const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleTimeString("ja-JP") : new Date().toLocaleTimeString("ja-JP");
          const messageId = `${data.speaker}-${data.text || data.message}-${timestamp}`;

          setProcessedMessages((prevProcessed) => {
            // 既に処理済みかチェック
            if (prevProcessed.has(messageId)) {
              return prevProcessed;
            }

            // 処理済みとしてマーク
            const newProcessed = new Set(prevProcessed);
            newProcessed.add(messageId);

            // speakerの正しいマッピング
            let speakerType: "AI" | "Customer" | "System" = "System";
            if (data.speaker === "ai" || data.speaker === "AI") {
              speakerType = "AI";
            } else if (data.speaker === "customer" || data.speaker === "Customer") {
              speakerType = "Customer";
            } else if (data.speaker === "system" || data.speaker === "System") {
              speakerType = "System";
              console.log("[CallStatusModal] System message detected:", data.message || data.text);
            }

            const newEntry: TranscriptEntry = {
              speaker: speakerType,
              text: data.text || data.message,
              timestamp: timestamp,
            };

            // トランスクリプト更新（UI表示レベルでの最終重複チェック付き）
            setTranscript((prevTranscript) => {
              const filteredTranscript = prevTranscript.filter(entry =>
                entry.text !== "会話が開始されると、ここに表示されます"
              );

              // UI表示レベルでの最終重複チェック
              const isDuplicateInTranscript = filteredTranscript.some(entry =>
                entry.speaker === newEntry.speaker &&
                entry.text === newEntry.text &&
                entry.timestamp === newEntry.timestamp
              );

              if (isDuplicateInTranscript) {
                return filteredTranscript;
              }

              return [...filteredTranscript, newEntry];
            });

            return newProcessed;
          });
        }
      });

      // Listen for conversation events
      newSocket.on("conversation-update", (data) => {
        // 重複表示を防ぐため、conversation-updateイベントは何も処理しない
        return; // 何も処理しない
      });

      // Listen for transfer events
      newSocket.on("call-transferred", (data) => {
        if (data.callSid === callSid) {
          setTranscript((prev) => [
            ...prev,
            {
              speaker: "System",
              text: "オペレーターに転送されました",
              timestamp: new Date().toLocaleTimeString("ja-JP"),
            },
          ]);
        }
      });


      setSocket(newSocket);

      return () => {
        clearTimeout(existingDataTimeout);
        newSocket.off("call-status", handleCallStatus);
        newSocket.off("call-terminated", handleCallTerminated);
        newSocket.emit("leave-call", { phoneNumber });
        newSocket.disconnect();
      };
    };

    initializeSocket();
  } else {
      // Clean up when modal closes
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      // モーダルを閉じてもtranscriptはクリアしない（再度開いた時に復元するため）
      // setTranscript([]);
    }
  }, [isOpen, phoneNumber]);

  // 既存の自動閉じロジックを無効化（call-terminatedイベントで処理するため）
  // useEffect(() => {
  //   if (!isOpen) return;
  //   if (callStatus !== "ended") return;

  //   const timeout = setTimeout(() => {
  //     onClose();
  //   }, 1000);

  //   return () => clearTimeout(timeout);
  // }, [callStatus, isOpen, onClose]);

  // Mock conversation for demonstration - 無効化
  // const simulateMockConversation = () => {
  //   setCallStatus("connected");
  //   
  //   const mockMessages: TranscriptEntry[] = [
  //     {
  //       speaker: "AI",
  //       text: "お電話ありがとうございます。株式会社○○でございます。",
  //       timestamp: new Date().toLocaleTimeString("ja-JP"),
  //     },
  //     {
  //       speaker: "Customer",
  //       text: "もしもし、お世話になっています。",
  //       timestamp: new Date().toLocaleTimeString("ja-JP"),
  //     },
  //     {
  //       speaker: "AI",
  //       text: "お世話になっております。本日はどのようなご用件でしょうか？",
  //       timestamp: new Date().toLocaleTimeString("ja-JP"),
  //     },
  //     {
  //       speaker: "Customer",
  //       text: "新しいサービスについて聞きたいのですが。",
  //       timestamp: new Date().toLocaleTimeString("ja-JP"),
  //     },
  //     {
  //       speaker: "AI",
  //       text: "承知いたしました。弊社の新サービスについてご説明させていただきます。",
  //       timestamp: new Date().toLocaleTimeString("ja-JP"),
  //     },
  //   ];

  //   // Add messages progressively
  //   mockMessages.forEach((message, index) => {
  //     setTimeout(() => {
  //       setTranscript((prev) => [...prev, message]);
  //     }, (index + 1) * 1500);
  //   });
  // };

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleTransfer = async () => {
    console.log("[取次ボタン] 開始", {
      phoneNumber,
      callStatus,
      callSid,
      hasToken: !!localStorage.getItem('accessToken')
    });

    setIsTransferring(true);
    try {
      // callSidが必要なので、存在しない場合はエラー
      if (!callSid) {
        throw new Error('通話IDが取得できていません。通話を開始してから取次ボタンを押してください。');
      }

      // 電話番号からCall Sessionを取得して取次処理を実行
      const token = localStorage.getItem('accessToken');
      console.log("[取次ボタン] トークン取得:", token ? "有効" : "無効");

      // CallSession IDからcallIdを抽出（callSidはCA...形式なので、CallSession IDが必要）
      // まずCallSession IDを取得するためのAPI呼び出し、またはcallSidをそのまま使用
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

      // ここでは簡易的にcallSidをそのまま使用（バックエンドで対応が必要）
      const response = await fetch(`${backendUrl}/api/direct/handoff-direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          callSid: callSid
        }),
      });

      console.log("[取次ボタン] APIレスポンス:", response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log("[取次ボタン] 成功:", data);
        setCallSid(data.callId);

        // Emit transfer event via socket
        if (socket) {
          socket.emit("transfer-call", { callSid: data.callId, phoneNumber });
        }

        setTranscript((prev) => [
          ...prev,
          {
            speaker: "System",
            text: "担当者にお繋ぎいたします。少々お待ちください。",
            timestamp: new Date().toLocaleTimeString("ja-JP"),
          },
        ]);
      } else {
        const errorData = await response.json();
        console.error("[取次ボタン] エラー:", errorData);
        throw new Error(errorData.error || errorData.message || "取次に失敗しました");
      }
    } catch (error) {
      console.error("Error transferring call:", error);
      setTranscript((prev) => [
        ...prev,
        {
          speaker: "System",
          text: `転送に失敗しました: ${error.message}`,
          timestamp: new Date().toLocaleTimeString("ja-JP"),
        },
      ]);
    } finally {
      setIsTransferring(false);
    }
  };

  // 電話番号を正規化するヘルパー関数
  const normalizePhoneNumber = (phone: string) => {
    return phone.replace(/[-\s]/g, '').replace(/^\+81/, '0');
  };

  const handleCheckStatus = () => {
    if (socket) {
      isCheckingStatusRef.current = true;
      // "ステータスを確認中..." のメッセージは表示しない

      // 電話番号を正規化して送信
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      socket.emit("get-call-status", { phoneNumber: normalizedPhone });
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case "connecting":
        return "bg-yellow-500";
      case "connected":
        return "bg-green-500";
      case "ended":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case "connecting":
        return "接続中";
      case "connected":
        return "通話中";
      case "ended":
        return "終了";
      default:
        return "不明";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh]" hideCloseButton={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              一斉コール実行中
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${getStatusColor()} text-white ${callStatus === "connected" ? "animate-pulse" : ""}`}>
                {getStatusText()}
              </Badge>
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
            <p className="text-sm text-gray-600">
              選択された顧客に順番に電話をかけています...
            </p>
            <div className="mt-2 flex items-center gap-4 flex-wrap">
              <span className="text-sm">
                <strong>電話番号:</strong> <span className="text-blue-600 font-mono">{phoneNumber}</span>
              </span>
              {companyName && (
                <span className="text-sm">
                  <strong>企業名:</strong> <span className="text-gray-800">{companyName}</span>
                </span>
              )}
              {callSid && (
                <span className="text-xs text-gray-500">
                  通話ID: {callSid.slice(0, 12)}...
                </span>
              )}
            </div>
          </div>

          {/* Conversation Transcript */}
          <div className="border rounded-lg h-[60vh]">
            <div className="bg-gray-100 px-4 py-3 border-b">
              <h3 className="font-semibold">会話内容</h3>
            </div>
            <ScrollArea className="h-[calc(60vh-50px)] p-4" ref={scrollRef}>
              <div className="space-y-3">
                {transcript.length === 0 ? (
                  <div className="text-center text-gray-400 py-12">
                    <div className="text-sm">会話が開始されると、ここに表示されます</div>
                  </div>
                ) : (
                  transcript.map((entry, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg ${entry.speaker === "AI"
                        ? "bg-blue-50 border-l-4 border-l-blue-500"
                        : entry.speaker === "Customer"
                          ? "bg-green-50 border-l-4 border-l-green-500"
                          : "bg-gray-50 border-l-4 border-l-gray-500"
                        }`}
                    >
                      <div className="flex-shrink-0">
                        {entry.speaker === "AI" && (
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                            <Volume2 className="w-4 h-4 text-white" />
                          </div>
                        )}
                        {entry.speaker === "Customer" && (
                          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                            <Mic className="w-4 h-4 text-white" />
                          </div>
                        )}
                        {entry.speaker === "System" && (
                          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {entry.speaker === "AI"
                              ? "AI オペレーター"
                              : entry.speaker === "Customer"
                                ? "お客様"
                                : "システム"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {entry.timestamp}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{entry.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-2">
            <div className="flex gap-2">
              <Button
                onClick={handleTransfer}
                disabled={isTransferring || callStatus !== "connected"}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={callStatus !== "connected" ? "通話中にのみ取次が可能です" : ""}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {isTransferring ? "転送中..." : "取次"}
              </Button>
              <Button
                onClick={handleCheckStatus}
                variant="outline"
              >
                コール状況を確認
              </Button>
            </div>
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
