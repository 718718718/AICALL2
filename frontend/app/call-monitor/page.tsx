'use client';

import React, { useEffect, useState } from 'react';
import { ActiveCallsList } from '@/components/call-monitor/ActiveCallsList';
import { CallTranscript } from '@/components/call-monitor/CallTranscript';
import { CallDetails } from '@/components/call-monitor/CallDetails';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { initializeSocket, getSocket } from '@/lib/socket';
import { callAPI } from '@/lib/api';
import { Phone, Users, Clock, TrendingUp } from 'lucide-react';

export default function CallMonitorPage() {
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [statistics, setStatistics] = useState({
    totalCallsToday: 0,
    activeCallsNow: 0,
    availableAgents: 0,
    successRate: 0
  });

  useEffect(() => {
    // WebSocket接続を初期化 (開発環境では認証オプショナル)
    const token = localStorage.getItem('accessToken');
    initializeSocket(token || undefined);
    
    // 統計情報の購読
    const socket = getSocket();
    if (socket) {
      socket.on('statistics-update', (data) => {
        setStatistics(prev => ({ ...prev, ...data }));
      });
      socket.emit('request-statistics');
    }

    // 統計情報を取得
    fetchStatistics();

    return () => {
      // クリーンアップ
    };
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await callAPI.getStatistics();
      setStatistics({
        totalCallsToday: response.data.data.totalCalls,
        activeCallsNow: 0, // ActiveCallsListから取得
        availableAgents: 0, // エージェントAPIから取得
        successRate: parseFloat(response.data.data.successRate)
      });
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    }
  };

  const handleCallSelect = async (call: any) => {
    setSelectedCall(call);
    
    // 通話の詳細情報を取得
    try {
      const response = await callAPI.getCallDetails(call._id);
      setSelectedCall(response.data.data);
    } catch (error) {
      console.error('Failed to fetch call details:', error);
    }
  };

  const handleCallEnd = () => {
    setSelectedCall(null);
    fetchStatistics();
  };

  const handleHandoffComplete = () => {
    fetchStatistics();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー統計 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本日の通話数</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalCallsToday}</div>
            <p className="text-xs text-muted-foreground">
              前日比 +12%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブ通話</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.activeCallsNow}</div>
            <p className="text-xs text-muted-foreground">
              現在対応中
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">利用可能エージェント</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.availableAgents}</div>
            <p className="text-xs text-muted-foreground">
              オンライン
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              本日の成功率
            </p>
          </CardContent>
        </Card>
      </div>

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左側：アクティブ通話リスト */}
        <div className="lg:col-span-1">
          <ActiveCallsList
            onSelectCall={handleCallSelect}
            selectedCallId={selectedCall?._id}
          />
        </div>

        {/* 右側：通話詳細とトランスクリプト */}
        <div className="lg:col-span-2">
          {selectedCall ? (
            <Tabs defaultValue="transcript" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="transcript">トランスクリプト</TabsTrigger>
                <TabsTrigger value="details">詳細情報</TabsTrigger>
              </TabsList>
              
              <TabsContent value="transcript" className="mt-4">
                <CallTranscript
                  callId={selectedCall._id}
                  initialTranscript={selectedCall.transcript}
                />
              </TabsContent>
              
              <TabsContent value="details" className="mt-4">
                <CallDetails
                  call={selectedCall}
                  onCallEnd={handleCallEnd}
                  onHandoffComplete={handleHandoffComplete}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="h-[600px] flex items-center justify-center">
              <CardContent>
                <div className="text-center text-muted-foreground">
                  <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>通話を選択すると詳細が表示されます</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}