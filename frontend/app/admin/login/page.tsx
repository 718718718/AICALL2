"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
      console.log('=== Admin Login Attempt ===');
      console.log('Email:', formData.email);
      console.log('Password length:', formData.password.length);
      console.log('Attempting login to /api/auth/admin-login');

      // Use Next.js API route for consistent behavior
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      const data = await response.json()
      console.log('Response data:', data);

      if (!response.ok) {
        console.error('Login failed with error:', data.error);
        throw new Error(data.error || 'Login failed')
      }

      console.log('Login successful!');
      console.log('Access token received:', !!data.accessToken);
      console.log('User role:', data.role);

      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken)
        console.log('Access token saved to localStorage');
      }
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken)
        console.log('Refresh token saved to localStorage');
      }
      localStorage.setItem('userData', JSON.stringify(data))
      console.log('User data saved to localStorage');

      console.log('Redirecting to /admin/companies');
      router.push('/admin/companies')
    } catch (err) {
      console.error('=== Login Error ===');
      console.error('Error:', err);
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("An unknown error occurred")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-medium">管理者ログイン</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-2 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}
            
            {/* デバッグ情報 - 正しいログイン情報を表示 */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-semibold text-blue-900 mb-1">正しいログイン情報:</p>
              <div className="text-xs space-y-1 font-mono">
                <p>Email: <span className="bg-white px-1 rounded">admin@example.com</span></p>
                <p>Password: <span className="bg-white px-1 rounded">admin123</span></p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="admin@gmail.com"
                value={formData.email}
                onChange={(e) => handleChange(e)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleChange(e)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
              {showPassword && formData.password && (
                <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
                  入力中のパスワード: <span className="font-mono">{formData.password}</span>
                </div>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full bg-[#00C9D8] hover:bg-[#00B0C0] text-white"
              disabled={loading}
            >
              {loading ? "処理中..." : "管理者としてログイン"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}