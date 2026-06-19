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
        return /^0\d{9,10}$/.test(v.replace(/-/g, ''));
      },
      message: '有効な日本の電話番号を入力してください（例: 09012345678）',
    },
  },
  aiCallName: {
    type: String,
    trim: true,
    default: '',
    maxlength: [50, 'AI call name cannot be more than 50 characters'],
  },
  // Twilio専用電話番号設定（米国番号 +1xxx）
  twilioPhoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
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
  // ✅ BYOC番号設定（顧客ごとの03/050番号）
  byocFromNumber: {
    type: String,
    trim: true,
    // 例: +81368682113
  },
  byocTrunkSid: {
    type: String,
    trim: true,
    // 例: BY9cf701873764c0b5cfdda525b19c824f
  },
  refreshToken: {
    type: String,
    select: false,
  },
  refreshTokenExpiresAt: {
    type: Date,
    select: false,
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
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerifiedAt: {
    type: Date,
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  newEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  emailChangeToken: {
    type: String,
  },
  emailChangeExpires: {
    type: Date,
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

UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.getTwilioPhoneNumber = function() {
  if (!this.handoffPhoneNumber) return null;
  let cleaned = this.handoffPhoneNumber.replace(/[-\s]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+81' + cleaned.substring(1);
  }
  return cleaned;
};

UserSchema.methods.getDedicatedTwilioNumber = function() {
  return this.twilioPhoneNumber;
};

UserSchema.methods.hasActiveTwilioNumber = function() {
  return this.twilioPhoneNumber && this.twilioPhoneNumberStatus === 'active';
};

// ✅ ユーザーのBYOC番号が設定されているか確認
UserSchema.methods.hasByocNumber = function() {
  return !!(this.byocFromNumber && this.byocTrunkSid);
};

UserSchema.methods.setRefreshToken = async function(token, expiresAt) {
  this.refreshToken = token;
  this.refreshTokenExpiresAt = expiresAt;
  return await this.save();
};

UserSchema.methods.clearRefreshToken = async function() {
  this.refreshToken = undefined;
  this.refreshTokenExpiresAt = undefined;
  return await this.save();
};

module.exports = mongoose.model('User', UserSchema);
