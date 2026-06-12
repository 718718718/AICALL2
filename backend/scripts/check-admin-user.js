const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const checkAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find admin user
    const adminUser = await User.findOne({ email: 'admin@example.com' }).select('-password');
    if (adminUser) {
      console.log('Admin user found:');
      console.log('Email:', adminUser.email);
      console.log('First Name:', adminUser.firstName);
      console.log('Last Name:', adminUser.lastName);
      console.log('Role:', adminUser.role);
      console.log('Company:', adminUser.companyName);
    } else {
      console.log('Admin user not found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error checking admin user:', error);
    process.exit(1);
  }
};

checkAdminUser();