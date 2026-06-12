require('dotenv').config();
const mongoose = require('mongoose');
const AgentSettings = require('../models/AgentSettings');

async function addPrepareTransferTemplate() {
  try {
    console.log('[Migration] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Migration] Connected to MongoDB');
    
    // 既存のすべてのAgentSettingsを取得
    const allSettings = await AgentSettings.find({});
    console.log(`[Migration] Found ${allSettings.length} AgentSettings records`);
    
    for (let i = 0; i < allSettings.length; i++) {
      const settings = allSettings[i];
      console.log(`[Migration] Updating record ${i + 1}/${allSettings.length} - userId: ${settings.userId}`);
      
      let needsUpdate = false;
      
      // conversationSettingsが存在しない場合は初期化
      if (!settings.conversationSettings) {
        settings.conversationSettings = {};
        needsUpdate = true;
      }
      
      // customTemplatesが存在しない場合は初期化
      if (!settings.conversationSettings.customTemplates) {
        settings.conversationSettings.customTemplates = {};
        needsUpdate = true;
      }
      
      // prepare_transferテンプレートを追加
      if (!settings.conversationSettings.customTemplates.prepare_transfer) {
        settings.conversationSettings.customTemplates.prepare_transfer = 'ありがとうございます。よろしくお願いいたします。';
        needsUpdate = true;
        console.log('[Migration] Added prepare_transfer template');
      }
      
      if (needsUpdate) {
        await settings.save();
        console.log(`[Migration] Updated settings for userId: ${settings.userId}`);
      } else {
        console.log(`[Migration] No updates needed for userId: ${settings.userId}`);
      }
    }
    
    console.log('[Migration] Prepare transfer template migration completed successfully');
    await mongoose.disconnect();
    console.log('[Migration] Disconnected from MongoDB');
    
  } catch (error) {
    console.error('[Migration] Error:', error);
    process.exit(1);
  }
}

addPrepareTransferTemplate();