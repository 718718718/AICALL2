const mongoose = require('mongoose');
const User = require('../models/User');

const connectDB = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');

    // Manage admin user
    await manageAdminUser();
    
    return mongoose.connection;
  } catch (err) {
    console.error('Database connection error:', err.message);
    process.exit(1);
  }
};

async function manageAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail, role: 'admin' });
    
    if (existingAdmin) {
      console.log('Admin user already exists:', adminEmail);
      return;
    }

    // Create new admin only if it doesn't exist
    await User.create({
      companyId: 'ADMIN001',  // Add companyId
      username: 'admin',
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      companyName: 'Admin Company',
      firstName: 'Admin',
      lastName: 'User',
      phone: '000-000-0000',
      address: 'Admin Address',
      businessType: 'it',
      employees: '1-10',
      description: 'System Administrator'
    });

    console.log('New admin user created successfully:', adminEmail);
  } catch (err) {
    console.error('Error managing admin user:', err.message);
    // Don't exit process here - let the application decide
  }
}

module.exports = connectDB;