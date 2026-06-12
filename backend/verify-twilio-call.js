require('dotenv').config();
const twilio = require('twilio');
const fs = require('fs');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
    console.error('Error: Twilio credentials not found in .env');
    process.exit(1);
}

const client = twilio(accountSid, authToken);

async function getCallDetails() {
    try {
        const result = {
            accountSid: accountSid,
            mainCall: null,
            handoffCall: null,
            recordings: [],
            analysis: {}
        };

        // メインコール
        const mainCallSid = 'CAfd2a882d1ecf3f0ed13bd6ebfbe27c26';
        const mainCall = await client.calls(mainCallSid).fetch();

        result.mainCall = {
            sid: mainCall.sid,
            from: mainCall.from,
            to: mainCall.to,
            status: mainCall.status,
            direction: mainCall.direction,
            startTime: mainCall.startTime,
            endTime: mainCall.endTime,
            duration: mainCall.duration,
            price: mainCall.price,
            priceUnit: mainCall.priceUnit,
            answeredBy: mainCall.answeredBy
        };

        // 転送先コール
        const handoffCallSid = 'CA6b86d558d1edc5ed78ea48aaa22464f1';
        try {
            const handoffCall = await client.calls(handoffCallSid).fetch();
            result.handoffCall = {
                sid: handoffCall.sid,
                from: handoffCall.from,
                to: handoffCall.to,
                status: handoffCall.status,
                direction: handoffCall.direction,
                startTime: handoffCall.startTime,
                endTime: handoffCall.endTime,
                duration: handoffCall.duration,
                price: handoffCall.price,
                priceUnit: handoffCall.priceUnit,
                answeredBy: handoffCall.answeredBy,
                parentCallSid: handoffCall.parentCallSid
            };
        } catch (error) {
            result.handoffCall = { error: error.message };
        }

        // 録音
        const recordings = await client.recordings.list({ callSid: mainCallSid, limit: 10 });
        result.recordings = recordings.map(r => ({
            sid: r.sid,
            duration: r.duration,
            dateCreated: r.dateCreated,
            url: `https://api.twilio.com${r.uri.replace('.json', '.mp3')}`
        }));

        // 分析
        if (mainCall.startTime && result.handoffCall?.startTime && result.handoffCall?.duration) {
            const transferDelay = (new Date(result.handoffCall.startTime) - new Date(mainCall.startTime)) / 1000;
            result.analysis = {
                transferDelaySeconds: Math.floor(transferDelay),
                handoffDurationSeconds: result.handoffCall.duration,
                totalDurationSeconds: mainCall.duration,
                mainCallDurationMinutes: `${Math.floor(mainCall.duration / 60)}分${mainCall.duration % 60}秒`,
                handoffDurationMinutes: result.handoffCall.duration ? `${Math.floor(result.handoffCall.duration / 60)}分${result.handoffCall.duration % 60}秒` : 'N/A'
            };
        }

        fs.writeFileSync('twilio-call-data.json', JSON.stringify(result, null, 2), 'utf8');
        console.log('Twilio call data saved to twilio-call-data.json');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

getCallDetails();
