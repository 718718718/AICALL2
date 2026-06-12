require('dotenv').config();
const mongoose = require('mongoose');
const AgentSettings = require('../models/AgentSettings');

async function updateExistingData() {
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
      
      // systemMessagesが存在しない場合は追加
      if (!settings.conversationSettings.systemMessages) {
        settings.conversationSettings.systemMessages = {
          systemError: 'システムエラーが発生しました。申し訳ございません。',
          agentConnection: '担当者におつなぎいたします。少々お待ちください。',
          noAnswer: 'お客様、お聞きになれますか？',
          tooManyClarifications: '申し訳ございません。音声が聞き取りづらいようでしたら、後日改めてご連絡いたします。ありがとうございました。',
          unknown: '申し訳ございません。もう一度お聞きしてもよろしいでしょうか？'
        };
        needsUpdate = true;
        console.log('[Migration] Added systemMessages');
      }
      
      // 新しい変数フィールドが存在しない場合は追加
      if (!settings.conversationSettings.selfIntroduction) {
        settings.conversationSettings.selfIntroduction = 'わたくしＡＩコールシステムの安達と申します';
        needsUpdate = true;
        console.log('[Migration] Added selfIntroduction');
      }
      
      if (!settings.conversationSettings.serviceDescription) {
        settings.conversationSettings.serviceDescription = '新規テレアポや掘り起こしなどの営業電話を人間に代わって生成AIが電話をかけるというサービスを提供している';
        needsUpdate = true;
        console.log('[Migration] Added serviceDescription');
      }
      
      if (!settings.conversationSettings.targetPerson) {
        settings.conversationSettings.targetPerson = '営業の担当者さま';
        needsUpdate = true;
        console.log('[Migration] Added targetPerson');
      }
      
      if (needsUpdate) {
        await settings.save();
        console.log(`[Migration] Updated settings for userId: ${settings.userId}`);
      } else {
        console.log(`[Migration] No updates needed for userId: ${settings.userId}`);
      }
    }
    
    console.log('[Migration] Migration completed successfully');
    await mongoose.disconnect();
    console.log('[Migration] Disconnected from MongoDB');
    
  } catch (error) {
    console.error('[Migration] Error:', error);
    process.exit(1);
  }
}

updateExistingData();