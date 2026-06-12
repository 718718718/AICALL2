const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const adminUser = await User.create({
      companyId: 'ADMIN',
      companyName: 'Admin Company',
      email: 'admin@example.com',
      password: 'admin123',
      firstName: '管理',
      lastName: '者',
      phone: '09012345678',
      address: '東京都渋谷区',
      businessType: 'it',
      employees: '1-10',
      description: 'System Administrator',
      role: 'admin',
      isCompanyAdmin: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });

    console.log('Admin user created successfully:');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
    console.log('Role: admin');

    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser();