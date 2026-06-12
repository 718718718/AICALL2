const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/ai-call-system').then(async () => {
  const db = mongoose.connection.db;
  
  // 定義されているステータス
  const validStatus = ['initiating', 'calling', 'initiated', 'ai-responding', 'transferring', 'human-connected', 'completed', 'failed', 'cancelled', 'in-progress', 'queued'];
  const validCallResult = ['成功', '不在', '拒否', '要フォロー', '失敗'];
  
  // CallSessionのステータスを集計
  const statusStats = await db.collection('callsessions').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('=== 現在のstatus値の分布 ===');
  console.log('定義済み:', validStatus.join(', '));
  console.log('\n実際のデータ:');
  statusStats.forEach(s => {
    const isValid = validStatus.includes(s._id) || !s._id;
    console.log(`${s._id || 'null'}: ${s.count}件 ${!isValid ? '⚠️ 未定義' : ''}`);
  });
  
  // callResultの集計
  const resultStats = await db.collection('callsessions').aggregate([
    { $group: { _id: '$callResult', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('\n=== 現在のcallResult値の分布 ===');
  console.log('定義済み:', validCallResult.join(', '));
  console.log('\n実際のデータ:');
  resultStats.forEach(r => {
    const isValid = validCallResult.includes(r._id) || !r._id;
    console.log(`${r._id || 'null'}: ${r.count}件 ${!isValid ? '⚠️ 未定義' : ''}`);
  });
  
  // 不正なステータスを持つレコードを検索
  const invalidStatusRecords = await db.collection('callsessions').find({
    status: { $nin: [...validStatus, null] }
  }).limit(5).toArray();
  
  if (invalidStatusRecords.length > 0) {
    console.log('\n=== 不正なstatus値を持つレコード例 ===');
    invalidStatusRecords.forEach(record => {
      console.log(`ID: ${record._id}, status: ${record.status}, createdAt: ${record.createdAt}`);
    });
  }
  
  // 不正なcallResultを持つレコードを検索
  const invalidResultRecords = await db.collection('callsessions').find({
    callResult: { $nin: [...validCallResult, null] }
  }).limit(5).toArray();
  
  if (invalidResultRecords.length > 0) {
    console.log('\n=== 不正なcallResult値を持つレコード例 ===');
    invalidResultRecords.forEach(record => {
      console.log(`ID: ${record._id}, callResult: ${record.callResult}, createdAt: ${record.createdAt}`);
    });
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
