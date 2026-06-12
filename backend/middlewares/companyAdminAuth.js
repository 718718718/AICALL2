const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const User = require('../models/User');

// 企業管理者権限のミドルウェア
exports.requireCompanyAdmin = asyncHandler(async (req, res, next) => {
  let token;

  // トークンを取得
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ErrorResponse('Access denied. No token provided.', 401));
  }

  try {
    // トークンを検証
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ユーザー情報を取得
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new ErrorResponse('User not found', 401));
    }

    // 企業管理者権限をチェック
    if (!user.isCompanyAdmin) {
      return next(new ErrorResponse('Access denied. Company admin privileges required.', 403));
    }

    // 企業IDが設定されているかチェック
    if (!user.companyId) {
      return next(new ErrorResponse('Access denied. User not associated with any company.', 403));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorResponse('Invalid token', 401));
  }
});

module.exports = exports;