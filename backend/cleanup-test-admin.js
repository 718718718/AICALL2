/**
 * テスト用 admin アカウント削除スクリプト
 * テスト完了後に実行してデータベースをクリーンに保つ
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const mongoose = require('mongoose');
const User = require('./models/User');
const Customer = require('./models/Customer');

const TEST_EMAIL = 'testlin@testing.com';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // テスト admin 削除
    const result = await User.deleteOne({ email: TEST_EMAIL });
    console.log('🗑  テスト admin 削除:', result.deletedCount, '件');

    // テスト用に作った Customer も削除（description で識別）
    try {
      const customerResult = await Customer.deleteMany({
        notes: { $regex: 'TEST_CLEANUP', $options: 'i' }
      });
      console.log('🗑  テスト顧客削除:', customerResult.deletedCount, '件');
    } catch (e) {
      console.log('ℹ  テスト顧客の削除はスキップ（モデル未取得）');
    }

    console.log('\n✅ クリーンアップ完了');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
