const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createStableAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Remove all existing admin accounts first
    const deletedCount = await User.deleteMany({ 
      email: { $in: ['admin@gmail.com', 'admin@example.com', 'admin@test.com'] } 
    });
    console.log('Deleted existing admin accounts:', deletedCount.deletedCount);
    
    // Create a stable admin account with the exact format we want
    const adminData = {
      email: 'admin@gmail.com',
      password: 'password',
      firstName: 'System',
      lastName: 'Administrator',
      companyId: 'ADMIN_SYSTEM',
      companyName: 'System Administration',
      phone: '+1234567890',
      address: 'System Address',
      businessType: 'service',
      employees: '1-10',
      role: 'admin',
      isCompanyAdmin: false
    };
    
    console.log('Creating admin with data:', {
      email: adminData.email,
      role: adminData.role,
      companyId: adminData.companyId
    });
    
    const adminUser = new User(adminData);
    await adminUser.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('- ID:', adminUser._id);
    console.log('- Email:', adminUser.email);
    console.log('- Role:', adminUser.role);
    
    // Verify immediately
    const savedAdmin = await User.findOne({ email: 'admin@gmail.com' }).select('+password');
    if (savedAdmin) {
      const passwordTest = await savedAdmin.comparePassword('password');
      console.log('- Password verification:', passwordTest ? '✅ PASS' : '❌ FAIL');
      
      if (!passwordTest) {
        console.log('❌ Password failed! Fixing manually...');
        const salt = await bcrypt.genSalt(10);
        savedAdmin.password = await bcrypt.hash('password', salt);
        await savedAdmin.save();
        
        const retestPassword = await savedAdmin.comparePassword('password');
        console.log('- Password retest:', retestPassword ? '✅ FIXED' : '❌ STILL BROKEN');
      }
    }
    
    // Test login immediately
    console.log('\n🔍 Testing login immediately...');
    const testResponse = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@gmail.com', password: 'password' })
    });
    
    const testResult = await testResponse.json();
    console.log('Backend login test:', testResponse.ok ? '✅ SUCCESS' : '❌ FAILED');
    if (!testResponse.ok) {
      console.log('Error:', testResult.error);
    }
    
    console.log('\n🎉 Stable admin account ready!');
    console.log('Email: admin@gmail.com');
    console.log('Password: password');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

createStableAdmin();