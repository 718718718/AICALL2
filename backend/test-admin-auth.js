const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function testAdminAuth() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find admin account
    const admin = await User.findOne({ email: 'admin@admin.com' }).select('+password');
    
    if (!admin) {
      console.log('❌ Admin account not found');
      process.exit(1);
    }

    console.log('\n=== Admin Account Info ===');
    console.log('Email:', admin.email);
    console.log('Role:', admin.role);
    console.log('Password hash exists:', !!admin.password);
    console.log('Password hash length:', admin.password?.length);
    
    // Test password comparison
    const testPassword = 'admin123';
    console.log('\n=== Testing Password ===');
    console.log('Testing with password:', testPassword);
    
    // Direct bcrypt comparison
    const isValidDirect = await bcrypt.compare(testPassword, admin.password);
    console.log('Direct bcrypt.compare result:', isValidDirect);
    
    // Using model method
    if (admin.comparePassword) {
      const isValidMethod = await admin.comparePassword(testPassword);
      console.log('Model comparePassword result:', isValidMethod);
    } else {
      console.log('⚠️  comparePassword method not found on model');
    }
    
    // Test with wrong password
    const wrongPassword = 'wrongpassword';
    const isWrong = await bcrypt.compare(wrongPassword, admin.password);
    console.log('Wrong password test:', isWrong);
    
    console.log('\n=== Hash Info ===');
    console.log('First 20 chars of hash:', admin.password.substring(0, 20));
    console.log('Hash format looks valid:', admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testAdminAuth();