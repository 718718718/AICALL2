/**
 * admin@example.com を強力なランダムパスワードに変更
 *
 * 用途: public repo に弱いパスワードが露出している状況を解消。
 * 実行後、新パスワードを安全な経路（メール等）でお客様に通知。
 *
 * 注意: このスクリプトはコンソールにのみパスワードを表示します。
 *      git commit しないでください。
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const TARGET_EMAIL = 'admin@example.com';

// 強力なランダムパスワードを生成（16文字、英数字+記号）
function generateStrongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    const admin = await User.findOne({ email: TARGET_EMAIL });
    if (!admin) {
      console.log('❌ Admin not found');
      process.exit(1);
    }

    const newPassword = generateStrongPassword();
    admin.password = newPassword;
    await admin.save();

    const verify = await User.findOne({ email: TARGET_EMAIL }).select('+password');
    const isValid = await bcrypt.compare(newPassword, verify.password);

    console.log('\n========================================');
    console.log('✅ Password reset complete');
    console.log('========================================');
    console.log('Email:    ', TARGET_EMAIL);
    console.log('Password: ', newPassword);
    console.log('Verified: ', isValid ? '✅' : '❌');
    console.log('========================================');
    console.log('\n⚠ このパスワードは画面のみ表示されます。');
    console.log('  どこかにメモを取って、お客様に安全な経路で通知してください。');
    console.log('  ターミナル履歴は使用後 `clear` でクリアすることを推奨。');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
