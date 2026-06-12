require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Company = require('../models/Company');
const User = require('../models/User');

const updateDefaultCompanyId = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');

    // Find the default company
    const defaultCompany = await Company.findOne({ companyId: 'DEFAULT001' });
    
    if (defaultCompany) {
      // Generate new secure random ID
      const newCompanyId = crypto.randomBytes(16).toString('base64url');
      
      // Update company with new ID
      const oldId = defaultCompany.companyId;
      defaultCompany.companyId = newCompanyId;
      await defaultCompany.save();
      
      console.log(`Updated default company ID from ${oldId} to ${newCompanyId}`);
      
      // Update all users with the old company ID
      const updateResult = await User.updateMany(
        { companyId: oldId },
        { 
          $set: { 
            companyId: newCompanyId
          } 
        }
      );
      
      console.log(`Updated ${updateResult.modifiedCount} users with new company ID`);
      
      console.log('\n=== New Default Company ID ===');
      console.log(`Company Name: ${defaultCompany.name}`);
      console.log(`New Company ID: ${newCompanyId}`);
      console.log('\nPlease save this ID for testing purposes.');
    } else {
      console.log('Default company not found. Creating new one with secure ID...');
      
      const newCompanyId = crypto.randomBytes(16).toString('base64url');
      
      const newCompany = await Company.create({
        companyId: newCompanyId,
        name: 'デフォルト企業',
        address: '東京都千代田区',
        phone: '03-0000-0000',
        email: 'info@default.com',
        url: 'https://default.com',
        status: 'active',
        createdBy: 'system'
      });
      
      console.log('\n=== New Default Company Created ===');
      console.log(`Company Name: ${newCompany.name}`);
      console.log(`Company ID: ${newCompanyId}`);
    }

    // Display all companies for reference
    const allCompanies = await Company.find().select('companyId name status');
    console.log('\n=== All Companies ===');
    allCompanies.forEach(company => {
      console.log(`- ${company.name}: ${company.companyId} (${company.status})`);
    });

  } catch (error) {
    console.error('Update failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

// Run the update
updateDefaultCompanyId();