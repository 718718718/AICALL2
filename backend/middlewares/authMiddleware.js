const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const User = require('../models/User');
const ErrorResponse = require('../utils/ErrorResponse');

// Protect routes
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  console.log('[Auth] Protect middleware called for:', req.method, req.originalUrl);
  console.log('[Auth] Authorization header:', req.headers.authorization ? 'Present' : 'Missing');

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
    console.log('[Auth] Token extracted, length:', token ? token.length : 0);
  }

  // Development mode: Allow dev tokens
  if (!token && process.env.NODE_ENV === 'development') {
    // Check for dev user token
    if (req.headers.authorization && req.headers.authorization.includes('dev-user-')) {
      // Create a mock user for development
      req.user = {
        id: 'dev-user-id',
        _id: 'dev-user-id',
        email: 'dev@example.com',
        firstName: 'Dev',
        lastName: 'User',
        role: 'user'
      };
      console.log('[Auth] Development mode: using dev user');
      return next();
    }
  }

  if (!token) {
    console.log('[Auth] No token provided');
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[Auth] Token verified for user ID:', decoded.id);

    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.log('[Auth] User not found in database:', decoded.id);
      return next(new ErrorResponse('User not found', 404));
    }
    
    console.log('[Auth] User found:', user.email, 'companyId:', user.companyId);
    
    // Ensure both _id and id are available
    req.user = user;
    if (!req.user.id) {
      req.user.id = user._id.toString();
    }

    next();
  } catch (err) {
    console.log('[Auth] Token verification failed:', err.message);
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};