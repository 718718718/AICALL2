const mongoose = require('mongoose');
const AgentSettings = require('./models/AgentSettings');
const { buildOpenAIInstructions } = require('./utils/promptBuilder');

async function checkSettings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-call-system');

    const settings = await AgentSettings.findOne({ userId: '68a070f04f58e8af1812b113' });

    if (!settings) {
      console.log('設定が見つかりません');
      process.exit(1);
    }

    console.log('=== AI設定の確認 ===');
    console.log('voice:', settings.voice);
    console.log('conversationStyle:', settings.conversationSettings?.conversationStyle);
    console.log('speechRate:', settings.conversationSettings?.speechRate);

    console.log('\n=== promptBuilder.jsでの出力確認 ===');
    const instructions = buildOpenAIInstructions(settings);
    const lines = instructions.split('\n');
    const toneSection = lines.findIndex(l => l.includes('【トーン・話し方】'));

    if (toneSection !== -1) {
      console.log(lines.slice(toneSection, toneSection + 6).join('\n'));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSettings();
