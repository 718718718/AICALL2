/**
 * プロンプト品質チェック用スクリプト
 *
 * このスクリプトで以下を設定・確認できます：
 * 1. Layer 2の企業設定変数（companyName, serviceName等）
 * 2. 生成されるOpenAI Realtime API用のinstructions全文
 *
 * 使い方:
 *   node backend/test-prompt.js
 */

const { buildOpenAIInstructions } = require('./utils/promptBuilder');

// ========================================
// ここで Layer 2 の変数を設定してください
// ========================================

const testAgentSettings = {
  conversationSettings: {
    // 基本情報
    companyName: '合同会社テスト会社',
    serviceName: 'AIコールアシスタント',
    representativeName: '鬼龍院',
    targetDepartment: '営業部',
    targetPerson: 'ご担当者様',

    // サービス説明（簡潔に、1文推奨）
    serviceDescription: 'ペットの健康状態を管理するサービス',

    // salesPitch（詳細説明、担当者に質問された時用）
    salesPitch: {
      companyDescription: '弊社では、AIが一次架電を行い、見込み度の高いお客様だけを営業におつなぎするサービスを提供しております',
      serviceDescription: 'AIが自動で一次架電を行い、要件把握と見込み度のスコアリングを実施。高確度の見込み客のみを人間の営業に引き継ぐことで、架電の無駄を削減し、商談化率の向上に寄与します',
      callToAction: 'ぜひ御社の営業部ご担当者様に概要をご案内できればと思いまして'
    },

    // 会話スタイル（formal, casual, friendly）
    conversationStyle: 'formal',

    // 1回の発言での最大文数
    maxSentencesPerTurn: 3,

    // カスタムテンプレート（オプション、未設定の場合はデフォルト使用）
    customTemplates: {
      // initial: 'お世話になります。{{selfIntroduction}}でございます...',
      // clarification: '...',
      // 等々、上書きしたいテンプレートがあればここに記述
    },

    // 企業独自のガイドライン（オプション）
    behaviorGuidelines: `- 丁寧で簡潔に話す
- 相手の時間を尊重する
- 断られたらすぐに引き下がる
- 業界の専門用語は使わない`
  },

  // OpenAI設定
  voice: 'alloy',  // alloy, echo, shimmer
  tools: []
};

// ========================================
// プロンプト生成と出力
// ========================================

console.log('='.repeat(80));
console.log('📋 プロンプト品質チェック');
console.log('='.repeat(80));
console.log('');

console.log('【設定内容】');
console.log(`会社名: ${testAgentSettings.conversationSettings.companyName}`);
console.log(`サービス名: ${testAgentSettings.conversationSettings.serviceName}`);
console.log(`担当者名: ${testAgentSettings.conversationSettings.representativeName}`);
console.log(`対象部署: ${testAgentSettings.conversationSettings.targetDepartment}`);
console.log(`サービス説明: ${testAgentSettings.conversationSettings.serviceDescription}`);
console.log('');

try {
  const instructions = buildOpenAIInstructions(testAgentSettings);

  console.log('='.repeat(80));
  console.log('🤖 生成されたOpenAI Instructions全文');
  console.log('='.repeat(80));
  console.log('');
  console.log(instructions);
  console.log('');
  console.log('='.repeat(80));
  console.log(`✅ 文字数: ${instructions.length} 文字`);
  console.log('='.repeat(80));

} catch (error) {
  console.error('❌ プロンプト生成エラー:', error.message);
  console.error(error.stack);
}
