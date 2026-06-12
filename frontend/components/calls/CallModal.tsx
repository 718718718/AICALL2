"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, PhoneOff, UserPlus, Loader2, Volume2, Mic } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  phoneNumber: string;
  customerId: string;
}

interface TranscriptEntry {
  speaker: "AI" | "Customer" | "Operator";
  text: string;
  timestamp: Date;
}

export function CallModal({
  isOpen,
  onClose,
  customerName,
  phoneNumber,
  customerId,
}: CallModalProps) {
  const [callStatus, setCallStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  // Helper function to refresh access token
  const refreshAccessToken = async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        return data.accessToken;
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
    return null;
  };

  useEffect(() => {
    if (isOpen && phoneNumber) {
      // Initialize socket connection
      const initializeSocket = async () => {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
        let token = localStorage.getItem('accessToken');

        if (!token) {
          token = await refreshAccessToken();
          if (!token) {
            window.location.href = '/login';
            return;
          }
        }

        const newSocket = io(backendUrl, {
          transports: ["websocket"],
          auth: { token }
        });

        newSocket.on("connect", () => {
          console.log("Socket connected");
          retryCountRef.current = 0;
          // Start the call
          initiateCall();
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
                speaker: "AI",
                text: `接続に失敗しました。再接続を試みています... (${retryCountRef.current + 1}/${MAX_RETRIES})`,
                timestamp: new Date(),
              },
            ]);
            
            setTimeout(() => {
              retryCountRef.current += 1;
              newSocket.connect();
            }, delay);
          } else {
            setCallStatus("ended");
            setTranscript((prev) => [
              ...prev,
              {
                speaker: "AI",
                text: "バックエンドへの接続に失敗しました。ページを更新するか、再ログインしてください。",
                timestamp: new Date(),
              },
            ]);
          }
        });

        newSocket.on("call-status", (data) => {
          if (data.status === "in-progress") {
            setCallStatus("connected");
            setCallSid(data.callSid);
          } else if (data.status === "completed" || data.status === "failed") {
            setCallStatus("ended");
          }
        });

        newSocket.on("transcript-update", (data) => {
          const newEntry: TranscriptEntry = {
            speaker: data.speaker,
            text: data.text,
            timestamp: new Date(data.timestamp),
          };
          setTranscript((prev) => [...prev, newEntry]);
        });

        setSocket(newSocket);

        return () => {
          newSocket.disconnect();
        };
      };

      initializeSocket();
    }
  }, [isOpen, phoneNumber]);

  const initiateCall = async () => {
    try {
      const response = await fetch("/api/twilio/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          customerId,
          customerName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to initiate call");
      }

      const data = await response.json();
      setCallSid(data.callSid);
      
      // Add initial transcript entry
      setTranscript([
        {
          speaker: "AI",
          text: "電話をかけています...",
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error("Error initiating call:", error);
      setCallStatus("ended");
    }
  };

  const handleEndCall = async () => {
    // Note: Twilio call termination is handled by backend via WebSocket
    // No need to call /api/twilio/call/end endpoint
    setCallStatus("ended");
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleTransferToOperator = async () => {
    if (!callSid) return;
    
    setIsTransferring(true);
    try {
      const response = await fetch("/api/twilio/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          callSid,
          operatorNumber: process.env.NEXT_PUBLIC_OPERATOR_PHONE || "+818012345678"
        }),
      });

      if (response.ok) {
        setTranscript((prev) => [
          ...prev,
          {
            speaker: "Operator",
            text: "オペレーターに接続しました",
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("Error transferring call:", error);
    } finally {
      setIsTransferring(false);
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
        return "接続中...";
      case "connected":
        return "通話中";
      case "ended":
        return "通話終了";
      default:
        return "不明";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              {customerName} - {phoneNumber}
            </div>
            <Badge className={`${getStatusColor()} text-white`}>
              {getStatusText()}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            AIと顧客の会話内容をリアルタイムで表示しています
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Call Controls */}
          <div className="flex gap-2 justify-center p-4 bg-gray-50 rounded-lg">
            {callStatus === "connected" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTransferToOperator}
                  disabled={isTransferring}
                >
                  {isTransferring ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  取次
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleEndCall}
                >
                  <PhoneOff className="h-4 w-4 mr-2" />
                  通話終了
                </Button>
              </>
            )}
            {callStatus === "connecting" && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>接続中...</span>
              </div>
            )}
            {callStatus === "ended" && (
              <Button onClick={onClose}>
                閉じる
              </Button>
            )}
          </div>

          {/* Transcript Area */}
          <ScrollArea className="h-[400px] border rounded-lg p-4 bg-white">
            <div className="space-y-3">
              {transcript.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  会話が開始されるまでお待ちください...
                </div>
              ) : (
                transcript.map((entry, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      entry.speaker === "AI" ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        entry.speaker === "AI"
                          ? "bg-blue-100 text-blue-900"
                          : entry.speaker === "Customer"
                          ? "bg-gray-100 text-gray-900"
                          : "bg-green-100 text-green-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {entry.speaker === "AI" && <Volume2 className="h-3 w-3" />}
                        {entry.speaker === "Customer" && <Mic className="h-3 w-3" />}
                        {entry.speaker === "Operator" && <UserPlus className="h-3 w-3" />}
                        <span className="text-xs font-semibold">
                          {entry.speaker === "AI" && "AI"}
                          {entry.speaker === "Customer" && "顧客"}
                          {entry.speaker === "Operator" && "オペレーター"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {entry.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm">{entry.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Call Info */}
          <div className="flex justify-between text-sm text-gray-500 px-2">
            <span>顧客ID: {customerId}</span>
            {callSid && <span>通話ID: {callSid.slice(0, 8)}...</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}