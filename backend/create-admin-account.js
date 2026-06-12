const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdminAccount() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Check if admin exists
    const existingAdmin = await User.findOne({ email: 'admin@admin.com' });
    
    if (existingAdmin) {
      console.log('Admin account already exists');
      
      // Update password to ensure it works
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'admin';
      await existingAdmin.save();
      console.log('Admin password updated successfully');
    } else {
      // Create new admin
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      const admin = await User.create({
        email: 'admin@admin.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        companyId: 'ADMIN',
        companyName: 'System Administrator',
        role: 'admin',
        phone: '090-0000-0000',
        address: 'Tokyo, Japan',
        businessType: 'it',
        employees: '1-10',
        description: 'System Administrator Account'
      });
      
      console.log('Admin account created successfully');
    }

    console.log('\n========================================');
    console.log('Admin Login Credentials:');
    console.log('Email: admin@admin.com');
    console.log('Password: admin123');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createAdminAccount();