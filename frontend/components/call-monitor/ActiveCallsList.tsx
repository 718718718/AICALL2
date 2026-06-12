'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, PhoneForwarded, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { callAPI } from '@/lib/api';
import { getSocket, subscribeToCallEvents, unsubscribeFromCallEvents } from '@/lib/socket';
import HandoffButton from '../calls/HandoffButton';

interface ActiveCall {
  _id: string;
  customerId: {
    _id: string;
    name: string;
    company: string;
    phone: string;
  };
  status: 'initiated' | 'ai-responding' | 'transferring' | 'human-connected' | 'completed' | 'failed';
  startTime: string;
  assignedAgent?: {
    firstName: string;
    lastName: string;
  };
  duration?: number;
}

interface ActiveCallsListProps {
  onSelectCall: (call: ActiveCall) => void;
  selectedCallId?: string;
}

export function ActiveCallsList({ onSelectCall, selectedCallId }: ActiveCallsListProps) {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveCalls();

    // WebSocketイベントの購読
    const socket = getSocket();
    if (socket) {
      // Listen for bulk calls and active calls updates
      socket.on('bulk-calls-started', (data) => {
        console.log('Bulk calls started:', data);
        fetchActiveCalls();
      });
      
      socket.on('active-calls', (calls) => {
        console.log('Active calls update:', calls);
        setActiveCalls(Array.isArray(calls) ? calls : []);
      });
    }

    subscribeToCallEvents({
      onCallStarted: (data) => {
        fetchActiveCalls();
      },
      onCallUpdated: (data) => {
        setActiveCalls(prev => 
          prev.map(call => 
            call._id === data.callId 
              ? { ...call, status: data.status, assignedAgent: data.assignedAgent }
              : call
          )
        );
      },
      onCallEnded: (data) => {
        setActiveCalls(prev => prev.filter(call => call._id !== data.callId));
      }
    });

    // 30秒ごとに更新
    const interval = setInterval(fetchActiveCalls, 30000);

    return () => {
      // WebSocketイベントのクリーンアップ
      if (socket) {
        socket.off('bulk-calls-started');
        socket.off('active-calls');
      }
      unsubscribeFromCallEvents();
      clearInterval(interval);
    };
  }, []);

  const fetchActiveCalls = async () => {
    try {
      // Try to fetch from API
      const response = await callAPI.getActiveCalls();
      // Handle both data formats
      const calls = response.data?.data || response.data || [];
      setActiveCalls(Array.isArray(calls) ? calls : []);
    } catch (error: any) {
      // Log error but don't crash the app
      if (error?.response?.status !== 404) {
        console.error('Failed to fetch active calls:', error);
      }
      // Set empty array on error to prevent UI issues
      setActiveCalls([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'initiated': { label: '接続中', variant: 'secondary' as const },
      'ai-responding': { label: 'AI対応中', variant: 'default' as const },
      'transferring': { label: '転送中', variant: 'warning' as const },
      'human-connected': { label: '担当者対応中', variant: 'success' as const },
      'completed': { label: '完了', variant: 'secondary' as const },
      'failed': { label: '失敗', variant: 'destructive' as const }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['initiated'];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getCallIcon = (status: string) => {
    switch (status) {
      case 'human-connected':
        return <PhoneForwarded className="h-4 w-4" />;
      case 'completed':
      case 'failed':
        return <PhoneOff className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクティブな通話</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            読み込み中...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeCalls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクティブな通話</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            現在アクティブな通話はありません
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>アクティブな通話</span>
          <Badge variant="outline">{activeCalls.length}件</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activeCalls.map((call) => (
            <div
              key={call._id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                selectedCallId === call._id ? 'border-primary bg-accent' : ''
              }`}
              onClick={() => onSelectCall(call)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getCallIcon(call.status)}
                    <span className="font-medium">
                      {call.customerId?.name || '不明な顧客'}
                    </span>
                    {getStatusBadge(call.status)}
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>{call.customerId?.company || '-'}</div>
                    <div>{call.customerId?.phone || call.phoneNumber || '-'}</div>
                    
                    {call.assignedAgent && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>
                          {call.assignedAgent?.lastName || ''} {call.assignedAgent?.firstName || ''}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(call.startTime), {
                          addSuffix: true,
                          locale: ja
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {call.status === 'ai-responding' && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <HandoffButton
                        callId={call._id}
                        callStatus={call.status}
                        customerName={call.customerId?.name}
                        onHandoffSuccess={() => fetchActiveCalls()}
                        onHandoffError={(error) => console.error('Handoff error:', error)}
                      />
                    </div>
                  )}
                  
                  {(call.status === 'human-connected' || call.status === 'transferring') && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await callAPI.endCall(call._id, { result: '完了' });
                          fetchActiveCalls();
                        } catch (error) {
                          console.error('Failed to end call:', error);
                        }
                      }}
                    >
                      終了
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}