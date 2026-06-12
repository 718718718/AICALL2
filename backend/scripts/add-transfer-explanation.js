require('dotenv').config();
const mongoose = require('mongoose');
const AgentSettings = require('../models/AgentSettings');

async function addTransferExplanationTemplate() {
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
      
      // transfer_explanationテンプレートを追加
      if (!settings.conversationSettings.customTemplates.transfer_explanation) {
        settings.conversationSettings.customTemplates.transfer_explanation = 'お忙しいところすみません。{{selfIntroduction}}。弊社は{{serviceDescription}}会社でございます。\n\nこれより直接担当者から詳細をご説明させて頂いてもよろしいでしょうか？\nお構いなければAIコールシステムから弊社の担当者に取り次ぎのうえご説明申し上げます。';
        needsUpdate = true;
        console.log('[Migration] Added transfer_explanation template');
      }
      
      if (needsUpdate) {
        await settings.save();
        console.log(`[Migration] Updated settings for userId: ${settings.userId}`);
      } else {
        console.log(`[Migration] No updates needed for userId: ${settings.userId}`);
      }
    }
    
    console.log('[Migration] Transfer explanation template migration completed successfully');
    await mongoose.disconnect();
    console.log('[Migration] Disconnected from MongoDB');
    
  } catch (error) {
    console.error('[Migration] Error:', error);
    process.exit(1);
  }
}

addTransferExplanationTemplate();