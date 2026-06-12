const mongoose = require('mongoose');

const AgentStatusSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true
  },
  status: { 
    type: String, 
    enum: ['available', 'busy', 'on-call', 'offline'],
    default: 'offline'
  },
  currentCallId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CallSession' 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  },
  totalCallsHandled: {
    type: Number,
    default: 0
  },
  totalCallDuration: {
    type: Number,
    default: 0
  },
  averageResponseTime: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

// インデックスの追加
// userIdは既にスキーマレベルでunique: trueが設定されているため、追加のインデックスは不要
AgentStatusSchema.index({ status: 1 });

// ステータス更新メソッド
AgentStatusSchema.methods.updateStatus = async function(newStatus, callId = null) {
  this.status = newStatus;
  this.lastActivity = new Date();
  
  if (newStatus === 'on-call' && callId) {
    this.currentCallId = callId;
  } else if (newStatus !== 'on-call') {
    this.currentCallId = null;
  }
  
  return await this.save();
};

// 利用可能なエージェントを取得するスタティックメソッド
AgentStatusSchema.statics.getAvailableAgents = function() {
  return this.find({ 
    status: 'available' 
  }).populate('userId');
};

// 最も負荷の低いエージェントを取得するスタティックメソッド
AgentStatusSchema.statics.getLeastBusyAgent = async function() {
  const availableAgents = await this.find({ 
    status: 'available' 
  }).sort({ totalCallsHandled: 1 }).limit(1);
  
  return availableAgents.length > 0 ? availableAgents[0] : null;
};

// 通話完了時の統計更新メソッド
AgentStatusSchema.methods.updateCallStatistics = async function(callDuration) {
  this.totalCallsHandled += 1;
  this.totalCallDuration += callDuration;
  this.averageResponseTime = Math.floor(this.totalCallDuration / this.totalCallsHandled);
  
  return await this.save();
};

module.exports = mongoose.model('AgentStatus', AgentStatusSchema);