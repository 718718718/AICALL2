const mongoose = require('mongoose');

// 定義されている有効な値
const VALID_STATUS = [
  'initiating', 'calling', 'initiated', 'ai-responding', 
  'transferring', 'human-connected', 'completed', 
  'failed', 'cancelled', 'in-progress', 'queued'
];

const VALID_CALL_RESULT = ['成功', '不在', '担当者不在', '拒否', '要フォロー', '失敗', '通話中'];

async function cleanInvalidStatus() {
  try {
    console.log('🧹 Starting status cleanup...');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-call-system');
    const db = mongoose.connection.db;
    
    // 1. 現在の不正な値を確認
    console.log('\n📊 Current invalid status distribution:');
    
    const invalidStatusRecords = await db.collection('callsessions').find({
      status: { $nin: [...VALID_STATUS, null] }
    }).toArray();
    
    const invalidResultRecords = await db.collection('callsessions').find({
      callResult: { $nin: [...VALID_CALL_RESULT, null] }
    }).toArray();
    
    console.log(`Invalid status records: ${invalidStatusRecords.length}`);
    console.log(`Invalid callResult records: ${invalidResultRecords.length}`);
    
    if (invalidStatusRecords.length > 0) {
      console.log('\nInvalid status values found:');
      const statusCounts = {};
      invalidStatusRecords.forEach(record => {
        statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
      });
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  - "${status}": ${count} records`);
      });
    }
    
    if (invalidResultRecords.length > 0) {
      console.log('\nInvalid callResult values found:');
      const resultCounts = {};
      invalidResultRecords.forEach(record => {
        resultCounts[record.callResult] = (resultCounts[record.callResult] || 0) + 1;
      });
      Object.entries(resultCounts).forEach(([result, count]) => {
        console.log(`  - "${result}": ${count} records`);
      });
    }
    
    // 2. 不正なstatus値を修正
    if (invalidStatusRecords.length > 0) {
      console.log('\n🔧 Fixing invalid status values...');
      
      const statusUpdateResult = await db.collection('callsessions').updateMany(
        { status: { $nin: [...VALID_STATUS, null] } },
        { $set: { status: 'failed' } }
      );
      
      console.log(`✅ Fixed ${statusUpdateResult.modifiedCount} records with invalid status`);
    }
    
    // 3. 不正なcallResult値を修正
    if (invalidResultRecords.length > 0) {
      console.log('\n🔧 Fixing invalid callResult values...');
      
      const resultUpdateResult = await db.collection('callsessions').updateMany(
        { callResult: { $nin: [...VALID_CALL_RESULT, null] } },
        { $unset: { callResult: 1 } }
      );
      
      console.log(`✅ Fixed ${resultUpdateResult.modifiedCount} records with invalid callResult`);
    }
    
    // 4. 修正後の確認
    console.log('\n📋 Post-cleanup verification:');
    
    const remainingInvalidStatus = await db.collection('callsessions').countDocuments({
      status: { $nin: [...VALID_STATUS, null] }
    });
    
    const remainingInvalidResult = await db.collection('callsessions').countDocuments({
      callResult: { $nin: [...VALID_CALL_RESULT, null] }
    });
    
    console.log(`Remaining invalid status records: ${remainingInvalidStatus}`);
    console.log(`Remaining invalid callResult records: ${remainingInvalidResult}`);
    
    if (remainingInvalidStatus === 0 && remainingInvalidResult === 0) {
      console.log('\n🎉 All invalid status values have been successfully cleaned up!');
    } else {
      console.log('\n⚠️  Some invalid values still remain. Please check manually.');
    }
    
    // 5. 最終確認のためのサマリー表示
    console.log('\n📊 Final status distribution:');
    const finalStatusStats = await db.collection('callsessions').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    finalStatusStats.forEach(stat => {
      const isValid = VALID_STATUS.includes(stat._id) || !stat._id;
      console.log(`  ${stat._id || 'null'}: ${stat.count} ${!isValid ? '⚠️' : '✅'}`);
    });
    
    console.log('\n📊 Final callResult distribution:');
    const finalResultStats = await db.collection('callsessions').aggregate([
      { $group: { _id: '$callResult', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    finalResultStats.forEach(stat => {
      const isValid = VALID_CALL_RESULT.includes(stat._id) || !stat._id;
      console.log(`  ${stat._id || 'null'}: ${stat.count} ${!isValid ? '⚠️' : '✅'}`);
    });
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database connection closed.');
    process.exit(0);
  }
}

// スクリプト実行
if (require.main === module) {
  cleanInvalidStatus();
}

module.exports = { cleanInvalidStatus, VALID_STATUS, VALID_CALL_RESULT };