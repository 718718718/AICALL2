require('dotenv').config();
const mongoose = require('mongoose');
const CallSession = require('./models/CallSession');
const Customer = require('./models/Customer');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI is not set'); process.exit(1); }

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('=== 最新の通話セッション ===\n');

    const latestCall = await CallSession.findOne()
      .sort({ createdAt: -1 })
      .populate('customerId assignedAgent');

    if (!latestCall) {
      console.log('通話セッションが見つかりません');
      process.exit(0);
    }

    console.log('Call ID:', latestCall._id);
    console.log('Status:', latestCall.status);
    console.log('Created:', latestCall.createdAt);
    console.log('Twilio Call SID:', latestCall.twilioCallSid);
    console.log('Customer:', latestCall.customerId?.phoneNumber);
    console.log('Assigned Agent:', latestCall.assignedAgent?.email);
    console.log('\n=== Status History ===');
    if (latestCall.statusHistory && latestCall.statusHistory.length > 0) {
      latestCall.statusHistory.slice(-10).forEach(h => {
        console.log(`${h.timestamp.toISOString()} - ${h.status}`);
      });
    } else {
      console.log('ステータス履歴なし');
    }

    console.log('\n=== Transfer Attempts ===');
    if (latestCall.transferAttempts && latestCall.transferAttempts.length > 0) {
      latestCall.transferAttempts.forEach(t => {
        console.log(`${t.timestamp.toISOString()} - ${t.status}`);
        console.log(`  To: ${t.targetNumber}`);
        if (t.error) console.log(`  Error: ${t.error}`);
      });
    } else {
      console.log('転送試行なし');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
