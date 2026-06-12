const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getAgentProfile,
  updateAgentProfile,
  updateAgentPhone,
  updateConversationSettings,
  updateAgentStatus,
  getAvailableAgents,
  getAgentStatistics,
  updateNotificationPreferences
} = require('../controllers/agentController');

// All routes require authentication
router.use(protect);

// Profile management
router.route('/profile')
  .get(getAgentProfile)
  .put(updateAgentProfile);

// Phone number management
router.put('/phone', updateAgentPhone);

// Conversation settings
router.put('/conversation', updateConversationSettings);

// Status management
router.put('/status', updateAgentStatus);

// Get available agents
router.get('/available', getAvailableAgents);

// Statistics
router.get('/statistics', getAgentStatistics);

// Notification preferences
router.put('/notifications', updateNotificationPreferences);

module.exports = router;