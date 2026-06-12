const mongoose = require('mongoose');
const User = require('./models/User');
const AgentSettings = require('./models/AgentSettings');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-call-system')
  .then(async () => {
    const user = await User.findOne({ email: 'test@gmail.com' });
    if (!user) {
      console.log('ユーザーが見つかりません');
      process.exit(1);
    }
    
    const settings = await AgentSettings.findOne({ userId: user._id });
    if (!settings) {
      console.log('AgentSettingsが見つかりません');
      process.exit(1);
    }
    
    console.log('=== test@gmail.com のAI設定 ===');
    console.log('userId:', user._id);
    console.log('voice:', settings.voice);
    console.log('speechRate:', settings.conversationSettings?.speechRate);
    console.log('conversationStyle:', settings.conversationSettings?.conversationStyle);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
