/**
 * admin@example.com のパスワードを新しい値に再設定するスクリプト
 *
 * 元のパスワードは bcrypt の特性上、復元不可能ですが、
 * このスクリプトで新パスワードを設定して再度ログイン可能にできます。
 *
 * 使用後、お客様にはこの暫定パスワードを通知し、
 * お客様にダッシュボード内で再変更していただくのが推奨フローです。
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const TARGET_EMAIL = 'admin@example.com';
const NEW_PASSWORD = 'admin123';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    const admin = await User.findOne({ email: TARGET_EMAIL });
    if (!admin) {
      console.log('❌ Admin not found:', TARGET_EMAIL);
      process.exit(1);
    }

    console.log('Admin found:', admin.email, 'role:', admin.role);
    console.log('Company:', admin.companyId, '/', admin.companyName);

    // 平文を渡すだけ。User schema の pre('save') hook が自動で hash する
    admin.password = NEW_PASSWORD;
    await admin.save();
    console.log('✅ パスワード設定完了 (schema により auto-hash)');

    // 検証
    const verifyUser = await User.findOne({ email: TARGET_EMAIL }).select('+password');
    const isValid = await bcrypt.compare(NEW_PASSWORD, verifyUser.password);

    console.log('\n========================================');
    console.log('Email   :', TARGET_EMAIL);
    console.log('暫定 Password:', NEW_PASSWORD);
    console.log('Verify  :', isValid ? '✅ VALID - ログイン可能' : '❌ INVALID');
    console.log('========================================');
    console.log('\n📝 お客様への通知文例:');
    console.log('   「admin@example.com の暫定パスワードを「' + NEW_PASSWORD + '」に');
    console.log('   設定いたしました。ログイン後、ダッシュボード内で');
    console.log('   ご希望のパスワードへ変更ください。」');

    process.exit(isValid ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
