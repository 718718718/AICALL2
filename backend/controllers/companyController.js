const Company = require('../models/Company');
const asyncHandler = require('../middlewares/asyncHandler');

exports.getAllCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find().sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    data: companies
  });
});

exports.getCompanyById = asyncHandler(async (req, res) => {
  console.log('Getting company by ID:', req.params.id);
  
  const company = await Company.findById(req.params.id);
  if (!company) {
    console.log('Company not found');
    return res.status(404).json({
      success: false,
      error: 'Company not found'
    });
  }

  console.log('Company found:', company.name);

  // Get users associated with this company
  const User = require('../models/User');
  const users = await User.find({ companyId: company.companyId })
    .select('firstName lastName email phone createdAt')
    .sort({ createdAt: -1 });

  console.log(`Found ${users.length} users for company ${company.companyId}`);

  const userList = users.map(user => ({
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt
  }));

  const responseData = {
    success: true,
    data: {
      company: company,
      users: {
        totalCount: users.length,
        userList: userList
      }
    }
  };

  console.log('Sending response:', JSON.stringify(responseData, null, 2));
  
  // キャッシュを無効にする
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  res.status(200).json(responseData);
});

exports.getCompanyByCompanyId = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ companyId: req.params.companyId });
  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Company not found'
    });
  }

  // Check if company already has an admin user
  const User = require('../models/User');
  const existingAdmin = await User.findOne({ 
    companyId: req.params.companyId, 
    isCompanyAdmin: true 
  });

  res.status(200).json({
    success: true,
    data: {
      ...company.toObject(),
      hasAdmin: !!existingAdmin
    }
  });
});

exports.createCompany = asyncHandler(async (req, res) => {
  const { name, address, url, phone, email, postalCode, businessType, employees, annualRevenue } = req.body;
  
  const existingCompany = await Company.findOne({ 
    $or: [
      { name: name },
      { phone: phone }
    ]
  });

  if (existingCompany) {
    return res.status(400).json({
      success: false,
      error: 'Company with this name or phone already exists'
    });
  }

  const company = await Company.create({
    name,
    address,
    url: url || '',
    phone,
    email: email || '',
    postalCode: postalCode || '',
    businessType: businessType || '',
    employees: employees || '',
    annualRevenue: annualRevenue || '',
    createdBy: req.user?.id || 'admin'
  });

  res.status(201).json({
    success: true,
    data: company
  });
});

exports.updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Company not found'
    });
  }

  res.status(200).json({
    success: true,
    data: company
  });
});

exports.deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndDelete(req.params.id);

  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Company not found'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Company deleted successfully'
  });
});

exports.validateCompanyId = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const company = await Company.findOne({ companyId: companyId, status: 'active' });
  
  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Invalid company ID'
    });
  }

  // 管理者が存在するかチェック
  const User = require('../models/User');
  const existingAdmin = await User.findOne({ 
    companyId: company._id,
    role: { $in: ['admin', 'company-admin'] }
  });

  res.status(200).json({
    success: true,
    data: {
      companyId: company.companyId,
      name: company.name,
      phone: company.phone,
      email: company.email,
      postalCode: company.postalCode,
      address: company.address,
      businessType: company.businessType,
      employees: company.employees,
      annualRevenue: company.annualRevenue,
      hasAdmin: !!existingAdmin
    }
  });
});