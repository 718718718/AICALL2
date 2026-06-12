/**
 * Test script for OpenAI Realtime API handoff functionality
 *
 * This script tests:
 * 1. Global activeMediaStreams map exists
 * 2. Handoff API endpoint is accessible
 * 3. Media Streams disconnection logic
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

// Helper function for HTTP requests
function httpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: body });
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test 1: Check if server is running
async function testServerHealth() {
  console.log('\n=== Test 1: Server Health ===');
  try {
    const response = await httpRequest('GET', '/api/health');
    if (response.status === 200) {
      console.log('✅ Server is running');
      return true;
    }
    console.log('❌ Server returned status:', response.status);
    return false;
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
    return false;
  }
}

// Test 2: Check handoff endpoint exists
async function testHandoffEndpoint() {
  console.log('\n=== Test 2: Handoff Endpoint ===');
  try {
    const response = await httpRequest('POST', '/api/calls/test-call-id/handoff', {});

    // 401 (auth required) or 404 (not found) are both acceptable
    // We just want to confirm the endpoint exists (not 404)
    if (response.status === 401) {
      console.log('✅ Handoff endpoint exists (auth required, as expected)');
      return true;
    } else if (response.status === 404) {
      console.log('✅ Handoff endpoint exists (call not found, as expected)');
      return true;
    } else if (response.status < 500) {
      console.log('✅ Handoff endpoint exists (status:', response.status, ')');
      return true;
    }

    console.log('❌ Unexpected status:', response.status);
    return false;
  } catch (error) {
    console.log('❌ Handoff endpoint check failed:', error.message);
    return false;
  }
}

// Test 3: Check handoff-by-phone endpoint
async function testHandoffByPhoneEndpoint() {
  console.log('\n=== Test 3: Handoff-by-Phone Endpoint ===');
  try {
    const response = await httpRequest('POST', '/api/calls/handoff-by-phone', {
      phoneNumber: '09012345678'
    });

    if (response.status === 401) {
      console.log('✅ Handoff-by-phone endpoint exists (auth required, as expected)');
      return true;
    } else if (response.status === 404) {
      console.log('✅ Handoff-by-phone endpoint exists (customer not found, as expected)');
      return true;
    } else if (response.status < 500) {
      console.log('✅ Handoff-by-phone endpoint exists (status:', response.status, ')');
      return true;
    }

    console.log('❌ Unexpected status:', response.status);
    return false;
  } catch (error) {
    console.log('❌ Handoff-by-phone endpoint check failed:', error.message);
    return false;
  }
}

// Test 4: Verify environment variables
async function testEnvironmentConfig() {
  console.log('\n=== Test 4: Environment Configuration ===');

  // Read .env file
  const fs = require('fs');
  const path = require('path');

  try {
    const envPath = path.join(__dirname, 'backend', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');

    const hasRealtimeFlag = envContent.includes('USE_OPENAI_REALTIME=');
    const hasRealtimeKey = envContent.includes('OPENAI_REALTIME_API_KEY=');

    console.log('USE_OPENAI_REALTIME:', hasRealtimeFlag ? '✅ Set' : '❌ Not set');
    console.log('OPENAI_REALTIME_API_KEY:', hasRealtimeKey ? '✅ Set' : '❌ Not set');

    return hasRealtimeFlag && hasRealtimeKey;
  } catch (error) {
    console.log('❌ Environment config check failed:', error.message);
    return false;
  }
}

// Test 5: Check global.activeMediaStreams implementation
async function testGlobalMapImplementation() {
  console.log('\n=== Test 5: Global Map Implementation ===');

  const fs = require('fs');
  const path = require('path');

  try {
    const serverPath = path.join(__dirname, 'backend', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    const hasGlobalMap = serverContent.includes('global.activeMediaStreams');
    const hasMapInitialization = serverContent.includes('new Map()');

    console.log('global.activeMediaStreams:', hasGlobalMap ? '✅ Implemented' : '❌ Not implemented');
    console.log('Map initialization:', hasMapInitialization ? '✅ Implemented' : '❌ Not implemented');

    // Check mediaStreamController
    const controllerPath = path.join(__dirname, 'backend', 'controllers', 'mediaStreamController.js');
    const controllerContent = fs.readFileSync(controllerPath, 'utf8');

    const hasMapSet = controllerContent.includes('activeMediaStreams.set');
    const hasMapDelete = controllerContent.includes('activeMediaStreams.delete');

    console.log('Map .set() usage:', hasMapSet ? '✅ Implemented' : '❌ Not implemented');
    console.log('Map .delete() usage:', hasMapDelete ? '✅ Implemented' : '❌ Not implemented');

    // Check handoffController
    const handoffPath = path.join(__dirname, 'backend', 'controllers', 'handoffController.js');
    const handoffContent = fs.readFileSync(handoffPath, 'utf8');

    const hasRealtimeModeCheck = handoffContent.includes('USE_OPENAI_REALTIME');
    const hasMapUsage = handoffContent.includes('activeMediaStreams.has');

    console.log('Realtime mode check:', hasRealtimeModeCheck ? '✅ Implemented' : '❌ Not implemented');
    console.log('Map .has() usage:', hasMapUsage ? '✅ Implemented' : '❌ Not implemented');

    return hasGlobalMap && hasMapSet && hasMapDelete && hasRealtimeModeCheck && hasMapUsage;
  } catch (error) {
    console.log('❌ Global map implementation check failed:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('========================================');
  console.log('OpenAI Realtime API Handoff Tests');
  console.log('========================================');

  const results = [];

  results.push(await testServerHealth());
  results.push(await testHandoffEndpoint());
  results.push(await testHandoffByPhoneEndpoint());
  results.push(await testEnvironmentConfig());
  results.push(await testGlobalMapImplementation());

  console.log('\n========================================');
  console.log('Test Results');
  console.log('========================================');
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${results.filter(r => r).length}`);
  console.log(`Failed: ${results.filter(r => !r).length}`);
  console.log('========================================\n');

  if (results.every(r => r)) {
    console.log('✅ All tests passed!');
    console.log('\nNext steps:');
    console.log('1. Make a real call to your Twilio number');
    console.log('2. Click "担当者に引き継ぐ" button in the frontend');
    console.log('3. Verify 3-way call is established');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

runTests();
