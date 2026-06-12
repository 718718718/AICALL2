const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  startCall,
  getActiveCalls,
  endCall,
  getCallHistory,
  getCallDetails,
  updateTranscript,
  getCallStatistics
} = require('../controllers/callController');
// Use new handoff controller that supports OpenAI Realtime API
const { initiateHandoff } = require('../controllers/handoffController');

// All routes require authentication
router.use(protect);

// Call management
router.post('/start', startCall);
router.get('/active', getActiveCalls);
router.get('/history', getCallHistory);
router.get('/statistics', getCallStatistics);

// Specific call operations
router.route('/:callId')
  .get(getCallDetails);

// Use new handoff controller that supports OpenAI Realtime API
router.post('/:callId/handoff', initiateHandoff);
router.post('/:callId/end', endCall);
router.put('/:callId/transcript', updateTranscript);

module.exports = router;