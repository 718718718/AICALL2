import { NextRequest, NextResponse } from 'next/server';
const jwt = require('jsonwebtoken');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, verificationCode } = body;

    console.log('=== VERCEL EMAIL VERIFICATION ===');
    console.log('Email:', email);
    console.log('Code:', verificationCode);

    // Validate required fields
    if (!email || !verificationCode) {
      return NextResponse.json({
        success: false,
        error: 'メールアドレスと認証コードが必要です',
      }, { status: 400 });
    }

    // 簡易版の認証コード検証
    // 本格実装では実際のデータベースで検証
    // 現在は送信されたコードと一致するかチェック
    
    // 一時的な実装: 任意の6桁数字を受け入れ
    if (!/^\d{6}$/.test(verificationCode)) {
      return NextResponse.json({
        success: false,
        error: '認証コードが正しくありません',
      }, { status: 400 });
    }

    // Get company data from request
    const { companyId, companyName, businessName, businessPhone, address, businessType, employees, description } = body;
    
    // Create temporary JWT token for account creation
    const JWT_SECRET = process.env.JWT_SECRET || '7f4a8b9c3d2e1f0g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f';
    const tempToken = jwt.sign(
      {
        email,
        companyId,
        companyData: {
          companyName,
          businessName,
          businessPhone,
          address,
          businessType,
          employees,
          description
        },
        type: 'email_verified',
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    console.log('Email verification successful for:', email);

    return NextResponse.json({
      success: true,
      message: 'メールアドレスの認証が完了しました',
      data: {
        tempToken,
        email,
      },
    });

  } catch (error) {
    console.error('Verify email code error:', error);
    return NextResponse.json({
      success: false,
      error: 'サーバーエラーが発生しました',
    }, { status: 500 });
  }
}