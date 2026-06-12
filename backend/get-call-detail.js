require('dotenv').config();
const mongoose = require('mongoose');
const CallSession = require('./models/CallSession');
const Customer = require('./models/Customer');
const User = require('./models/User');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI is not set'); process.exit(1); }

mongoose.connect(MONGODB_URI)
    .then(async () => {
        const callId = '693644865979ad7006eab117';

        const call = await CallSession.findById(callId)
            .populate('customerId')
            .populate('assignedAgent', 'firstName lastName email')
            .lean();

        if (!call) {
            console.log(JSON.stringify({ error: 'Call not found' }));
            process.exit(0);
        }

        // JSON形式で保存
        fs.writeFileSync('call-detail.json', JSON.stringify(call, null, 2), 'utf8');
        console.log('Call detail saved to call-detail.json');

        // 会話履歴のみを別ファイルに抽出
        if (call.transcript && call.transcript.length > 0) {
            const transcript = call.transcript.map((item, index) => ({
                index: index + 1,
                timestamp: item.timestamp,
                speaker: item.speaker,
                text: item.text
            }));

            fs.writeFileSync('transcript.json', JSON.stringify(transcript, null, 2), 'utf8');
            console.log(`Transcript saved to transcript.json (${transcript.length} messages)`);
        }

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
