const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find existing admin
    const admin = await User.findOne({ email: 'admin@example.com' });
    
    if (!admin) {
      console.log('Admin account not found, creating new one...');
      
      // Create new admin with all required fields
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      const newAdmin = await User.create({
        email: 'admin@example.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        companyId: 'ADMIN',
        companyName: 'Admin Company',
        role: 'admin',
        phone: '090-0000-0000',
        address: 'Tokyo, Japan',
        businessType: 'it',
        employees: '1-10',
        description: 'System Administrator'
      });
      
      console.log('✅ New admin account created');
    } else {
      // Reset password for existing admin
      console.log('Admin account found, resetting password...');
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      admin.password = hashedPassword;
      admin.role = 'admin'; // Ensure role is admin
      await admin.save();
      
      console.log('✅ Admin password reset successfully');
    }

    console.log('\n========================================');
    console.log('Admin Login Credentials:');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
    console.log('========================================\n');
    
    // Verify the password works
    const verifyAdmin = await User.findOne({ email: 'admin@example.com' }).select('+password');
    const isValid = await bcrypt.compare('admin123', verifyAdmin.password);
    console.log('Password verification:', isValid ? '✅ VALID' : '❌ INVALID');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetAdminPassword();