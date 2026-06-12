const mongoose = require('mongoose');
const Customer = require('./backend/models/Customer');
const User = require('./backend/models/User');
require('dotenv').config();

async function checkCustomerData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-call-system');
    
    console.log('=== 顧客データの分布状況 ===');
    const customers = await Customer.find({}, 'companyId customer');
    const customersByCompany = {};
    
    customers.forEach(customer => {
      if (!customersByCompany[customer.companyId]) {
        customersByCompany[customer.companyId] = [];
      }
      customersByCompany[customer.companyId].push(customer.customer);
    });
    
    console.log('\n企業別顧客データ:');
    for (const companyId of Object.keys(customersByCompany)) {
      const customerList = customersByCompany[companyId];
      console.log(`\n企業ID: ${companyId}`);
      console.log(`顧客数: ${customerList.length}件`);
      console.log(`顧客: ${customerList.join(', ')}`);
      
      const users = await User.find({ companyId }, 'email companyName');
      if (users.length > 0) {
        console.log(`企業名: ${users[0].companyName}`);
        console.log(`所属ユーザー: ${users.map(u => u.email).join(', ')}`);
      }
      console.log('---');
    }
    
    console.log('\n=== 顧客データが存在するユーザー一覧 ===');
    const usersWithData = await User.find({ 
      companyId: { $in: Object.keys(customersByCompany) } 
    }, 'email companyName companyId');
    
    usersWithData.forEach(user => {
      const customerCount = customersByCompany[user.companyId]?.length || 0;
      console.log(`✓ ${user.email} (${user.companyName}): ${customerCount}件の顧客データ`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCustomerData();