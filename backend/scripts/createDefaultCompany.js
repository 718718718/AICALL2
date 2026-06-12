require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');

const createDefaultCompanyAndMigrateUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');

    // Check if default company exists
    let defaultCompany = await Company.findOne({ companyId: 'DEFAULT001' });
    
    if (!defaultCompany) {
      // Create default company
      defaultCompany = await Company.create({
        companyId: 'DEFAULT001',
        name: 'デフォルト企業',
        address: '東京都千代田区',
        phone: '03-0000-0000',
        email: 'info@default.com',
        url: 'https://default.com',
        status: 'active',
        createdBy: 'system'
      });
      
      console.log('Default company created:', defaultCompany.companyId);
    } else {
      console.log('Default company already exists:', defaultCompany.companyId);
    }

    // Find users without companyId
    const usersWithoutCompany = await User.find({ 
      $or: [
        { companyId: { $exists: false } },
        { companyId: null },
        { companyId: '' }
      ]
    });

    console.log(`Found ${usersWithoutCompany.length} users without company`);

    if (usersWithoutCompany.length > 0) {
      // Update users with default company
      const updateResult = await User.updateMany(
        { 
          $or: [
            { companyId: { $exists: false } },
            { companyId: null },
            { companyId: '' }
          ]
        },
        { 
          $set: { 
            companyId: defaultCompany.companyId,
            companyName: defaultCompany.name
          } 
        }
      );

      console.log(`Updated ${updateResult.modifiedCount} users with default company`);
    }

    // Verify migration
    const usersStillWithoutCompany = await User.find({ 
      $or: [
        { companyId: { $exists: false } },
        { companyId: null },
        { companyId: '' }
      ]
    });

    if (usersStillWithoutCompany.length === 0) {
      console.log('✅ Migration successful! All users now have a company ID.');
    } else {
      console.log(`⚠️ ${usersStillWithoutCompany.length} users still without company ID`);
    }

    // Display summary
    const totalUsers = await User.countDocuments();
    const totalCompanies = await Company.countDocuments();
    
    console.log('\n=== Summary ===');
    console.log(`Total companies: ${totalCompanies}`);
    console.log(`Total users: ${totalUsers}`);
    console.log(`Default company ID: ${defaultCompany.companyId}`);
    console.log('\nYou can now use this company ID for testing.');
    console.log('Admin can create new companies from /admin/companies page.');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

// Run the migration
createDefaultCompanyAndMigrateUsers();