require('dotenv').config();
const mongoose = require('mongoose');
const CallSession = require('./models/CallSession');
const Customer = require('./models/Customer');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI is not set'); process.exit(1); }

mongoose.connect(MONGODB_URI)
    .then(async () => {
        const callId = '693644865979ad7006eab117';
        const call = await CallSession.findById(callId).lean();

        if (!call) {
            console.log('Call not found');
            process.exit(0);
        }

        console.log('=== 通話タイムライン分析 ===\n');

        const startTime = new Date(call.startTime);
        const endTime = new Date(call.endTime);
        const transferTime = call.handoffDetails?.requestedAt ? new Date(call.handoffDetails.requestedAt) : null;

        console.log('【メインコール】');
        console.log(`Twilio Call SID: ${call.twilioCallSid}`);
        console.log(`開始時刻: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (UTC: ${startTime.toISOString()})`);
        console.log(`終了時刻: ${endTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (UTC: ${endTime.toISOString()})`);
        console.log(`総通話時間: ${call.duration}秒 (${Math.floor(call.duration / 60)}分${call.duration % 60}秒)`);

        if (transferTime) {
            console.log(`\n【転送情報】`);
            console.log(`転送実行時刻: ${transferTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (UTC: ${transferTime.toISOString()})`);
            console.log(`転送先電話番号: ${call.handoffDetails.handoffPhoneNumber}`);
            console.log(`転送先Call SID: ${call.handoffDetails.handoffCallSid}`);

            const aiHandlingTime = Math.floor((transferTime - startTime) / 1000);
            const postTransferTime = Math.floor((endTime - transferTime) / 1000);

            console.log(`\n【時間内訳】`);
            console.log(`AI対応時間: ${aiHandlingTime}秒 (${Math.floor(aiHandlingTime / 60)}分${aiHandlingTime % 60}秒)`);
            console.log(`転送後の時間: ${postTransferTime}秒 (${Math.floor(postTransferTime / 60)}分${postTransferTime % 60}秒)`);
        }

        // 会話履歴のタイムスタンプ確認
        if (call.transcript && call.transcript.length > 0) {
            console.log(`\n【会話タイムスタンプ】`);
            call.transcript.forEach((t, i) => {
                const timestamp = new Date(t.timestamp);
                console.log(`${i + 1}. ${timestamp.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })} - ${t.speaker}: ${t.message ? t.message.substring(0, 30) : '(なし)'}...`);
            });
        }

        // 転送先の通話を検索
        if (call.handoffDetails?.handoffCallSid) {
            console.log(`\n【転送先通話の検索】`);
            const handoffCall = await CallSession.findOne({
                twilioCallSid: call.handoffDetails.handoffCallSid
            }).lean();

            if (handoffCall) {
                console.log(`転送先通話が見つかりました:`);
                console.log(`  Call ID: ${handoffCall._id}`);
                console.log(`  ステータス: ${handoffCall.status}`);
                console.log(`  通話時間: ${handoffCall.duration ? `${Math.floor(handoffCall.duration / 60)}分${handoffCall.duration % 60}秒` : 'N/A'}`);
                if (handoffCall.startTime && handoffCall.endTime) {
                    console.log(`  開始: ${new Date(handoffCall.startTime).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
                    console.log(`  終了: ${new Date(handoffCall.endTime).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
                }
            } else {
                console.log('注意: 転送先の通話レ��ードが見つかりませんでした。');
                console.log('転送先は別の電話番号（人間の担当者）のため、Twilioの通話ログに別途記録されている可能性があります。');
            }
        }

        console.log(`\n【結論】`);
        console.log(`メインコールは開始から終了まで ${Math.floor(call.duration / 60)}分${call.duration % 60}秒 継続しました。`);
        console.log(`終了理由: ${call.error || call.callResult}`);

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
