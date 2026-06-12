const mongoose = require('mongoose');
const PhonePool = require('./models/PhonePool');
require('dotenv').config();

async function cleanupTestNumbers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // テスト用番号（+1555で始まる番号）を削除
    const result = await PhonePool.deleteMany({ 
      phoneNumber: { $regex: /^\+1555/ } 
    });
    
    console.log('Deleted test numbers:', result.deletedCount);
    
    // 残っている番号を確認
    const remaining = await PhonePool.find();
    console.log('Remaining phone numbers:');
    remaining.forEach(num => {
      console.log(`- ${num.phoneNumber} (Status: ${num.status})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

cleanupTestNumbers();