'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Users, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Phone,
  Mail,
  Building,
  UserCheck,
  UserX,
  PhoneCall,
  Shield,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminToggleButton } from '@/components/company-admin/AdminToggleButton';

interface CompanyUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  businessType: string;
  employees: string;
  handoffPhoneNumber: string | null;
  isCompanyAdmin: boolean;
  createdAt: string;
  lastLoginAt?: string;
  totalCalls: number;
  successfulCalls: number;
}

export default function CompanyUsersPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm)
    );
    setFilteredUsers(filtered);
  }, [users, searchTerm]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      const response = await fetch(`${apiUrl}/api/company-admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.data);
      } else {
        toast.error('ユーザー一覧の取得に失敗しました');
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('ユーザー一覧の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    return role === 'admin' ? (
      <Badge variant="default">管理者</Badge>
    ) : (
      <Badge variant="secondary">一般ユーザー</Badge>
    );
  };

  const getBusinessTypeName = (type: string) => {
    const types: { [key: string]: string } = {
      'it': 'IT・技術',
      'manufacturing': '製造業',
      'retail': '小売業',
      'service': 'サービス業'
    };
    return types[type] || type;
  };

  const getEmployeesRange = (range: string) => {
    const ranges: { [key: string]: string } = {
      '1-10': '1-10名',
      '11-50': '11-50名',
      '51-100': '51-100名',
      '100+': '100名以上'
    };
    return ranges[range] || range;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ユーザー管理</h1>
          <p className="text-gray-600 mt-1">企業に所属するユーザーの管理</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          新規ユーザー追加
        </Button>
      </div>

      {/* 検索・フィルター */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="名前、メールアドレス、電話番号で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              <span>総ユーザー数: {users.length}名</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ユーザー一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>ユーザー一覧</CardTitle>
          <CardDescription>
            検索結果: {filteredUsers.length}名のユーザー
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>連絡先</TableHead>
                  <TableHead>役割</TableHead>
                  <TableHead>業種・規模</TableHead>
                  <TableHead>通話実績</TableHead>
                  <TableHead>取次設定</TableHead>
                  <TableHead>管理者権限</TableHead>
                  <TableHead>最終ログイン</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {user.lastName} {user.firstName}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2 text-sm">
                        <Phone className="h-3 w-3" />
                        <span>{user.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getRoleBadge(user.role)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{getBusinessTypeName(user.businessType)}</div>
                        <div className="text-gray-500">{getEmployeesRange(user.employees)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center space-x-1">
                          <PhoneCall className="h-3 w-3" />
                          <span>総数: {user.totalCalls}件</span>
                        </div>
                        <div className="text-green-600">
                          成功: {user.successfulCalls}件
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.handoffPhoneNumber ? (
                        <div className="flex items-center space-x-1 text-green-600">
                          <UserCheck className="h-4 w-4" />
                          <span>設定済み</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 text-gray-400">
                          <UserX className="h-4 w-4" />
                          <span>未設定</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <AdminToggleButton 
                        userId={user.id}
                        isAdmin={user.isCompanyAdmin}
                        userName={`${user.lastName} ${user.firstName}`}
                        onToggle={fetchUsers}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-500">
                        {user.lastLoginAt 
                          ? new Date(user.lastLoginAt).toLocaleDateString('ja-JP')
                          : '未ログイン'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>ユーザー詳細</DialogTitle>
                              <DialogDescription>
                                {selectedUser?.lastName} {selectedUser?.firstName}の詳細情報
                              </DialogDescription>
                            </DialogHeader>
                            {selectedUser && (
                              <div className="grid grid-cols-2 gap-4 py-4">
                                <div>
                                  <label className="text-sm font-medium text-gray-700">氏名</label>
                                  <p className="text-sm">{selectedUser.lastName} {selectedUser.firstName}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">メールアドレス</label>
                                  <p className="text-sm">{selectedUser.email}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">電話番号</label>
                                  <p className="text-sm">{selectedUser.phone}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">役割</label>
                                  <p className="text-sm">{selectedUser.role === 'admin' ? '管理者' : '一般ユーザー'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">業種</label>
                                  <p className="text-sm">{getBusinessTypeName(selectedUser.businessType)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">従業員数</label>
                                  <p className="text-sm">{getEmployeesRange(selectedUser.employees)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">総通話数</label>
                                  <p className="text-sm">{selectedUser.totalCalls}件</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">成功通話数</label>
                                  <p className="text-sm text-green-600">{selectedUser.successfulCalls}件</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">取次電話番号</label>
                                  <p className="text-sm">
                                    {selectedUser.handoffPhoneNumber ? '設定済み' : '未設定'}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">登録日時</label>
                                  <p className="text-sm">
                                    {new Date(selectedUser.createdAt).toLocaleString('ja-JP')}
                                  </p>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                ユーザーが見つかりません
              </h3>
              <p className="text-gray-500">
                検索条件を変更するか、新規ユーザーを追加してください
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}