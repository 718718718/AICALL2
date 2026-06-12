const fetch = global.fetch || require('node-fetch'); // Fallback if needed, but Node 18+ has fetch
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const CALL_ID = process.argv[2] || '675685a5xxxxx'; // Replace with a valid CallSession ID from your DB

async function simulateConferenceEnd() {
    if (CALL_ID === '675685a5xxxxx') {
        console.error('Please provide a valid Call Session ID as an argument.');
        console.error('Usage: node simulate-conference-end.js <callId>');
        return;
    }

    console.log(`Simulating conference-end event for Call ID: ${CALL_ID}`);
    console.log(`Target URL: ${BASE_URL}/api/twilio/conference/transfer-events/${CALL_ID}`);

    try {
        const response = await fetch(`${BASE_URL}/api/twilio/conference/transfer-events/${CALL_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded', // Twilio usually sends form-urlencoded
            },
            body: new URLSearchParams({
                'StatusCallbackEvent': 'conference-end',
                'ConferenceSid': 'CFmockconference12345',
                'Timestamp': new Date().toISOString()
            })
        });

        const text = await response.text();
        console.log(`Response Status: ${response.status}`);
        console.log(`Response Body: ${text}`);

        if (response.status === 200) {
            console.log('✅ Success! The server accepted the event.');
            console.log('Check your database to see if the CallSession status is now "completed" and duration is set.');
        } else {
            console.log('❌ Failed. Server returned an error.');
        }

    } catch (error) {
        console.error('Error sending request:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('Is the backend server running?');
        }
    }
}

simulateConferenceEnd();
