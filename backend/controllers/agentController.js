const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const AgentSettings = require('../models/AgentSettings');
const AgentStatus = require('../models/AgentStatus');
const User = require('../models/User');

// @desc    Get agent profile
// @route   GET /api/agents/profile
// @access  Private
exports.getAgentProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const [user, settings, status] = await Promise.all([
    User.findById(userId).select('-password'),
    AgentSettings.findOne({ userId }),
    AgentStatus.findOne({ userId })
  ]);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      user,
      settings: settings || null,
      status: status || null
    }
  });
});

// @desc    Update agent profile
// @route   PUT /api/agents/profile
// @access  Private
exports.updateAgentProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { firstName, lastName, email, phone } = req.body;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      firstName,
      lastName,
      email,
      phone
    },
    {
      new: true,
      runValidators: true
    }
  ).select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update agent phone number
// @route   PUT /api/agents/phone
// @access  Private
exports.updateAgentPhone = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return next(new ErrorResponse('Please provide a phone number', 400));
  }

  let settings = await AgentSettings.findOne({ userId });

  if (settings) {
    settings.phoneNumber = phoneNumber;
    await settings.save();
  } else {
    // デフォルト設定で新規作成
    const user = await User.findById(userId);
    settings = await AgentSettings.create({
      userId,
      phoneNumber,
      conversationSettings: {
        companyName: user.companyName || '未設定',
        serviceName: 'サービス名',
        representativeName: `${user.lastName} ${user.firstName}`,
        targetDepartment: '営業部'
      }
    });
  }

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update conversation settings
// @route   PUT /api/agents/conversation
// @access  Private
exports.updateConversationSettings = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { 
    companyName, 
    serviceName, 
    representativeName, 
    targetDepartment,
    customTemplates 
  } = req.body;

  let settings = await AgentSettings.findOne({ userId });

  if (!settings) {
    return next(new ErrorResponse('Agent settings not found. Please set phone number first.', 404));
  }

  // 会話設定を更新
  if (companyName) settings.conversationSettings.companyName = companyName;
  if (serviceName) settings.conversationSettings.serviceName = serviceName;
  if (representativeName) settings.conversationSettings.representativeName = representativeName;
  if (targetDepartment) settings.conversationSettings.targetDepartment = targetDepartment;
  
  // カスタムテンプレートがある場合は更新
  if (customTemplates) {
    Object.keys(customTemplates).forEach(key => {
      if (settings.conversationSettings.customTemplates[key] !== undefined) {
        settings.conversationSettings.customTemplates[key] = customTemplates[key];
      }
    });
  }

  await settings.save();

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update agent status
// @route   PUT /api/agents/status
// @access  Private
exports.updateAgentStatus = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { status, isAvailable } = req.body;

  // AgentStatusの更新または作成
  let agentStatus = await AgentStatus.findOne({ userId });
  
  if (agentStatus) {
    if (status) {
      await agentStatus.updateStatus(status);
    }
  } else {
    agentStatus = await AgentStatus.create({
      userId,
      status: status || 'offline'
    });
  }

  // AgentSettingsのisAvailable更新
  if (isAvailable !== undefined) {
    const settings = await AgentSettings.findOne({ userId });
    if (settings) {
      settings.isAvailable = isAvailable;
      await settings.save();
    }
  }

  res.status(200).json({
    success: true,
    data: {
      status: agentStatus,
      isAvailable
    }
  });
});

// @desc    Get all available agents
// @route   GET /api/agents/available
// @access  Private
exports.getAvailableAgents = asyncHandler(async (req, res, next) => {
  const availableAgents = await AgentSettings.getAvailableAgents();
  
  const agentsWithStatus = await Promise.all(
    availableAgents.map(async (settings) => {
      const status = await AgentStatus.findOne({ userId: settings.userId._id });
      const user = settings.userId;
      return {
        userId: user._id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        email: user.email,
        phoneNumber: settings.phoneNumber,
        status: status?.status || 'offline',
        totalCallsHandled: status?.totalCallsHandled || 0,
        isAvailable: settings.isAvailable && status?.status !== 'offline' && status?.status !== 'on-call'
      };
    })
  );

  // 利用可能でオフラインでないエージェントのみフィルタリング
  const activeAgents = agentsWithStatus.filter(agent => agent.isAvailable);

  res.status(200).json({
    success: true,
    count: activeAgents.length,
    data: activeAgents
  });
});

// @desc    Get agent statistics
// @route   GET /api/agents/statistics
// @access  Private
exports.getAgentStatistics = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { startDate, endDate } = req.query;

  const CallSession = require('../models/CallSession');
  
  const dateRange = {};
  if (startDate) dateRange.start = new Date(startDate);
  if (endDate) dateRange.end = new Date(endDate);

  const stats = await CallSession.getCallStatistics(userId, dateRange);
  
  const agentStatus = await AgentStatus.findOne({ userId });

  res.status(200).json({
    success: true,
    data: {
      callStatistics: stats,
      totalCalls: agentStatus?.totalCallsHandled || 0,
      totalDuration: agentStatus?.totalCallDuration || 0,
      averageResponseTime: agentStatus?.averageResponseTime || 0
    }
  });
});

// @desc    Update notification preferences
// @route   PUT /api/agents/notifications
// @access  Private
exports.updateNotificationPreferences = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { 
    enableCallNotifications, 
    enableEmailNotifications,
    workingHours 
  } = req.body;

  let settings = await AgentSettings.findOne({ userId });

  if (!settings) {
    return next(new ErrorResponse('Agent settings not found. Please set phone number first.', 404));
  }

  if (enableCallNotifications !== undefined) {
    settings.notificationPreferences.enableCallNotifications = enableCallNotifications;
  }
  if (enableEmailNotifications !== undefined) {
    settings.notificationPreferences.enableEmailNotifications = enableEmailNotifications;
  }
  if (workingHours) {
    if (workingHours.start) settings.notificationPreferences.workingHours.start = workingHours.start;
    if (workingHours.end) settings.notificationPreferences.workingHours.end = workingHours.end;
    if (workingHours.timezone) settings.notificationPreferences.workingHours.timezone = workingHours.timezone;
  }

  await settings.save();

  res.status(200).json({
    success: true,
    data: settings.notificationPreferences
  });
});