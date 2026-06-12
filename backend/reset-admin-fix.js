/**
 * 正しいパスワード reset スクリプト
 * User schema の pre('save') hook が自動的に hash するので、ここでは平文を渡すだけ
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

    // 平文を渡すだけ。schema の pre('save') hook が hash してくれる
    admin.password = NEW_PASSWORD;
    admin.role = 'admin';
    await admin.save();
    console.log('✅ Password set (auto-hashed by schema)');

    // 検証
    const verifyUser = await User.findOne({ email: TARGET_EMAIL }).select('+password');
    const isValid = await bcrypt.compare(NEW_PASSWORD, verifyUser.password);

    console.log('\n========================================');
    console.log('Email   :', TARGET_EMAIL);
    console.log('Password:', NEW_PASSWORD);
    console.log('Verify  :', isValid ? '✅ VALID' : '❌ INVALID');
    console.log('========================================');

    process.exit(isValid ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
