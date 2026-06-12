const mongoose = require('mongoose');
const PhonePool = require('./models/PhonePool');
require('dotenv').config();

async function seedPhoneNumbers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // テスト用の電話番号を追加
    const testNumbers = [
      {
        phoneNumber: '+1555-123-4567',
        twilioSid: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX1',
        friendlyName: 'Test Number 1',
        capabilities: {
          voice: true,
          sms: true,
          mms: false,
          fax: false
        },
        status: 'available'
      },
      {
        phoneNumber: '+1555-123-4568',
        twilioSid: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX2',
        friendlyName: 'Test Number 2',
        capabilities: {
          voice: true,
          sms: false,
          mms: false,
          fax: false
        },
        status: 'available'
      },
      {
        phoneNumber: '+1555-123-4569',
        twilioSid: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX3',
        friendlyName: 'Test Number 3',
        capabilities: {
          voice: true,
          sms: true,
          mms: true,
          fax: false
        },
        status: 'available'
      }
    ];
    
    for (const numberData of testNumbers) {
      const existing = await PhonePool.findOne({ phoneNumber: numberData.phoneNumber });
      if (!existing) {
        const phoneNumber = new PhonePool(numberData);
        await phoneNumber.save();
        console.log('Added test number:', numberData.phoneNumber);
      } else {
        console.log('Number already exists:', numberData.phoneNumber);
      }
    }
    
    const count = await PhonePool.countDocuments();
    console.log('Total PhonePool documents:', count);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seedPhoneNumbers();