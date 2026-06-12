#!/usr/bin/env node

const twilio = require('twilio');
const config = require('../config/environment');

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

async function updateWebhooks() {
  try {
    const phoneNumbers = await client.incomingPhoneNumbers.list();
    
    for (const number of phoneNumbers) {
      const updates = {
        voiceUrl: `${config.twilio.webhookBaseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${config.twilio.webhookBaseUrl}/api/twilio/call/status`,
        statusCallbackMethod: 'POST',
      };
      
      if (number.phoneNumber === config.twilio.phoneNumber) {
        console.log(`Updating webhooks for ${config.env} environment: ${number.phoneNumber}`);
        
        await client.incomingPhoneNumbers(number.sid).update(updates);
        
        console.log('Updated webhook URLs:');
        console.log(`  Voice URL: ${updates.voiceUrl}`);
        console.log(`  Status Callback: ${updates.statusCallback}`);
      } else {
        console.log(`Skipping ${number.phoneNumber} (not configured for ${config.env})`);
      }
    }
    
    console.log('\nWebhook update completed successfully!');
  } catch (error) {
    console.error('Error updating webhooks:', error);
    process.exit(1);
  }
}

updateWebhooks();