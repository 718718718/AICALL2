require('dotenv').config();
const mongoose = require('mongoose');
const AgentSettings = require('./models/AgentSettings');
const User = require('./models/User');

const setupAgent = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');
    
    // 管理者ユーザーを取得
    const adminUser = await User.findOne({ email: 'admin@example.com' });
    if (!adminUser) {
      console.log('管理者ユーザーが見つかりません');
      process.exit(1);
    }
    
    // 既存の設定をチェック
    const existingSettings = await AgentSettings.findOne({ userId: adminUser._id });
    if (existingSettings) {
      console.log('既存のエージェント設定があります:', existingSettings._id);
      await mongoose.connection.close();
      return;
    }
    
    // エージェント設定を作成
    const settings = await AgentSettings.create({
      userId: adminUser._id,
      phoneNumber: '+819012345678',
      conversationSettings: {
        companyName: 'AIコールシステム株式会社',
        serviceName: 'AIアシスタントサービス',
        representativeName: 'AI担当者',
        targetDepartment: '営業部'
      }
    });
    
    console.log('エージェント設定を作成しました:', settings._id);
    await mongoose.connection.close();
  } catch (error) {
    console.error('エラー:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

setupAgent();