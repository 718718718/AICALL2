require('dotenv').config();
const mongoose = require('mongoose');
// Node 18+ has native fetch
const fetch = global.fetch;

// 設定
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function runTest() {
    console.log('=== Call Duration Fix Verification Test ===');

    if (!fetch) {
        console.error('Error: This script requires Node.js 18+ with native fetch support.');
        process.exit(1);
    }

    // 1. DB接続
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('Error: MONGODB_URI not found in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }

    let testSessionId = null;

    try {
        // 2. テスト用データの作成
        // 10分前に開始されたことにして、Conference中の状態を作成
        const startTime = new Date(Date.now() - 10 * 60 * 1000);
        const CallSession = require('./models/CallSession');

        // ユーザーIDが必要な場合があるのでダミーを用意（スキーマ依存によるが、今回は必須ではないと仮定、またはランダムID）
        const dummyUserId = new mongoose.Types.ObjectId();

        const testSession = new CallSession({
            status: 'transferring', // 転送中
            startTime: startTime,
            userId: dummyUserId,
            // バグの発生条件: handoffDetails.conferenceName が存在する
            handoffDetails: {
                conferenceName: 'test-verification-conference',
                requestedAt: startTime,
                handoffMethod: 'manual'
            },
            // 必須フィールドを適当に埋める
            callerName: 'Test Verify',
            phoneNumber: '09012345678'
        });

        const savedSession = await testSession.save();
        testSessionId = savedSession._id.toString();
        console.log(`\n1. Created test CallSession: ${testSessionId}`);
        console.log(`   Initial Status: ${savedSession.status}`);
        console.log(`   Start Time: ${savedSession.startTime.toISOString()}`);

        // 3. Webhookリクエストの送信
        console.log('\n2. Sending mock conference-end event to server...');
        const webhookUrl = `${BASE_URL}/api/twilio/conference/transfer-events/${testSessionId}`;

        // x-www-form-urlencoded形式で送信 (Twilioのデフォルト)
        const params = new URLSearchParams();
        params.append('StatusCallbackEvent', 'conference-end');
        params.append('ConferenceSid', 'CF_TEST_MOCK');
        params.append('Timestamp', new Date().toISOString());

        console.log(`   Target: ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.status !== 200) {
            const text = await response.text();
            throw new Error(`Webhook request failed with status ${response.status}: ${text}`);
        }
        console.log('   Webhook request sent successfully (200 OK)');

        // 4. 結果の検証
        // DB反映までのわずかなラグを考慮
        await new Promise(resolve => setTimeout(resolve, 1000));

        const updatedSession = await CallSession.findById(testSessionId);
        console.log('\n3. Verifying updated CallSession...');
        console.log(`   Current Status: ${updatedSession.status}`);
        console.log(`   Duration: ${updatedSession.duration} seconds`);
        console.log(`   CallResult: ${updatedSession.callResult}`);

        let success = true;

        // ステータスチェック
        if (updatedSession.status !== 'completed') {
            console.error('   ❌ FAIL: Status should be "completed"');
            success = false;
        } else {
            console.log('   ✅ PASS: Status converted to "completed"');
        }

        // Durationチェック (10分 = 600秒 前後であること)
        // 処理時間を含めて多少の誤差(±5秒)を許容
        if (updatedSession.duration >= 595 && updatedSession.duration <= 605) {
            console.log(`   ✅ PASS: Duration is correctly calculated (${updatedSession.duration}s, expected ~600s)`);
        } else {
            console.error(`   ❌ FAIL: Unexpected duration: ${updatedSession.duration}s (Expected ~600s)`);
            success = false;
        }

        if (success) {
            console.log('\n✨ TEST PASSED: The bug fix is working correctly!');
        } else {
            console.error('\n💀 TEST FAILED: Verification failed.');
        }

    } catch (error) {
        console.error('\n❌ Error during test execution:', error);
        if (error.cause && error.cause.code === 'ECONNREFUSED') {
            console.error('   Hint: Ensure the backend server is running on ' + BASE_URL);
        } else if (error.code === 'ECONNREFUSED') {
            console.error('   Hint: Ensure the backend server is running on ' + BASE_URL);
        }
    } finally {
        // 5. クリーンアップ
        if (testSessionId) {
            // CallSessionは削除
            const CallSession = require('./models/CallSession');
            await CallSession.findByIdAndDelete(testSessionId);
            console.log(`\n4. Cleanup: Deleted test session ${testSessionId}`);
        }
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

runTest();
