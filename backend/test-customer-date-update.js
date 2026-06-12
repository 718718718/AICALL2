const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const CallSession = require('./models/CallSession');
require('dotenv').config();

async function testCustomerDateUpdate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    console.log('=== Testing Customer Last Call Date Update ===\n');
    
    // 1. 最近のCallSessionを確認
    const recentSessions = await CallSession.find({
      status: 'completed',
      customerId: { $exists: true, $ne: null }
    })
    .sort('-updatedAt')
    .limit(5)
    .populate('customerId');
    
    console.log(`Found ${recentSessions.length} recent completed call sessions`);
    
    for (const session of recentSessions) {
      if (session.customerId) {
        const customer = session.customerId;
        console.log(`\nCustomer: ${customer.customer || customer._id}`);
        console.log(`  Phone: ${customer.phone}`);
        console.log(`  Current Date: ${customer.date}`);
        console.log(`  Call Session: ${session._id}`);
        console.log(`  Call End Time: ${session.endTime}`);
        
        // Check if dates match
        if (session.endTime) {
          const expectedDate = new Date(session.endTime);
          const expectedDateStr = `${expectedDate.getFullYear()}/${String(expectedDate.getMonth() + 1).padStart(2, '0')}/${String(expectedDate.getDate()).padStart(2, '0')}`;
          
          if (customer.date === expectedDateStr) {
            console.log('  ✅ Date is correctly updated');
          } else {
            console.log(`  ⚠️ Date mismatch - Expected: ${expectedDateStr}, Actual: ${customer.date}`);
          }
        }
      }
    }
    
    // 2. 全顧客の日付フォーマットを確認
    console.log('\n=== Checking Date Format for All Customers ===\n');
    const allCustomers = await Customer.find({}).limit(10);
    
    const dateFormats = new Map();
    for (const customer of allCustomers) {
      if (customer.date) {
        // Detect date format
        let format = 'unknown';
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(customer.date)) {
          format = 'YYYY/MM/DD';
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(customer.date)) {
          format = 'YYYY-MM-DD';
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(customer.date)) {
          format = 'MM/DD/YYYY';
        }
        
        const count = dateFormats.get(format) || 0;
        dateFormats.set(format, count + 1);
      }
    }
    
    console.log('Date format distribution:');
    for (const [format, count] of dateFormats.entries()) {
      console.log(`  ${format}: ${count} customers`);
    }
    
    // 3. テスト: 日付を手動で更新
    console.log('\n=== Testing Manual Date Update ===\n');
    
    const testCustomer = allCustomers[0];
    if (testCustomer) {
      console.log(`Testing with customer: ${testCustomer.customer || testCustomer._id}`);
      console.log(`  Current date: ${testCustomer.date}`);
      
      const today = new Date();
      const newDateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
      
      await Customer.findByIdAndUpdate(testCustomer._id, {
        date: newDateStr
      });
      
      const updatedCustomer = await Customer.findById(testCustomer._id);
      console.log(`  Updated date: ${updatedCustomer.date}`);
      
      if (updatedCustomer.date === newDateStr) {
        console.log('  ✅ Manual update successful');
      } else {
        console.log('  ❌ Manual update failed');
      }
    }
    
    console.log('\n=== Test Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testCustomerDateUpdate();