'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function RegistrationCompletePage() {
  const router = useRouter();

  const handleGoHome = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="text-center space-y-6">
            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-gray-900">
              新規アカウント登録完了
            </h1>

            {/* Description */}
            <p className="text-gray-600">
              新規アカウント登録が完了しました。
              <br />
              さっそく利用してみましょう。
            </p>

            {/* Action Button */}
            <Button 
              onClick={handleGoHome}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3"
              size="lg"
            >
              ホームへ戻る
            </Button>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}