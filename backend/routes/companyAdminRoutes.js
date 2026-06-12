const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getCompanyUsers,
  toggleUserAdminStatus,
  getCompanyReports,
  exportCompanyReports
} = require('../controllers/companyAdminController');
const { requireCompanyAdmin } = require('../middlewares/companyAdminAuth');

// Company admin dashboard
router.get('/dashboard-stats', requireCompanyAdmin, getDashboardStats);

// Company users management
router.get('/users', requireCompanyAdmin, getCompanyUsers);
router.put('/users/:userId/admin', requireCompanyAdmin, toggleUserAdminStatus);

// Company reports and analytics
router.get('/reports', requireCompanyAdmin, getCompanyReports);
router.get('/reports/export', requireCompanyAdmin, exportCompanyReports);

module.exports = router;