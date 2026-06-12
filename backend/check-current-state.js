const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkCurrentState() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('=== Current Database State ===');
    
    const admin = await User.findOne({ email: 'admin@gmail.com' });
    console.log('admin@gmail.com exists:', !!admin);
    
    if (admin) {
      console.log('- ID:', admin._id);
      console.log('- Role:', admin.role);
      console.log('- Created:', admin.createdAt);
      
      // Test password immediately
      const passwordTest = await admin.comparePassword('password');
      console.log('- Password test:', passwordTest ? 'PASS' : 'FAIL');
    }
    
    const allAdmins = await User.find({ role: 'admin' });
    console.log('\nAll admin users:');
    allAdmins.forEach(user => {
      console.log(`- ${user.email}: ${user._id} (created: ${user.createdAt})`);
    });
    
    console.log('\nAll users count:', await User.countDocuments());
    
    // Check for cleanup processes
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10);
    console.log('\nRecent 10 users:');
    recentUsers.forEach(user => {
      console.log(`- ${user.email} (${user.role}) created: ${user.createdAt}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkCurrentState();