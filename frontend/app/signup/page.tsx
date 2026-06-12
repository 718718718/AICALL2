"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { env } from "process";

type FormData = {
  companyId: string;
  companyName: string;
  password: string;
  confirmPassword: string;
  businessName: string;
  businessPhone: string;
  email: string;
  postalCode: string;
  address: string;
  businessType: string;
  employees: string;
  annualRevenue: string;
  firstName: string;
  lastName: string;
  verificationEmail: string;
  verificationCode: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

type VerificationStep = 'email' | 'code' | 'completed';

type EmailVerificationState = {
  step: VerificationStep;
  token: string;
  countdown: number;
  resendCooldown: number;
  isLoading: boolean;
  error: string | null;
};

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    companyId: "",
    companyName: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    businessPhone: "",
    email: "",
    postalCode: "",
    address: "",
    businessType: "",
    employees: "",
    annualRevenue: "",
    firstName: "",
    lastName: "",
    verificationEmail: "",
    verificationCode: "",
  });
  const [companyValidated, setCompanyValidated] = useState(false);
  const [hasExistingAdmin, setHasExistingAdmin] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // メール認証関連の状態
  const [emailVerification, setEmailVerification] = useState<EmailVerificationState>({
    step: 'email',
    token: '',
    countdown: 600, // 10分
    resendCooldown: 0,
    isLoading: false,
    error: null
  });
  
  const router = useRouter();

  // カウントダウンタイマーの実装
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (emailVerification.countdown > 0) {
      interval = setInterval(() => {
        setEmailVerification(prev => {
          const newCountdown = prev.countdown - 1;
          if (newCountdown <= 0) {
            return { ...prev, countdown: 0 };
          }
          return { ...prev, countdown: newCountdown };
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [emailVerification.countdown]);

  // 再送信クールダウンの実装
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (emailVerification.resendCooldown > 0) {
      interval = setInterval(() => {
        setEmailVerification(prev => {
          const newCooldown = prev.resendCooldown - 1;
          if (newCooldown <= 0) {
            return { ...prev, resendCooldown: 0 };
          }
          return { ...prev, resendCooldown: newCooldown };
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [emailVerification.resendCooldown]);

  // メール認証コード送信関数
  const sendVerificationCode = async () => {
    if (!validateStep(3)) return;

    setEmailVerification(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const requestData = {
        email: formData.verificationEmail,
        companyId: formData.companyId,
        companyName: formData.companyName,
        businessName: formData.businessName,
        businessPhone: formData.businessPhone,
        address: formData.address,
        businessType: formData.businessType,
        employees: formData.employees,
        description: formData.annualRevenue || ''
      };
      
      console.log('Sending verification code request...');
      console.log('Data to send:', requestData);
      
      // Vercel API Routeを使用
      const response = await fetch(`/api/auth/send-verification-code`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();
      console.log('API Response:', { status: response.status, data });

      if (!response.ok) {
        const errorMessage = data.error || data.message || '認証コードの送信に失敗しました';
        console.error('API Error:', errorMessage);
        throw new Error(errorMessage);
      }

      setEmailVerification(prev => ({
        ...prev,
        step: 'code',
        token: data.token,
        countdown: 600, // 10分
        resendCooldown: 60 // 1分
      }));

      // ステップ4に進む
      setStep(4);
    } catch (error) {
      setEmailVerification(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : '認証コード送信中にエラーが発生しました'
      }));
      setSubmitError(error instanceof Error ? error.message : '認証コード送信中にエラーが発生しました');
    } finally {
      setEmailVerification(prev => ({ ...prev, isLoading: false }));
    }
  };

  // 認証コード検証関数
  const verifyEmailCode = async () => {
    if (!validateStep(4)) return;

    setEmailVerification(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Vercel API Routeを使用
      const response = await fetch(`/api/auth/verify-email-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.verificationEmail,
          verificationCode: formData.verificationCode,
          token: emailVerification.token,
          companyId: formData.companyId,
          companyName: formData.companyName,
          businessName: formData.businessName,
          businessPhone: formData.businessPhone,
          address: formData.address,
          businessType: formData.businessType,
          employees: formData.employees,
          description: formData.annualRevenue || ''
        })
      });

      const data = await response.json();
      console.log('Verify API Response:', { status: response.status, data });

      if (!response.ok) {
        const errorMessage = data.error || data.message || '認証コードの検証に失敗しました';
        console.error('Verify API Error:', errorMessage);
        throw new Error(errorMessage);
      }

      setEmailVerification(prev => ({
        ...prev,
        step: 'completed',
        token: data.data.tempToken
      }));

      // メールアドレスをformDataのemailにコピー
      setFormData(prev => ({ ...prev, email: formData.verificationEmail }));

      // ステップ5に進む
      setStep(5);
    } catch (error) {
      setEmailVerification(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : '認証コード検証中にエラーが発生しました'
      }));
      setSubmitError(error instanceof Error ? error.message : '認証コード検証中にエラーが発生しました');
    } finally {
      setEmailVerification(prev => ({ ...prev, isLoading: false }));
    }
  };

  // 認証コード再送信関数
  const resendVerificationCode = async () => {
    if (emailVerification.resendCooldown > 0) return;

    setEmailVerification(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const requestData = {
        email: formData.verificationEmail,
        companyId: formData.companyId,
        companyName: formData.companyName,
        businessName: formData.businessName,
        businessPhone: formData.businessPhone,
        address: formData.address,
        businessType: formData.businessType,
        employees: formData.employees,
        description: formData.annualRevenue || ''
      };
      
      console.log('Resending verification code request...');
      console.log('Data to send:', requestData);
      
      const apiUrl2 = process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_BACKEND_URL_PROD!
        : (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5002');
      
      const response = await fetch(`${apiUrl2}/api/auth/send-verification-code`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();
      console.log('Resend API Response:', { status: response.status, data });

      if (!response.ok) {
        const errorMessage = data.error || data.message || '認証コードの再送信に失敗しました';
        console.error('Resend API Error:', errorMessage);
        throw new Error(errorMessage);
      }

      setEmailVerification(prev => ({
        ...prev,
        token: data.token,
        countdown: 600, // 10分
        resendCooldown: 60 // 1分
      }));
    } catch (error) {
      setEmailVerification(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : '認証コード再送信中にエラーが発生しました'
      }));
      setSubmitError(error instanceof Error ? error.message : '認証コード再送信中にエラーが発生しました');
    } finally {
      setEmailVerification(prev => ({ ...prev, isLoading: false }));
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: FormErrors = {};

    if (step === 1) {
      if (!formData.companyId.trim()) {
        newErrors.companyId = "企業IDは必須です";
      }
      if (!companyValidated) {
        newErrors.companyId = "企業IDを確認してください";
      }
    }

    if (step === 2) {
      if (!formData.businessName.trim()) {
        newErrors.businessName = "事業者名は必須です";
      }

      if (!formData.businessPhone.trim()) {
        newErrors.businessPhone = "事業者電話番号は必須です";
      } else if (!/^[0-9-]+$/.test(formData.businessPhone)) {
        newErrors.businessPhone = "有効な電話番号を入力してください";
      }

      if (!formData.email.trim()) {
        newErrors.email = "メールアドレスは必須です";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = "有効なメールアドレスを入力してください";
      }

      if (!formData.address.trim()) {
        newErrors.address = "住所は必須です";
      }

      if (!formData.businessType.trim()) {
        newErrors.businessType = "業種は必須です";
      }

      if (!formData.employees.trim()) {
        newErrors.employees = "社員数は必須です";
      }
    }

    if (step === 3) {
      if (!formData.verificationEmail.trim()) {
        newErrors.verificationEmail = "メールアドレスは必須です";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.verificationEmail)) {
        newErrors.verificationEmail = "有効なメールアドレスを入力してください";
      }
    }

    if (step === 4) {
      if (!formData.verificationCode.trim()) {
        newErrors.verificationCode = "認証コードは必須です";
      } else if (!/^[A-Za-z0-9]{6}$/.test(formData.verificationCode)) {
        newErrors.verificationCode = "認証コードは6桁の英数字で入力してください";
      }
    }

    if (step === 5) {
      if (!formData.lastName.trim()) {
        newErrors.lastName = "姓は必須です";
      }
      if (!formData.firstName.trim()) {
        newErrors.firstName = "名は必須です";
      }
      if (!formData.password) {
        newErrors.password = "パスワードは必須です";
      } else if (formData.password.length < 8) {
        newErrors.password = "パスワードは8文字以上必要です";
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "パスワードが一致しません";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;

    if (step < 5) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    setSubmitError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // メール認証が完了しているか確認
      if (emailVerification.step !== 'completed' || !emailVerification.token) {
        setSubmitError('メール認証が完了していません');
        return;
      }

      const response = await fetch(
        `${process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_BACKEND_URL_PROD! : (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')}/api/auth/complete-registration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            password: formData.password.trim(),
            tempToken: emailVerification.token
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Registration failed:', data);
        let errorMessage = data.error || "登録に失敗しました";
        throw new Error(errorMessage);
      }

      console.log('Registration completed successfully!');
      
      // トークンとユーザーデータをlocalStorageに保存
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      
      // roleを"user"に設定して保存（サイドバー表示のため）
      const userData = {
        ...data.data,
        role: 'user'
      };
      localStorage.setItem('userData', JSON.stringify(userData));
      
      // 登録完了ページへリダイレクト
      router.push("/signup/registration-complete");
    } catch (error) {
      console.error("Registration error:", error);
      setSubmitError(
        error instanceof Error ? error.message : "登録中にエラーが発生しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };;

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is updated
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // Reset company validation when company ID changes
    if (field === 'companyId') {
      setCompanyValidated(false);
      setFormData(prev => ({ 
        ...prev, 
        companyName: '',
        businessName: '',
        businessPhone: '',
        email: '',
        postalCode: '',
        address: ''
      }));
    }
  };

  const validateCompanyId = async () => {
    if (!formData.companyId.trim()) {
      setErrors(prev => ({ ...prev, companyId: '企業IDを入力してください' }));
      return;
    }
    
    try {
      const apiUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:5000'
        : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!;
      const response = await fetch(`${apiUrl}/api/companies/validate/${formData.companyId}`);
      const data = await response.json();
      
      if (data.success) {
        setCompanyValidated(true);
        setFormData(prev => ({
          ...prev,
          companyName: data.data.name,
          businessName: data.data.name, // 事業者名にも同じ名前を設定
          businessPhone: data.data.phone || '', // 空文字でなく確実に設定
          email: data.data.email || '', // 空文字でなく確実に設定
          postalCode: data.data.postalCode || '', // 空文字でなく確実に設定
          address: data.data.address || '', // 空文字でなく確実に設定
          // DBから取得した値を自動入力
          businessType: data.data.businessType || '',
          employees: data.data.employees || '',
          annualRevenue: data.data.annualRevenue || ''
        }));
        setErrors(prev => ({ ...prev, companyId: undefined }));
        
        // 管理者が既に存在するかチェック
        setHasExistingAdmin(data.data.hasAdmin || false);
        
        // 企業ID確認後、自動的に次のステップに進む
        setTimeout(() => {
          setStep(2);
        }, 500);
      } else {
        setCompanyValidated(false);
        setErrors(prev => ({ ...prev, companyId: '無効な企業IDです' }));
      }
    } catch (error) {
      setCompanyValidated(false);
      setErrors(prev => ({ ...prev, companyId: '企業IDの確認に失敗しました' }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">

        {submitError && (
          <Alert variant="destructive" className="mb-4">
            <ExclamationTriangleIcon className="h-4 w-4" />
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 1 && "企業情報を探す"}
              {step === 2 && "企業情報を入力"}
              {step === 3 && "新規アカウント作成"}
              {step === 4 && "認証コードの入力"}
              {step === 5 && "アカウント情報入力"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <div className="text-center">
                  <p className="text-gray-600 mb-6">企業IDを入力してください。</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyId">企業ID</Label>
                    <Input
                      id="companyId"
                      value={formData.companyId}
                      onChange={(e) =>
                        updateFormData("companyId", e.target.value)
                      }
                      placeholder="XXXXXX"
                      className={`text-center ${errors.companyId ? "border-red-500" : ""}`}
                    />
                    {errors.companyId && (
                      <p className="text-sm text-red-500 text-center">{errors.companyId}</p>
                    )}
                    {companyValidated && (
                      <p className="text-sm text-green-600 text-center">✓ 企業確認済み: {formData.companyName}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={validateCompanyId}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    検索する
                  </Button>
                </div>
                {companyValidated && (
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-sm text-gray-600">所属企業</p>
                    <p className="font-medium">{formData.companyName}</p>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyId">企業ID</Label>
                  <Input
                    id="companyId"
                    value={formData.companyId}
                    disabled
                    className="bg-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessName">事業者名 *</Label>
                  <Input
                    id="businessName"
                    value={formData.businessName}
                    onChange={(e) => updateFormData("businessName", e.target.value)}
                    placeholder="株式会社○○"
                    className={errors.businessName ? "border-red-500" : ""}
                  />
                  {errors.businessName && (
                    <p className="text-sm text-red-500">{errors.businessName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessPhone">事業者電話番号 *</Label>
                  <Input
                    id="businessPhone"
                    value={formData.businessPhone}
                    onChange={(e) => updateFormData("businessPhone", e.target.value)}
                    placeholder="03-1234-5678"
                    className={errors.businessPhone ? "border-red-500" : ""}
                  />
                  {errors.businessPhone && (
                    <p className="text-sm text-red-500">{errors.businessPhone}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">企業メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateFormData("email", e.target.value)}
                    placeholder="admin@company.com"
                    className={errors.email ? "border-red-500" : ""}
                  />
                  {errors.email && (
                    <p className="text-sm text-red-500">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">郵便番号</Label>
                  <Input
                    id="postalCode"
                    value={formData.postalCode}
                    onChange={(e) => updateFormData("postalCode", e.target.value)}
                    placeholder="100-0001"
                    className={errors.postalCode ? "border-red-500" : ""}
                  />
                  {errors.postalCode && (
                    <p className="text-sm text-red-500">{errors.postalCode}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">住所 *</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => updateFormData("address", e.target.value)}
                    placeholder="東京都渋谷区..."
                    className={errors.address ? "border-red-500" : ""}
                  />
                  {errors.address && (
                    <p className="text-sm text-red-500">{errors.address}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">業種 *</Label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(value) =>
                      updateFormData("businessType", value)
                    }
                  >
                    <SelectTrigger
                      className={errors.businessType ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="業種を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="it">IT・通信</SelectItem>
                      <SelectItem value="manufacturing">製造業</SelectItem>
                      <SelectItem value="retail">小売業</SelectItem>
                      <SelectItem value="service">サービス業</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.businessType && (
                    <p className="text-sm text-red-500">
                      {errors.businessType}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employees">社員数 *</Label>
                  <Select
                    value={formData.employees}
                    onValueChange={(value) =>
                      updateFormData("employees", value)
                    }
                  >
                    <SelectTrigger
                      className={errors.employees ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="社員数を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10名</SelectItem>
                      <SelectItem value="11-50">11-50名</SelectItem>
                      <SelectItem value="51-100">51-100名</SelectItem>
                      <SelectItem value="100+">100名以上</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.employees && (
                    <p className="text-sm text-red-500">{errors.employees}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annualRevenue">年間売上</Label>
                  <Select
                    value={formData.annualRevenue}
                    onValueChange={(value) =>
                      updateFormData("annualRevenue", value)
                    }
                  >
                    <SelectTrigger
                      className={errors.annualRevenue ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="年間売上を選択（任意）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">選択しない</SelectItem>
                      <SelectItem value="under-10M">1000万円未満</SelectItem>
                      <SelectItem value="10M-50M">1000万円〜5000万円</SelectItem>
                      <SelectItem value="50M-100M">5000万円〜1億円</SelectItem>
                      <SelectItem value="100M-500M">1億円〜5億円</SelectItem>
                      <SelectItem value="500M-1B">5億円〜10億円</SelectItem>
                      <SelectItem value="1B+">10億円以上</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.annualRevenue && (
                    <p className="text-sm text-red-500">{errors.annualRevenue}</p>
                  )}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="text-center mb-6">
                  <p className="text-gray-600">メールアドレスを入力してください。</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verificationEmail">メールアドレス</Label>
                    <Input
                      id="verificationEmail"
                      type="email"
                      value={formData.verificationEmail}
                      onChange={(e) =>
                        updateFormData("verificationEmail", e.target.value)
                      }
                      placeholder="xxxxxxx@aicall.com"
                      className={`text-center ${errors.verificationEmail ? "border-red-500" : ""}`}
                    />
                    {errors.verificationEmail && (
                      <p className="text-sm text-red-500 text-center">{errors.verificationEmail}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="text-center mb-6">
                  <p className="text-gray-600 mb-2">
                    {formData.verificationEmail}に認証コードを送信しました。
                  </p>
                  <p className="text-gray-600">
                    下記に認証コードを入力してください。
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verificationCode">認証コード</Label>
                    <Input
                      id="verificationCode"
                      value={formData.verificationCode}
                      onChange={(e) =>
                        updateFormData("verificationCode", e.target.value.toUpperCase())
                      }
                      placeholder="XXXXXX"
                      maxLength={6}
                      className={`text-center text-lg tracking-widest ${errors.verificationCode ? "border-red-500" : ""}`}
                    />
                    {errors.verificationCode && (
                      <p className="text-sm text-red-500 text-center">{errors.verificationCode}</p>
                    )}
                  </div>
                  {emailVerification.countdown > 0 && (
                    <div className="text-center">
                      <p className="text-sm text-gray-500">
                        有効期限: {Math.floor(emailVerification.countdown / 60)}:{(emailVerification.countdown % 60).toString().padStart(2, '0')}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lastName">姓 *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) =>
                        updateFormData("lastName", e.target.value)
                      }
                      placeholder="田中"
                      className={errors.lastName ? "border-red-500" : ""}
                    />
                    {errors.lastName && (
                      <p className="text-sm text-red-500">{errors.lastName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firstName">名 *</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) =>
                        updateFormData("firstName", e.target.value)
                      }
                      placeholder="太郎"
                      className={errors.firstName ? "border-red-500" : ""}
                    />
                    {errors.firstName && (
                      <p className="text-sm text-red-500">{errors.firstName}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">パスワード *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => updateFormData("password", e.target.value)}
                    placeholder="••••••••"
                    className={errors.password ? "border-red-500" : ""}
                  />
                  {errors.password && (
                    <p className="text-sm text-red-500">{errors.password}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">パスワード確認 *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      updateFormData("confirmPassword", e.target.value)
                    }
                    placeholder="••••••••"
                    className={errors.confirmPassword ? "border-red-500" : ""}
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-red-500">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="flex flex-col space-y-3 pt-4">
              {step === 4 && (
                <Button
                  variant="outline"
                  onClick={resendVerificationCode}
                  disabled={emailVerification.resendCooldown > 0 || emailVerification.isLoading}
                  className="w-full"
                >
                  {emailVerification.resendCooldown > 0 ? (
                    `認証コードを再発行する (${emailVerification.resendCooldown}秒)`
                  ) : (
                    "認証コードを再発行する"
                  )}
                </Button>
              )}
              
              <div className="flex justify-between">
                {step > 1 && (
                  <Button variant="outline" onClick={handleBack}>
                    戻る
                  </Button>
                )}
                {step !== 1 && (
                  <Button
                    onClick={step === 3 ? sendVerificationCode : step === 4 ? verifyEmailCode : handleNext}
                    className="bg-orange-500 hover:bg-orange-600 ml-auto"
                    disabled={isSubmitting || emailVerification.isLoading}
                  >
                    {(isSubmitting || emailVerification.isLoading) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        処理中...
                      </>
                    ) : step === 3 ? (
                      "メール認証をする"
                    ) : step === 4 ? (
                      "認証する"
                    ) : step === 5 ? (
                      "登録完了"
                    ) : (
                      "次へ"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
