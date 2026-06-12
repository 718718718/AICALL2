const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const User = require('../models/User');
const { protect } = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const companyController = require('../controllers/companyController');

// @desc    Get all companies (no auth for admin panel)
// @route   GET /api/companies
// @access  Public (admin panel uses this)
router.get('/', companyController.getAllCompanies);

// @desc    Create a new company
// @route   POST /api/companies
// @access  Public (admin panel uses this)
router.post('/', companyController.createCompany);

// @desc    Validate company ID (must come before /:id)
// @route   GET /api/companies/validate/:companyId
// @access  Public
router.get('/validate/:companyId', companyController.validateCompanyId);

// @desc    Get company by ID
// @route   GET /api/companies/:id
// @access  Public (admin panel uses this)
router.get('/:id', companyController.getCompanyById);

// @desc    Update company
// @route   PUT /api/companies/:id
// @access  Public (admin panel uses this)
router.put('/:id', companyController.updateCompany);

// @desc    Delete company
// @route   DELETE /api/companies/:id
// @access  Public (admin panel uses this)
router.delete('/:id', companyController.deleteCompany);

// @desc    Get user's company information
// @route   GET /api/company/my-company
// @access  Private
router.get('/my-company', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Get user with company information
  const user = await User.findById(userId).select('companyId companyName');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  // Find the company by companyId
  const company = await Company.findOne({ companyId: user.companyId });
  
  if (!company) {
    // Return user's stored company information as fallback
    return res.status(200).json({
      success: true,
      data: {
        companyId: user.companyId,
        name: user.companyName,
        status: 'pending',
        message: 'Company record not found in database'
      }
    });
  }
  
  res.status(200).json({
    success: true,
    data: company
  });
}));

// @desc    Update user's company association
// @route   PUT /api/company/user/:userId/assign
// @access  Private (Admin only)
router.put('/user/:userId/assign', protect, asyncHandler(async (req, res) => {
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to perform this action'
    });
  }
  
  const { userId } = req.params;
  const { companyId } = req.body;
  
  // Validate company exists
  const company = await Company.findOne({ companyId, status: 'active' });
  if (!company) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or inactive company ID'
    });
  }
  
  // Update user's company association
  const user = await User.findByIdAndUpdate(
    userId,
    {
      companyId: company.companyId,
      companyName: company.name
    },
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  res.status(200).json({
    success: true,
    data: {
      user,
      company
    }
  });
}));

// @desc    Get all companies (for admin selection)
// @route   GET /api/company/all
// @access  Private (Admin only)
router.get('/all', protect, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Not authorized'
    });
  }
  
  const companies = await Company.find({ status: 'active' })
    .select('companyId name')
    .sort('name');
  
  res.status(200).json({
    success: true,
    data: companies
  });
}));

module.exports = router;