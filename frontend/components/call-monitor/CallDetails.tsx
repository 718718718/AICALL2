'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Phone, 
  Building, 
  User, 
  Clock, 
  Calendar,
  PhoneOff,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { HandoffButton } from './HandoffButton';
import { callAPI } from '@/lib/api';
import { toast } from 'sonner';

interface CallDetailsProps {
  call: any;
  onCallEnd?: () => void;
  onHandoffComplete?: () => void;
}

export function CallDetails({ call, onCallEnd, onHandoffComplete }: CallDetailsProps) {
  const [isEnding, setIsEnding] = React.useState(false);

  if (!call) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            通話を選択してください
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleEndCall = async () => {
    setIsEnding(true);
    try {
      await callAPI.endCall(call._id, '手動終了');
      toast.success('通話を終了しました');
      if (onCallEnd) {
        onCallEnd();
      }
    } catch (error) {
      console.error('Failed to end call:', error);
      toast.error('通話の終了に失敗しました');
    } finally {
      setIsEnding(false);
    }
  };

  const getDuration = () => {
    if (!call.startTime) return '0:00';
    const start = new Date(call.startTime);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>通話詳細</CardTitle>
          <Badge variant={
            call.status === 'human-connected' ? 'success' :
            call.status === 'ai-responding' ? 'default' :
            call.status === 'transferring' ? 'warning' :
            'secondary'
          }>
            {call.status === 'ai-responding' && 'AI対応中'}
            {call.status === 'human-connected' && '担当者対応中'}
            {call.status === 'transferring' && '転送中'}
            {call.status === 'initiated' && '接続中'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 顧客情報 */}
        <div>
          <h3 className="text-sm font-medium mb-3">顧客情報</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{call.customerId?.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Building className="h-4 w-4 text-muted-foreground" />
              <span>{call.customerId?.company}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{call.customerId?.phone}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* 通話情報 */}
        <div>
          <h3 className="text-sm font-medium mb-3">通話情報</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                開始時刻: {format(new Date(call.startTime), 'yyyy/MM/dd HH:mm:ss', { locale: ja })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>通話時間: {getDuration()}</span>
            </div>
            {call.assignedAgent && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>
                  担当: {call.assignedAgent.lastName} {call.assignedAgent.firstName}
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* AI設定 */}
        {call.aiConfiguration && (
          <>
            <div>
              <h3 className="text-sm font-medium mb-3">AI設定</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">会社名:</span>{' '}
                  {call.aiConfiguration.companyName}
                </div>
                <div>
                  <span className="text-muted-foreground">サービス:</span>{' '}
                  {call.aiConfiguration.serviceName}
                </div>
                <div>
                  <span className="text-muted-foreground">担当者:</span>{' '}
                  {call.aiConfiguration.representativeName}
                </div>
                <div>
                  <span className="text-muted-foreground">部署:</span>{' '}
                  {call.aiConfiguration.targetDepartment}
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* アクションボタン */}
        <div className="space-y-2">
          {call.status === 'ai-responding' && (
            <HandoffButton
              callId={call._id}
              onHandoffComplete={onHandoffComplete}
            />
          )}
          
          {(call.status === 'human-connected' || call.status === 'transferring') && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleEndCall}
              disabled={isEnding}
            >
              <PhoneOff className="mr-2 h-4 w-4" />
              {isEnding ? '終了中...' : '通話を終了'}
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              // メモ機能の実装
              toast.info('メモ機能は準備中です');
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            メモを追加
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}