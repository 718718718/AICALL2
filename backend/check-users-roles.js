/**
 * データベース内のユーザー一覧と role を確認
 * テスト用にどのアカウントを使うべきか判断するため
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    const users = await User.find({}).select('email role companyId companyName firstName lastName twilioPhoneNumber').lean();

    console.log(`📊 全ユーザー数: ${users.length}\n`);

    // role 別グルーピング
    const byRole = {};
    users.forEach(u => {
      const r = u.role || 'undefined';
      if (!byRole[r]) byRole[r] = [];
      byRole[r].push(u);
    });

    Object.keys(byRole).forEach(role => {
      console.log(`\n=== Role: ${role} (${byRole[role].length}件) ===`);
      byRole[role].forEach(u => {
        console.log(`  📧 ${u.email}`);
        console.log(`     name: ${u.firstName} ${u.lastName}`);
        console.log(`     company: ${u.companyId} / ${u.companyName}`);
        console.log(`     phone: ${u.twilioPhoneNumber || '(未設定)'}`);
      });
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
