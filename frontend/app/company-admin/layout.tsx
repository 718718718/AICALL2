'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/company-admin/Sidebar';
import { CompanyAdminGuard } from '@/components/auth/CompanyAdminGuard';

export default function CompanyAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/company-admin/login';

  // Don't apply guard to login page
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <CompanyAdminGuard>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="ml-64 overflow-hidden">
          <div className="h-full overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </CompanyAdminGuard>
  );
}