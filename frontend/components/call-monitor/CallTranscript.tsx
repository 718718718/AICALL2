'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bot, User, Headphones } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { monitorCall, stopMonitoringCall, getSocket } from '@/lib/socket';

interface TranscriptMessage {
  timestamp: string;
  speaker: 'ai' | 'customer' | 'agent';
  message: string;
  confidence?: number;
  isPlaying?: boolean; // 音声再生中フラグ
}

interface CallTranscriptProps {
  callId: string;
  initialTranscript?: TranscriptMessage[];
}

export function CallTranscript({ callId, initialTranscript = [] }: CallTranscriptProps) {
  const [transcript, setTranscript] = useState<TranscriptMessage[]>(initialTranscript);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  useEffect(() => {
    // 通話のモニタリング開始
    monitorCall(callId);

    // トランスクリプト更新の購読
    const socket = getSocket();
    if (socket) {
      socket.on('transcript-update', (data: any) => {
        if (data.callId === callId) {
          setTranscript(prev => [...prev, {
            timestamp: data.timestamp || new Date().toISOString(),
            speaker: data.speaker,
            message: data.message,
            confidence: data.confidence,
            isPlaying: data.isPlaying
          }]);
        }
      });
    }

    return () => {
      stopMonitoringCall(callId);
      if (socket) {
        socket.off('transcript-update');
      }
    };
  }, [callId]);

  useEffect(() => {
    // 自動スクロール
    if (isAutoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [transcript, isAutoScroll]);

  const getSpeakerIcon = (speaker: string) => {
    switch (speaker) {
      case 'ai':
        return <Bot className="h-4 w-4" />;
      case 'agent':
        return <Headphones className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getSpeakerLabel = (speaker: string) => {
    switch (speaker) {
      case 'ai':
        return 'AI';
      case 'agent':
        return '担当者';
      case 'customer':
        return '顧客';
      default:
        return speaker;
    }
  };

  const getSpeakerColor = (speaker: string) => {
    switch (speaker) {
      case 'ai':
        return 'bg-blue-50 border-blue-200';
      case 'agent':
        return 'bg-green-50 border-green-200';
      case 'customer':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>会話内容</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {transcript.length} メッセージ
            </Badge>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isAutoScroll}
                onChange={(e) => setIsAutoScroll(e.target.checked)}
                className="rounded"
              />
              自動スクロール
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-[600px] pr-4" ref={scrollAreaRef}>
          <div className="space-y-3">
            {transcript.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                会話が開始されるとここに表示されます
              </div>
            ) : (
              transcript.map((item, index) => (
                <div
                  key={index}
                  className={`flex ${
                    item.speaker === 'ai' || item.speaker === 'agent' 
                      ? 'justify-start' 
                      : 'justify-end'
                  }`}
                >
                  <div className={`max-w-[70%] ${
                    item.speaker === 'ai' || item.speaker === 'agent'
                      ? 'mr-auto'
                      : 'ml-auto'
                  }`}>
                    <div className={`flex items-start gap-2 ${
                      item.speaker === 'customer' ? 'flex-row-reverse' : ''
                    }`}>
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        item.speaker === 'ai' ? 'bg-blue-100 text-blue-600' :
                        item.speaker === 'agent' ? 'bg-green-100 text-green-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {getSpeakerIcon(item.speaker)}
                      </div>
                      <div className="flex-1">
                        <div className={`flex items-center gap-2 mb-1 ${
                          item.speaker === 'customer' ? 'justify-end' : ''
                        }`}>
                          <span className="font-medium text-xs text-muted-foreground">
                            {getSpeakerLabel(item.speaker)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.timestamp), 'HH:mm:ss', { locale: ja })}
                          </span>
                        </div>
                        <div className={`rounded-lg px-4 py-2 ${
                          item.speaker === 'ai' 
                            ? 'bg-blue-50 text-blue-900 border border-blue-200' 
                            : item.speaker === 'agent'
                            ? 'bg-green-50 text-green-900 border border-green-200'
                            : 'bg-gray-50 text-gray-900 border border-gray-200'
                        }`}>
                          {item.isPlaying && item.speaker === 'ai' ? (
                            <div className="flex items-center gap-2 text-blue-600">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                              </div>
                              <span className="italic text-sm">音声再生中...</span>
                            </div>
                          ) : (
                            <p className="text-sm">{item.message}</p>
                          )}
                          {item.confidence && item.confidence < 0.8 && (
                            <div className="mt-1">
                              <Badge variant="outline" className="text-xs">
                                信頼度: {Math.round(item.confidence * 100)}%
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}