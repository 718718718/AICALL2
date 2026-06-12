const twilioService = require('../services/twilioService');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const AgentSettings = require('../models/AgentSettings');
const webSocketService = require('../services/websocket');

// Initiate bulk calls to selected customers
exports.initiateBulkCalls = async (req, res) => {
  console.log('=== Bulk Call Request ===');
  console.log('Request Body:', req.body);
  console.log('User:', req.user);
  console.log('User ID:', req.user?._id || req.user?.id || 'NOT FOUND');
  
  try {
    const { phoneNumbers, customerIds } = req.body;

    console.log('Phone Numbers:', phoneNumbers);
    console.log('Customer IDs:', customerIds);

    if (!phoneNumbers || phoneNumbers.length === 0) {
      console.log('❌ No phone numbers provided');
      return res.status(400).json({ 
        error: 'No phone numbers provided' 
      });
    }

    // ユーザーのエージェント設定を取得
    const userId = req.user?._id || req.user?.id;
    let agentSettings = null;
    
    if (userId) {
      agentSettings = await AgentSettings.findOne({ userId });
      console.log('[BulkCall] Agent settings found:', agentSettings ? agentSettings._id : 'none');
    }
    
    // Create call sessions for tracking
    const callSessions = [];
    const callPromises = [];

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      const customerId = customerIds ? customerIds[i] : null;

      // Create a call session with AI configuration
      const sessionData = {
        phoneNumber,
        customerId,
        status: 'initiating',
        startTime: new Date(),
        assignedAgent: userId,
      };
      
      // エージェント設定がある場合はaiConfigurationを追加
      if (agentSettings && agentSettings.conversationSettings) {
        sessionData.aiConfiguration = {
          companyName: agentSettings.conversationSettings.companyName,
          serviceName: agentSettings.conversationSettings.serviceName,
          representativeName: agentSettings.conversationSettings.representativeName,
          targetDepartment: agentSettings.conversationSettings.targetDepartment
        };
        console.log('[BulkCall] AI Configuration:', sessionData.aiConfiguration);
      }

      const session = new CallSession(sessionData);
      await session.save();
      callSessions.push(session);

      // Initiate the call via Twilio
      if (!userId) {
        console.error('[BulkCall] No user ID found in request');
        session.status = 'failed';
        session.error = 'ユーザー情報が提供されていません。運営会社にお問い合わせください。';
        await session.save();
        continue;
      }
      
      const callPromise = twilioService.makeCall(phoneNumber, session._id, userId)
        .then(call => {
          session.twilioCallSid = call.sid;
          session.status = 'calling';
          return session.save();
        })
        .catch(error => {
          session.status = 'failed';
          session.error = error.message;
          return session.save();
        });

      callPromises.push(callPromise);
    }

    // Wait for all calls to be initiated
    await Promise.all(callPromises);

    // Broadcast new calls via WebSocket
    webSocketService.broadcastCallEvent('bulk-calls-started', {
      sessions: callSessions.map(s => ({
        id: s._id,
        phoneNumber: s.phoneNumber,
        status: s.status,
        twilioCallSid: s.twilioCallSid
      }))
    });

    // Send active calls update
    const activeCalls = await CallSession.getActiveCalls();
    webSocketService.broadcastCallEvent('active-calls', activeCalls);

    res.status(200).json({
      message: `Initiated ${phoneNumbers.length} calls`,
      sessions: callSessions.map(s => ({
        id: s._id,
        phoneNumber: s.phoneNumber,
        status: s.status,
        twilioCallSid: s.twilioCallSid
      }))
    });

  } catch (error) {
    console.error('Bulk call error:', error);
    res.status(500).json({ 
      error: 'Failed to initiate bulk calls',
      details: error.message 
    });
  }
};

// Get status of bulk calls
exports.getBulkCallStatus = async (req, res) => {
  try {
    const { sessionIds } = req.query;
    
    let query = {};
    if (sessionIds) {
      const ids = sessionIds.split(',');
      query._id = { $in: ids };
    }

    const sessions = await CallSession.find(query)
      .populate('customerId', 'customer phone')
      .sort('-createdAt')
      .limit(100);

    res.status(200).json({
      sessions: sessions.map(s => ({
        id: s._id,
        phoneNumber: s.phoneNumber,
        customer: s.customerId,
        status: s.status,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.duration,
        twilioCallSid: s.twilioCallSid
      }))
    });

  } catch (error) {
    console.error('Get bulk call status error:', error);
    res.status(500).json({ 
      error: 'Failed to get call status',
      details: error.message 
    });
  }
};

// Cancel ongoing bulk calls
exports.cancelBulkCalls = async (req, res) => {
  try {
    const { sessionIds } = req.body;

    if (!sessionIds || sessionIds.length === 0) {
      return res.status(400).json({ 
        error: 'No session IDs provided' 
      });
    }

    const sessions = await CallSession.find({
      _id: { $in: sessionIds },
      status: { $in: ['initiating', 'calling', 'in-progress'] }
    });

    const cancelPromises = sessions.map(async (session) => {
      if (session.twilioCallSid) {
        try {
          await twilioService.endCall(session.twilioCallSid);
        } catch (error) {
          console.error(`Failed to end call ${session.twilioCallSid}:`, error);
        }
      }
      session.status = 'cancelled';
      session.endTime = new Date();
      return session.save();
    });

    await Promise.all(cancelPromises);

    res.status(200).json({
      message: `Cancelled ${sessions.length} calls`,
      cancelledSessions: sessions.map(s => s._id)
    });

  } catch (error) {
    console.error('Cancel bulk calls error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel calls',
      details: error.message 
    });
  }
};

// Clean up old call sessions
exports.cleanupOldSessions = async (req, res) => {
  try {
    console.log('=== Cleanup Old Sessions ===');
    
    // Define cutoff dates for different cleanup scenarios
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes for stale sessions
    const oldCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours for very old sessions
    
    console.log('Stale cutoff (10 min):', staleCutoff);
    console.log('Old cutoff (24 hours):', oldCutoff);
    
    const twilioService = require('../services/twilioService');
    const webSocketService = require('../services/websocket');
    
    // Find stale sessions (likely hung calls that should have ended)
    const staleSessions = await CallSession.find({
      startTime: { $lt: staleCutoff },
      status: { $in: ['initiating', 'calling', 'in-progress', 'ai-responding', 'human-connected'] }
    });
    
    console.log(`Found ${staleSessions.length} stale sessions to clean up`);
    
    // Clean up stale sessions and try to end Twilio calls
    for (const session of staleSessions) {
      try {
        // Try to end the Twilio call if it exists
        if (session.twilioCallSid && session.twilioCallSid !== 'pending' && !session.twilioCallSid.startsWith('SIMULATED')) {
          console.log(`Attempting to end Twilio call: ${session.twilioCallSid}`);
          await twilioService.endCall(session.twilioCallSid);
        }
        
        // Update the session status
        await CallSession.findByIdAndUpdate(session._id, {
          status: 'failed',
          endTime: new Date(),
          error: 'Session cleanup - likely hung call'
        });
        
        // Broadcast status update
        let phoneNumber = session.phoneNumber || '';
        if (session.customerId?.phone) {
          phoneNumber = session.customerId.phone;
        }
        
        webSocketService.broadcastCallEvent('call-status', {
          callId: session._id.toString(),
          callSid: session.twilioCallSid,
          phoneNumber: phoneNumber,
          status: 'failed',
          timestamp: new Date()
        });
        
        console.log(`Cleaned up stale session: ${session._id}`);
      } catch (error) {
        console.error(`Error cleaning up session ${session._id}:`, error);
      }
    }
    
    // Find very old sessions (older than 24 hours) and mark as completed
    const veryOldUpdateResult = await CallSession.updateMany(
      {
        startTime: { $lt: oldCutoff },
        status: { $in: ['initiating', 'calling', 'in-progress', 'ai-responding', 'human-connected'] }
      },
      {
        $set: {
          status: 'completed',
          endTime: new Date()
        }
      }
    );
    
    console.log(`Updated ${veryOldUpdateResult.modifiedCount} very old sessions`);
    
    const totalCleaned = staleSessions.length + veryOldUpdateResult.modifiedCount;
    
    res.status(200).json({
      message: `Cleaned up ${totalCleaned} old sessions`,
      staleCleaned: staleSessions.length,
      veryOldCleaned: veryOldUpdateResult.modifiedCount,
      staleCutoff: staleCutoff,
      oldCutoff: oldCutoff
    });

  } catch (error) {
    console.error('Cleanup sessions error:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup sessions',
      details: error.message 
    });
  }
};