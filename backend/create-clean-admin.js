const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createCleanAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/twilio-ai');
    console.log('Connected to MongoDB');
    console.log('Database:', process.env.MONGODB_URI);
    
    // Delete all existing admin users
    const deletedAdmins = await User.deleteMany({ 
      $or: [
        { email: 'admin@gmail.com' },
        { email: 'admin@example.com' },
        { email: 'admin@test.com' }
      ]
    });
    console.log('Deleted existing admin users:', deletedAdmins.deletedCount);
    
    // Create fresh admin
    const adminEmail = 'admin@gmail.com';
    const adminPassword = 'password';
    
    const newAdmin = new User({
      email: adminEmail,
      password: adminPassword, // Will be hashed by pre-save hook
      firstName: 'Admin',
      lastName: 'User',
      companyId: 'ADMIN001',
      companyName: 'Admin Company',
      phone: '0000000000',
      address: 'Admin Building, Tokyo',
      businessType: 'service',
      employees: '1-10',
      role: 'admin'
    });
    
    await newAdmin.save();
    console.log('✅ Admin user created successfully!');
    
    // Verify immediately
    const createdAdmin = await User.findOne({ email: adminEmail }).select('+password');
    if (createdAdmin) {
      console.log('✅ Admin found in database');
      console.log('- Email:', createdAdmin.email);
      console.log('- Role:', createdAdmin.role);
      console.log('- ID:', createdAdmin._id);
      
      // Test password
      const isMatch = await createdAdmin.comparePassword(adminPassword);
      console.log('- Password test:', isMatch ? '✅ PASS' : '❌ FAIL');
      
      if (isMatch) {
        console.log('\n🎉 Admin account ready for login!');
        console.log('Email: admin@gmail.com');
        console.log('Password: password');
      }
    } else {
      console.log('❌ Admin not found after creation!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

createCleanAdmin();