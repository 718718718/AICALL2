const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetAdminPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    console.log('=== 管理者パスワードリセット ===');
    
    // 全管理者を取得
    const admins = await User.find({ role: 'admin' });
    
    for (const admin of admins) {
      console.log(`\n処理中: ${admin.email}`);
      
      // パスワードを直接設定して保存（preフックを通す）
      admin.password = 'admin123';
      await admin.save();
      
      console.log(`✅ パスワードをリセットしました`);
      
      // 確認
      const updatedUser = await User.findOne({ email: admin.email }).select('+password');
      const isMatch = await updatedUser.comparePassword('admin123');
      console.log(`  検証結果: ${isMatch ? '✅ 成功' : '❌ 失敗'}`);
    }
    
    console.log('\n=== 最終確認 ===');
    const allAdmins = await User.find({ role: 'admin' }).select('email companyId companyName');
    
    console.log('利用可能な管理者アカウント:');
    for (const admin of allAdmins) {
      console.log(`\nEmail: ${admin.email}`);
      console.log(`Password: admin123`);
      console.log(`Company: ${admin.companyName}`);
      
      // ログインテスト
      const testUser = await User.findOne({ email: admin.email }).select('+password');
      const testResult = await testUser.comparePassword('admin123');
      console.log(`ログインテスト: ${testResult ? '✅ OK' : '❌ NG'}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetAdminPasswords();