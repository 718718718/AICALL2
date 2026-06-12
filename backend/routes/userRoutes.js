const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PhonePool = require('../models/PhonePool');
const AgentSettings = require('../models/AgentSettings');
const phonePoolService = require('../services/phonePoolService');
const { protect, authorize } = require('../middlewares/authMiddleware');

// GET all users (admin only)
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    console.log('User requesting users list:', req.user);
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users' 
    });
  }
});

// UPDATE sales pitch settings
router.put('/sales-pitch', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const { voice, conversationSettings } = req.body;

    if (!conversationSettings) {
      return res.status(400).json({
        success: false,
        message: 'conversationSettings is required'
      });
    }

    const {
      // 基本設定
      companyName, serviceName, representativeName, targetDepartment,
      // その他設定
      serviceDescription, targetPerson,
      // AI設定
      conversationStyle, speechRate,
      // セールスピッチ設定
      salesPitch
    } = conversationSettings;

    const { companyDescription, callToAction, keyBenefits } = salesPitch || {};

    console.log('[Sales Pitch Update] User ID:', userId);
    console.log('[Sales Pitch Update] Data:', req.body);
    console.log('[Sales Pitch Update] Received fields:', {
      voice,
      companyName,
      serviceName,
      representativeName,
      targetDepartment,
      serviceDescription,
      targetPerson,
      conversationStyle,
      speechRate,
      companyDescription,
      callToAction,
      keyBenefits
    });

    // Find or create agent settings
    let agentSettings = await AgentSettings.findOne({ userId });

    if (!agentSettings) {
      console.log(`[Sales Pitch PUT] Creating agent settings for user ${userId}`);

      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
      }

      // Create agent settings if they don't exist
      agentSettings = await AgentSettings.create({
        userId: userId,
        conversationSettings: {
          companyName: 'AIコールシステム株式会社',
          serviceName: 'AIアシスタントサービス',
          representativeName: user.firstName || '佐藤',
          targetDepartment: '営業部'
        }
      });

      console.log(`[Sales Pitch PUT] Created agent settings: ${agentSettings._id}`);
    }

    // Update basic settings
    if (companyName !== undefined) {
      agentSettings.conversationSettings.companyName = companyName;
    }
    if (serviceName !== undefined) {
      agentSettings.conversationSettings.serviceName = serviceName;
    }
    if (representativeName !== undefined) {
      agentSettings.conversationSettings.representativeName = representativeName;
    }
    if (targetDepartment !== undefined) {
      agentSettings.conversationSettings.targetDepartment = targetDepartment;
    }

    // Update other settings
    if (serviceDescription !== undefined) {
      agentSettings.conversationSettings.serviceDescription = serviceDescription;
    }
    if (targetPerson !== undefined) {
      agentSettings.conversationSettings.targetPerson = targetPerson;
    }

    // Update AI settings
    if (conversationStyle !== undefined) {
      agentSettings.conversationSettings.conversationStyle = conversationStyle;
    }
    if (speechRate !== undefined) {
      agentSettings.conversationSettings.speechRate = speechRate;
    }

    // Mark conversationSettings as modified for Mongoose
    if (conversationStyle !== undefined || speechRate !== undefined) {
      agentSettings.markModified('conversationSettings');
    }

    // Update voice (top-level field in AgentSettings)
    if (voice !== undefined) {
      agentSettings.voice = voice;
    }

    // Initialize salesPitch if it doesn't exist
    if (!agentSettings.conversationSettings.salesPitch) {
      agentSettings.conversationSettings.salesPitch = {};
    }

    // Update sales pitch settings
    if (companyDescription !== undefined) {
      agentSettings.conversationSettings.salesPitch.companyDescription = companyDescription;
    }
    if (callToAction !== undefined) {
      agentSettings.conversationSettings.salesPitch.callToAction = callToAction;
    }
    if (keyBenefits !== undefined) {
      agentSettings.conversationSettings.salesPitch.keyBenefits = keyBenefits;
    }

    // 保存前にデータを確認
    console.log('[Sales Pitch Update] 保存前の設定:');
    console.log('- companyName:', agentSettings.conversationSettings.companyName);
    console.log('- representativeName:', agentSettings.conversationSettings.representativeName);
    console.log('- serviceName:', agentSettings.conversationSettings.serviceName);
    console.log('- voice:', agentSettings.voice);
    console.log('- conversationStyle:', agentSettings.conversationSettings.conversationStyle);
    console.log('- speechRate:', agentSettings.conversationSettings.speechRate);

    console.log('[Sales Pitch Update] 保存前のagentSettings:', {
      id: agentSettings._id,
      userId: agentSettings.userId,
      conversationSettings: agentSettings.conversationSettings
    });
    
    await agentSettings.save();
    console.log('[Sales Pitch Update] データベースに保存完了');
    
    // 保存後に再度読み込んで確認
    const savedSettings = await AgentSettings.findById(agentSettings._id);
    console.log('[Sales Pitch Update] 保存後確認:', {
      companyName: savedSettings.conversationSettings.companyName,
      representativeName: savedSettings.conversationSettings.representativeName,
      serviceName: savedSettings.conversationSettings.serviceName,
      voice: savedSettings.voice,
      conversationStyle: savedSettings.conversationSettings.conversationStyle,
      speechRate: savedSettings.conversationSettings.speechRate
    });

    res.json({
      success: true,
      message: 'トークスクリプト設定が更新されました',
      data: {
        voice: agentSettings.voice,
        conversationSettings: agentSettings.conversationSettings
      }
    });

  } catch (error) {
    console.error('Sales pitch update error:', error);
    res.status(500).json({
      success: false,
      message: 'トークスクリプト設定の更新に失敗しました',
      error: error.message
    });
  }
});

// GET sales pitch settings
router.get('/sales-pitch', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    let agentSettings = await AgentSettings.findOne({ userId });

    // If no agent settings exist, create default ones
    if (!agentSettings) {
      console.log(`[Sales Pitch GET] Creating default agent settings for user ${userId}`);

      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
      }

      // Create default agent settings
      agentSettings = await AgentSettings.create({
        userId: userId,
        conversationSettings: {
          companyName: 'AIコールシステム株式会社',
          serviceName: 'AIアシスタントサービス',
          representativeName: user.firstName || '佐藤',
          targetDepartment: '営業部',
          serviceDescription: '新規テレアポや掘り起こしなどの営業電話を人間に代わって生成AIが電話をかけるというサービスを提供している',
          targetPerson: '営業の担当者さま'
        }
      });

      console.log(`[Sales Pitch GET] Created default agent settings: ${agentSettings._id}`);
    }

    // エージェント設定の全データを返す
    res.json({
      success: true,
      data: agentSettings
    });

  } catch (error) {
    console.error('Get sales pitch error:', error);
    res.status(500).json({
      success: false,
      message: 'トークスクリプト設定の取得に失敗しました',
      error: error.message
    });
  }
});

// GET single user (admin only)
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user' 
    });
  }
});

// UPDATE user (admin only)
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { firstName, lastName, phone, role } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Update fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role;
    
    await user.save();
    
    // Return user without password
    const updatedUser = await User.findById(user._id).select('-password');
    
    res.json({ 
      success: true, 
      user: updatedUser,
      message: 'User updated successfully' 
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update user' 
    });
  }
});

// DELETE user (admin only)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Don't allow deleting the last admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          success: false, 
          error: 'Cannot delete the last admin user' 
        });
      }
    }
    
    await user.deleteOne();
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete user' 
    });
  }
});

// GET available phone numbers for assignment (admin only)
router.get('/phone-numbers/available', protect, authorize('admin'), async (req, res) => {
  try {
    const availableNumbers = await PhonePool.find({
      status: 'available'
    }).select('phoneNumber friendlyName capabilities');
    
    res.json({ 
      success: true, 
      numbers: availableNumbers 
    });
  } catch (error) {
    console.error('Error fetching available phone numbers:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch available phone numbers' 
    });
  }
});

// ASSIGN phone number to user (admin only)
router.post('/:id/assign-phone', protect, authorize('admin'), async (req, res) => {
  try {
    const { phoneNumberId } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    const phoneNumber = await PhonePool.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({ 
        success: false, 
        error: 'Phone number not found' 
      });
    }
    
    if (phoneNumber.status !== 'available') {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is not available' 
      });
    }
    
    // Remove existing assignment if user already has a phone number
    if (user.twilioPhoneNumberSid) {
      await PhonePool.findOneAndUpdate(
        { twilioSid: user.twilioPhoneNumberSid },
        { 
          status: 'available',
          $unset: { assignedTo: "" }
        }
      );
    }
    
    // Assign new phone number
    phoneNumber.status = 'reserved';
    phoneNumber.assignedTo = {
      userId: user._id,
      assignedAt: new Date()
    };
    await phoneNumber.save();
    
    // Update user with new phone number
    user.twilioPhoneNumber = phoneNumber.phoneNumber;
    user.twilioPhoneNumberSid = phoneNumber.twilioSid;
    user.twilioPhoneNumberStatus = 'active';
    await user.save();
    
    const updatedUser = await User.findById(user._id).select('-password');
    
    res.json({ 
      success: true, 
      user: updatedUser,
      message: 'Phone number assigned successfully' 
    });
  } catch (error) {
    console.error('Error assigning phone number:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to assign phone number' 
    });
  }
});

// UNASSIGN phone number from user (admin only)
router.delete('/:id/unassign-phone', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (user.twilioPhoneNumberSid) {
      // Release the phone number back to the pool
      await PhonePool.findOneAndUpdate(
        { twilioSid: user.twilioPhoneNumberSid },
        { 
          status: 'available',
          $unset: { assignedTo: "" }
        }
      );
      
      // Clear phone number from user
      user.twilioPhoneNumber = undefined;
      user.twilioPhoneNumberSid = undefined;
      user.twilioPhoneNumberStatus = undefined;
      await user.save();
    }
    
    const updatedUser = await User.findById(user._id).select('-password');
    
    res.json({ 
      success: true, 
      user: updatedUser,
      message: 'Phone number unassigned successfully' 
    });
  } catch (error) {
    console.error('Error unassigning phone number:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to unassign phone number' 
    });
  }
});

// IMPORT existing Twilio numbers into pool (admin only)
router.post('/phone-numbers/import-from-twilio', protect, authorize('admin'), async (req, res) => {
  try {
    const importedNumbers = await phonePoolService.importExistingNumbers();
    
    res.json({ 
      success: true, 
      message: `Successfully imported ${importedNumbers.length} phone numbers from Twilio`,
      numbers: importedNumbers
    });
  } catch (error) {
    console.error('Error importing Twilio numbers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to import phone numbers from Twilio' 
    });
  }
});

// PURCHASE new phone number from Twilio (admin only)
router.post('/phone-numbers/purchase', protect, authorize('admin'), async (req, res) => {
  try {
    const { areaCode = '607', capabilities } = req.body;
    
    const newNumber = await phonePoolService.purchaseNewNumber(areaCode, capabilities);
    
    res.json({ 
      success: true, 
      message: `Successfully purchased new phone number: ${newNumber.phoneNumber}`,
      number: newNumber
    });
  } catch (error) {
    console.error('Error purchasing phone number:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to purchase phone number from Twilio' 
    });
  }
});

module.exports = router;