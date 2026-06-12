const mongoose = require('mongoose');
require('dotenv').config();

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ai_call_system';

// Schema definitions
const CustomerSchema = new mongoose.Schema({
  companyId: String,
  userId: String,
  customer: String,
  date: String,
  time: String,
  duration: String,
  result: String,
  notes: String,
  address: String,
  phone: String,
  email: String,
  company: String
}, { timestamps: true });

const CallSessionSchema = new mongoose.Schema({
  companyId: String,
  userId: String,
  customerId: mongoose.Schema.Types.ObjectId,
  assignedAgent: mongoose.Schema.Types.ObjectId,
  // 他のフィールドは省略
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  companyId: String,
  email: String,
  firstName: String,
  lastName: String,
  isCompanyAdmin: Boolean,
  // 他のフィールドは省略
}, { timestamps: true });

// モデル作成
const Customer = mongoose.model('Customer', CustomerSchema);
const CallSession = mongoose.model('CallSession', CallSessionSchema);
const User = mongoose.model('User', UserSchema);

async function migrateCustomerData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');

    // 1. 企業ごとの管理者ユーザーを取得
    const companyAdmins = await User.aggregate([
      {
        $match: { isCompanyAdmin: true }
      },
      {
        $group: {
          _id: '$companyId',
          adminUser: { $first: '$$ROOT' }
        }
      }
    ]);

    console.log(`Found ${companyAdmins.length} company admins`);

    // 2. 各企業の顧客データを対応する管理者ユーザーに紐付け
    for (const companyAdmin of companyAdmins) {
      const companyId = companyAdmin._id;
      const adminUserId = companyAdmin.adminUser._id;

      console.log(`\nMigrating customers for company: ${companyId}`);
      console.log(`Assigning to admin user: ${adminUserId} (${companyAdmin.adminUser.email})`);

      // 顧客データを移行
      const customerUpdateResult = await Customer.updateMany(
        { companyId: companyId, userId: { $exists: false } },
        {
          $set: { userId: adminUserId.toString() },
          $unset: { companyId: 1 }
        }
      );

      console.log(`Updated ${customerUpdateResult.modifiedCount} customer records`);

      // CallSessionデータを移行
      const callSessionUpdateResult = await CallSession.updateMany(
        { companyId: companyId, userId: { $exists: false } },
        {
          $set: { userId: adminUserId.toString() },
          $unset: { companyId: 1 }
        }
      );

      console.log(`Updated ${callSessionUpdateResult.modifiedCount} call session records`);
    }

    // 3. 管理者が存在しない企業の処理
    const customersWithoutAdmin = await Customer.find({
      companyId: { $exists: true },
      userId: { $exists: false }
    }).distinct('companyId');

    if (customersWithoutAdmin.length > 0) {
      console.log(`\nFound customers from companies without admin: ${customersWithoutAdmin}`);

      for (const companyId of customersWithoutAdmin) {
        // その企業の最初のユーザーを取得
        const firstUser = await User.findOne({ companyId: companyId });

        if (firstUser) {
          console.log(`Assigning orphaned customers from ${companyId} to user: ${firstUser._id} (${firstUser.email})`);

          await Customer.updateMany(
            { companyId: companyId, userId: { $exists: false } },
            {
              $set: { userId: firstUser._id.toString() },
              $unset: { companyId: 1 }
            }
          );

          await CallSession.updateMany(
            { companyId: companyId, userId: { $exists: false } },
            {
              $set: { userId: firstUser._id.toString() },
              $unset: { companyId: 1 }
            }
          );
        } else {
          console.log(`No user found for company ${companyId}. Customers will remain unmigrated.`);
        }
      }
    }

    // 4. 移行結果の確認
    const totalCustomers = await Customer.countDocuments();
    const migratedCustomers = await Customer.countDocuments({ userId: { $exists: true } });
    const remainingOldCustomers = await Customer.countDocuments({ companyId: { $exists: true } });

    console.log('\n=== Migration Summary ===');
    console.log(`Total customers: ${totalCustomers}`);
    console.log(`Migrated customers (with userId): ${migratedCustomers}`);
    console.log(`Remaining old format customers (with companyId): ${remainingOldCustomers}`);

    const totalCallSessions = await CallSession.countDocuments();
    const migratedCallSessions = await CallSession.countDocuments({ userId: { $exists: true } });
    const remainingOldCallSessions = await CallSession.countDocuments({ companyId: { $exists: true } });

    console.log(`Total call sessions: ${totalCallSessions}`);
    console.log(`Migrated call sessions (with userId): ${migratedCallSessions}`);
    console.log(`Remaining old format call sessions (with companyId): ${remainingOldCallSessions}`);

    if (remainingOldCustomers === 0 && remainingOldCallSessions === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log('\n⚠️  Some records were not migrated. Please review the logs above.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// 実行確認
if (require.main === module) {
  console.log('Customer Data Migration Script');
  console.log('This will migrate customer and call session data from companyId-based to userId-based.');
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Are you sure you want to proceed? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      rl.close();
      migrateCustomerData().then(() => {
        console.log('Migration script completed.');
        process.exit(0);
      }).catch((error) => {
        console.error('Migration script failed:', error);
        process.exit(1);
      });
    } else {
      console.log('Migration cancelled.');
      rl.close();
      process.exit(0);
    }
  });
}

module.exports = { migrateCustomerData };