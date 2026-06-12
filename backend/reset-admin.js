const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function resetAdminPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/twilio-ai', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    const adminEmail = 'admin@gmail.com';
    const newPassword = 'password';
    
    // Find and delete existing admin
    await User.deleteOne({ email: adminEmail });
    console.log('Deleted existing admin user');
    
    // Create fresh admin user
    const adminUser = new User({
      email: adminEmail,
      password: newPassword, // Will be hashed by pre-save hook
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
    
    // Verify the login works
    const testUser = await User.findOne({ email: adminEmail }).select('+password');
    const isMatch = await testUser.comparePassword(newPassword);
    
    console.log('\n✅ Admin account created:');
    console.log('Email:', adminEmail);
    console.log('Password:', newPassword);
    console.log('Password verification:', isMatch ? '✓ Working' : '✗ Failed');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

resetAdminPassword();