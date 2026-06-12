'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Building2, 
  Users, 
  Phone, 
  BarChart3, 
  Settings, 
  LogOut,
  Home
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navigation = [
  {
    name: 'ダッシュボード',
    href: '/company-admin',
    icon: Home,
  },
  {
    name: 'ユーザー管理',
    href: '/company-admin/users',
    icon: Users,
  },
  {
    name: '通話履歴',
    href: '/company-admin/calls',
    icon: Phone,
  },
  {
    name: '統計・レポート',
    href: '/company-admin/reports',
    icon: BarChart3,
  },
  {
    name: '企業設定',
    href: '/company-admin/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  };

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200">
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <Building2 className="h-8 w-8 text-blue-600" />
        <div className="ml-3">
          <h1 className="text-lg font-semibold text-gray-900">企業管理</h1>
          <p className="text-sm text-gray-500">管理者画面</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/company-admin' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <Button
          variant="ghost"
          className="w-full justify-start text-gray-600 hover:text-gray-900"
          onClick={handleLogout}
        >
          <LogOut className="mr-3 h-5 w-5" />
          ログアウト
        </Button>
      </div>
    </div>
  );
}