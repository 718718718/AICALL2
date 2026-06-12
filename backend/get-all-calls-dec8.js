require('dotenv').config();
const twilio = require('twilio');
const fs = require('fs');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);

async function getAllCallsOnDate() {
    try {
        console.log('Fetching all calls on 2025-12-08...\n');

        // 12/8 12:00 - 14:00 JST = 12/8 03:00 - 05:00 UTC
        const startTime = new Date('2025-12-08T03:00:00Z');
        const endTime = new Date('2025-12-08T05:00:00Z');

        const calls = await client.calls.list({
            startTimeAfter: startTime,
            startTimeBefore: endTime,
            limit: 100
        });

        console.log(`Found ${calls.length} calls\n`);

        const callData = calls.map(call => ({
            sid: call.sid,
            from: call.from,
            to: call.to,
            status: call.status,
            startTime: call.startTime,
            endTime: call.endTime,
            duration: call.duration,
            price: call.price,
            direction: call.direction,
            parentCallSid: call.parentCallSid
        }));

        // 電話番号でフィルタリング（090-7481-0973関連）
        const targetCalls = callData.filter(call =>
            call.to === '+819074810973' ||
            call.from === '+819074810973' ||
            call.to === '+819080974503' ||
            call.from === '+819080974503'
        );

        console.log(`Calls related to target numbers: ${targetCalls.length}\n`);

        targetCalls.forEach((call, i) => {
            console.log(`[${i + 1}] ==================`);
            console.log(`SID: ${call.sid}`);
            console.log(`From: ${call.from} → To: ${call.to}`);
            console.log(`Start: ${call.startTime ? new Date(call.startTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : 'N/A'}`);
            console.log(`End: ${call.endTime ? new Date(call.endTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : 'N/A'}`);
            console.log(`Duration: ${call.duration}秒 (${Math.floor(call.duration / 60)}分${call.duration % 60}秒)`);
            console.log(`Status: ${call.status}`);
            console.log(`Price: ${call.price} JPY`);
            console.log(`Direction: ${call.direction}`);
            console.log(`Parent Call: ${call.parentCallSid || 'None'}`);
            console.log('');
        });

        fs.writeFileSync('all-calls-dec8.json', JSON.stringify(targetCalls, null, 2), 'utf8');
        console.log('\nData saved to all-calls-dec8.json');

        // 合計通話時間と料金を計算
        const totalDuration = targetCalls.reduce((sum, call) => sum + (call.duration || 0), 0);
        const totalPrice = targetCalls.reduce((sum, call) => sum + parseFloat(call.price || 0), 0);

        console.log(`\n=== SUMMARY ===`);
        console.log(`Total calls: ${targetCalls.length}`);
        console.log(`Total duration: ${totalDuration}秒 (${Math.floor(totalDuration / 60)}分${totalDuration % 60}秒)`);
        console.log(`Total price: ${totalPrice.toFixed(2)} JPY`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

getAllCallsOnDate();
