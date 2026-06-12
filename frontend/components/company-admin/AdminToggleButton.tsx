'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AdminToggleButtonProps {
  userId: string;
  isAdmin: boolean;
  userName: string;
  onToggle: () => void;
}

export function AdminToggleButton({ userId, isAdmin, userName, onToggle }: AdminToggleButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      const response = await fetch(`${apiUrl}/api/company-admin/users/${userId}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isCompanyAdmin: !isAdmin
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '権限の変更に失敗しました');
      }

      toast.success(
        isAdmin 
          ? `${userName}の管理者権限を削除しました`
          : `${userName}に管理者権限を付与しました`
      );
      
      onToggle();
    } catch (error: any) {
      console.error('Failed to toggle admin status:', error);
      toast.error('権限の変更に失敗しました', {
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isAdmin) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-1 text-green-600" />
                <Badge variant="default" className="bg-green-100 text-green-800">管理者</Badge>
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>管理者権限を削除</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p><strong>{userName}</strong>の企業管理者権限を削除しますか？</p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mt-2">
                  <p className="text-sm text-yellow-800">
                    <strong>注意:</strong> 権限を削除すると、このユーザーは企業管理画面にアクセスできなくなります。
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggle}>
              権限を削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Shield className="h-4 w-4 mr-1 text-gray-400" />
              <Badge variant="secondary">一般</Badge>
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>管理者権限を付与</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-2">
              <p><strong>{userName}</strong>に企業管理者権限を付与しますか？</p>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-2">
                <p className="text-sm text-blue-800">
                  <strong>管理者権限で可能な操作:</strong>
                </p>
                <ul className="text-sm text-blue-700 list-disc list-inside mt-1 space-y-1">
                  <li>企業所属ユーザーの一覧表示</li>
                  <li>通話統計とレポートの確認</li>
                  <li>他のユーザーの管理者権限設定</li>
                  <li>企業全体の架電実績確認</li>
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggle}>
            権限を付与
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}