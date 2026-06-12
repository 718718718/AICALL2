const mongoose = require('mongoose');
const AgentSettings = require('./models/AgentSettings');
const conversationEngine = require('./services/conversationEngine');

async function testSalesPitchTemplate() {
  try {
    // MongoDBに接続（.envファイルの設定を使用）
    require('dotenv').config();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB接続成功');

    const settings = await AgentSettings.findOne({}).sort({ createdAt: -1 });

    if (settings) {
      console.log('\n=== 現在のAgentSettings ===');
      console.log('companyName:', settings.conversationSettings.companyName);
      console.log('representativeName:', settings.conversationSettings.representativeName);
      console.log('serviceName:', settings.conversationSettings.serviceName);

      console.log('\n=== セールスピッチ設定 ===');
      console.log('companyDescription:', settings.conversationSettings.salesPitch?.companyDescription);
      console.log('callToAction:', settings.conversationSettings.salesPitch?.callToAction);

      console.log('\n=== 新しい単一テンプレートエンジンの結果 ===');
      const salesPitchResult = conversationEngine.processTemplate('sales_pitch', settings.conversationSettings);
      console.log('sales_pitch template result:', salesPitchResult);

      const purposeInquiryResult = conversationEngine.processTemplate('purpose_inquiry', settings.conversationSettings);
      console.log('purpose_inquiry template result:', purposeInquiryResult);

    } else {
      console.log('AgentSettingsが見つかりません');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('エラー:', error);
  }
}

testSalesPitchTemplate();