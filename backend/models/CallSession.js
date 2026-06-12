const mongoose = require('mongoose');
const { 
  VALID_STATUS, 
  VALID_CALL_RESULT, 
  VALID_END_REASON,
  validateAndSanitizeSession,
  isValidStatusTransition,
  getStatusLogInfo
} = require('../utils/statusValidator');

const CallSessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: false  // Make optional for bulk calls
  },
  phoneNumber: {
    type: String,
    required: false  // Store phone number directly
  },
  twilioCallSid: { 
    type: String, 
    required: false,  // Make optional until Twilio call is created
    unique: true,
    sparse: true  // Allow multiple null values
  },
  conferenceSid: {
    type: String,
    sparse: true
  },
  status: { 
    type: String, 
    enum: {
      values: VALID_STATUS,
      message: 'Invalid status value: {VALUE}. Must be one of: ' + VALID_STATUS.join(', ')
    },
    default: 'initiating',
    validate: {
      validator: function(value) {
        // ステータス変更の妥当性をチェック
        if (this.isNew) {
          return true; // 新規作成時は制限なし
        }
        
        const currentStatus = this.constructor.findById(this._id).select('status');
        if (currentStatus && currentStatus.status) {
          return isValidStatusTransition(currentStatus.status, value);
        }
        
        return true;
      },
      message: 'Invalid status transition'
    }
  },
  error: {
    type: String,
    required: false
  },
  startTime: { 
    type: Date, 
    default: Date.now 
  },
  endTime: Date,
  endReason: {
    type: String,
    enum: {
      values: VALID_END_REASON,
      message: 'Invalid endReason value: {VALUE}. Must be one of: ' + VALID_END_REASON.join(', ')
    },
    required: false
  },
  assignedAgent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  transcript: [{
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    speaker: { 
      type: String, 
      enum: ['ai', 'customer', 'agent'] 
    },
    message: String,
    confidence: Number
  }],
  handoffTime: Date,
  handoffReason: String,
  handoffDetails: {
    requestedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    requestedAt: Date,
    connectedAt: Date,
    disconnectedAt: Date,
    handoffPhoneNumber: String,
    handoffCallSid: String,
    handoffMethod: {
      type: String,
      enum: ['manual', 'auto', 'ai-triggered', 'ai-auto'],
      default: 'manual'
    }
  },
  participants: [{
    type: {
      type: String,
      enum: ['customer', 'ai', 'agent']
    },
    callSid: String,
    phoneNumber: String,
    joinedAt: Date,
    leftAt: Date,
    isMuted: Boolean,
    isOnHold: Boolean
  }],
  recordingSettings: {
    enabled: { type: Boolean, default: true },
    retentionDays: { type: Number, default: 7 },
    deleteAfter: Date
  },
  callResult: {
    type: String,
    enum: {
      values: VALID_CALL_RESULT,
      message: 'Invalid callResult value: {VALUE}. Must be one of: ' + VALID_CALL_RESULT.join(', ')
    }
  },
  notes: String,
  duration: Number,
  recordingUrl: String,
  twilioRecordingUrl: String,
  recordingSid: String,
  aiConfiguration: {
    companyName: String,
    serviceName: String,
    representativeName: String,
    targetDepartment: String,
    serviceDescription: String,
    targetPerson: String,
    salesPitch: {
      companyDescription: String,
      callToAction: String,
      keyBenefits: [String]
    }
  },
  // OpenAI Realtime API integration fields
  realtimeSessionId: {
    type: String,
    required: false,
    sparse: true
  },
  realtimeConversation: [{
    type: {
      type: String,  // e.g., 'message', 'function_call', etc.
      default: 'message'
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system']
    },
    content: mongoose.Schema.Types.Mixed,  // Can be String or Array
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});;

// インデックスの追加
CallSessionSchema.index({ customerId: 1, createdAt: -1 });
CallSessionSchema.index({ assignedAgent: 1, createdAt: -1 });
CallSessionSchema.index({ status: 1 });
// twilioCallSidは既にスキーマレベルでunique: trueが設定されているため、追加のインデックスは不要

// 通話時間を計算するメソッド
CallSessionSchema.methods.calculateDuration = function() {
  if (this.endTime && this.startTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / 1000); // 秒単位
  }
  return this.duration;
};

// 保存前のバリデーションとサニタイズ
CallSessionSchema.pre('save', function(next) {
  try {
    // ステータス値のサニタイズ
    const sanitized = validateAndSanitizeSession(this.toObject());
    
    // サニタイズされた値を設定
    if (sanitized.status !== this.status) {
      console.warn(`[CallSession] Sanitized status from '${this.status}' to '${sanitized.status}' for session ${this._id}`);
      this.status = sanitized.status;
    }
    
    if (sanitized.callResult !== this.callResult) {
      console.warn(`[CallSession] Sanitized callResult from '${this.callResult}' to '${sanitized.callResult}' for session ${this._id}`);
      this.callResult = sanitized.callResult;
    }
    
    if (sanitized.endReason !== this.endReason) {
      console.warn(`[CallSession] Sanitized endReason from '${this.endReason}' to '${sanitized.endReason}' for session ${this._id}`);
      this.endReason = sanitized.endReason;
    }
    
    // 録音の自動削除日を設定
    if (this.isNew && this.recordingSettings.enabled) {
      const deleteDate = new Date();
      deleteDate.setDate(deleteDate.getDate() + this.recordingSettings.retentionDays);
      this.recordingSettings.deleteAfter = deleteDate;
    }
    
    // ログ出力（デバッグ用）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[CallSession] Pre-save validation: ${getStatusLogInfo(this)}`);
    }
    
    next();
  } catch (error) {
    console.error('[CallSession] Pre-save validation error:', error);
    next(error);
  }
});

// アクティブな通話を取得するスタティックメソッド
CallSessionSchema.statics.getActiveCalls = function() {
  return this.find({
    status: { $in: ['initiating', 'calling', 'initiated', 'ai-responding', 'transferring', 'human-connected', 'in-progress'] }
  }).populate('customerId assignedAgent');
};

// 通話結果の統計を取得するスタティックメソッド
CallSessionSchema.statics.getCallStatistics = async function(agentId, dateRange) {
  const query = {};
  if (agentId) {
    query.assignedAgent = agentId;
  }
  if (dateRange) {
    query.createdAt = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }

  const stats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$callResult',
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);

  return stats;
};

module.exports = mongoose.model('CallSession', CallSessionSchema);