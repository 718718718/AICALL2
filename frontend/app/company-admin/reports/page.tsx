'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BarChart3, 
  TrendingUp, 
  Download, 
  Calendar,
  Phone,
  Target,
  Users,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface CallStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  pendingCalls: number;
  averageDuration: number;
  successRate: number;
}

interface DailyStats {
  date: string;
  calls: number;
  success: number;
  duration: number;
}

interface UserPerformance {
  userId: string;
  name: string;
  totalCalls: number;
  successfulCalls: number;
  averageDuration: number;
  successRate: number;
}

export default function CompanyReportsPage() {
  const [period, setPeriod] = useState('7days');
  const [callStats, setCallStats] = useState<CallStats>({
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    pendingCalls: 0,
    averageDuration: 0,
    successRate: 0
  });
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [userPerformance, setUserPerformance] = useState<UserPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReportsData();
  }, [period]);

  const fetchReportsData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      const response = await fetch(`${apiUrl}/api/company-admin/reports?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCallStats(data.data.callStats);
        setDailyStats(data.data.dailyStats || []);
        setUserPerformance(data.data.userPerformance || []);
      } else {
        toast.error('レポートデータの取得に失敗しました');
      }
    } catch (error) {
      console.error('Failed to fetch reports data:', error);
      toast.error('レポートデータの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case '7days': return '過去7日間';
      case '30days': return '過去30日間';
      case '90days': return '過去90日間';
      default: return period;
    }
  };

  const exportReport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      const response = await fetch(`${apiUrl}/api/company-admin/reports/export?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `call-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('レポートをダウンロードしました');
      } else {
        toast.error('レポートのダウンロードに失敗しました');
      }
    } catch (error) {
      console.error('Failed to export report:', error);
      toast.error('レポートのダウンロードに失敗しました');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">統計・レポート</h1>
          <p className="text-gray-600 mt-1">通話実績の分析と統計情報</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">過去7日間</SelectItem>
              <SelectItem value="30days">過去30日間</SelectItem>
              <SelectItem value="90days">過去90日間</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />
            CSV出力
          </Button>
        </div>
      </div>

      {/* 概要統計 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総架電数</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callStats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">
              {getPeriodLabel(period)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功率</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {callStats.successRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {callStats.successfulCalls}件成功
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
              {formatDuration(callStats.averageDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              平均値
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">失敗数</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{callStats.failedCalls}</div>
            <p className="text-xs text-muted-foreground">
              要改善
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 日別統計グラフ */}
      <Card>
        <CardHeader>
          <CardTitle>日別通話統計</CardTitle>
          <CardDescription>
            {getPeriodLabel(period)}の日別通話実績
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dailyStats.length > 0 ? (
            <div className="space-y-4">
              {/* 簡易グラフ表示 */}
              <div className="grid gap-4">
                {dailyStats.map((stat, index) => {
                  const maxCalls = Math.max(...dailyStats.map(s => s.calls));
                  const width = maxCalls > 0 ? (stat.calls / maxCalls) * 100 : 0;
                  const successRate = stat.calls > 0 ? (stat.success / stat.calls) * 100 : 0;
                  
                  return (
                    <div key={index} className="flex items-center space-x-4">
                      <div className="w-20 text-sm text-gray-600">
                        {new Date(stat.date).toLocaleDateString('ja-JP', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <div 
                            className="bg-blue-500 h-6 rounded"
                            style={{ width: `${width}%`, minWidth: '2px' }}
                          ></div>
                          <span className="text-sm font-medium">{stat.calls}件</span>
                        </div>
                        <div className="text-xs text-gray-500 flex space-x-4">
                          <span>成功: {stat.success}件 ({successRate.toFixed(1)}%)</span>
                          <span>平均時間: {formatDuration(stat.duration)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              データがありません
            </div>
          )}
        </CardContent>
      </Card>

      {/* ユーザー別パフォーマンス */}
      <Card>
        <CardHeader>
          <CardTitle>ユーザー別パフォーマンス</CardTitle>
          <CardDescription>
            {getPeriodLabel(period)}のユーザー別通話実績
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userPerformance.length > 0 ? (
            <div className="space-y-4">
              {userPerformance.map((user, index) => (
                <div key={user.userId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-gray-500">
                        総通話: {user.totalCalls}件 | 平均時間: {formatDuration(user.averageDuration)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-green-600">
                        成功: {user.successfulCalls}件
                      </div>
                      <div className="text-xs text-gray-500">
                        成功率: {user.successRate.toFixed(1)}%
                      </div>
                    </div>
                    <Badge variant={user.successRate >= 70 ? 'default' : user.successRate >= 50 ? 'secondary' : 'destructive'}>
                      {user.successRate >= 70 ? '優秀' : user.successRate >= 50 ? '普通' : '要改善'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              データがありません
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}