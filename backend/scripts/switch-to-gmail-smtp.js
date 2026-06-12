const fs = require('fs');
const path = require('path');

console.log('📧 Gmail SMTP設定スクリプト');
console.log('============================');

const envPath = path.join(__dirname, '../.env');

// 現在の.envファイルを読み込み
let envContent = fs.readFileSync(envPath, 'utf8');

console.log('現在のSMTP設定をGmail用に更新します...');

// Gmail SMTP設定に更新
envContent = envContent.replace(
  /SMTP_USER=.*$/m, 
  'SMTP_USER=your-gmail@gmail.com  # ここに送信用Gmailアドレスを設定'
);

envContent = envContent.replace(
  /SMTP_PASS=.*$/m, 
  'SMTP_PASS=your-app-password     # ここにGmailアプリパスワードを設定'
);

// EMAIL_FROMも更新
envContent = envContent.replace(
  /EMAIL_FROM=.*$/m, 
  'EMAIL_FROM=your-gmail@gmail.com'
);

// ファイルに書き込み
fs.writeFileSync(envPath, envContent);

console.log('✅ .envファイルが更新されました');
console.log('');
console.log('📋 次の手順:');
console.log('1. .envファイルを開いて以下を実際の値に変更:');
console.log('   - SMTP_USER: 送信用のGmailアドレス');
console.log('   - SMTP_PASS: Gmailアプリパスワード');
console.log('   - EMAIL_FROM: 送信者表示用のメールアドレス');
console.log('');
console.log('2. Gmailアプリパスワードの取得方法:');
console.log('   a) Googleアカウントの2段階認証を有効にする');
console.log('   b) https://myaccount.google.com/apppasswords にアクセス');
console.log('   c) "AI Call System"などの名前でアプリパスワードを生成');
console.log('   d) 生成された16文字のパスワードを SMTP_PASS に設定');
console.log('');
console.log('3. バックエンドサーバーを再起動');
console.log('   (現在のEthereal Emailから実際のGmail SMTPに切り替わります)');

// テスト用のコマンドも提供
console.log('');
console.log('🧪 設定後のテストコマンド:');
console.log('   node scripts/test-actual-email.js');

fs.writeFileSync(
  path.join(__dirname, 'test-actual-email.js'),
  `const { sendVerificationCode } = require('../controllers/authController');
const express = require('express');

// テスト用のHTTPリクエストオブジェクトを作成
const mockReq = {
  body: {
    email: 'sekizawa1129@gmail.com',
    companyId: 'bddiEgklCFCi_qYccz_x9A',
    companyData: {
      businessPhone: '03-111-2222',
      address: '大阪府大阪市',
      businessType: 'it',
      employees: '1-10',
      description: 'テスト用企業'
    }
  }
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(\`レスポンス (\${code}):\`, data);
    }
  })
};

console.log('📧 実際のメール送信テスト開始...');
console.log('送信先:', mockReq.body.email);

// 実際のメール認証コード送信関数を呼び出し
sendVerificationCode(mockReq, mockRes);`
);

console.log('✅ テスト用スクリプトも作成しました');