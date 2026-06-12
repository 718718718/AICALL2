const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

let isMonitoring = false;

async function monitorAdmin() {
  if (isMonitoring) return;
  isMonitoring = true;
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Monitoring admin account...');
    console.log('Press Ctrl+C to stop monitoring\n');
    
    let lastAdminId = null;
    let checkCount = 0;
    
    const checkInterval = setInterval(async () => {
      try {
        checkCount++;
        const admin = await User.findOne({ email: 'admin@gmail.com' });
        
        if (admin) {
          if (lastAdminId !== admin._id.toString()) {
            console.log(`[${new Date().toISOString()}] ✅ Admin found: ${admin._id}`);
            lastAdminId = admin._id.toString();
          }
          
          if (checkCount % 10 === 0) {
            console.log(`[${new Date().toISOString()}] ✅ Admin still exists (check #${checkCount})`);
          }
        } else {
          console.log(`[${new Date().toISOString()}] ❌ ADMIN DELETED! (check #${checkCount})`);
          
          // Log all recent database operations
          const recentUsers = await User.find().select('email role createdAt').sort({ createdAt: -1 }).limit(10);
          console.log('Recent users in database:');
          recentUsers.forEach(user => {
            console.log(`- ${user.email} (${user.role}) created: ${user.createdAt}`);
          });
          
          console.log('\n🔄 Recreating admin account...');
          const newAdmin = new User({
            email: 'admin@gmail.com',
            password: 'password',
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
          console.log(`[${new Date().toISOString()}] ✅ Admin recreated: ${newAdmin._id}`);
          lastAdminId = newAdmin._id.toString();
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during check:`, error.message);
      }
    }, 2000); // Check every 2 seconds
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping monitoring...');
      clearInterval(checkInterval);
      await mongoose.connection.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error setting up monitoring:', error);
    isMonitoring = false;
  }
}

monitorAdmin();