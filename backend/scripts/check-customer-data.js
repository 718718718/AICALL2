const mongoose = require('mongoose');
require('dotenv').config();

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ai_call_system';

const CustomerSchema = new mongoose.Schema({
  userId: String,
  companyId: String,
  customer: String,
  // 他のフィールドは省略
}, { timestamps: true });

const Customer = mongoose.model('Customer', CustomerSchema);

async function checkCustomerData() {
  try {
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');

    // 全顧客データの確認
    const allCustomers = await Customer.find({}, 'userId companyId customer email').limit(20);

    console.log('\n=== Customer Data Overview ===');
    allCustomers.forEach((customer, index) => {
      console.log(`${index + 1}. Customer: ${customer.customer || 'N/A'}`);
      console.log(`   userId: ${customer.userId || 'N/A'}`);
      console.log(`   companyId: ${customer.companyId || 'N/A'}`);
      console.log(`   email: ${customer.email || 'N/A'}`);
      console.log('---');
    });

    // ユーザー別カウント
    const userCounts = await Customer.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 }, samples: { $push: '$customer' } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n=== User ID Distribution ===');
    userCounts.forEach(user => {
      console.log(`UserID: ${user._id} - ${user.count} customers`);
      console.log(`Samples: ${user.samples.slice(0, 3).join(', ')}`);
      console.log('---');
    });

    // 古いcompanyIdデータの確認
    const oldData = await Customer.find({ companyId: { $exists: true } }).limit(5);
    console.log(`\n=== Old CompanyId Data: ${oldData.length} records ===`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkCustomerData();