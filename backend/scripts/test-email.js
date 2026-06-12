const nodemailer = require('nodemailer');
require('dotenv').config();

async function sendTestEmail() {
  try {
    console.log('テストメール送信を開始します...');
    
    // Gmail SMTP設定でトランスポーターを作成
    // 注意: これは実際のGmail SMTPを使用します
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        // テスト用に一時的な認証情報を使用
        // 本番環境では環境変数から読み込む
        user: 'your-test-email@gmail.com', // ここに送信元Gmailアドレスを入力
        pass: 'your-app-password'          // ここにGmailアプリパスワードを入力
      }
    });

    console.log('SMTP接続をテストしています...');
    
    // 接続テスト
    await transporter.verify();
    console.log('✅ SMTP接続成功');
    
    // テストメール内容
    const mailOptions = {
      from: 'your-test-email@gmail.com', // 送信元
      to: 'sekizawa1129@gmail.com',      // 送信先
      subject: '[AI Call System] テストメール認証コード',
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
            
            <p><strong>フローテスト株式会社</strong> への登録ありがとうございます。</p>
            
            <p>この度は当システムにご登録いただき、ありがとうございます。<br>
            以下の認証コードを入力してメールアドレス認証を完了してください。</p>
            
            <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h2 style="color: #495057; font-size: 32px; letter-spacing: 4px; margin: 0;">
                123456
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

    console.log('テストメール送信中...');
    console.log(`送信先: ${mailOptions.to}`);
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ テストメール送信成功！');
    console.log(`メッセージID: ${result.messageId}`);
    console.log(`送信先メールボックスを確認してください: ${mailOptions.to}`);
    
  } catch (error) {
    console.error('❌ テストメール送信失敗:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 認証エラーの解決方法:');
      console.log('1. Gmailの2段階認証を有効にする');
      console.log('2. アプリパスワードを生成する:');
      console.log('   https://myaccount.google.com/apppasswords');
      console.log('3. 生成されたアプリパスワードをスクリプト内のpassに設定する');
    }
  }
}

// 使用方法の説明
console.log('📧 Gmail SMTP テストメール送信スクリプト');
console.log('=====================================');
console.log('実行前に以下を設定してください:');
console.log('1. Line 12: your-test-email@gmail.com を実際のGmailアドレスに変更');
console.log('2. Line 13: your-app-password を実際のGmailアプリパスワードに変更');
console.log('3. Line 25: 送信元メールアドレスを設定');
console.log('');

sendTestEmail();