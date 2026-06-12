"use client";

import type React from "react";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/apiHelper";

export default function LoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      // Store the token (you might want to use secure cookies instead)
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken)
      }
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken)
      }
      localStorage.setItem('userData', JSON.stringify(data))

      // Redirect to dashboard based on role
      // Check different possible response structures
      const role = data.user?.role || data.data?.role || data.role
      
      if (role === 'admin') {
        router.push('/admin/companies')
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('[Login] Full error details:', err);
      if (err instanceof Error) {
        console.error('[Login] Error name:', err.name);
        console.error('[Login] Error message:', err.message);
        console.error('[Login] Error stack:', err.stack);
        setError(`Login failed: ${err.message}`)
      } else {
        console.error('[Login] Unknown error type:', typeof err, err);
        setError("An unknown error occurred")
      }
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-medium">ログインする</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
                <div className="p-2 bg-red-100 text-red-700 rounded-md">
                  {error}
                </div>
              )}
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="example@email.com"
                value={formData.email}
                onChange={(e) => handleChange(e)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => handleChange(e)}
                required
              />
            </div>
              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={loading}
              >
                {loading ? "処理中..." : "ログイン"}
              </Button>
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => router.push("/login/forgot-password")}
                  className="text-sm text-blue-600 hover:underline"
                >
                  パスワードをお忘れですか？
                </button>
              </div>
          </form>
          <div className="text-center text-sm text-gray-600">
            <button
              onClick={() => router.push("/signup")}
              className="text-blue-600 hover:underline"
            >
              新規アカウントを作成する
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
