'use client';

import React, { useState } from 'react';
import { Phone, Loader2, UserCheck, AlertCircle } from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface HandoffButtonProps {
  callId: string;
  callStatus: string;
  customerName?: string;
  disabled?: boolean;
  onHandoffSuccess?: () => void;
  onHandoffError?: (error: string) => void;
}

export default function HandoffButton({
  callId,
  callStatus,
  customerName,
  disabled = false,
  onHandoffSuccess,
  onHandoffError
}: HandoffButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 引き継ぎ可能かチェック
  const canHandoff = callStatus === 'ai-responding' && !disabled && !isLoading;

  // エージェントの可用性をチェック
  const checkAgentAvailability = async () => {
    try {
      const response = await fetch('/api/agents/available', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to check agent availability');
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error checking agent availability:', error);
      return [];
    }
  };

  // 引き継ぎボタンクリック時の処理
  const handleHandoffClick = async () => {
    setError(null);
    setIsLoading(true);

    try {
      // エージェントの可用性をチェック
      const agents = await checkAgentAvailability();
      setAvailableAgents(agents);

      if (agents.length === 0) {
        setError('現在利用可能なエージェントがいません。しばらくお待ちください。');
        setIsLoading(false);
        return;
      }

      // 確認ダイアログを表示
      setShowConfirmDialog(true);
      setIsLoading(false);
    } catch (error) {
      setError('エージェントの確認中にエラーが発生しました。');
      setIsLoading(false);
      onHandoffError?.('エージェントの確認に失敗しました');
    }
  };

  // 引き継ぎを実行
  const executeHandoff = async () => {
    setIsLoading(true);
    setShowConfirmDialog(false);

    try {
      const response = await fetch(`/api/calls/${callId}/handoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          agentId: selectedAgentId,
          reason: 'Manual handoff requested'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Handoff failed');
      }

      const data = await response.json();
      
      // 成功通知
      toast.success('通話を正常に転送しました', {
        description: `${customerName ? customerName + 'との' : ''}通話がエージェントに転送されました。`
      });

      onHandoffSuccess?.();
    } catch (error: any) {
      console.error('Handoff error:', error);
      
      // エラー通知
      toast.error('転送に失敗しました', {
        description: error.message || '通話の転送中にエラーが発生しました。'
      });

      onHandoffError?.(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ダイアログを閉じる
  const handleCancelHandoff = () => {
    setShowConfirmDialog(false);
    setSelectedAgentId(null);
    setError(null);
  };

  return (
    <>
      <Button
        onClick={handleHandoffClick}
        disabled={!canHandoff}
        variant={callStatus === 'ai-responding' ? 'default' : 'outline'}
        size="sm"
        className="gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            確認中...
          </>
        ) : (
          <>
            <Phone className="h-4 w-4" />
            人間に引き継ぐ
          </>
        )}
      </Button>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>通話を引き継ぎますか？</DialogTitle>
            <DialogDescription>
              {customerName && (
                <span className="font-semibold">{customerName}との</span>
              )}
              通話をエージェントに転送します。
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {availableAgents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                利用可能なエージェント: {availableAgents.length}名
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableAgents.map((agent) => (
                  <div
                    key={agent.userId}
                    onClick={() => setSelectedAgentId(agent.userId)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedAgentId === agent.userId
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{agent.name || agent.email}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        通話数: {agent.totalCallsHandled || 0}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelHandoff}
              disabled={isLoading}
            >
              キャンセル
            </Button>
            <Button
              onClick={executeHandoff}
              disabled={isLoading || (availableAgents.length > 0 && !selectedAgentId)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  転送中...
                </>
              ) : (
                '転送する'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}