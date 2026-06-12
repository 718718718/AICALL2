require('dotenv').config();
const mongoose = require('mongoose');
const CallSession = require('./models/CallSession');
const Customer = require('./models/Customer');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI is not set'); process.exit(1); }

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('=== 通話履歴検索 ===\n');
        console.log('検索条件:');
        console.log('- 電話番号: 090-7481-0973');
        console.log('- 日時: 2025-12-08 12:22 ～ 13:25 (JST)');
        console.log('');

        // JSTをUTCに変換 (JST = UTC+9)
        const startDate = new Date('2025-12-08T12:22:00+09:00');
        const endDate = new Date('2025-12-08T13:25:00+09:00');

        console.log('UTC範囲:', startDate.toISOString(), '～', endDate.toISOString());
        console.log('');

        const calls = await CallSession.find({
            $or: [
                { phoneNumber: '090-7481-0973' },
                { phoneNumber: '+819074810973' },
                { phoneNumber: '09074810973' },
                { phoneNumber: '81907481097' }
            ],
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        })
            .populate('customerId')
            .populate('assignedAgent', 'firstName lastName email')
            .sort({ createdAt: 1 })
            .lean();

        if (calls.length === 0) {
            console.log('該当する通話履歴が見つかりませんでした。');
            console.log('\n全期間で同じ電話番号を検索します...\n');

            const allCalls = await CallSession.find({
                $or: [
                    { phoneNumber: '090-7481-0973' },
                    { phoneNumber: '+819074810973' },
                    { phoneNumber: '09074810973' },
                    { phoneNumber: '81907481097' }
                ]
            })
                .populate('customerId')
                .populate('assignedAgent', 'firstName lastName email')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            console.log(`見つかった通話: ${allCalls.length}件\n`);
            allCalls.forEach((call, index) => {
                console.log(`\n[${index + 1}] Call ID: ${call._id}`);
                console.log(`作成日時: ${new Date(call.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
                console.log(`電話番号: ${call.phoneNumber}`);
                console.log(`ステータス: ${call.status}`);
                console.log(`結果: ${call.callResult || 'N/A'}`);
                console.log(`通話時間: ${call.duration ? `${Math.floor(call.duration / 60)}分${call.duration % 60}秒` : 'N/A'}`);
                if (call.customerId) {
                    console.log(`顧客: ${call.customerId.customer || 'N/A'}`);
                }
            });
        } else {
            console.log(`見つかった通話: ${calls.length}件\n`);

            calls.forEach((call, index) => {
                console.log(`\n[${index + 1}] ==================`);
                console.log(`Call ID: ${call._id}`);
                console.log(`作成日時: ${new Date(call.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
                console.log(`電話番号: ${call.phoneNumber}`);
                console.log(`ステータス: ${call.status}`);
                console.log(`結果: ${call.callResult || 'N/A'}`);
                console.log(`通話時間: ${call.duration ? `${Math.floor(call.duration / 60)}分${call.duration % 60}秒` : 'N/A'}`);
                console.log(`Twilio Call SID: ${call.twilioCallSid || 'N/A'}`);

                if (call.customerId) {
                    console.log(`\n[顧客情報]`);
                    console.log(`  名前: ${call.customerId.customer || 'N/A'}`);
                    console.log(`  会社: ${call.customerId.company || 'N/A'}`);
                    console.log(`  電話: ${call.customerId.phone || 'N/A'}`);
                }

                if (call.assignedAgent) {
                    console.log(`\n[担当エージェント]`);
                    console.log(`  名前: ${call.assignedAgent.firstName} ${call.assignedAgent.lastName}`);
                    console.log(`  Email: ${call.assignedAgent.email}`);
                }

                if (call.transcript && call.transcript.length > 0) {
                    console.log(`\n[文字起こし] (${call.transcript.length}件)`);
                    call.transcript.slice(0, 5).forEach(t => {
                        console.log(`  ${t.timestamp ? new Date(t.timestamp).toLocaleTimeString('ja-JP') : 'N/A'} [${t.speaker}]: ${t.text}`);
                    });
                    if (call.transcript.length > 5) {
                        console.log(`  ... 他 ${call.transcript.length - 5}件`);
                    }
                }
            });
        }

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
