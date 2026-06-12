const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkAllUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    console.log('=== 全ユーザーリスト ===');
    const allUsers = await User.find({}).select('email role companyId createdAt');
    
    if (allUsers.length === 0) {
      console.log('❌ ユーザーが1人も存在しません！');
    } else {
      console.log(`合計 ${allUsers.length} ユーザー:`);
      allUsers.forEach(user => {
        console.log(`  Email: ${user.email}, Role: ${user.role}, Created: ${user.createdAt.toISOString()}`);
      });
    }
    
    console.log('\n=== 管理者アカウント ===');
    const admins = await User.find({ role: 'admin' }).select('email companyId');
    if (admins.length === 0) {
      console.log('❌ 管理者が存在しません！');
    } else {
      console.log(`合計 ${admins.length} 管理者:`);
      admins.forEach(admin => {
        console.log(`  - ${admin.email} (CompanyId: ${admin.companyId})`);
      });
    }
    
    console.log('\n=== 特定アカウントの検索 ===');
    const searchEmails = ['admin@gmail.com', 'admin@example.com'];
    for (const email of searchEmails) {
      const user = await User.findOne({ email });
      console.log(`${email}: ${user ? '✅ 存在' : '❌ 存在しない'}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllUsers();