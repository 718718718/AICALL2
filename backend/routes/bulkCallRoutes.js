const express = require('express');
const router = express.Router();
const bulkCallController = require('../controllers/bulkCallController');
const { protect } = require('../middlewares/authMiddleware');

// Initiate bulk calls (with authentication)
router.post('/bulk', protect, bulkCallController.initiateBulkCalls);

// Stop all bulk calls (with authentication)
router.post('/bulk/stop', protect, bulkCallController.stopAllBulkCalls);

// Get bulk call status (with authentication)
router.get('/bulk', protect, bulkCallController.getBulkCallStatus);
router.get('/bulk/status', protect, bulkCallController.getBulkCallStatus || (() => {}));

// Cancel bulk calls (with authentication)
router.post('/bulk/cancel', protect, bulkCallController.cancelBulkCalls || (() => {}));

// Clean up old sessions (with authentication)
router.post('/bulk/cleanup', protect, bulkCallController.cleanupOldSessions);

module.exports = router;