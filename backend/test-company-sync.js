const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

async function testCompanySync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // Test user email
    const testEmail = 'kosaku.tsubata@gmail.com';
    
    console.log('=== Testing Company-User Synchronization ===\n');
    
    // 1. Find the test user
    const user = await User.findOne({ email: testEmail });
    if (!user) {
      console.log(`❌ User ${testEmail} not found`);
      process.exit(1);
    }
    
    console.log(`Found user: ${user.email}`);
    console.log(`Current CompanyId: ${user.companyId}`);
    console.log(`Current CompanyName: ${user.companyName}\n`);
    
    // 2. Find the associated company
    if (user.companyId) {
      const company = await Company.findOne({ companyId: user.companyId });
      
      if (company) {
        console.log('Associated Company in Database:');
        console.log(`  Name: ${company.name}`);
        console.log(`  ID: ${company.companyId}`);
        console.log(`  Address: ${company.address || 'Not set'}`);
        console.log(`  Phone: ${company.phone || 'Not set'}`);
        console.log(`  Status: ${company.status}`);
        
        // Check if names match
        if (user.companyName !== company.name) {
          console.log(`\n⚠️  Company name mismatch detected!`);
          console.log(`  User has: "${user.companyName}"`);
          console.log(`  Company table has: "${company.name}"`);
          
          console.log('\n🔧 Fixing mismatch...');
          user.companyName = company.name;
          await user.save();
          console.log('✅ User companyName updated to match Company table');
        } else {
          console.log('\n✅ Company names are synchronized correctly');
        }
      } else {
        console.log(`❌ No company found with ID: ${user.companyId}`);
        
        // List available companies
        const companies = await Company.find({});
        console.log('\nAvailable companies:');
        companies.forEach(c => {
          console.log(`  - ${c.name} (ID: ${c.companyId})`);
        });
      }
    } else {
      console.log('❌ User has no companyId set');
    }
    
    // 3. Test the /api/auth/me endpoint simulation
    console.log('\n=== Simulating /api/auth/me endpoint ===');
    const freshUser = await User.findById(user._id).select('-password');
    
    if (freshUser.companyId) {
      const company = await Company.findOne({ companyId: freshUser.companyId });
      if (company) {
        freshUser.companyName = company.name;
        console.log('✅ Company name would be updated in API response');
        console.log(`  Final companyName: ${freshUser.companyName}`);
      }
    }
    
    // 4. Test the /api/company/my-company endpoint simulation
    console.log('\n=== Simulating /api/company/my-company endpoint ===');
    const userCompany = await Company.findOne({ companyId: user.companyId });
    
    if (userCompany) {
      console.log('✅ Company data would be returned:');
      console.log(`  Name: ${userCompany.name}`);
      console.log(`  ID: ${userCompany.companyId}`);
      console.log(`  Status: ${userCompany.status}`);
    } else {
      console.log('⚠️  Fallback response would be sent with user\'s stored company info');
    }
    
    console.log('\n=== Test Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testCompanySync();