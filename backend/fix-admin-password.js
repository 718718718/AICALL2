const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-agent').then(async () => {
  const User = require('./models/User');
  
  console.log('=== Checking Admin Account ===');
  
  const adminUser = await User.findOne({ email: 'admin@example.com' }).select('+password');
  
  if (adminUser) {
    console.log('Admin user found:');
    console.log('Email:', adminUser.email);
    console.log('Role:', adminUser.role);
    console.log('Password field exists:', Boolean(adminUser.password));
    console.log('Password hash (first 20 chars):', adminUser.password?.substring(0, 20));
    
    // パスワードが正しくハッシュ化されているかチェック
    const isValidHash = adminUser.password && 
      (adminUser.password.startsWith('$2b$') || adminUser.password.startsWith('$2a$'));
    
    console.log('Is valid bcrypt hash:', isValidHash);
    
    // パスワードをリセット（常に新しいハッシュを生成）
    console.log('\nResetting password to: admin123');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // 直接データベースを更新（pre-saveフックを回避）
    await User.findOneAndUpdate(
      { email: 'admin@example.com' },
      { password: hashedPassword },
      { new: true }
    );
    
    console.log('Password has been reset with new hash');
    
    // 更新後のユーザーを再取得
    const updatedUser = await User.findOne({ email: 'admin@example.com' }).select('+password');
    
    // テスト
    const testResult = await bcrypt.compare('admin123', updatedUser.password);
    console.log('\nTest password comparison:');
    console.log('Password "admin123" matches:', testResult);
    
    // comparePasswordメソッドのテスト
    try {
      const methodResult = await updatedUser.comparePassword('admin123');
      console.log('comparePassword method result:', methodResult);
    } catch (err) {
      console.log('comparePassword method error:', err.message);
    }
    
    console.log('\n==== LOGIN CREDENTIALS ====');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
    console.log('===========================');
    
  } else {
    console.log('Admin user not found. Creating new admin...');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const newAdmin = new User({
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      name: 'Admin',
      firstName: 'Admin',
      lastName: 'User',
      companyId: 'DEFAULT',
      companyName: 'Admin Company'
    });
    
    await newAdmin.save();
    console.log('New admin user created\!');
    
    console.log('\n==== LOGIN CREDENTIALS ====');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
    console.log('===========================');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});