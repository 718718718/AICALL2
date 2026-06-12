const mongoose = require('mongoose');
require('dotenv').config();

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ai_call_system';

// CallSession schema
const CallSessionSchema = new mongoose.Schema({
  companyId: String,
  userId: String,
  // 他のフィールドは省略
}, { timestamps: true });

const CallSession = mongoose.model('CallSession', CallSessionSchema);

async function cleanupOldCallSessions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');

    // 削除前の件数確認
    const totalCallSessions = await CallSession.countDocuments();
    const oldCallSessions = await CallSession.countDocuments({
      companyId: { $exists: true },
      userId: { $exists: false }
    });
    const newCallSessions = await CallSession.countDocuments({
      userId: { $exists: true }
    });

    console.log('\n=== Before Cleanup ===');
    console.log(`Total call sessions: ${totalCallSessions}`);
    console.log(`Old format (companyId only): ${oldCallSessions}`);
    console.log(`New format (userId): ${newCallSessions}`);

    if (oldCallSessions === 0) {
      console.log('\n✅ No old call sessions to clean up!');
      return;
    }

    // 古い形式のCallSessionを削除
    console.log(`\n🗑️  Deleting ${oldCallSessions} old call sessions...`);
    const deleteResult = await CallSession.deleteMany({
      companyId: { $exists: true },
      userId: { $exists: false }
    });

    console.log(`✅ Deleted ${deleteResult.deletedCount} old call sessions`);

    // 削除後の件数確認
    const remainingTotal = await CallSession.countDocuments();
    const remainingOld = await CallSession.countDocuments({
      companyId: { $exists: true },
      userId: { $exists: false }
    });
    const remainingNew = await CallSession.countDocuments({
      userId: { $exists: true }
    });

    console.log('\n=== After Cleanup ===');
    console.log(`Total call sessions: ${remainingTotal}`);
    console.log(`Old format remaining: ${remainingOld}`);
    console.log(`New format: ${remainingNew}`);

    if (remainingOld === 0) {
      console.log('\n🎉 Cleanup completed successfully!');
    } else {
      console.log('\n⚠️  Some old records still remain');
    }

  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// 実行確認
if (require.main === module) {
  console.log('CallSession Cleanup Script');
  console.log('This will delete old CallSession records that use companyId format.');
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Are you sure you want to delete old call session records? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      rl.close();
      cleanupOldCallSessions().then(() => {
        console.log('Cleanup script completed.');
        process.exit(0);
      }).catch((error) => {
        console.error('Cleanup script failed:', error);
        process.exit(1);
      });
    } else {
      console.log('Cleanup cancelled.');
      rl.close();
      process.exit(0);
    }
  });
}

module.exports = { cleanupOldCallSessions };