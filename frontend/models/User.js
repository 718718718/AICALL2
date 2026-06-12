const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: [true, 'Please provide company ID'],
    trim: true,
  },
  companyName: {
    type: String,
    required: [true, 'Please provide company name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please provide password'],
    minlength: 6,
    select: false,
  },
  firstName: {
    type: String,
    required: [true, 'Please provide first name'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Please provide last name'],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'Please provide phone number'],
    trim: true,
  },
  address: {
    type: String,
    required: [true, 'Please provide address'],
    trim: true,
  },
  businessType: {
    type: String,
    required: [true, 'Please select business type'],
    enum: ['it', 'manufacturing', 'retail', 'service'],
  },
  employees: {
    type: String,
    required: [true, 'Please select employee range'],
    enum: ['1-10', '11-50', '51-100', '100+'],
  },
  description: {
    type: String,
    trim: true,
  },
  handoffPhoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        // 日本の電話番号形式（0から始まる10桁または11桁）
        return /^0\d{9,10}$/.test(v.replace(/-/g, ''));
      },
      message: '有効な日本の電話番号を入力してください（例: 09012345678）',
    },
  },
  // Twilio専用電話番号設定
  twilioPhoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        // Twilio番号形式（+1から始まる米国番号）
        return /^\+1\d{10}$/.test(v);
      },
      message: '有効なTwilio電話番号を入力してください（例: +16076956082）',
    },
  },
  twilioPhoneNumberSid: {
    type: String,
    trim: true,
  },
  twilioPhoneNumberStatus: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending',
  },
  role: {
    type: String,
    default: 'user',
    enum: ['admin', 'user'],
  },
  isCompanyAdmin: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to get formatted phone number for Twilio
UserSchema.methods.getTwilioPhoneNumber = function() {
  if (!this.handoffPhoneNumber) return null;
  
  // Remove hyphens and spaces
  let cleaned = this.handoffPhoneNumber.replace(/[-\s]/g, '');
  
  // Convert to international format for Japan
  if (cleaned.startsWith('0')) {
    cleaned = '+81' + cleaned.substring(1);
  }
  
  return cleaned;
};

// Method to get user's dedicated Twilio phone number for outbound calls
UserSchema.methods.getDedicatedTwilioNumber = function() {
  return this.twilioPhoneNumber;
};

// Method to check if user has an active Twilio number
UserSchema.methods.hasActiveTwilioNumber = function() {
  return this.twilioPhoneNumber && this.twilioPhoneNumberStatus === 'active';
};

export default mongoose.models.User || mongoose.model('User', UserSchema);