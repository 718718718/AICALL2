const CallSession = require('./models/CallSession');

async function cleanupOldCalls() {
  try {
    // Find calls that are older than 1 hour and still marked as active
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    console.log('Cleaning up old active calls...');
    console.log('Cutoff time:', oneHourAgo.toISOString());
    
    const result = await CallSession.updateMany(
      {
        status: { $in: ['initiating', 'calling', 'initiated', 'ai-responding', 'transferring', 'human-connected', 'in-progress'] },
        createdAt: { $lt: oneHourAgo }
      },
      {
        status: 'completed',
        endTime: new Date()
      }
    );
    
    console.log(`Updated ${result.modifiedCount} old active calls to completed status`);
    
    // Show current active calls
    const activeCalls = await CallSession.find({
      status: { $in: ['initiating', 'calling', 'initiated', 'ai-responding', 'transferring', 'human-connected', 'in-progress'] }
    });
    console.log(`Remaining active calls: ${activeCalls.length}`);
    
    return {
      updated: result.modifiedCount,
      remaining: activeCalls.length
    };
  } catch (error) {
    console.error('Error cleaning up calls:', error);
    throw error;
  }
}

module.exports = { cleanupOldCalls };