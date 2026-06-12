const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

async function fixUserCompanyMapping() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`Found ${users.length} users to check`);

    // Get all companies for reference
    const companies = await Company.find({});
    const companyMap = new Map();
    companies.forEach(c => {
      companyMap.set(c.companyId, c);
    });
    console.log(`Found ${companies.length} companies in database`);

    // Track stats
    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let needsManualFixCount = 0;
    const needsManualFix = [];

    // Get default company
    const defaultCompany = await Company.findOne({ companyId: 'p0GW2tPh1l7DYTK7TxqCow' });
    if (!defaultCompany) {
      console.error('Default company not found!');
      process.exit(1);
    }

    // Check and fix each user
    for (const user of users) {
      const existingCompany = companyMap.get(user.companyId);
      
      if (existingCompany) {
        // Company exists, check if name matches
        if (user.companyName !== existingCompany.name) {
          console.log(`Fixing company name for user ${user.email}: "${user.companyName}" -> "${existingCompany.name}"`);
          user.companyName = existingCompany.name;
          await user.save();
          fixedCount++;
        } else {
          alreadyCorrectCount++;
        }
      } else {
        // Company doesn't exist
        console.log(`User ${user.email} has invalid companyId: ${user.companyId}`);
        
        // Special handling for admin users
        if (user.role === 'admin') {
          console.log(`Admin user ${user.email} - assigning to default company`);
          user.companyId = defaultCompany.companyId;
          user.companyName = defaultCompany.name;
          await user.save();
          fixedCount++;
        } else if (user.companyId === 'COMP001' && user.companyName === 'Example Company') {
          // Create the Example Company
          console.log('Creating Example Company for user');
          const newCompany = await Company.create({
            companyId: 'COMP001',
            name: 'Example Company',
            address: '未設定',
            phone: '未設定',
            status: 'active'
          });
          console.log(`Created company: ${newCompany.name}`);
          fixedCount++;
        } else {
          // Need manual intervention
          needsManualFix.push({
            email: user.email,
            companyId: user.companyId,
            companyName: user.companyName
          });
          needsManualFixCount++;
        }
      }
    }

    // Report results
    console.log('\n=== Fix Summary ===');
    console.log(`Total users checked: ${users.length}`);
    console.log(`Already correct: ${alreadyCorrectCount}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Needs manual fix: ${needsManualFixCount}`);

    if (needsManualFix.length > 0) {
      console.log('\n=== Users needing manual fix ===');
      needsManualFix.forEach(u => {
        console.log(`Email: ${u.email}, CompanyId: ${u.companyId}, CompanyName: ${u.companyName}`);
      });
      console.log('\nTo fix these users:');
      console.log('1. Create the missing companies in the admin panel');
      console.log('2. Or assign them to existing companies using the user edit page');
    }

    console.log('\n✅ Script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
fixUserCompanyMapping();