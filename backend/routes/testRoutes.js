const express = require('express');
const router = express.Router();
const CallSession = require('../models/CallSession');
const webSocketService = require('../services/websocket');

// テスト用: 通話セッション作成
router.post('/create-test-call', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    const callSession = new CallSession({
      phoneNumber: phoneNumber,
      twilioCallSid: `CA${Math.random().toString(36).substr(2, 32)}`,
      status: 'ai-responding',
      transcript: []
    });
    
    await callSession.save();
    
    res.json({
      success: true,
      data: {
        callId: callSession._id,
        phoneNumber: callSession.phoneNumber,
        status: callSession.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// テスト用: トランスクリプト追加
router.post('/add-transcript', async (req, res) => {
  try {
    const { callId, speaker, message } = req.body;
    
    const callSession = await CallSession.findById(callId);
    if (!callSession) {
      return res.status(404).json({ success: false, error: 'Call session not found' });
    }
    
    // データベースに追加
    await CallSession.findByIdAndUpdate(callId, {
      $push: {
        transcript: {
          speaker: speaker,
          message: message,
          timestamp: new Date()
        }
      }
    });
    
    // WebSocketで送信
    webSocketService.sendTranscriptUpdate(callId, {
      speaker: speaker,
      message: message,
      phoneNumber: callSession.phoneNumber,
      callId: callId,
      callSid: callSession.twilioCallSid,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      data: { speaker, message, timestamp: new Date() }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// テスト用: 通話セッション削除
router.delete('/call-sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await CallSession.findByIdAndUpdate(id, { status: 'completed' });
    res.json({ success: true, message: 'Call session completed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// テスト用: 通話セッション取得
router.get('/call-sessions', async (req, res) => {
  try {
    const callSessions = await CallSession.find({
      status: { $in: ['calling', 'initiated', 'ai-responding', 'in-progress'] }
    }).sort({ createdAt: -1 }).limit(10);
    
    res.json({
      success: true,
      data: callSessions.map(session => ({
        id: session._id,
        phoneNumber: session.phoneNumber,
        status: session.status,
        transcriptCount: session.transcript ? session.transcript.length : 0,
        createdAt: session.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// テスト用: 一斉通話（認証スキップ）
router.post('/test-bulk-call', async (req, res) => {
  try {
    const bulkCallController = require('../controllers/bulkCallController');
    const User = require('../models/User');
    
    // テスト用ユーザーを取得
    const user = await User.findOne({ email: 'kosaku.tsubata@gmail.com' });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // リクエストにユーザー情報を設定
    req.user = user;
    req.body = req.body || { phoneNumbers: ['09062660207'], customerIds: ['689f46a7e1f94c181214218b'] };
    
    // bulk call controllerを呼び出し
    return bulkCallController.initiateBulkCalls(req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;