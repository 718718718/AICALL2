const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function testAdminLogin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/twilio-ai', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    const adminEmail = 'admin@gmail.com';
    const testPassword = 'password';
    
    // Find admin user
    const adminUser = await User.findOne({ email: adminEmail }).select('+password');
    
    if (!adminUser) {
      console.log('Admin user not found!');
      
      // Let's create a new admin if not exists
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(testPassword, salt);
      
      const newAdmin = new User({
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
      
      await newAdmin.save();
      console.log('New admin user created!');
    } else {
      console.log('Admin user found!');
      console.log('Email:', adminUser.email);
      console.log('Role:', adminUser.role);
      console.log('Has password:', !!adminUser.password);
      
      // Test password
      const isMatch = await bcrypt.compare(testPassword, adminUser.password);
      console.log('Password "password" matches:', isMatch);
      
      // If password doesn't match, update it
      if (!isMatch) {
        console.log('Updating password...');
        const salt = await bcrypt.genSalt(10);
        adminUser.password = await bcrypt.hash(testPassword, salt);
        await adminUser.save();
        console.log('Password updated!');
      }
      
      // Test comparePassword method
      const methodMatch = await adminUser.comparePassword(testPassword);
      console.log('comparePassword method result:', methodMatch);
    }
    
    console.log('\n✅ Admin account ready:');
    console.log('Email: admin@gmail.com');
    console.log('Password: password');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

testAdminLogin();