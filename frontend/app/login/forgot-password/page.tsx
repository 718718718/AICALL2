"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code" | "reset">("email");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  // Step 1: Send reset email
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      const apiUrl = process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_BACKEND_URL_PROD!
        : (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5002");
      const response = await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "メール送信に失敗しました");
      }

      setSuccess("認証コードをメールアドレスに送信しました。メールをご確認ください。");
      setStep("code");
    } catch (err: any) {
      setError(err.message || "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify reset code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      const apiUrl = process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_BACKEND_URL_PROD!
        : (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5002");
      const response = await fetch(`${apiUrl}/api/auth/verify-reset-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, resetCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "認証コードの確認に失敗しました");
      }

      setTempToken(data.tempToken);
      setSuccess("認証コードが確認されました");
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // パスワードの検証
    if (newPassword.length < 6) {
      setError("パスワードは6文字以上である必要があります");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_BACKEND_URL_PROD!
        : (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5002");
      const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tempToken, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "パスワードリセットに失敗しました");
      }

      setSuccess("パスワードが正常にリセットされました");

      // 3秒後にログインページへリダイレクト
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-medium">
            {step === "email" && "パスワードをお忘れですか？"}
            {step === "code" && "認証コードを入力"}
            {step === "reset" && "新しいパスワードを設定"}
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            {step === "email" && "メールアドレスを入力してください。パスワードリセット用の認証コードをお送りします。"}
            {step === "code" && "メールに送信された6桁の認証コードを入力してください。"}
            {step === "reset" && "新しいパスワードを設定してください。"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {success}
              </AlertDescription>
            </Alert>
          )}

          {/* Step 1: Email Form */}
          {step === "email" && (
            <form onSubmit={handleSendResetEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    送信中...
                  </>
                ) : (
                  "認証コードを送信"
                )}
              </Button>
            </form>
          )}

          {/* Step 2: Code Verification Form */}
          {step === "code" && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">認証コード</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  required
                  disabled={isLoading}
                  maxLength={6}
                />
                <p className="text-xs text-gray-500">
                  {email} に送信された6桁のコードを入力してください
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    確認中...
                  </>
                ) : (
                  "認証コードを確認"
                )}
              </Button>
            </form>
          )}

          {/* Step 3: Password Reset Form */}
          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">新しいパスワード</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="6文字以上"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">パスワードの確認</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="パスワードを再入力"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={6}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    リセット中...
                  </>
                ) : (
                  "パスワードをリセット"
                )}
              </Button>
            </form>
          )}

          <div className="text-center">
            <button
              onClick={() => router.push("/login")}
              className="text-sm text-blue-600 hover:underline"
              disabled={isLoading}
            >
              ログイン画面に戻る
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}