const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixAdminLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    console.log('=== 管理者アカウント修復 ===\n');
    
    // 1. admin@gmail.comアカウントを削除して再作成
    console.log('1. admin@gmail.comアカウントを再作成...');
    await User.deleteOne({ email: 'admin@gmail.com' });
    
    const newAdmin = new User({
      email: 'admin@gmail.com',
      password: 'admin123',  // この後preフックでハッシュ化される
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isActive: true,
      companyId: 'DEFAULT001',
      companyName: 'デフォルト企業',
      phone: '09012345678',
      address: '東京都千代田区',
      businessType: 'it',
      employees: '1-10'
    });
    
    await newAdmin.save();
    console.log('✅ admin@gmail.comを作成しました');
    console.log('   Email: admin@gmail.com');
    console.log('   Password: admin123');
    
    // 2. admin@example.comのパスワードをリセット
    console.log('\n2. admin@example.comのパスワードをリセット...');
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    if (existingAdmin) {
      existingAdmin.password = 'admin123';
      existingAdmin.isActive = true;
      await existingAdmin.save();
      console.log('✅ admin@example.comのパスワードをリセットしました');
      console.log('   Email: admin@example.com');
      console.log('   Password: admin123');
    }
    
    // 3. ログイン確認テスト
    console.log('\n=== ログインテスト ===');
    
    const testAccounts = [
      { email: 'admin@gmail.com', password: 'admin123' },
      { email: 'admin@example.com', password: 'admin123' }
    ];
    
    for (const account of testAccounts) {
      const user = await User.findOne({ email: account.email }).select('+password');
      if (user) {
        const isMatch = await user.comparePassword(account.password);
        console.log(`\n${account.email}:`);
        console.log(`  ログイン可能: ${isMatch ? '✅ YES' : '❌ NO'}`);
        console.log(`  Role: ${user.role}`);
        console.log(`  Active: ${user.isActive !== false ? 'Yes' : 'No'}`);
        
        // パスワードハッシュの状態を確認
        const isBcryptHash = user.password && user.password.startsWith('$2');
        console.log(`  パスワードハッシュ化: ${isBcryptHash ? '✅' : '❌'}`);
      } else {
        console.log(`\n${account.email}: ❌ アカウントが存在しません`);
      }
    }
    
    console.log('\n=== 利用可能な管理者アカウント ===');
    console.log('\nアカウント1:');
    console.log('  Email: admin@gmail.com');
    console.log('  Password: admin123');
    console.log('\nアカウント2:');
    console.log('  Email: admin@example.com');
    console.log('  Password: admin123');
    
    console.log('\n✅ 管理者ログイン修復完了');
    console.log('上記のアカウントでログインしてください');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAdminLogin();