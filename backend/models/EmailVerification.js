const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const EmailVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please provide email'],
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email',
    ],
  },
  verificationCode: {
    type: String,
    required: [true, 'Verification code is required'],
  },
  companyId: {
    type: String,
    required: [true, 'Company ID is required'],
    trim: true,
  },
  companyData: {
    type: Object,
    required: [true, 'Company data is required'],
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10分後
    expires: 0, // MongoDB TTLインデックス
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 認証コードをハッシュ化してから保存
EmailVerificationSchema.pre('save', async function (next) {
  if (!this.isModified('verificationCode')) {
    next();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.verificationCode = await bcrypt.hash(this.verificationCode, salt);
  next();
});

// 認証コード検証メソッド
EmailVerificationSchema.methods.compareVerificationCode = async function (enteredCode) {
  return await bcrypt.compare(enteredCode, this.verificationCode);
};

// 期限切れチェックメソッド
EmailVerificationSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

// インデックス設定
EmailVerificationSchema.index({ email: 1 });
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailVerification', EmailVerificationSchema);