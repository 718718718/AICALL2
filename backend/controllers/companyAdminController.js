const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/ErrorResponse');
const User = require('../models/User');
const CallSession = require('../models/CallSession');
const Company = require('../models/Company');

// @desc    Get company admin dashboard stats
// @route   GET /api/company-admin/dashboard-stats
// @access  Private (Company Admin)
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const companyId = req.user.companyId;

  if (!companyId) {
    return next(new ErrorResponse('User is not associated with any company', 400));
  }

  try {
    // 企業情報を取得
    const company = await Company.findOne({ companyId });
    
    // 企業のユーザー数を取得
    const totalUsers = await User.countDocuments({ companyId });
    const activeUsers = await User.countDocuments({ 
      companyId,
      // 最近30日以内にログインしたユーザーをアクティブとする
      updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    // 企業のユーザーIDリストを取得
    const companyUsers = await User.find({ companyId }).select('_id');
    const userIds = companyUsers.map(user => user._id);

    // 通話統計を取得
    const totalCalls = await CallSession.countDocuments({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ]
    });

    const successfulCalls = await CallSession.countDocuments({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ],
      callResult: '成功'
    });

    // 今日の通話数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const callsToday = await CallSession.countDocuments({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ],
      createdAt: { $gte: today, $lt: tomorrow }
    });

    // 平均通話時間を計算
    const callSessions = await CallSession.find({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ],
      duration: { $exists: true, $gt: 0 }
    }).select('duration');

    const averageCallDuration = callSessions.length > 0 
      ? Math.round(callSessions.reduce((sum, call) => sum + call.duration, 0) / callSessions.length)
      : 0;

    // 最近の通話履歴を取得
    const recentCalls = await CallSession.find({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ]
    })
      .populate('customerId', 'customer')
      .populate('assignedAgent', 'firstName lastName')
      .populate('handoffDetails.requestedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('customerId assignedAgent handoffDetails.requestedBy duration callResult createdAt');

    const formattedRecentCalls = recentCalls.map(call => ({
      id: call._id,
      customerName: call.customerId?.customer || '不明',
      userAgent: call.assignedAgent 
        ? `${call.assignedAgent.lastName} ${call.assignedAgent.firstName}`
        : call.handoffDetails?.requestedBy
        ? `${call.handoffDetails.requestedBy.lastName} ${call.handoffDetails.requestedBy.firstName}`
        : '不明',
      duration: call.duration || 0,
      result: call.callResult || '処理中',
      timestamp: call.createdAt
    }));

    res.status(200).json({
      success: true,
      data: {
        companyInfo: company ? {
          id: company.companyId,
          name: company.name,
          status: company.status
        } : null,
        stats: {
          totalUsers,
          activeUsers,
          totalCalls,
          successfulCalls,
          averageCallDuration,
          callsToday
        },
        recentCalls: formattedRecentCalls
      }
    });

  } catch (error) {
    return next(new ErrorResponse(`Failed to get dashboard stats: ${error.message}`, 500));
  }
});

// @desc    Get company users
// @route   GET /api/company-admin/users
// @access  Private (Company Admin)
exports.getCompanyUsers = asyncHandler(async (req, res, next) => {
  const companyId = req.user.companyId;

  if (!companyId) {
    return next(new ErrorResponse('User is not associated with any company', 400));
  }

  try {
    // 企業のユーザー一覧を取得
    const users = await User.find({ companyId })
      .select('-password')
      .sort({ createdAt: -1 });

    // 各ユーザーの通話統計を取得
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const totalCalls = await CallSession.countDocuments({
          $or: [
            { assignedAgent: user._id },
            { 'handoffDetails.requestedBy': user._id }
          ]
        });

        const successfulCalls = await CallSession.countDocuments({
          $or: [
            { assignedAgent: user._id },
            { 'handoffDetails.requestedBy': user._id }
          ],
          callResult: '成功'
        });

        return {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          businessType: user.businessType,
          employees: user.employees,
          handoffPhoneNumber: user.handoffPhoneNumber ? 'configured' : null,
          isCompanyAdmin: user.isCompanyAdmin || false,
          createdAt: user.createdAt,
          lastLoginAt: user.updatedAt, // 簡易的な最終ログイン時刻
          totalCalls,
          successfulCalls
        };
      })
    );

    res.status(200).json({
      success: true,
      data: usersWithStats
    });

  } catch (error) {
    return next(new ErrorResponse(`Failed to get company users: ${error.message}`, 500));
  }
});

// @desc    Toggle user company admin status
// @route   PUT /api/company-admin/users/:userId/admin
// @access  Private (Company Admin)
exports.toggleUserAdminStatus = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { isCompanyAdmin } = req.body;
  const adminId = req.user.id;
  const companyId = req.user.companyId;

  if (!companyId) {
    return next(new ErrorResponse('User is not associated with any company', 400));
  }

  try {
    // 対象ユーザーが同じ企業に所属しているかチェック
    const targetUser = await User.findOne({ _id: userId, companyId });
    if (!targetUser) {
      return next(new ErrorResponse('User not found in your company', 404));
    }

    // 自分自身の権限を削除しようとしている場合はエラー
    if (userId === adminId && !isCompanyAdmin) {
      return next(new ErrorResponse('Cannot remove your own admin privileges', 400));
    }

    // 権限を更新
    await User.findByIdAndUpdate(userId, {
      isCompanyAdmin: isCompanyAdmin
    });

    res.status(200).json({
      success: true,
      message: `User admin status updated successfully`
    });

  } catch (error) {
    return next(new ErrorResponse(`Failed to update user admin status: ${error.message}`, 500));
  }
});

// @desc    Get company call reports
// @route   GET /api/company-admin/reports
// @access  Private (Company Admin)
exports.getCompanyReports = asyncHandler(async (req, res, next) => {
  const companyId = req.user.companyId;
  const { period = '7days' } = req.query;

  if (!companyId) {
    return next(new ErrorResponse('User is not associated with any company', 400));
  }

  try {
    // 期間を設定
    let startDate = new Date();
    switch (period) {
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // 企業のユーザーIDリストを取得
    const companyUsers = await User.find({ companyId }).select('_id firstName lastName');
    const userIds = companyUsers.map(user => user._id);

    // 期間内の通話データを取得
    const calls = await CallSession.find({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ],
      createdAt: { $gte: startDate }
    });

    // 統計データを計算
    const totalCalls = calls.length;
    const successfulCalls = calls.filter(call => call.callResult === '成功').length;
    const failedCalls = calls.filter(call => ['拒否', '不在', '失敗'].includes(call.callResult)).length;
    const pendingCalls = calls.filter(call => !call.callResult || call.callResult === '処理中').length;
    
    const callsWithDuration = calls.filter(call => call.duration && call.duration > 0);
    const averageDuration = callsWithDuration.length > 0
      ? Math.round(callsWithDuration.reduce((sum, call) => sum + call.duration, 0) / callsWithDuration.length)
      : 0;
    
    const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;

    // 日別統計を作成
    const dailyStatsMap = new Map();
    calls.forEach(call => {
      const date = call.createdAt.toISOString().split('T')[0];
      if (!dailyStatsMap.has(date)) {
        dailyStatsMap.set(date, { calls: 0, success: 0, totalDuration: 0, count: 0 });
      }
      const stats = dailyStatsMap.get(date);
      stats.calls++;
      if (call.callResult === '成功') {
        stats.success++;
      }
      if (call.duration && call.duration > 0) {
        stats.totalDuration += call.duration;
        stats.count++;
      }
    });

    const dailyStats = Array.from(dailyStatsMap.entries()).map(([date, stats]) => ({
      date,
      calls: stats.calls,
      success: stats.success,
      duration: stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // ユーザー別パフォーマンス
    const userPerformanceMap = new Map();
    calls.forEach(call => {
      const userId = call.assignedAgent || call.handoffDetails?.requestedBy;
      if (userId) {
        const userIdStr = userId.toString();
        if (!userPerformanceMap.has(userIdStr)) {
          userPerformanceMap.set(userIdStr, {
            totalCalls: 0,
            successfulCalls: 0,
            totalDuration: 0,
            durationCount: 0
          });
        }
        const userStats = userPerformanceMap.get(userIdStr);
        userStats.totalCalls++;
        if (call.callResult === '成功') {
          userStats.successfulCalls++;
        }
        if (call.duration && call.duration > 0) {
          userStats.totalDuration += call.duration;
          userStats.durationCount++;
        }
      }
    });

    const userPerformance = Array.from(userPerformanceMap.entries()).map(([userId, stats]) => {
      const user = companyUsers.find(u => u._id.toString() === userId);
      return {
        userId,
        name: user ? `${user.lastName} ${user.firstName}` : '不明',
        totalCalls: stats.totalCalls,
        successfulCalls: stats.successfulCalls,
        averageDuration: stats.durationCount > 0 ? Math.round(stats.totalDuration / stats.durationCount) : 0,
        successRate: stats.totalCalls > 0 ? (stats.successfulCalls / stats.totalCalls) * 100 : 0
      };
    }).sort((a, b) => b.totalCalls - a.totalCalls);

    res.status(200).json({
      success: true,
      data: {
        callStats: {
          totalCalls,
          successfulCalls,
          failedCalls,
          pendingCalls,
          averageDuration,
          successRate
        },
        dailyStats,
        userPerformance
      }
    });

  } catch (error) {
    return next(new ErrorResponse(`Failed to get company reports: ${error.message}`, 500));
  }
});

// @desc    Export company reports as CSV
// @route   GET /api/company-admin/reports/export
// @access  Private (Company Admin)
exports.exportCompanyReports = asyncHandler(async (req, res, next) => {
  const companyId = req.user.companyId;
  const { period = '7days' } = req.query;

  if (!companyId) {
    return next(new ErrorResponse('User is not associated with any company', 400));
  }

  try {
    // 期間を設定
    let startDate = new Date();
    switch (period) {
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // 企業のユーザーIDリストを取得
    const companyUsers = await User.find({ companyId }).select('_id firstName lastName');
    const userIds = companyUsers.map(user => user._id);

    // 期間内の通話データを取得
    const calls = await CallSession.find({
      $or: [
        { assignedAgent: { $in: userIds } },
        { 'handoffDetails.requestedBy': { $in: userIds } }
      ],
      createdAt: { $gte: startDate }
    })
      .populate('customerId', 'customer phone')
      .populate('assignedAgent', 'firstName lastName')
      .populate('handoffDetails.requestedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    // CSV形式でデータを作成
    const csvHeader = '日時,顧客名,顧客電話番号,担当者,通話時間(秒),結果,ステータス\n';
    const csvRows = calls.map(call => {
      const date = call.createdAt.toLocaleString('ja-JP');
      const customerName = call.customerId?.customer || '不明';
      const customerPhone = call.customerId?.phone || '';
      const agent = call.assignedAgent 
        ? `${call.assignedAgent.lastName} ${call.assignedAgent.firstName}`
        : call.handoffDetails?.requestedBy
        ? `${call.handoffDetails.requestedBy.lastName} ${call.handoffDetails.requestedBy.firstName}`
        : '不明';
      const duration = call.duration || 0;
      const result = call.callResult || '';
      const status = call.status || '';

      return `"${date}","${customerName}","${customerPhone}","${agent}",${duration},"${result}","${status}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=call-report-${period}-${new Date().toISOString().split('T')[0]}.csv`);
    
    // UTF-8 BOMを追加（Excelでの文字化け防止）
    res.write('\uFEFF');
    res.end(csvContent);

  } catch (error) {
    return next(new ErrorResponse(`Failed to export company reports: ${error.message}`, 500));
  }
});

module.exports = exports;