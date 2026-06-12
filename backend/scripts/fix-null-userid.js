const mongoose = require('mongoose');
require('dotenv').config();

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ai_call_system';

const CustomerSchema = new mongoose.Schema({
  userId: String,
  companyId: String,
  customer: String,
}, { timestamps: true });

const Customer = mongoose.model('Customer', CustomerSchema);

async function fixNullUserIds() {
  try {
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');

    // null userIdのデータを削除
    const deleteResult = await Customer.deleteMany({
      $or: [
        { userId: null },
        { userId: { $exists: false } },
        { userId: "" }
      ]
    });

    console.log(`\n✅ Deleted ${deleteResult.deletedCount} customers with null userId`);

    // 残りのデータ確認
    const remaining = await Customer.countDocuments();
    console.log(`📊 Remaining customers: ${remaining}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

fixNullUserIds();