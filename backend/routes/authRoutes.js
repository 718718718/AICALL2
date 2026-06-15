const express = require('express');
const router = express.Router();
const { register, login, adminLogin, getMe, updateProfile, sendVerificationCode, verifyEmailCode, createRegistrationToken, completeRegistration, getAllUsers, forgotPassword, verifyResetCode, resetPassword, refreshToken, logout } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/signup', register);
router.post('/login', login);
router.post('/admin-login', adminLogin);
router.get('/me', protect, getMe);
router.post('/refresh-token', refreshToken);
router.post('/logout', protect, logout);

// Email verification routes
router.post('/send-verification-code', sendVerificationCode);
router.post('/verify-email-code', verifyEmailCode);
router.post('/create-registration-token', createRegistrationToken);
router.post('/complete-registration', completeRegistration);

// Password reset routes
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);

// Users routes
router.put('/users/profile', protect, updateProfile);

// Admin routes
router.get('/admin/users', protect, getAllUsers);

module.exports = router;