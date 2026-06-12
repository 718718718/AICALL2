'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Phone, TrendingUp, Clock, Building2, UserCheck } from 'lucide-react';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalCalls: number;
  successfulCalls: number;
  averageCallDuration: number;
  callsToday: number;
}

interface RecentCall {
  id: string;
  customerName: string;
  userAgent: string;
  duration: number;
  result: string;
  timestamp: string;
}

export default function CompanyAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalCalls: 0,
    successfulCalls: 0,
    averageCallDuration: 0,
    callsToday: 0
  });
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      // 企業統計データを取得
      const statsResponse = await fetch(`${apiUrl}/api/company-admin/dashboard-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.data.stats);
        setRecentCalls(statsData.data.recentCalls || []);
        setCompanyInfo(statsData.data.companyInfo);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case '成功':
        return <Badge variant="default" className="bg-green-100 text-green-800">成功</Badge>;
      case '不在':
        return <Badge variant="secondary">不在</Badge>;
      case '拒否':
        return <Badge variant="destructive">拒否</Badge>;
      case '要フォロー':
        return <Badge variant="outline">要フォロー</Badge>;
      default:
        return <Badge variant="secondary">{result}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
          {companyInfo && (
            <div className="flex items-center mt-2 text-gray-600">
              <Building2 className="h-4 w-4 mr-2" />
              <span>{companyInfo.name}</span>
            </div>
          )}
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleString('ja-JP')}
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総ユーザー数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              アクティブ: {stats.activeUsers}人
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総架電数</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">
              本日: {stats.callsToday}件
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalCalls > 0 ? Math.round((stats.successfulCalls / stats.totalCalls) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              成功: {stats.successfulCalls}件
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均通話時間</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(stats.averageCallDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              平均値
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 最近の通話履歴 */}
      <Card>
        <CardHeader>
          <CardTitle>最近の通話履歴</CardTitle>
          <CardDescription>
            直近の通話実績を表示しています
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentCalls.length > 0 ? (
            <div className="space-y-4">
              {recentCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="font-medium">{call.customerName}</div>
                      <div className="text-sm text-gray-500">
                        担当: {call.userAgent} | 通話時間: {formatDuration(call.duration)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {getResultBadge(call.result)}
                    <div className="text-sm text-gray-500">
                      {new Date(call.timestamp).toLocaleString('ja-JP')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              まだ通話履歴がありません
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}