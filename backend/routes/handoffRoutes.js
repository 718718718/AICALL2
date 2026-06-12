const express = require('express');
const router = express.Router();
const {
  initiateHandoff,
  getHandoffStatus,
  cancelHandoff,
  updateHandoffSettings,
  getHandoffSettings,
  initiateHandoffByPhone
} = require('../controllers/handoffController');
const { protect } = require('../middlewares/authMiddleware');

// Development middleware - skip auth in dev mode
const devProtect = async (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    // In development, create a mock user
    req.user = {
      id: 'dev-user-id',
      _id: 'dev-user-id',
      email: 'dev@example.com',
      firstName: 'Dev',
      lastName: 'User',
      role: 'user'
    };
    return next();
  }
  // In production, use normal protect
  return protect(req, res, next);
};

// Handoff operations
router.post('/calls/:callId/handoff', devProtect, initiateHandoff);
router.post('/calls/handoff-by-phone', devProtect, initiateHandoffByPhone);
// Test route without auth - must be defined first
router.post('/calls/handoff-by-phone-test', (req, res, next) => {
  // Mock user for test
  req.user = {
    id: 'test-user-id',
    _id: 'test-user-id',
    email: 'test@example.com'
  };
  initiateHandoffByPhone(req, res, next);
});
router.get('/calls/:callId/handoff-status', protect, getHandoffStatus);
router.delete('/calls/:callId/handoff', protect, cancelHandoff);

// User handoff settings
router.get('/users/handoff-settings', protect, getHandoffSettings);
router.put('/users/handoff-settings', protect, updateHandoffSettings);

module.exports = router;