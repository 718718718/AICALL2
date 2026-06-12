/**
 * テスト専用 admin アカウント作成スクリプト
 *
 * 既存の admin@example.com は触らず、新規でテスト用アカウントを作成します。
 * テスト完了後は cleanup-test-admin.js で削除可能。
 *
 * 既存の admin と同じ companyId を使うので、Twilio 番号などの設定を継承します。
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const TEST_EMAIL = 'testlin@testing.com';
const TEST_PASSWORD = 'TestLin2026!';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // 既に存在する場合は削除して再作成
    const existing = await User.findOne({ email: TEST_EMAIL });
    if (existing) {
      await User.deleteOne({ email: TEST_EMAIL });
      console.log('🗑  既存のテストアカウントを削除');
    }

    // 既存の admin から company 情報を継承
    const baseAdmin = await User.findOne({ email: 'admin@example.com' });
    if (!baseAdmin) {
      console.log('⚠  admin@example.com が見つかりません。デフォルト値で作成します。');
    }

    // 平文パスワードを渡す。schema の pre('save') hook が hash する
    const testAdmin = await User.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      firstName: 'Test',
      lastName: 'Lin',
      companyId: baseAdmin?.companyId || 'ADMIN',
      companyName: baseAdmin?.companyName || 'Test Company',
      role: 'admin',
      phone: '090-0000-0001',
      address: 'Test Address',
      businessType: 'it',
      employees: '1-10',
      description: 'Temporary test admin (DELETE AFTER TEST)'
    });

    // 検証
    const verifyUser = await User.findOne({ email: TEST_EMAIL }).select('+password');
    const isValid = await bcrypt.compare(TEST_PASSWORD, verifyUser.password);

    console.log('\n========================================');
    console.log('✅ テスト用 admin 作成完了');
    console.log('========================================');
    console.log('Email   :', TEST_EMAIL);
    console.log('Password:', TEST_PASSWORD);
    console.log('Role    :', testAdmin.role);
    console.log('Company :', testAdmin.companyId, '/', testAdmin.companyName);
    console.log('Verify  :', isValid ? '✅ VALID - ログイン可能' : '❌ INVALID');
    console.log('========================================');
    console.log('\n📝 テスト後の削除コマンド:');
    console.log('   node cleanup-test-admin.js');

    process.exit(isValid ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
