const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/twilio-ai', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    const adminEmail = 'admin@gmail.com';
    const adminPassword = 'password';
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (existingAdmin) {
      console.log('Admin user already exists with email:', adminEmail);
      console.log('Current role:', existingAdmin.role);
      
      // Update to admin role if not already admin
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('Updated user role to admin');
      }
    } else {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      
      // Create new admin user with all required fields
      const adminUser = new User({
        email: adminEmail,
        password: hashedPassword,
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
      
      await adminUser.save();
      console.log('Admin user created successfully!');
      console.log('Email:', adminEmail);
      console.log('Password:', adminPassword);
    }
    
    // Verify the admin user
    const admin = await User.findOne({ email: adminEmail });
    console.log('\nVerification - Admin user details:');
    console.log('ID:', admin._id);
    console.log('Email:', admin.email);
    console.log('Name:', admin.firstName, admin.lastName);
    console.log('Role:', admin.role);
    console.log('Company:', admin.companyName);
    
    // List all users in database
    console.log('\nAll users in database:');
    const allUsers = await User.find().select('email role firstName lastName');
    allUsers.forEach(user => {
      console.log(`- ${user.email} (${user.role}): ${user.firstName} ${user.lastName}`);
    });
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

createAdminUser();