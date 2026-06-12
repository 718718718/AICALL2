const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixAdminAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // デフォルト企業を取得
    const defaultCompany = await Company.findOne({ companyId: 'p0GW2tPh1l7DYTK7TxqCow' });
    if (!defaultCompany) {
      console.log('❌ デフォルト企業が見つかりません');
      
      // 企業一覧を表示
      const companies = await Company.find({});
      console.log('\n利用可能な企業:');
      companies.forEach(c => {
        console.log(`  - ${c.name} (ID: ${c.companyId})`);
      });
      
      if (companies.length === 0) {
        console.log('❌ 企業が1つも存在しません！');
        process.exit(1);
      }
      
      // 最初の企業を使用
      const firstCompany = companies[0];
      console.log(`\n最初の企業を使用: ${firstCompany.name}`);
      
      // admin@example.comを修正
      const adminExample = await User.findOne({ email: 'admin@example.com' });
      if (adminExample) {
        adminExample.companyId = firstCompany.companyId;
        adminExample.companyName = firstCompany.name;
        await adminExample.save();
        console.log('✅ admin@example.comのCompanyIdを修正しました');
      }
    } else {
      // admin@example.comを修正
      const adminExample = await User.findOne({ email: 'admin@example.com' });
      if (adminExample) {
        adminExample.companyId = defaultCompany.companyId;
        adminExample.companyName = defaultCompany.name;
        await adminExample.save();
        console.log('✅ admin@example.comのCompanyIdを修正しました');
      }
    }
    
    // admin@gmail.comを作成または更新
    console.log('\n=== admin@gmail.com の作成/更新 ===');
    
    // 既存のadmin@gmail.comを削除
    await User.deleteOne({ email: 'admin@gmail.com' });
    console.log('既存のadmin@gmail.comを削除（存在する場合）');
    
    // 使用する企業を決定
    const targetCompany = defaultCompany || (await Company.findOne({}));
    if (!targetCompany) {
      console.log('❌ 利用可能な企業がありません');
      process.exit(1);
    }
    
    // 新しいadmin@gmail.comを作成
    const newAdmin = new User({
      companyId: targetCompany.companyId,
      companyName: targetCompany.name,
      email: 'admin@gmail.com',
      password: 'admin123',  // preフックでハッシュ化される
      firstName: 'Admin',
      lastName: 'User',
      phone: '09012345678',
      address: '東京都千代田区',
      businessType: 'it',
      employees: '1-10',
      description: 'System Administrator',
      role: 'admin',
      isActive: true
    });
    
    await newAdmin.save();
    console.log('✅ admin@gmail.comを作成しました');
    console.log(`  CompanyId: ${newAdmin.companyId}`);
    console.log(`  CompanyName: ${newAdmin.companyName}`);
    console.log(`  Password: admin123`);
    
    // 最終確認
    console.log('\n=== 管理者アカウント一覧 ===');
    const allAdmins = await User.find({ role: 'admin' }).select('email companyId companyName');
    allAdmins.forEach(admin => {
      console.log(`Email: ${admin.email}`);
      console.log(`  CompanyId: ${admin.companyId}`);
      console.log(`  CompanyName: ${admin.companyName}`);
      console.log('  Password: admin123');
      console.log('');
    });
    
    // ログインテスト
    console.log('=== ログインテスト ===');
    for (const admin of allAdmins) {
      const testUser = await User.findOne({ email: admin.email }).select('+password');
      const isMatch = await testUser.comparePassword('admin123');
      console.log(`${admin.email}: ${isMatch ? '✅ パスワード正常' : '❌ パスワード異常'}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAdminAccounts();