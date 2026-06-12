const mongoose = require('mongoose');
const Company = require('./models/Company');
const User = require('./models/User');
require('dotenv').config();

async function checkUserCompanyRelation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/twilio-ai');
    console.log('Connected to MongoDB');
    
    const companies = await Company.find().lean();
    console.log('\n=== Companies in database ===');
    companies.forEach(company => {
      console.log(`- ${company.name} (ID: ${company.companyId}) - Status: ${company.status}`);
    });
    
    const users = await User.find().select('email companyId companyName role').lean();
    console.log('\n=== Users and their companies ===');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.role}) -> Company: ${user.companyName} (ID: ${user.companyId})`);
    });
    
    // Check for orphaned users (users with invalid companyId)
    console.log('\n=== Checking for orphaned users ===');
    const companyIds = companies.map(c => c.companyId);
    const orphanedUsers = users.filter(user => !companyIds.includes(user.companyId) && user.role !== 'admin');
    
    if (orphanedUsers.length > 0) {
      console.log('⚠️  Found orphaned users:');
      orphanedUsers.forEach(user => {
        console.log(`   - ${user.email} has invalid companyId: ${user.companyId}`);
      });
    } else {
      console.log('✅ All users are properly linked to valid companies');
    }
    
    // Check referential integrity
    console.log('\n=== User-Company Relationship Analysis ===');
    console.log(`Total Companies: ${companies.length}`);
    console.log(`Total Users: ${users.length}`);
    console.log(`Admin Users: ${users.filter(u => u.role === 'admin').length}`);
    console.log(`Regular Users: ${users.filter(u => u.role === 'user').length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkUserCompanyRelation();