'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Phone,
  Clock,
  Calendar,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  Users,
  PhoneCall,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { callAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('history');
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<any>({});
  const [pagination, setPagination] = useState({
    current: 1,
    total: 1,
    hasNext: false,
    hasPrev: false
  });
  
  // フィルター
  const [filters, setFilters] = useState({
    status: '',
    result: '',
    startDate: '',
    endDate: '',
    search: ''
  });

  useEffect(() => {
    if (activeTab === 'history') {
      fetchCallHistory();
    } else {
      fetchStatistics();
    }
  }, [activeTab, filters, pagination.current]);

  const fetchCallHistory = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.current,
        limit: 10
      };

      if (filters.status) params.status = filters.status;
      if (filters.result) params.result = filters.result;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await callAPI.getCallHistory(params);
      setCalls(response.data.data);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Failed to fetch call history:', error);
      toast.error('通話履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await callAPI.getStatistics(params);
      setStatistics(response.data.data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
      toast.error('統計情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      'completed': { label: '完了', variant: 'default' },
      'failed': { label: '失敗', variant: 'destructive' },
      'human-connected': { label: '担当者対応', variant: 'success' }
    };
    const config = statusMap[status] || { label: status, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getResultBadge = (result: string) => {
    const resultMap: Record<string, { variant: any }> = {
      '成功': { variant: 'success' },
      '不在': { variant: 'warning' },
      '拒否': { variant: 'destructive' },
      '要フォロー': { variant: 'default' }
    };
    const config = resultMap[result] || { variant: 'secondary' };
    return <Badge variant={config.variant}>{result}</Badge>;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const exportData = () => {
    // CSV エクスポート機能の実装
    toast.info('エクスポート機能は準備中です');
  };

  // チャートデータの準備
  const prepareChartData = () => {
    if (!statistics.resultBreakdown) return [];
    
    return statistics.resultBreakdown.map((item: any) => ({
      name: item._id || '未分類',
      count: item.count,
      avgDuration: Math.round(item.avgDuration || 0)
    }));
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">通話履歴とレポート</h1>
        <p className="text-muted-foreground mt-2">
          過去の通話履歴と統計情報を確認できます
        </p>
      </div>

      {/* フィルター */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            フィルター
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="status">ステータス</Label>
              <Select value={filters.status} onValueChange={(value) => 
                setFilters(prev => ({ ...prev, status: value }))
              }>
                <SelectTrigger id="status">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべて</SelectItem>
                  <SelectItem value="completed">完了</SelectItem>
                  <SelectItem value="failed">失敗</SelectItem>
                  <SelectItem value="human-connected">担当者対応</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="result">結果</Label>
              <Select value={filters.result} onValueChange={(value) => 
                setFilters(prev => ({ ...prev, result: value }))
              }>
                <SelectTrigger id="result">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべて</SelectItem>
                  <SelectItem value="成功">成功</SelectItem>
                  <SelectItem value="不在">不在</SelectItem>
                  <SelectItem value="拒否">拒否</SelectItem>
                  <SelectItem value="要フォロー">要フォロー</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="startDate">開始日</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="endDate">終了日</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button 
                onClick={() => setFilters({
                  status: '',
                  result: '',
                  startDate: '',
                  endDate: '',
                  search: ''
                })}
                variant="outline"
              >
                リセット
              </Button>
              <Button onClick={exportData} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="history">通話履歴</TabsTrigger>
          <TabsTrigger value="reports">レポート</TabsTrigger>
        </TabsList>

        {/* 通話履歴 */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>通話履歴</CardTitle>
              <CardDescription>
                過去のすべての通話記録
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">読み込み中...</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日時</TableHead>
                        <TableHead>顧客</TableHead>
                        <TableHead>会社</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead>結果</TableHead>
                        <TableHead>通話時間</TableHead>
                        <TableHead>担当者</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calls.map((call) => (
                        <TableRow key={call._id}>
                          <TableCell>
                            {format(new Date(call.startTime), 'MM/dd HH:mm', { locale: ja })}
                          </TableCell>
                          <TableCell>{call.customerId?.name}</TableCell>
                          <TableCell>{call.customerId?.company}</TableCell>
                          <TableCell>{getStatusBadge(call.status)}</TableCell>
                          <TableCell>
                            {call.callResult && getResultBadge(call.callResult)}
                          </TableCell>
                          <TableCell>
                            {call.duration && formatDuration(call.duration)}
                          </TableCell>
                          <TableCell>
                            {call.assignedAgent && 
                              `${call.assignedAgent.lastName} ${call.assignedAgent.firstName}`
                            }
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                // 詳細表示
                                toast.info('詳細表示は準備中です');
                              }}
                            >
                              詳細
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* ページネーション */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      ページ {pagination.current} / {pagination.total}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPagination(prev => ({ 
                          ...prev, 
                          current: prev.current - 1 
                        }))}
                        disabled={!pagination.hasPrev}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        前へ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPagination(prev => ({ 
                          ...prev, 
                          current: prev.current + 1 
                        }))}
                        disabled={!pagination.hasNext}
                      >
                        次へ
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* レポート */}
        <TabsContent value="reports" className="mt-6 space-y-6">
          {/* 統計カード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">総通話数</CardTitle>
                <PhoneCall className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.totalCalls || 0}</div>
                <p className="text-xs text-muted-foreground">
                  選択期間内
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">成功数</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.successfulCalls || 0}</div>
                <p className="text-xs text-muted-foreground">
                  成功した通話
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">成功率</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.successRate || 0}%</div>
                <p className="text-xs text-muted-foreground">
                  全体の成功率
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
                  {statistics.averageDuration ? formatDuration(Math.round(statistics.averageDuration)) : '0:00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  平均時間
                </p>
              </CardContent>
            </Card>
          </div>

          {/* チャート */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 結果別通話数 */}
            <Card>
              <CardHeader>
                <CardTitle>結果別通話数</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={prepareChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#8884d8" name="通話数" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 結果別割合 */}
            <Card>
              <CardHeader>
                <CardTitle>結果別割合</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={prepareChartData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.count}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {prepareChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* 平均通話時間 */}
          <Card>
            <CardHeader>
              <CardTitle>結果別平均通話時間</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={prepareChartData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatDuration(value)} />
                  <Legend />
                  <Bar dataKey="avgDuration" fill="#82ca9d" name="平均時間（秒）" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}