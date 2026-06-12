require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const AgentSettings = require('./models/AgentSettings');

async function createCompleteAgentSettings() {
  try {
    if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set'); process.exit(1); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // 登録したユーザーを取得
    const user = await User.findOne({ email: 'sekizawa1129@gmail.com' });
    if (!user) {
      console.error('User not found');
      return;
    }
    console.log('Found user:', user._id);
    
    // 既存のエージェント設定を削除
    await AgentSettings.deleteMany({ userId: user._id });
    
    // 新しいエージェント設定を作成
    const agentSettings = await AgentSettings.create({
      userId: user._id,
      phoneNumber: '09097509504',
      isAvailable: true,
      conversationSettings: {
        companyName: 'デフォルト企業',
        serviceName: 'AIコールシステム',
        representativeName: '安達',
        targetDepartment: '営業部',
        selfIntroduction: 'わたくしデフォルト企業の安達と申します',
        serviceDescription: 'AIが自動で営業電話をかけるサービスを提供している',
        targetPerson: '営業の担当者さま'
      },
      notificationPreferences: {
        enableCallNotifications: true,
        enableEmailNotifications: false,
        workingHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Asia/Tokyo'
        }
      },
      priority: 50
    });
    
    console.log('Agent settings created successfully:', agentSettings._id);
    await mongoose.disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  }
}

createCompleteAgentSettings();