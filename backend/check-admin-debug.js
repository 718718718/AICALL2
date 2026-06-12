const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/twilio-ai');
    
    const admin = await User.findOne({ email: 'admin@gmail.com' }).select('+password');
    if (admin) {
      console.log('Admin exists:');
      console.log('- Email:', admin.email);
      console.log('- Role:', admin.role);
      console.log('- Password hash exists:', !!admin.password);
      console.log('- Password hash length:', admin.password ? admin.password.length : 0);
      console.log('- Password hash preview:', admin.password ? admin.password.substring(0, 20) + '...' : 'none');
      
      // Test password comparison
      const isMatch = await admin.comparePassword('password');
      console.log('- Password "password" matches:', isMatch);
      
      // Try direct bcrypt comparison
      const bcrypt = require('bcryptjs');
      const directMatch = await bcrypt.compare('password', admin.password);
      console.log('- Direct bcrypt comparison:', directMatch);
      
    } else {
      console.log('Admin user not found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkAdmin();