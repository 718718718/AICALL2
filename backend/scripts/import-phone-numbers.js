#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const phonePoolService = require('../services/phonePoolService');
const config = require('../config/environment');

async function importNumbers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.database.uri);
    console.log('Connected to MongoDB');
    
    // Import existing Twilio numbers
    console.log('Importing existing Twilio phone numbers...');
    const numbers = await phonePoolService.importExistingNumbers();
    
    console.log(`\nSuccessfully imported ${numbers.length} phone numbers:`);
    numbers.forEach(num => {
      console.log(`  - ${num.phoneNumber} (${num.status})`);
    });
    
    // Get pool statistics
    const stats = await phonePoolService.getPoolStats();
    console.log('\nPhone Pool Statistics:');
    console.log(`  Total Numbers: ${stats.total}`);
    console.log(`  Monthly Cost: $${stats.monthlyFees}`);
    stats.byStatus.forEach(s => {
      console.log(`  ${s._id}: ${s.count} numbers`);
    });
    
  } catch (error) {
    console.error('Error importing phone numbers:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

importNumbers();