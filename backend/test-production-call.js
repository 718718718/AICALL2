#!/usr/bin/env node

/**
 * Production Call Test Script
 * 
 * This script tests the actual makeCall functionality with detailed logging
 * to help identify why calls are queued but not connecting.
 */

require('dotenv').config();
const twilioService = require('./services/twilioService');

async function testProductionCall() {
  console.log('🧪 TESTING PRODUCTION CALL');
  console.log('=' .repeat(50));
  
  // Test configuration
  const testPhoneNumber = '09062660207'; // The failing number
  const sessionId = 'test-session-' + Date.now();
  const userId = null; // Test without userId to see what happens
  
  console.log(`📱 Test Phone Number: ${testPhoneNumber}`);
  console.log(`🆔 Session ID: ${sessionId}`);
  console.log(`👤 User ID: ${userId || 'null (testing without user)'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 BASE_URL: ${process.env.BASE_URL || 'NOT SET'}`);
  
  try {
    console.log('\n🚀 Attempting to make call...');
    
    const result = await twilioService.makeCall(testPhoneNumber, sessionId, userId);
    
    console.log('\n✅ CALL RESULT:');
    console.log('Status:', result.status);
    console.log('SID:', result.sid);
    console.log('To:', result.to);
    console.log('From:', result.from);
    
    if (result.status === 'simulated') {
      console.log('\n⚠️ This was a simulated call (Twilio not configured)');
    } else {
      console.log('\n🎉 Real call initiated successfully!');
      console.log('Call details:', JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.log('\n❌ CALL FAILED:');
    console.log('Error Message:', error.message);
    
    if (error.code) {
      console.log('Twilio Error Code:', error.code);
      
      // Provide specific guidance based on error code
      switch (error.code) {
        case 21215:
          console.log('📋 ISSUE: Account not authorized to make calls to this number');
          console.log('💡 SOLUTION: Check if your Twilio account has international calling enabled');
          console.log('💡 SOLUTION: Verify the target country is allowed in your account settings');
          break;
          
        case 21219:
          console.log('📋 ISSUE: Invalid phone number format');
          console.log('💡 SOLUTION: Ensure phone number is in E.164 format (+819062660207)');
          break;
          
        case 21220:
          console.log('📋 ISSUE: Invalid phone number');
          console.log('💡 SOLUTION: This number may not exist or be reachable');
          break;
          
        case 13224:
          console.log('📋 ISSUE: Rate limit exceeded');
          console.log('💡 SOLUTION: Too many requests - wait before trying again');
          break;
          
        case 20003:
          console.log('📋 ISSUE: Authentication error');
          console.log('💡 SOLUTION: Check your Twilio Account SID and Auth Token');
          break;
          
        default:
          console.log(`📋 ISSUE: Unknown Twilio error code ${error.code}`);
          console.log('💡 SOLUTION: Check Twilio documentation for error code details');
      }
    }
    
    if (error.status) {
      console.log('HTTP Status:', error.status);
    }
    
    if (error.details) {
      console.log('Error Details:', error.details);
    }
    
    console.log('\nFull Error:', error);
  }
  
  console.log('\n🔍 DEBUGGING RECOMMENDATIONS:');
  console.log('1. Check if Twilio credentials are correctly set in production');
  console.log('2. Verify international calling is enabled on your Twilio account');
  console.log('3. Test with a different phone number (preferably your own)');
  console.log('4. Check Twilio Console logs for detailed error information');
  console.log('5. Ensure your Render deployment has the correct environment variables');
  console.log('6. Verify webhook URLs are accessible from Twilio servers');
}

// Run the test
testProductionCall().catch(console.error);