const express = require('express');
const router = express.Router();
const https = require('https');
const { protect } = require('../middlewares/authMiddleware');
const CallSession = require('../models/CallSession');
const Customer = require('../models/Customer');
const config = require('../config/environment');

// 認証必須
router.use(protect);

// @desc    Get call history with filters
// @route   GET /api/call-history
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search,
      status,
      result,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // クエリ構築 - ログインユーザーのデータのみ取得
    // Twilioに実際に発信されたコールのみ表示（twilioCallSidが有効なもののみ）
    const query = {
      assignedAgent: req.user._id || req.user.id,
      twilioCallSid: { $exists: true, $nin: [null, 'pending'] }
    };

    // 検索条件
    if (search) {
      // 顧客名で検索するため、まず同じ会社の顧客を検索
      const customers = await Customer.find({
        userId: req.user._id,
        $or: [
          { customer: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      });
      const customerIds = customers.map(c => c._id);
      query.customerId = { $in: customerIds };
    }

    // ステータスフィルター
    if (status) {
      query.status = status;
    }

    // 結果フィルター
    if (result) {
      query.callResult = result;
    }

    // 日付範囲フィルター
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // ページネーション計算
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // ソート設定
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // データ取得
    const [calls, total] = await Promise.all([
      CallSession.find(query)
        .populate('customerId', 'customer company phone email')
        .populate('assignedAgent', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      CallSession.countDocuments(query)
    ]);

    // データ整形
    const formattedCalls = calls.map(call => {
      // 通話時間を計算（秒単位）
      let duration = 0;
      if (typeof call.duration === 'number' && !Number.isNaN(call.duration)) {
        duration = call.duration;
      } else if (call.endTime && call.startTime) {
        duration = Math.floor((new Date(call.endTime) - new Date(call.startTime)) / 1000);
      }

      // 分:秒形式に変換
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      const formattedDuration = `${minutes}分${seconds}秒`;

      return {
        id: call._id,
        customer: call.customerId ? {
          id: call.customerId._id,
          name: call.customerId.customer || '不明',
          phone: call.customerId.phone || call.phoneNumber || '不明',
          company: call.customerId.company || ''
        } : {
          name: '不明',
          phone: call.phoneNumber || '不明',
          company: ''
        },
        date: call.createdAt,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: formattedDuration,
        durationSeconds: duration,
        status: call.status,
        result: call.callResult || '未設定',
        notes: call.notes || '',
        assignedAgent: call.assignedAgent ? {
          id: call.assignedAgent._id,
          name: `${call.assignedAgent.firstName || ''} ${call.assignedAgent.lastName || ''}`.trim() || call.assignedAgent.email
        } : null,
        twilioCallSid: call.twilioCallSid,
        recordingUrl: call.recordingUrl,
        // 録音がダウンロード可能かどうか（twilioRecordingUrlまたはrecordingSidが必要）
        hasRecording: !!(call.twilioRecordingUrl || call.recordingSid),
        hasTranscript: call.transcript && call.transcript.length > 0,
        transcriptCount: call.transcript ? call.transcript.length : 0
      };
    });

    // ページネーション情報
    const totalPages = Math.ceil(total / parseInt(limit));
    const currentPage = parseInt(page);

    res.json({
      success: true,
      data: formattedCalls,
      pagination: {
        currentPage,
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1
      }
    });

  } catch (error) {
    console.error('Error fetching call history:', error);
    res.status(500).json({
      success: false,
      error: 'コール履歴の取得に失敗しました'
    });
  }
});

// @desc    Get call details with transcript
// @route   GET /api/call-history/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const call = await CallSession.findOne({
      _id: req.params.id,
      assignedAgent: req.user._id || req.user.id
    })
      .populate('customerId', 'customer company phone email')
      .populate('assignedAgent', 'firstName lastName email')
      .lean();

    if (!call) {
      return res.status(404).json({
        success: false,
        error: '通話記録が見つかりません'
      });
    }

    // 通話時間を計算
    let duration = 0;
    if (typeof call.duration === 'number' && !Number.isNaN(call.duration)) {
      duration = call.duration;
    } else if (call.endTime && call.startTime) {
      duration = Math.floor((new Date(call.endTime) - new Date(call.startTime)) / 1000);
    }

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    const formattedCall = {
      id: call._id,
      customer: call.customerId ? {
        name: call.customerId.customer || '不明',
        phone: call.customerId.phone || call.phoneNumber || '不明',
        company: call.customerId.company || ''
      } : { name: '不明', phone: call.phoneNumber || '不明' },
      date: call.createdAt,
      startTime: call.startTime,
      endTime: call.endTime,
      duration: `${minutes}分${seconds}秒`,
      durationSeconds: duration,
      status: call.status,
      result: call.callResult || '未設定',
      notes: call.notes || '',
      assignedAgent: call.assignedAgent,
      twilioCallSid: call.twilioCallSid,
      recordingUrl: call.recordingUrl,
      // 録音がダウンロード可能かどうか（twilioRecordingUrlまたはrecordingSidが必要）
      hasRecording: !!(call.twilioRecordingUrl || call.recordingSid),
      transcript: call.transcript || [],
      handoffDetails: call.handoffDetails,
      aiConfiguration: call.aiConfiguration
    };

    res.json({
      success: true,
      data: formattedCall
    });

  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({
      success: false,
      error: '通話詳細の取得に失敗しました'
    });
  }
});

// @desc    Download recording from Twilio (proxy)
// @route   GET /api/call-history/:id/recording
// @access  Private
router.get('/:id/recording', async (req, res) => {
  try {
    const call = await CallSession.findOne({
      _id: req.params.id,
      assignedAgent: req.user._id || req.user.id
    }).lean();

    if (!call) {
      return res.status(404).json({
        success: false,
        error: '通話記録が見つかりません'
      });
    }

    // twilioRecordingUrlを優先、なければrecordingSidからURLを構築
    let twilioUrl = call.twilioRecordingUrl;

    if (!twilioUrl && call.recordingSid) {
      twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Recordings/${call.recordingSid}`;
    }

    if (!twilioUrl) {
      return res.status(404).json({
        success: false,
        error: '録音データが見つかりません'
      });
    }

    // WAV形式でダウンロード
    const recordingUrl = twilioUrl.endsWith('.wav') ? twilioUrl : `${twilioUrl}.wav`;

    console.log('[CallHistory] Proxying recording from Twilio:', recordingUrl);

    // Twilio認証情報
    const authString = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');

    // Twilioから録音をフェッチしてストリーミング
    const twilioRequest = https.get(recordingUrl, {
      headers: {
        'Authorization': `Basic ${authString}`
      }
    }, (twilioResponse) => {
      // リダイレクトの処理
      if (twilioResponse.statusCode === 301 || twilioResponse.statusCode === 302) {
        const redirectUrl = twilioResponse.headers.location;
        console.log('[CallHistory] Following redirect to:', redirectUrl);

        // リダイレクト先にアクセス（認証不要の場合が多い）
        https.get(redirectUrl, (redirectResponse) => {
          if (redirectResponse.statusCode !== 200) {
            console.error('[CallHistory] Redirect failed:', redirectResponse.statusCode);
            return res.status(500).json({
              success: false,
              error: '録音のダウンロードに失敗しました'
            });
          }

          // ファイル名を生成
          const filename = `recording_${call._id}.wav`;

          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

          if (redirectResponse.headers['content-length']) {
            res.setHeader('Content-Length', redirectResponse.headers['content-length']);
          }

          redirectResponse.pipe(res);
        }).on('error', (error) => {
          console.error('[CallHistory] Redirect request error:', error);
          res.status(500).json({
            success: false,
            error: '録音のダウンロードに失敗しました'
          });
        });
        return;
      }

      if (twilioResponse.statusCode !== 200) {
        console.error('[CallHistory] Twilio response error:', twilioResponse.statusCode);
        return res.status(500).json({
          success: false,
          error: '録音のダウンロードに失敗しました'
        });
      }

      // ファイル名を生成
      const filename = `recording_${call._id}.wav`;

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      if (twilioResponse.headers['content-length']) {
        res.setHeader('Content-Length', twilioResponse.headers['content-length']);
      }

      twilioResponse.pipe(res);
    });

    twilioRequest.on('error', (error) => {
      console.error('[CallHistory] Twilio request error:', error);
      res.status(500).json({
        success: false,
        error: '録音のダウンロードに失敗しました'
      });
    });

  } catch (error) {
    console.error('[CallHistory] Error downloading recording:', error);
    res.status(500).json({
      success: false,
      error: '録音のダウンロードに失敗しました'
    });
  }
});

// @desc    Update call notes/result
// @route   PUT /api/call-history/:id
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const { notes, callResult } = req.body;
    
    const updateData = {};
    if (notes !== undefined) updateData.notes = notes;
    if (callResult !== undefined) updateData.callResult = callResult;

    const call = await CallSession.findOneAndUpdate(
      {
        _id: req.params.id,
        assignedAgent: req.user._id || req.user.id
      },
      updateData,
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: '通話記録が見つかりません'
      });
    }

    res.json({
      success: true,
      data: call
    });

  } catch (error) {
    console.error('Error updating call:', error);
    res.status(500).json({
      success: false,
      error: '通話記録の更新に失敗しました'
    });
  }
});

// @desc    Delete call history records (bulk)
// @route   DELETE /api/call-history/bulk
// @access  Private
router.delete('/bulk', async (req, res) => {
  try {
    const { callIds } = req.body;

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '削除するコールIDを指定してください'
      });
    }

    // ログインユーザーに属するコールのみ削除
    const result = await CallSession.deleteMany({
      _id: { $in: callIds },
      assignedAgent: req.user._id || req.user.id
    });

    res.json({
      success: true,
      message: `${result.deletedCount}件のコール履歴を削除しました`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Error deleting call history:', error);
    res.status(500).json({
      success: false,
      error: 'コール履歴の削除に失敗しました'
    });
  }
});

// @desc    Delete single call history record
// @route   DELETE /api/call-history/:id
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const call = await CallSession.findOneAndDelete({
      _id: req.params.id,
      assignedAgent: req.user._id || req.user.id
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: '通話記録が見つかりません'
      });
    }

    res.json({
      success: true,
      message: 'コール履歴を削除しました'
    });

  } catch (error) {
    console.error('Error deleting call:', error);
    res.status(500).json({
      success: false,
      error: 'コール履歴の削除に失敗しました'
    });
  }
});

// @desc    Get call statistics
// @route   GET /api/call-history/stats/summary
// @access  Private
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // ログインユーザーのIDでフィルタリング
    // Twilioに実際に発信されたコールのみ集計（twilioCallSidが有効なもののみ）
    const query = {
      assignedAgent: req.user._id || req.user.id,
      twilioCallSid: { $exists: true, $nin: [null, 'pending'] }
    };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // 統計情報を集計（startTimeとendTimeから実際の通話時間を計算）
    const stats = await CallSession.aggregate([
      { $match: query },
      {
        $addFields: {
          calculatedDuration: {
            $cond: {
              if: { $ne: ['$duration', null] },
              then: '$duration',
              else: {
                $cond: {
                  if: { $and: [{ $ne: ['$endTime', null] }, { $ne: ['$startTime', null] }] },
                  then: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 1000] },
                  else: 0
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          avgDuration: { $avg: '$calculatedDuration' },
          totalDuration: { $sum: '$calculatedDuration' },
          successCount: {
            $sum: { $cond: [{ $eq: ['$callResult', '成功'] }, 1, 0] }
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ['$callResult', '不在'] }, 1, 0] }
          },
          rejectCount: {
            $sum: { $cond: [{ $eq: ['$callResult', '拒否'] }, 1, 0] }
          },
          followUpCount: {
            $sum: { $cond: [{ $eq: ['$callResult', '要フォロー'] }, 1, 0] }
          }
        }
      }
    ]);

    // 顧客テーブルから未対応件数を取得（ログインユーザーの会社のデータのみ）
    const pendingCount = await Customer.countDocuments({
      userId: req.user._id,
      result: '未対応'
    });

    // デフォルト値
    const defaultStats = {
      totalCalls: 0,
      avgDuration: 0,
      successCount: 0,
      absentCount: 0,
      rejectCount: 0,
      followUpCount: 0
    };

    const summary = stats[0] || defaultStats;
    
    // 成功率の計算
    const successRate = summary.totalCalls > 0 
      ? Math.round((summary.successCount / summary.totalCalls) * 100)
      : 0;
    
    // 平均通話時間のフォーマット（秒を分:秒形式に）
    const avgDurationSeconds = Math.round(summary.avgDuration || 0);
    const minutes = Math.floor(avgDurationSeconds / 60);
    const seconds = avgDurationSeconds % 60;
    const avgDurationFormatted = `${minutes}分${seconds}秒`;

    res.json({
      success: true,
      data: {
        totalCalls: summary.totalCalls,
        successRate: successRate,
        avgDuration: avgDurationFormatted,
        pendingCount: pendingCount // 顧客テーブルから取得した未対応件数
      }
    });

  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: '統計情報の取得に失敗しました'
    });
  }
});

module.exports = router;
