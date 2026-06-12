// Direct handoff routes with authentication
const express = require('express');
const router = express.Router();
const { initiateHandoffByPhone, initiateHandoff } = require('../controllers/handoffController');
const { protect } = require('../middlewares/authMiddleware');

// Direct route WITH authentication - uses actual logged-in user
router.post('/handoff-direct', protect, (req, res, next) => {
  console.log('[Handoff Direct] ========== NEW HANDOFF REQUEST ==========');
  console.log('[Handoff Direct] Request body:', JSON.stringify(req.body, null, 2));
  console.log('[Handoff Direct] Authenticated user:', req.user ? req.user.email : 'NOT AUTHENTICATED');

  // req.user is set by protect middleware (actual authenticated user)
  if (!req.user) {
    console.error('[Handoff Direct] No authenticated user!');
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  console.log('[Handoff Direct] User:', {
    id: req.user.id || req.user._id,
    email: req.user.email
  });

  try {
    // Check if this is a handoff by callId or by phone
    if (req.body.callId) {
      // Set callId as URL parameter for initiateHandoff
      req.params = req.params || {};
      req.params.callId = req.body.callId;
      console.log('[Handoff Direct] Using initiateHandoff with callId:', req.body.callId);
      console.log('[Handoff Direct] req.params set to:', req.params);
      initiateHandoff(req, res, next);
    } else {
      console.log('[Handoff Direct] Using initiateHandoffByPhone');
      initiateHandoffByPhone(req, res, next);
    }
  } catch (error) {
    console.error('[Handoff Direct] Error in route handler:', error);
    res.status(500).json({
      success: false,
      error: 'Route handler error: ' + error.message
    });
  }

  console.log('[Handoff Direct] =======================================');
});

module.exports = router;