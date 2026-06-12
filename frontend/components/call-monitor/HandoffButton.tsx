'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { PhoneForwarded, Loader2 } from 'lucide-react';
// Removed unused imports
import { toast } from 'sonner';

interface HandoffButtonProps {
  callId: string;
  disabled?: boolean;
  onHandoffComplete?: () => void;
}

export function HandoffButton({ callId, disabled = false, onHandoffComplete }: HandoffButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isHandingOff, setIsHandingOff] = useState(false);

  const handleHandoff = async () => {
    setIsHandingOff(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/calls/${callId}/handoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '取次に失敗しました');
      }

      const data = await response.json();
      
      toast.success('担当者に電話をかけています...', {
        description: `電話番号: ${data.data.agentPhoneNumber}`,
        duration: 5000
      });
      
      setIsOpen(false);
      setReason('');
      
      if (onHandoffComplete) {
        onHandoffComplete();
      }
    } catch (error: any) {
      console.error('Handoff error:', error);
      
      if (error.message && error.message.includes('phone number configured')) {
        toast.error('電話番号が設定されていません', {
          description: '設定画面から取次用の電話番号を登録してください',
          action: {
            label: '設定へ',
            onClick: () => window.location.href = '/settings/handoff'
          }
        });
      } else {
        toast.error('取次に失敗しました', {
          description: error.message
        });
      }
    } finally {
      setIsHandingOff(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          disabled={disabled || isHandingOff}
          className="w-full"
        >
          {isHandingOff ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              引き継ぎ中...
            </>
          ) : (
            <>
              <PhoneForwarded className="mr-2 h-4 w-4" />
              担当者に引き継ぐ
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>担当者に取り次ぎますか？</DialogTitle>
          <DialogDescription>
            AIから担当者の電話に通話を転送します。お客様は保留状態になり、担当者が応答後に接続されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea
            placeholder="引き継ぎ理由（オプション）例：お客様が詳細な説明を希望"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isHandingOff}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleHandoff}
            disabled={isHandingOff}
          >
            {isHandingOff ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                処理中...
              </>
            ) : (
              '引き継ぐ'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}