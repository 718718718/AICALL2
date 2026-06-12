const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

async function createAdminGmail() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // デフォルト企業を取得
    const defaultCompany = await Company.findOne({ companyId: 'p0GW2tPh1l7DYTK7TxqCow' });
    
    if (!defaultCompany) {
      console.error('Default company not found');
      process.exit(1);
    }
    
    // 既存のadmin@gmail.comを削除
    await User.deleteOne({ email: 'admin@gmail.com' });
    console.log('Deleted existing admin@gmail.com if any');
    
    // admin@gmail.comを作成
    const admin = new User({
      companyId: defaultCompany.companyId,
      companyName: defaultCompany.name,
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
    
    await admin.save();
    
    console.log('✅ Admin user created successfully:', admin.email);
    console.log('Password: admin123');
    console.log('Role:', admin.role);
    console.log('Company:', admin.companyName);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createAdminGmail();