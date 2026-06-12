const mongoose = require('mongoose');
const CallSession = require('../models/CallSession');
const AgentSettings = require('../models/AgentSettings');

async function migrateAiConfiguration() {
  try {
    require('dotenv').config();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB接続成功');

    console.log('\n=== 既存CallSessionのaiConfiguration修正を開始 ===');

    // すべてのCallSessionを取得
    const sessions = await CallSession.find({});
    console.log(`対象CallSession数: ${sessions.length}`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const session of sessions) {
      try {
        let needsUpdate = false;

        // aiConfigurationが存在しない場合は空オブジェクトで初期化
        if (!session.aiConfiguration) {
          session.aiConfiguration = {};
          needsUpdate = true;
        }

        // 不足しているフィールドをチェック
        if (!session.aiConfiguration.serviceDescription) {
          needsUpdate = true;
        }

        if (!session.aiConfiguration.targetPerson) {
          needsUpdate = true;
        }

        if (!session.aiConfiguration.salesPitch) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          // companyIdが不足している場合は設定
          if (!session.companyId) {
            session.companyId = 'default-company';
          }

          // 無効なcallResultを修正
          if (session.callResult === 'タイムアウト') {
            session.callResult = '失敗';
          }

          // assignedAgentからAgentSettingsを取得して補完
          let agentSettings = null;

          if (session.assignedAgent) {
            agentSettings = await AgentSettings.findOne({ userId: session.assignedAgent });
          }

          // AgentSettingsが見つからない場合は、最初のAgentSettingsを使用
          if (!agentSettings) {
            agentSettings = await AgentSettings.findOne();
          }

          if (agentSettings) {
            // 不足フィールドを補完
            if (!session.aiConfiguration.serviceDescription) {
              session.aiConfiguration.serviceDescription =
                agentSettings.conversationSettings?.serviceDescription ||
                '新規テレアポや掘り起こしなどの営業電話を人間に代わって生成AIが電話をかけるというサービスを提供している';
            }

            if (!session.aiConfiguration.targetPerson) {
              session.aiConfiguration.targetPerson =
                agentSettings.conversationSettings?.targetPerson ||
                '営業の担当者さま';
            }

            if (!session.aiConfiguration.salesPitch) {
              session.aiConfiguration.salesPitch = {
                companyDescription:
                  agentSettings.conversationSettings?.salesPitch?.companyDescription ||
                  'AIコールシステム株式会社では、生成AIを使った新規顧客獲得テレアポ支援により、AIが一次架電と仕分けを行い、見込み度の高いお客さまだけを営業におつなぎする仕組みをご提供しています。',
                callToAction:
                  agentSettings.conversationSettings?.salesPitch?.callToAction ||
                  '御社の営業部ご担当者さまに、概要だけご説明させていただけますか？',
                keyBenefits:
                  agentSettings.conversationSettings?.salesPitch?.keyBenefits || []
              };
            }

            await session.save();
            updatedCount++;
            console.log(`✓ Updated CallSession ${session._id}`);
          } else {
            console.warn(`⚠ No AgentSettings found for CallSession ${session._id}, using default values`);

            // デフォルト値で補完
            if (!session.aiConfiguration.serviceDescription) {
              session.aiConfiguration.serviceDescription = '新規テレアポや掘り起こしなどの営業電話を人間に代わって生成AIが電話をかけるというサービスを提供している';
            }

            if (!session.aiConfiguration.targetPerson) {
              session.aiConfiguration.targetPerson = '営業の担当者さま';
            }

            if (!session.aiConfiguration.salesPitch) {
              session.aiConfiguration.salesPitch = {
                companyDescription: 'AIコールシステム株式会社では、生成AIを使った新規顧客獲得テレアポ支援により、AIが一次架電と仕分けを行い、見込み度の高いお客さまだけを営業におつなぎする仕組みをご提供しています。',
                callToAction: '御社の営業部ご担当者さまに、概要だけご説明させていただけますか？',
                keyBenefits: []
              };
            }

            await session.save();
            updatedCount++;
            console.log(`✓ Updated CallSession ${session._id} with default values`);
          }
        }
      } catch (error) {
        console.error(`✗ Error updating CallSession ${session._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n=== 移行完了 ===');
    console.log(`更新成功: ${updatedCount}`);
    console.log(`エラー: ${errorCount}`);

    // 修正後の状態を確認
    console.log('\n=== 修正後の状態確認 ===');
    const updatedSessions = await CallSession.find({}).limit(3);

    for (const session of updatedSessions) {
      console.log(`\nCallSession ${session._id}:`);
      console.log('- companyName:', session.aiConfiguration?.companyName);
      console.log('- serviceName:', session.aiConfiguration?.serviceName);
      console.log('- representativeName:', session.aiConfiguration?.representativeName);
      console.log('- targetDepartment:', session.aiConfiguration?.targetDepartment);
      console.log('- serviceDescription:', session.aiConfiguration?.serviceDescription ? '✓' : '✗');
      console.log('- targetPerson:', session.aiConfiguration?.targetPerson ? '✓' : '✗');
      console.log('- salesPitch:', session.aiConfiguration?.salesPitch ? '✓' : '✗');
      if (session.aiConfiguration?.salesPitch) {
        console.log('  - companyDescription:', session.aiConfiguration.salesPitch.companyDescription ? '✓' : '✗');
        console.log('  - callToAction:', session.aiConfiguration.salesPitch.callToAction ? '✓' : '✗');
      }
    }

    await mongoose.disconnect();
    console.log('\nMongoDB接続を閉じました');

  } catch (error) {
    console.error('移行エラー:', error);
    process.exit(1);
  }
}

migrateAiConfiguration();