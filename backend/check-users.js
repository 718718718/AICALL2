const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkAllUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    console.log('Database URI:', process.env.MONGODB_URI?.substring(0, 30) + '...');

    // Find all users
    const users = await User.find({});
    console.log(`\nTotal users in database: ${users.length}`);
    
    if (users.length === 0) {
      console.log('No users found in the database');
    } else {
      console.log('\n=== All Users ===');
      users.forEach((user, index) => {
        console.log(`\nUser ${index + 1}:`);
        console.log('  Email:', user.email);
        console.log('  Role:', user.role);
        console.log('  Company:', user.companyName);
        console.log('  Created:', user.createdAt);
      });
    }

    // Check specifically for admin role
    const admins = await User.find({ role: 'admin' });
    console.log(`\n=== Admin Users: ${admins.length} ===`);
    admins.forEach(admin => {
      console.log('  Admin Email:', admin.email);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllUsers();