"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { getWsUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ChevronLeft, ChevronRight, Upload, FileUp, X, Phone, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { useToast } from "@/components/ui/use-toast";
import { authenticatedApiRequest, getApiUrl } from "@/lib/apiHelper";
import { parseCSV, formatCustomerForImport } from "@/lib/csvParser";
import { normalizeApiResponse, getCustomerId, getCustomerIds } from "@/lib/utils/id-normalizer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CallModal } from "@/components/calls/CallModal";
import { CallStatusModal } from "@/components/calls/CallStatusModal";

// Define customer type
type Customer = {
  id: number;
  _id?: string;
  name: string;
  address: string;
  status: string;
  lastCall: string;
  callResult: string;
  date?: string;
  time?: string;
  duration?: string;
  result?: string;
  customer?: string;
  notes?: string;
  phone?: string;
  email?: string;
  company?: string;
  url?: string;
  importedAt?: string;
};

// 定義されているステータス値
const VALID_CALL_RESULTS = ['成功', '不在', '拒否', '要フォロー', '失敗', '通話中', '未対応'];

const statusColors = {
  不在: "bg-yellow-500",
  成功: "bg-green-500",
  要フォロー: "bg-purple-500",
  拒否: "bg-red-500",
  失敗: "bg-gray-500",
  通話中: "bg-blue-500",
  未対応: "bg-gray-600",
  未設定: "bg-gray-400"
};

// ステータス値を正規化する関数
const normalizeStatus = (status: string | null | undefined): string => {
  if (!status || status === '') return "未対応";

  // "失敗: timeout" のような形式のステータスを処理
  if (status.includes("失敗")) return "失敗";
  if (status.includes("成功")) return "成功";
  if (status.includes("不在")) return "不在";
  if (status.includes("拒否")) return "拒否";
  if (status.includes("要フォロー")) return "要フォロー";
  if (status.includes("通話中")) return "通話中";
  if (status.includes("未対応")) return "未対応";

  // 完全一致のチェック
  if (VALID_CALL_RESULTS.includes(status)) return status;

  // 無効なステータスでもそのまま保持（警告のみ）
  console.warn(`[Dashboard] Unknown status: ${status}, keeping as-is`);
  return status;
};

export default function DashboardPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isCalling, setIsCalling] = useState(false); // API呼び出し中フラグ
  const [isBulkCallActive, setIsBulkCallActive] = useState(false); // 一斉通話実行中フラグ
  const [callingSessions, setCallingSessions] = useState<Set<string>>(new Set()); // 通話中の顧客ID
  const [bulkCallQueue, setBulkCallQueue] = useState<number>(0); // キュー中の通話数
  const [isQueueProcessing, setIsQueueProcessing] = useState(false); // キュー処理中フラグ
  const [isCallStarting, setIsCallStarting] = useState(false); // 通話開始処理中フラグ（カウント補正用）
  const [callProgress, setCallProgress] = useState(0);
  const [phoneToCustomerMap, setPhoneToCustomerMap] = useState<Map<string, string>>(new Map()); // phone -> customerId
  const itemsPerPage = 30;
  const [isCallDialogOpen, setIsCallDialogOpen] = useState(false);
  const [callResults, setCallResults] = useState<any[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeCallModal, setActiveCallModal] = useState<{
    isOpen: boolean;
    customerName: string;
    phoneNumber: string;
    customerId: string;
  }>({ isOpen: false, customerName: "", phoneNumber: "", customerId: "" });
  const [isCallStatusModalOpen, setIsCallStatusModalOpen] = useState(false);
  const [activePhoneNumber, setActivePhoneNumber] = useState("");
  const activePhoneNumberRef = useRef("");
  const isCallStatusModalOpenRef = useRef(false);
  const activeSessionKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activePhoneNumberRef.current = activePhoneNumber;
  }, [activePhoneNumber]);

  useEffect(() => {
    isCallStatusModalOpenRef.current = isCallStatusModalOpen;
  }, [isCallStatusModalOpen]);
  const { toast } = useToast();

  const normalizePhoneNumber = useCallback((phone?: string | null) => {
    if (!phone) return "";
    let normalized = phone.replace(/[\s-]/g, "");
    if (normalized.startsWith("+81")) {
      normalized = "0" + normalized.substring(3);
    }
    return normalized;
  }, []);

  const getSessionKey = useCallback((session: any, phone: string) => {
    const sessionId = session?._id
      || session?.id
      || session?.sessionId
      || session?.twilioCallSid
      || session?.callId
      || session?.conferenceSid;
    const start = session?.startTime || session?.createdAt || "";
    const base = sessionId ? String(sessionId) : `no-id-${start}`;
    return `${base}|${phone || "unknown"}`;
  }, []);

  // Fetch customers from API
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const data = await authenticatedApiRequest('/api/customers');
        const newCustomers = normalizeApiResponse(data);

        // 手動変更されたステータスを保持
        setCustomers(prevCustomers => {
          return newCustomers.map(newCustomer => {
            const existingCustomer = prevCustomers.find(prev =>
              getCustomerId(prev) === getCustomerId(newCustomer)
            );

            // 既存データがあり、手動変更されている場合は保持
            if (existingCustomer &&
              (existingCustomer.result !== newCustomer.result ||
                existingCustomer.callResult !== newCustomer.callResult)) {
              return {
                ...newCustomer,
                result: existingCustomer.result,
                callResult: existingCustomer.callResult
              };
            }

            return newCustomer;
          });
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch customers",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, [toast]);

  // Handle CSV file selection
  const handleFileSelection = useCallback(async (file: File) => {
    // More lenient CSV file check
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "エラー",
        description: "CSVファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);

    try {
      // Read and parse CSV data
      const text = await file.text();
      const parsedData = parseCSV(text);

      if (parsedData.length === 0) {
        toast({
          title: "エラー",
          description: "CSVファイルが空です",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      // Format data for import
      const formattedData = parsedData.map(formatCustomerForImport);

      // Send to API directly without showing dialog
      const token = localStorage.getItem('accessToken');
      const response = await fetch("/api/customers/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ customers: formattedData }),
      });

      if (!response.ok) throw new Error("Import failed");

      const result = await response.json();
      toast({
        title: "成功",
        description: `${formattedData.length}件のデータをインポートしました`,
      });

      // Refresh customer list
      const data = await authenticatedApiRequest('/api/customers');
      setCustomers(normalizeApiResponse(data));

    } catch (error) {
      toast({
        title: "エラー",
        description: "CSVファイルのインポートに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  }, [toast]);

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if we're actually leaving the drop zone
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Accept CSV files even if MIME type is not set
      if (file.name.toLowerCase().endsWith('.csv')) {
        handleFileSelection(file);
      } else {
        toast({
          title: "エラー",
          description: "CSVファイルのみアップロード可能です",
          variant: "destructive",
        });
      }
    }
  }, [handleFileSelection, toast]);

  // Removed old handleImport function - now handled directly in handleFileSelection

  // Delete selected customers
  const deleteSelectedCustomers = async (ids: number[]) => {
    try {
      const response = await fetch("/api/customers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) throw new Error("Deletion failed");

      toast({
        title: "Success",
        description: "Deleted selected customers",
      });

      // Refresh customer list
      const data = await authenticatedApiRequest('/api/customers');
      setCustomers(normalizeApiResponse(data));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete customers",
        variant: "destructive",
      });
    }
  };

  // Handle select all checkbox (current page only)
  const handleSelectAll = () => {
    if (selectAll) {
      // Deselect all customers on current page
      const currentPageIds = new Set(getCustomerIds(paginatedCustomers));
      const newSelected = new Set(
        Array.from(selectedCustomers).filter(id => !currentPageIds.has(id))
      );
      setSelectedCustomers(newSelected);
    } else {
      // Select all customers on current page
      const currentPageIds = new Set(getCustomerIds(paginatedCustomers));
      const newSelected = new Set([...selectedCustomers, ...currentPageIds]);
      setSelectedCustomers(newSelected);
    }
    setSelectAll(!selectAll);
  };

  // Handle individual customer selection
  const handleSelectCustomer = (customerId: string) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId);
    } else {
      newSelected.add(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  // Handle status change
  const handleStatusChange = async (customerId: string, newStatus: string) => {
    if (isUpdatingStatus === customerId) return; // 重複更新を防ぐ

    setIsUpdatingStatus(customerId);
    try {
      await authenticatedApiRequest(`/api/customers?id=${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          result: newStatus,
          callResult: newStatus
        }),
      });

      // Update local state
      setCustomers(prevCustomers =>
        prevCustomers.map(c =>
          getCustomerId(c) === customerId
            ? { ...c, result: newStatus, callResult: newStatus }
            : c
        )
      );

      toast({
        title: "ステータス更新",
        description: `ステータスを「${newStatus}」に変更しました`,
      });
    } catch (error) {
      console.error('Status update error:', error);
      toast({
        title: "エラー",
        description: "ステータスの更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  // Handle bulk call
  const handleBulkCall = async () => {
    const selectedCustomerData = customers.filter(c =>
      selectedCustomers.has(getCustomerId(c))
    );

    const phoneNumbers = selectedCustomerData
      .map(c => c.phone)
      .filter(phone => phone);

    const customerIds = selectedCustomerData
      .map(getCustomerId);

    if (phoneNumbers.length === 0) {
      toast({
        title: "エラー",
        description: "選択された顧客に電話番号がありません",
        variant: "destructive",
      });
      return;
    }

    // Don't open the progress dialog, go directly to call status modal
    setIsCalling(true);
    setCallProgress(0);
    setCallResults([]);

    try {
      // 電話番号と顧客IDのマッピングを作成（通話状態はポーリングで管理）
      const phoneMap = new Map<string, string>();
      phoneNumbers.forEach((phone, index) => {
        if (customerIds[index]) {
          phoneMap.set(normalizePhoneNumber(phone), customerIds[index]);
        }
      });
      setPhoneToCustomerMap(phoneMap);

      // 通話中状態はクリアして、実際の通話開始時にポーリングで検出される
      setCallingSessions(new Set());

      const result = await authenticatedApiRequest('/api/calls/bulk', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumbers,
          customerIds
        })
      });

      // Immediately open the call status modal AFTER API request succeeds
      if (phoneNumbers.length > 0) {
        const firstNumber = normalizePhoneNumber(phoneNumbers[0]);
        console.log("[Dashboard] 一斉コール開始, 電話番号:", firstNumber);
        setActivePhoneNumber(firstNumber);
        setIsCallStatusModalOpen(true);
      }

      // Update progress and results - 修正: result.results を result.sessions に変更
      setCallProgress(100);
      setCallResults(result.sessions || []);
      setIsCalling(false);

      toast({
        title: "一斉コール開始",
        description: `${phoneNumbers.length}件の電話を開始しました`,
      });

      // Clear selection after starting calls
      setSelectedCustomers(new Set());
      setSelectAll(false);

      // ポーリングで通話状態を監視するため、ここではクリアしない
      // 実際の通話終了イベントでクリアされる

    } catch (error) {
      setIsCalling(false);
      setCallingSessions(new Set()); // エラー時も通話中状態をクリア
      toast({
        title: "エラー",
        description: "一斉コールの開始に失敗しました",
        variant: "destructive",
      });
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedCustomers.size === 0) {
      toast({
        title: "エラー",
        description: "削除する顧客を選択してください",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm(`選択した${selectedCustomers.size}件の顧客を削除してもよろしいですか？\nこの操作は取り消せません。`);

    if (!confirmed) {
      return;
    }

    try {
      const customerIds = Array.from(selectedCustomers);

      const result = await authenticatedApiRequest('/api/customers/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ customerIds }),
      });

      toast({
        title: "削除完了",
        description: result.message || `${result.deletedCount}件の顧客を削除しました`,
      });

      // Clear selection
      setSelectedCustomers(new Set());
      setSelectAll(false);

      // Refresh customer list
      const data = await authenticatedApiRequest('/api/customers');
      const newCustomers = normalizeApiResponse(data);
      setCustomers(newCustomers);

    } catch (error) {
      toast({
        title: "エラー",
        description: "一括削除に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 通話状態監視 - 全通話終了時に一斉通話状態を自動リセット（遅延実行）
  useEffect(() => {
    if (isBulkCallActive && callingSessions.size === 0 && bulkCallQueue === 0 && !isQueueProcessing) {
      console.log("[Dashboard] All calls ended and queue empty, scheduling bulk call state reset");

      // 3秒後にリセット（通話終了処理の完了を待つ）
      const resetTimer = setTimeout(() => {
        // タイマー実行時にも再度確認してから実行
        if (callingSessions.size === 0 && bulkCallQueue === 0 && !isQueueProcessing) {
          console.log("[Dashboard] Auto-resetting bulk call state after delay");
          setIsBulkCallActive(false);
          setIsQueueProcessing(false);
          toast({
            title: "通話完了",
            description: "すべての通話が終了しました",
          });
        } else {
          console.log("[Dashboard] Reset cancelled - calls still active or processing");
        }
      }, 3000);

      return () => {
        clearTimeout(resetTimer);
      };
    }
  }, [callingSessions.size, isBulkCallActive, bulkCallQueue, isQueueProcessing, toast]);

  // WebSocket - リアルタイム通話状態更新
  useEffect(() => {
    let socket: Socket | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    // トークンリフレッシュ関数
    const refreshAccessToken = async (): Promise<string | null> => {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) return null;

        const response = await fetch('/api/auth/refresh-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        return data.accessToken;
      } catch (error) {
        console.error('Token refresh failed:', error);
        return null;
      }
    };

    const initializeSocket = async () => {
      const wsUrl = getWsUrl();

      let token = localStorage.getItem('accessToken');

      // トークンがない場合はリフレッシュを試みる
      if (!token) {
        console.log('[Dashboard WebSocket] No token, attempting refresh...');
        token = await refreshAccessToken();
      }

      console.log('[Dashboard WebSocket] Connecting to:', wsUrl);

      socket = io(wsUrl, {
        transports: ["websocket"],
        auth: { token },
        reconnection: false // 手動で再接続制御を行うため無効化
      });

      // 電話番号正規化関数（ローカル）
      const normalize = (phone?: string | null) => {
        if (!phone) return "";
        let normalized = phone.replace(/[\s-]/g, "");
        if (normalized.startsWith("+81")) {
          normalized = "0" + normalized.substring(3);
        }
        return normalized;
      };

      socket.on('connect', () => {
        console.log('[Dashboard WebSocket] Connected');
        setWsConnected(true);
        retryCount = 0; // 接続成功したらリセット

        // 再接続時に最新の通話状態を1度だけ取得（同期）
        authenticatedApiRequest('/api/calls/bulk')
          .then(data => {
            if (data.success && data.sessions) {
              const activeSessions = data.sessions.filter((s: any) => {
                // 1. 基本的なステータスチェック
                const isActiveStatus = ['calling', 'initiated', 'ai-responding', 'in-progress', 'transferring', 'human-connected'].includes(s.status);
                if (!isActiveStatus) return false;

                // 2. 人間対応フェーズは常に有効
                if (['transferring', 'human-connected'].includes(s.status)) {
                  return true;
                }

                // 3. AIフェーズのゾンビセッション対策 (6分ルール)
                // startTimeがない場合はcreatedAtをフォールバックとして使用
                const startTime = new Date(s.startTime || s.createdAt).getTime();
                const now = Date.now();
                const elapsedMinutes = (now - startTime) / (1000 * 60);

                if (elapsedMinutes > 6) {
                  console.warn(`[Dashboard] Zombie session filtered: ${s._id || s.callId}, status=${s.status}, elapsed=${elapsedMinutes.toFixed(1)}min`);
                  return false;
                }

                return true;
              });

              const activeIds = new Set<string>(
                activeSessions
                  .map((s: any) => {
                    const id = s.customer?._id || s.customer;
                    return typeof id === 'string' ? id : String(id);
                  })
                  .filter((id: string): id is string => Boolean(id))
              );

              setCallingSessions(activeIds);
              console.log('[Dashboard WebSocket] Synced active calls on reconnect:', activeIds.size);
            }
          })
          .catch(err => console.error('[Dashboard WebSocket] Sync failed:', err));
      });

      socket.on('connect_error', async (error) => {
        console.error('[Dashboard WebSocket] Connection error:', error);
        setWsConnected(false);

        // 認証エラーやトークンエラーの場合
        if (error.message.includes('Authentication error') ||
          error.message.includes('jwt expired') ||
          error.message.includes('No token provided')) {

          console.log('[Dashboard WebSocket] Auth error detected, refreshing token...');
          const newToken = await refreshAccessToken();

          if (newToken && socket) {
            console.log('[Dashboard WebSocket] Token refreshed, retrying connection...');
            socket.auth = { token: newToken };
            socket.connect();
            return;
          }
        }

        // その他のエラーまたはリフレッシュ失敗時はバックオフ再試行
        if (retryCount < MAX_RETRIES) {
          const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.log(`[Dashboard WebSocket] Retrying in ${timeout}ms... (${retryCount + 1}/${MAX_RETRIES})`);
          retryCount++;
          setTimeout(() => {
            if (socket) socket.connect();
          }, timeout);
        } else {
          console.error('[Dashboard WebSocket] Max retries reached');
        }
      });

      socket.on('callStatusUpdate', (data) => {
        console.log('[Dashboard WebSocket] Received callStatusUpdate:', data);

        const { customerId, phoneNumber, status, callResult, callId, twilioCallSid } = data;

        // 通話状態に応じてローカルステートを更新
        if (status === 'calling' || status === 'ai-responding') {
          // 通話中セッションに追加
          setCallingSessions(prev => {
            const newSet = new Set(prev);
            newSet.add(customerId);
            console.log('[Dashboard WebSocket] Added to calling sessions:', customerId);
            return newSet;
          });

          // 電話番号 → 顧客IDマップを更新
          if (phoneNumber) {
            setPhoneToCustomerMap(prev => {
              const newMap = new Map(prev);
              const normalized = normalize(phoneNumber);
              newMap.set(normalized, customerId);
              return newMap;
            });
          }

          // 新しい通話開始時はモーダルを自動表示
          if (status === 'calling' && phoneNumber) {
            setActivePhoneNumber(phoneNumber);
            setIsCallStatusModalOpen(true);
            console.log('[Dashboard WebSocket] Auto-opened call status modal for:', phoneNumber);
          }

        } else if (status === 'completed' || status === 'failed') {
          // 通話完了または失敗: セッションから削除
          setCallingSessions(prev => {
            const newSet = new Set(prev);
            newSet.delete(customerId);
            console.log('[Dashboard WebSocket] Removed from calling sessions:', customerId);
            return newSet;
          });

          // 顧客リストに通話結果を反映（定義済みステータスのみ）
          if (callResult) {
            // ステータスバリデーション
            const normalizedResult = normalizeStatus(callResult);

            // 定義済みステータスの場合のみ更新
            if (VALID_CALL_RESULTS.includes(normalizedResult)) {
              console.log('[Dashboard WebSocket] Updating customer result:', customerId, normalizedResult);
              setCustomers(prev =>
                prev.map(c => {
                  const cId = getCustomerId(c);
                  if (cId === customerId) {
                    return { ...c, result: normalizedResult, callResult: normalizedResult };
                  }
                  return c;
                })
              );
            } else {
              console.warn('[Dashboard WebSocket] Invalid callResult ignored:', callResult, '→', normalizedResult);
            }
          }

          // 電話番号マップから削除
          if (phoneNumber) {
            setPhoneToCustomerMap(prev => {
              const newMap = new Map(prev);
              const normalized = normalize(phoneNumber);
              newMap.delete(normalized);
              return newMap;
            });
          }
        }
      });

      // 通話開始イベント（カウント補正用）
      socket.on('call-initiated', (data) => {
        console.log('[Dashboard WebSocket] Received call-initiated:', data);
        setIsCallStarting(false);
        // 通話開始処理中として即座にセッションに追加（カウント統一のため）
        if (data.customerId) {
          setCallingSessions(prev => {
            const newSet = new Set(prev);
            newSet.add(data.customerId);
            console.log('[Dashboard WebSocket] Added to calling sessions (initiated):', data.customerId);
            return newSet;
          });
        }
      });

      // 一斉コール開始イベント
      socket.on('bulk-calls-queued', (data) => {
        console.log('[Dashboard WebSocket] Received bulk-calls-queued:', data);
        setIsBulkCallActive(true);
        if (data.totalCalls) {
          setBulkCallQueue(data.totalCalls);
        }
      });

      // 一斉コール停止イベント
      socket.on('bulk-calls-stopped', (data) => {
        console.log('[Dashboard WebSocket] Received bulk-calls-stopped:', data);
        setIsBulkCallActive(false);
        setBulkCallQueue(0);
        setIsQueueProcessing(false);
        setIsCallStarting(false);
        toast({
          title: "一斉コール停止完了",
          description: `${data.totalStopped || 0}件の通話を停止しました`,
        });
      });

      // キュー更新イベント
      socket.on('bulk-queue-update', (data) => {
        console.log('[Dashboard WebSocket] Received bulk-queue-update:', data);
        if (typeof data.remaining === 'number') {
          setBulkCallQueue(data.remaining);
        }
        if (typeof data.processing === 'boolean') {
          setIsQueueProcessing(data.processing);
          // 処理中なら通話開始待ち状態にする、処理完了なら解除
          if (data.processing) {
            setIsCallStarting(true);
          } else {
            setIsCallStarting(false);
          }
        }

        // 処理完了時にフラグを落とす（念のため）
        if (data.remaining === 0 && !data.processing && callingSessions.size === 0) {
          // 少し遅延させてからチェックして閉じる（通話終了イベントとの競合を防ぐ）
          setTimeout(() => {
            if (callingSessions.size === 0) {
              setIsBulkCallActive(false);
            }
          }, 1000);
        }
      });

      socket.on('disconnect', () => {
        console.log('[Dashboard WebSocket] Disconnected');
        setWsConnected(false);
      });

      socket.on('error', (error) => {
        console.error('[Dashboard WebSocket] Error:', error);
      });
    };

    initializeSocket();

    return () => {
      if (socket) {
        console.log('[Dashboard WebSocket] Cleaning up connection');
        socket.disconnect();
      }
    };
  }, []); // 依存配列を空にしてマウント時のみ実行

  // Filter customers based on search and filters
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      (customer.customer &&
        customer.customer.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (customer.address &&
        customer.address.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPrefecture =
      !selectedPrefecture || selectedPrefecture === 'all' ||
      (customer.address && customer.address.includes(selectedPrefecture));
    const matchesStatus =
      !selectedStatus || selectedStatus === 'all' ||
      customer.callResult === selectedStatus ||
      customer.result === selectedStatus;

    return matchesSearch && matchesPrefecture && matchesStatus;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPrefecture, selectedStatus]);

  // Update selectAll state based on current page selection
  useEffect(() => {
    if (paginatedCustomers.length === 0) {
      setSelectAll(false);
      return;
    }
    const currentPageIds = getCustomerIds(paginatedCustomers);
    const allSelected = currentPageIds.every(id => selectedCustomers.has(id));
    setSelectAll(allSelected);
  }, [selectedCustomers, currentPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <main className="ml-64 p-6 flex items-center justify-center">
          <div>Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <main
        className="ml-64 p-6 relative"
        onDragEnter={handleDragEnter}
      >
        {/* Drag & Drop Overlay */}
        {isDragging && (
          <div
            className="fixed inset-0 z-50"
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.currentTarget === e.target) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
          >
            <div className="absolute inset-0 bg-black/50 pointer-events-none" />
            <div className="flex items-center justify-center h-full pointer-events-none">
              <div className="bg-white rounded-lg p-8 shadow-xl">
                <FileUp className="h-16 w-16 mx-auto mb-4 text-orange-500 animate-bounce" />
                <p className="text-xl font-semibold">CSVファイルをここにドロップ</p>
                <p className="text-sm text-gray-500 mt-2">ファイルを離してアップロード</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">顧客リスト</h1>
            {!wsConnected && (
              <span className="text-xs text-gray-500 bg-yellow-100 px-2 py-1 rounded">
                再接続中...
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {selectedCustomers.size > 0 && (
              <>
                <Button
                  onClick={handleBulkCall}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  一斉コール ({selectedCustomers.size}件)
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  一括削除 ({selectedCustomers.size}件)
                </Button>
              </>
            )}

            {/* 停止ボタン - 一斉通話実行中かつ通話が残っている場合のみ表示 */}
            {isBulkCallActive && (callingSessions.size > 0 || bulkCallQueue > 0 || isQueueProcessing) && (
              <Button
                onClick={async () => {
                  console.log('[Dashboard] 停止ボタンがクリックされました');
                  try {
                    console.log('[Dashboard] Calling /api/calls/bulk/stop...');
                    await authenticatedApiRequest('/api/calls/bulk/stop', {
                      method: 'POST'
                    });
                    console.log('[Dashboard] Stop API call successful');

                    // 停止処理成功時、即座にフラグをfalseに設定
                    setIsBulkCallActive(false);
                    setBulkCallQueue(0);
                    setIsQueueProcessing(false);

                    toast({
                      title: "停止処理中",
                      description: "一斉通話を停止しています...",
                    });
                  } catch (error) {
                    console.error('[Dashboard] Stop API call failed:', error);
                    toast({
                      title: "エラー",
                      description: "停止処理に失敗しました",
                      variant: "destructive",
                    });
                  }
                }}
                className="bg-red-500 hover:bg-red-600 text-white animate-pulse"
              >
                <X className="mr-2 h-4 w-4" />
                停止 {(callingSessions.size + bulkCallQueue > 0) && `(残り${callingSessions.size + bulkCallQueue}件)`}
              </Button>
            )}

            <Link href="/import">
              <Button
                variant="outline"
                className="border-orange-500 text-orange-500 bg-transparent hover:bg-orange-50"
              >
                <Upload className="mr-2 h-4 w-4" />
                インポート
              </Button>
            </Link>

            <Link href="/customer/new">
              <Button className="bg-orange-500 hover:bg-orange-600">
                新規登録
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="顧客検索"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select
              value={selectedPrefecture}
              onValueChange={setSelectedPrefecture}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="都道府県" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="北海道">北海道</SelectItem>
                <SelectItem value="青森県">青森県</SelectItem>
                <SelectItem value="岩手県">岩手県</SelectItem>
                <SelectItem value="宮城県">宮城県</SelectItem>
                <SelectItem value="秋田県">秋田県</SelectItem>
                <SelectItem value="山形県">山形県</SelectItem>
                <SelectItem value="福島県">福島県</SelectItem>
                <SelectItem value="茨城県">茨城県</SelectItem>
                <SelectItem value="栃木県">栃木県</SelectItem>
                <SelectItem value="群馬県">群馬県</SelectItem>
                <SelectItem value="埼玉県">埼玉県</SelectItem>
                <SelectItem value="千葉県">千葉県</SelectItem>
                <SelectItem value="東京都">東京都</SelectItem>
                <SelectItem value="神奈川県">神奈川県</SelectItem>
                <SelectItem value="新潟県">新潟県</SelectItem>
                <SelectItem value="富山県">富山県</SelectItem>
                <SelectItem value="石川県">石川県</SelectItem>
                <SelectItem value="福井県">福井県</SelectItem>
                <SelectItem value="山梨県">山梨県</SelectItem>
                <SelectItem value="長野県">長野県</SelectItem>
                <SelectItem value="岐阜県">岐阜県</SelectItem>
                <SelectItem value="静岡県">静岡県</SelectItem>
                <SelectItem value="愛知県">愛知県</SelectItem>
                <SelectItem value="三重県">三重県</SelectItem>
                <SelectItem value="滋賀県">滋賀県</SelectItem>
                <SelectItem value="京都府">京都府</SelectItem>
                <SelectItem value="大阪府">大阪府</SelectItem>
                <SelectItem value="兵庫県">兵庫県</SelectItem>
                <SelectItem value="奈良県">奈良県</SelectItem>
                <SelectItem value="和歌山県">和歌山県</SelectItem>
                <SelectItem value="鳥取県">鳥取県</SelectItem>
                <SelectItem value="島根県">島根県</SelectItem>
                <SelectItem value="岡山県">岡山県</SelectItem>
                <SelectItem value="広島県">広島県</SelectItem>
                <SelectItem value="山口県">山口県</SelectItem>
                <SelectItem value="徳島県">徳島県</SelectItem>
                <SelectItem value="香川県">香川県</SelectItem>
                <SelectItem value="愛媛県">愛媛県</SelectItem>
                <SelectItem value="高知県">高知県</SelectItem>
                <SelectItem value="福岡県">福岡県</SelectItem>
                <SelectItem value="佐賀県">佐賀県</SelectItem>
                <SelectItem value="長崎県">長崎県</SelectItem>
                <SelectItem value="熊本県">熊本県</SelectItem>
                <SelectItem value="大分県">大分県</SelectItem>
                <SelectItem value="宮崎県">宮崎県</SelectItem>
                <SelectItem value="鹿児島県">鹿児島県</SelectItem>
                <SelectItem value="沖縄県">沖縄県</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="不在">不在</SelectItem>
                <SelectItem value="成功">成功</SelectItem>
                <SelectItem value="要フォロー">要フォロー</SelectItem>
                <SelectItem value="拒否">拒否</SelectItem>
                <SelectItem value="失敗">失敗</SelectItem>
                <SelectItem value="未対応">未対応</SelectItem>
              </SelectContent>
            </Select>

          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left">
                    <Checkbox
                      checked={selectAll}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left">番号</th>
                  <th className="p-3 text-left">顧客名</th>
                  <th className="p-3 text-left">住所</th>
                  <th className="p-3 text-left">URL</th>
                  <th className="p-3 text-left">電話番号</th>
                  <th className="p-3 text-left">インポート</th>
                  <th className="p-3 text-left">最終コール日</th>
                  <th className="p-3 text-left">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer, index) => {
                  const customerId = getCustomerId(customer);
                  const isCallingNow = callingSessions.has(customerId);
                  const actualIndex = startIndex + index;
                  return (
                    <tr
                      key={customerId}
                      className={`border-b transition-all ${isCallingNow
                        ? 'bg-green-50 border-green-200 hover:bg-green-100'
                        : 'hover:bg-gray-50'
                        }`}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selectedCustomers.has(customerId)}
                          onCheckedChange={() => handleSelectCustomer(customerId)}
                        />
                      </td>
                      <td className="p-3">{actualIndex + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/customer/${customerId}`)}
                            className="text-blue-600 hover:underline text-left"
                          >
                            {customer.customer || `顧客名${index + 1}`}
                          </button>
                          {isCallingNow && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                              通話中
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">{customer.address || `住所${actualIndex + 1}`}</td>
                      <td className="p-3">
                        {customer.url ? (
                          <a href={customer.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            URL
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-3">{customer.phone || `電話番号${actualIndex + 1}`}</td>
                      <td className="p-3">
                        {customer.importedAt
                          ? new Date(customer.importedAt).toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })
                          : '-'}
                      </td>
                      <td className="p-3">{customer.date || '-'}</td>
                      <td className="p-3">
                        {isCallingNow ? (
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Phone className="w-4 h-4 text-green-600 animate-pulse" />
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                            </div>
                            <Badge
                              className="bg-green-500 text-white cursor-pointer hover:bg-green-600 transition-colors"
                              onClick={() => {
                                console.log("[Dashboard] 通話中バッジクリック, 電話番号:", customer.phone);
                                setActivePhoneNumber(customer.phone || "");
                                setIsCallStatusModalOpen(true);
                              }}
                            >
                              通話中
                            </Badge>
                          </div>
                        ) : (
                          <Select
                            value={normalizeStatus(customer.result || customer.callResult)}
                            onValueChange={(value) => handleStatusChange(customerId, value)}
                          >
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue>
                                {(() => {
                                  const normalizedStatus = normalizeStatus(customer.result || customer.callResult);
                                  return (
                                    <Badge
                                      className={`${statusColors[normalizedStatus]} text-white`}
                                    >
                                      {normalizedStatus}
                                    </Badge>
                                  );
                                })()}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="不在">
                                <Badge className="bg-yellow-500 text-white">不在</Badge>
                              </SelectItem>
                              <SelectItem value="成功">
                                <Badge className="bg-green-500 text-white">成功</Badge>
                              </SelectItem>
                              <SelectItem value="要フォロー">
                                <Badge className="bg-purple-500 text-white">要フォロー</Badge>
                              </SelectItem>
                              <SelectItem value="拒否">
                                <Badge className="bg-red-500 text-white">拒否</Badge>
                              </SelectItem>
                              <SelectItem value="失敗">
                                <Badge className="bg-gray-500 text-white">失敗</Badge>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 flex justify-between items-center border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              前へ
            </Button>
            <span className="text-sm text-gray-600">
              {filteredCustomers.length > 0
                ? `${startIndex + 1}-${Math.min(endIndex, filteredCustomers.length)}件 (全${filteredCustomers.length}件) - ページ ${currentPage}/${totalPages}`
                : "0件"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              次へ
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </main>

      {/* Call Modal */}
      <CallModal
        isOpen={activeCallModal.isOpen}
        onClose={() => setActiveCallModal({ ...activeCallModal, isOpen: false })}
        customerName={activeCallModal.customerName}
        phoneNumber={activeCallModal.phoneNumber}
        customerId={activeCallModal.customerId}
      />

      {/* Call Status Modal */}
      <CallStatusModal
        isOpen={isCallStatusModalOpen}
        onClose={() => {
          setIsCallStatusModalOpen(false);
          setActivePhoneNumber("");
        }}
        phoneNumber={activePhoneNumber}
        companyName={(() => {
          if (!activePhoneNumber) return undefined;
          const normalizedActive = normalizePhoneNumber(activePhoneNumber);
          const customerId = phoneToCustomerMap.get(normalizedActive);
          if (!customerId) return undefined;

          const customer = customers.find(c => getCustomerId(c) === customerId);
          return customer?.company;
        })()}
      />
    </div>
  );
}
