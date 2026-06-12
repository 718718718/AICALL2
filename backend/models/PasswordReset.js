const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const passwordResetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  resetToken: {
    type: String,
    required: true,
    select: false, // セキュリティのため通常は選択しない
  },
  resetCode: {
    type: String,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  usedAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// リセットコードをハッシュ化
passwordResetSchema.pre('save', async function(next) {
  if (!this.isModified('resetCode')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.resetCode = await bcrypt.hash(this.resetCode, salt);
  next();
});

// リセットコードを検証
passwordResetSchema.methods.compareResetCode = async function(enteredCode) {
  return await bcrypt.compare(enteredCode, this.resetCode);
};

// 有効期限切れかチェック
passwordResetSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// インデックス：有効期限切れの自動削除（30日後）
passwordResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);