const mongoose = require('mongoose');
const AgentSettings = require('../models/AgentSettings');

async function addTransferConfirmedTemplate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_call_system');
    console.log('Connected to MongoDB');

    // 全てのAgentSettingsを更新
    const result = await AgentSettings.updateMany(
      {},
      {
        $set: {
          'conversationTemplates.transfer_confirmed': 'ありがとうございます。転送いたしますので少々お待ち下さい。'
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} AgentSettings documents`);

    // 更新後の確認
    const updated = await AgentSettings.findOne();
    if (updated && updated.conversationTemplates.transfer_confirmed) {
      console.log('✅ transfer_confirmed template added successfully');
      console.log('Template content:', updated.conversationTemplates.transfer_confirmed);
    } else {
      console.log('❌ Failed to add transfer_confirmed template');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error updating AgentSettings:', error);
    process.exit(1);
  }
}

addTransferConfirmedTemplate();