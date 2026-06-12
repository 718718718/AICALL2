import { NextRequest, NextResponse } from 'next/server';
const nodemailer = require('nodemailer');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, companyId, companyName, businessName, businessPhone, address, businessType, employees, description } = body;

    console.log('=== VERCEL EMAIL VERIFICATION ===');
    console.log('Email:', email);
    console.log('Company:', companyName);

    // Validate required fields
    if (!email || !companyId) {
      return NextResponse.json({
        success: false,
        error: 'メールアドレスと企業IDが必要です',
      }, { status: 400 });
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log('Generated verification code:', verificationCode);

    // Gmail SMTP configuration
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER || 'ai.call.app.2025@gmail.com',
        pass: process.env.GMAIL_PASS || 'nlwy fpgl xetw zsgk',
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Email template
    const mailOptions = {
      from: process.env.GMAIL_USER || 'ai.call.app.2025@gmail.com',
      to: email,
      subject: '[AI Call System] メールアドレス認証のお願い',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>メールアドレス認証</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">AI Call System</h2>
            <h3 style="color: #34495e;">メールアドレス認証のお願い</h3>

            <p>お疲れ様です。</p>

            <p><strong>${companyName}</strong> への登録ありがとうございます。</p>

            <p>この度は当システムにご登録いただき、ありがとうございます。<br>
            以下の認証コードを入力してメールアドレス認証を完了してください。</p>

            <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h2 style="color: #495057; font-size: 32px; letter-spacing: 4px; margin: 0;">
                ${verificationCode}
              </h2>
            </div>

            <p><strong>※このコードは10分間有効です。</strong></p>
            <p>※このメールに心当たりがない場合は、このメールを無視してください。</p>

            <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">

            <p style="font-size: 14px; color: #6c757d;">
              このメールは AI Call System から自動送信されています。<br>
              このメールに返信されても回答できませんのでご了承ください。
            </p>
          </div>
        </body>
        </html>
      `
    };

    // Send email
    console.log('Sending verification email...');
    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);

    // Store verification data in memory/cache (簡易版)
    // 本格実装では Vercel KV や外部データベースを使用
    
    return NextResponse.json({
      success: true,
      message: '認証コードをメールアドレスに送信しました',
      token: verificationCode, // 一時的な実装
      data: {
        email,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    });

  } catch (error) {
    console.error('Email sending error:', error);
    return NextResponse.json({
      success: false,
      error: 'メールの送信に失敗しました',
    }, { status: 500 });
  }
}