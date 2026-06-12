const PhonePool = require('../models/PhonePool');
const config = require('../config/environment');
const twilio = require('twilio');

class PhonePoolService {
  constructor() {
    if (config.twilio.accountSid && config.twilio.authToken) {
      this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
    }
  }
  
  /**
   * Purchase a new phone number from Twilio and add to pool
   */
  async purchaseNewNumber(areaCode = '607', capabilities = { voice: true }) {
    if (!this.twilioClient) {
      throw new Error('Twilio client not configured');
    }
    
    try {
      // Search for available numbers
      const availableNumbers = await this.twilioClient.availablePhoneNumbers('US')
        .local
        .list({
          areaCode,
          voiceEnabled: capabilities.voice,
          smsEnabled: capabilities.sms || false,
          limit: 1,
        });
      
      if (availableNumbers.length === 0) {
        throw new Error(`No available numbers found for area code ${areaCode}`);
      }
      
      // Purchase the first available number
      const numberToPurchase = availableNumbers[0];
      const purchasedNumber = await this.twilioClient.incomingPhoneNumbers.create({
        phoneNumber: numberToPurchase.phoneNumber,
        voiceUrl: `${config.twilio.webhookBaseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${config.twilio.webhookBaseUrl}/api/twilio/call/status`,
        statusCallbackMethod: 'POST',
      });
      
      // Add to our phone pool
      const phonePoolEntry = new PhonePool({
        phoneNumber: purchasedNumber.phoneNumber,
        twilioSid: purchasedNumber.sid,
        friendlyName: purchasedNumber.friendlyName,
        capabilities: {
          voice: purchasedNumber.capabilities.voice,
          sms: purchasedNumber.capabilities.sms,
          mms: purchasedNumber.capabilities.mms,
          fax: purchasedNumber.capabilities.fax,
        },
        status: 'available',
      });
      
      await phonePoolEntry.save();
      
      console.log(`Successfully purchased and added number: ${purchasedNumber.phoneNumber}`);
      return phonePoolEntry;
    } catch (error) {
      console.error('Error purchasing phone number:', error);
      throw error;
    }
  }
  
  /**
   * Import existing Twilio numbers into the pool
   */
  async importExistingNumbers() {
    if (!this.twilioClient) {
      throw new Error('Twilio client not configured');
    }
    
    try {
      const existingNumbers = await this.twilioClient.incomingPhoneNumbers.list();
      
      for (const number of existingNumbers) {
        // Check if already in pool
        const existing = await PhonePool.findOne({ phoneNumber: number.phoneNumber });
        
        if (!existing) {
          const phonePoolEntry = new PhonePool({
            phoneNumber: number.phoneNumber,
            twilioSid: number.sid,
            friendlyName: number.friendlyName,
            capabilities: {
              voice: number.capabilities.voice,
              sms: number.capabilities.sms,
              mms: number.capabilities.mms,
              fax: number.capabilities.fax,
            },
            status: 'available',
          });
          
          await phonePoolEntry.save();
          console.log(`Imported existing number: ${number.phoneNumber}`);
        }
      }
      
      return await PhonePool.find();
    } catch (error) {
      console.error('Error importing existing numbers:', error);
      throw error;
    }
  }
  
  /**
   * Get an available number for a call session
   */
  async allocateNumberForSession(companyId, userId, sessionId) {
    // Try to find a number already assigned to this company
    let phoneNumber = await PhonePool.findOne({
      'assignedTo.companyId': companyId,
      status: { $in: ['reserved', 'in_use'] },
    });
    
    if (!phoneNumber) {
      // Find any available number
      phoneNumber = await PhonePool.findAvailable();
      
      if (!phoneNumber) {
        // Check if we should auto-purchase
        if (config.features.autoPurchaseNumbers) {
          phoneNumber = await this.purchaseNewNumber();
        } else {
          throw new Error('No available phone numbers. Please contact administrator.');
        }
      }
    }
    
    // Assign the number to this session
    await phoneNumber.assign(companyId, userId, sessionId);
    
    return phoneNumber;
  }
  
  /**
   * Release a number after call completion
   */
  async releaseNumber(phoneNumber) {
    const number = await PhonePool.findOne({ phoneNumber });
    
    if (number) {
      // Update usage stats
      number.usageStats.totalCalls += 1;
      number.usageStats.lastCallAt = new Date();
      
      // If it's a shared number, just mark as available
      // If it's a dedicated number (reserved), keep it reserved
      if (number.status === 'in_use' && !number.assignedTo?.companyId) {
        await number.release();
      } else if (number.status === 'in_use') {
        number.status = 'reserved'; // Keep reserved for the company
        await number.save();
      }
    }
    
    return number;
  }
  
  /**
   * Get pool statistics
   */
  async getPoolStats() {
    const stats = await PhonePool.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCalls: { $sum: '$usageStats.totalCalls' },
          totalMinutes: { $sum: '$usageStats.totalMinutes' },
        },
      },
    ]);
    
    const total = await PhonePool.countDocuments();
    const monthlyFees = await PhonePool.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$monthlyFee' },
        },
      },
    ]);
    
    return {
      total,
      byStatus: stats,
      monthlyFees: monthlyFees[0]?.total || 0,
    };
  }
}

module.exports = new PhonePoolService();