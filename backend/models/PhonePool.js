const mongoose = require('mongoose');

const phonePoolSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
  },
  twilioSid: {
    type: String,
    required: true,
  },
  friendlyName: String,
  capabilities: {
    voice: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    mms: { type: Boolean, default: false },
    fax: { type: Boolean, default: false },
  },
  status: {
    type: String,
    enum: ['available', 'in_use', 'reserved', 'maintenance'],
    default: 'available',
  },
  assignedTo: {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sessionId: String,
    assignedAt: Date,
  },
  lastUsedAt: Date,
  purchasedAt: {
    type: Date,
    default: Date.now,
  },
  monthlyFee: {
    type: Number,
    default: 1.15, // Twilio's typical monthly fee for US numbers
  },
  usageStats: {
    totalCalls: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    lastCallAt: Date,
  },
}, {
  timestamps: true,
});

// Index for quick lookup of available numbers
phonePoolSchema.index({ status: 1, 'capabilities.voice': 1 });
phonePoolSchema.index({ 'assignedTo.companyId': 1 });

// Method to assign a phone number
phonePoolSchema.methods.assign = async function(companyId, userId, sessionId) {
  this.status = 'in_use';
  this.assignedTo = {
    companyId,
    userId,
    sessionId,
    assignedAt: new Date(),
  };
  this.lastUsedAt = new Date();
  return this.save();
};

// Method to release a phone number
phonePoolSchema.methods.release = async function() {
  this.status = 'available';
  this.assignedTo = undefined;
  return this.save();
};

// Static method to find an available number
phonePoolSchema.statics.findAvailable = async function() {
  return this.findOne({
    status: 'available',
    'capabilities.voice': true,
  });
};

// Static method to find or allocate a number for a company
phonePoolSchema.statics.getNumberForCompany = async function(companyId) {
  // First, check if company already has an assigned number
  let phoneNumber = await this.findOne({
    'assignedTo.companyId': companyId,
    status: { $in: ['in_use', 'reserved'] },
  });
  
  if (phoneNumber) {
    return phoneNumber;
  }
  
  // If not, find an available number
  phoneNumber = await this.findAvailable();
  
  if (!phoneNumber) {
    throw new Error('No available phone numbers in pool');
  }
  
  // Reserve it for the company
  phoneNumber.status = 'reserved';
  phoneNumber.assignedTo = {
    companyId,
    assignedAt: new Date(),
  };
  
  await phoneNumber.save();
  return phoneNumber;
};

const PhonePool = mongoose.model('PhonePool', phonePoolSchema);

module.exports = PhonePool;