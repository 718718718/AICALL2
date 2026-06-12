const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

async function ensureAdminCompany() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // 利用可能な企業を確認
    const companies = await Company.find({});
    console.log('=== 現在の企業一覧 ===');
    companies.forEach(c => {
      console.log(`- ${c.name} (ID: ${c.companyId})`);
    });
    
    // デフォルト企業があるか確認
    const defaultCompany = companies.find(c => c.companyId === 'p0GW2tPh1l7DYTK7TxqCow');
    const targetCompany = defaultCompany || companies[0];
    
    if (!targetCompany) {
      console.log('\n❌ 企業が1つも存在しません！企業を作成します...');
      
      // デフォルト企業を作成
      const newCompany = await Company.create({
        companyId: 'DEFAULT001',
        name: 'デフォルト企業',
        address: '東京都千代田区',
        phone: '03-0000-0000',
        status: 'active'
      });
      console.log('✅ デフォルト企業を作成しました');
      targetCompany = newCompany;
    }
    
    console.log(`\n使用する企業: ${targetCompany.name} (ID: ${targetCompany.companyId})`);
    
    // 全管理者アカウントを更新
    console.log('\n=== 管理者アカウントの企業紐付けを修正 ===');
    const admins = await User.find({ role: 'admin' });
    
    for (const admin of admins) {
      console.log(`\n更新中: ${admin.email}`);
      admin.companyId = targetCompany.companyId;
      admin.companyName = targetCompany.name;
      await admin.save();
      console.log(`  ✅ CompanyId: ${admin.companyId}`);
      console.log(`  ✅ CompanyName: ${admin.companyName}`);
    }
    
    // admin@gmail.comが存在しない場合は作成
    const adminGmail = await User.findOne({ email: 'admin@gmail.com' });
    if (!adminGmail) {
      console.log('\n=== admin@gmail.comを作成 ===');
      const newAdmin = new User({
        companyId: targetCompany.companyId,
        companyName: targetCompany.name,
        email: 'admin@gmail.com',
        password: 'admin123',
        firstName: 'Admin',
        lastName: 'Gmail',
        phone: '09012345678',
        address: '東京都千代田区',
        businessType: 'it',
        employees: '1-10',
        role: 'admin',
        isActive: true
      });
      await newAdmin.save();
      console.log('✅ admin@gmail.comを作成しました');
    }
    
    // 最終確認
    console.log('\n=== 利用可能な管理者アカウント ===');
    const finalAdmins = await User.find({ role: 'admin' }).select('email companyId companyName');
    
    for (const admin of finalAdmins) {
      console.log(`\n${admin.email}`);
      console.log(`  Password: admin123`);
      console.log(`  CompanyId: ${admin.companyId}`);
      console.log(`  CompanyName: ${admin.companyName}`);
      
      // パスワード検証
      const user = await User.findOne({ email: admin.email }).select('+password');
      const isValid = await user.comparePassword('admin123');
      console.log(`  ログイン可能: ${isValid ? '✅ YES' : '❌ NO'}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

ensureAdminCompany();