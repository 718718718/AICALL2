'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert, Building2 } from 'lucide-react';

interface CompanyAdminGuardProps {
  children: React.ReactNode;
}

export function CompanyAdminGuard({ children }: CompanyAdminGuardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkCompanyAdminAccess();
  }, []);

  const checkCompanyAdminAccess = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      
      if (!token) {
        setError('ログインが必要です');
        setIsLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      // 企業管理者権限をチェック
      const response = await fetch(`${apiUrl}/api/company-admin/dashboard-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setIsAuthorized(true);
      } else if (response.status === 401) {
        setError('認証が必要です');
        localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken');
        localStorage.removeItem('userData');
      } else if (response.status === 403) {
        setError('企業管理者権限が必要です');
      } else {
        setError('アクセスエラーが発生しました');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setError('認証チェックに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    router.push('/company-admin/login');
  };

  const handleGoBack = () => {
    router.push('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">認証を確認しています...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <ShieldAlert className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-xl">アクセス権限が必要です</CardTitle>
            <CardDescription>
              {error === '企業管理者権限が必要です' 
                ? '企業管理画面にアクセスするには、企業管理者権限が必要です。'
                : error === 'ログインが必要です' || error === '認証が必要です'
                ? '企業管理画面にアクセスするにはログインが必要です。'
                : error
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(error === 'ログインが必要です' || error === '認証が必要です') && (
              <Button onClick={handleLogin} className="w-full">
                <Building2 className="mr-2 h-4 w-4" />
                企業管理者ログイン
              </Button>
            )}
            <Button variant="outline" onClick={handleGoBack} className="w-full">
              ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}