const mongoose = require('mongoose');
const crypto = require('crypto');

const companySchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      // Generate a cryptographically secure random ID
      // 16 bytes = 128 bits of randomness, converted to base64url
      return crypto.randomBytes(16).toString('base64url');
    }
  },
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  url: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  postalCode: {
    type: String,
    trim: true,
    default: ''
  },
  businessType: {
    type: String,
    trim: true,
    default: ''
  },
  employees: {
    type: String,
    trim: true,
    default: ''
  },
  annualRevenue: {
    type: String,
    trim: true,
    default: ''
  },
  lastCall: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  },
  createdBy: {
    type: String,
    default: 'admin'
  }
}, {
  timestamps: true
});

// companyIdは既にスキーマレベルでunique: trueが設定されているため、追加のインデックスは不要
companySchema.index({ name: 1 });

module.exports = mongoose.model('Company', companySchema);