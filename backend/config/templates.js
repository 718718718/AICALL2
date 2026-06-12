/**
 * テンプレート統一設定ファイル
 * 全てのインテント→テンプレートマッピングとデフォルトテンプレートを管理
 */

// インテント名 → AgentSettingsのテンプレート名のマッピング
const intentToTemplate = {
  // 肯定的応答系
  normal_response: 'positive_response',
  positive_response: 'positive_response',

  // 担当者変更・転送系
  person_changed: 'transfer_accepted',
  transfer_explanation: 'transfer_explanation',
  prepare_transfer: 'prepare_transfer',
  transfer_wait: 'positive_response',
  transfer_confirm: 'positive_response',
  transfer_handover: 'transfer_accepted',

  // 転送確定（サービス説明後の同意）
  transfer_agreement: 'transfer_confirmed',

  // 確認・問い合わせ系（統合）
  purpose_inquiry: 'clarification',
  company_inquiry: 'clarification',
  clarification_request: 'clarification',

  // 終了系
  absent: 'absent',
  rejection: 'rejection',
  website_redirect: 'website_redirect',
  closing: 'closing',

  // その他
};

// フォールバック用デフォルトテンプレート定義
const defaultTemplates = {
  // セールス系（sales_pitchは削除 - GUI設定のみ使用）

  // 確認・問い合わせ系
  company_confirmation: '{{companyName}}でございます。{{representativeName}}です。',
  clarification: '失礼しました。{{companyName}}の{{representativeName}}です。{{serviceName}}についてご担当者さまにご案内の可否を伺っております。',

  // 肯定的応答系
  positive_response: 'ありがとうございます。よろしくお願いいたします。',

  // 取次受諾系
  transfer_accepted: 'ありがとうございます。お待ちしております。',
  
  // 転送・説明系
  transfer_explanation: 'お忙しいところすみません。{{selfIntroduction}}。弊社は{{serviceDescription}}会社でございます。\n\nこれより直接担当者から詳細をご説明させて頂いてもよろしいでしょうか？\nお構いなければAIコールシステムから弊社の担当者に取り次ぎのうえご説明申し上げます。',
  prepare_transfer: 'ありがとうございます。よろしくお願いいたします。',
  
  // 終了系
  absent: '承知しました。では、また改めてお電話いたします。ありがとうございました。',
  rejection: '承知いたしました。本日は突然のご連絡、失礼いたしました。よろしくお願いいたします。',
  website_redirect: '承知しました。御社ホームページの問い合わせフォームからご連絡いたします。ありがとうございました。',
  closing: '本日はありがとうございました。失礼いたします。',
  
  // 転送確定系
  transfer_confirmed: 'ありがとうございます。転送いたしますので少々お待ち下さい。',
  
  // その他
  
  // システム応答
  initial: 'お世話になります。{{selfIntroduction}}。弊社は{{serviceDescription}}会社でございます。{{serviceName}}について、是非御社の{{targetDepartment}}にご案内できればと思いお電話をさせていただきました。本日、{{targetPerson}}はいらっしゃいますでしょうか？',
  unknown: '申し訳ございません。もう一度お聞きしてもよろしいでしょうか？'
};

// 必須テンプレート一覧（バリデーション用）
const requiredTemplates = [
  'positive_response',
  'transfer_explanation',
  'prepare_transfer',
  'company_confirmation',
  'absent',
  'rejection',
  'website_redirect',
  'closing',
  'unknown'
];

// AgentSettingsで管理されるべきテンプレート一覧
const agentSettingsTemplates = [
  'initial',
  'clarification',
  'company_confirmation',
  'absent',
  'rejection',
  'website_redirect',
  'closing',
  'positive_response',
  'transfer_explanation',
  'prepare_transfer',
  'transfer_confirmed'
];

// グローバルキーワード（いつでも優先的に処理）
const globalPatterns = {
  // 即終了系（最優先）
  rejection: {
    keywords: ['お断り', '必要ない', 'いらない', '結構です', '営業お断り', '間に合って', '受け付けない', '遠慮します', 'お断りします', '今回は見送ります', '興味ない', '必要ありません', '迷惑', '間に合っています'],
    confidence: 0.9,
    priority: 1
  },
  absent: {
    keywords: ['不在', 'いない', 'いません', '席を外し', '出張', '会議', '休み', '外出', '他の電話', 'おりません'],
    confidence: 0.85,
    priority: 1
  },
  website_redirect: {
    keywords: ['ホームページ', 'HP', 'Web', 'メール', 'サイト', 'フォーム', '問い合わせフォーム', 'ウェブ', '新規のご提案', 'ホームページから', 'サイトから', 'ウェブから'],
    confidence: 0.85,
    priority: 1
  },
  // 統合された明確化要求（用件確認、会社確認、聞き返し）
  clarification_request: {
    keywords: [
      // 用件確認系
      'ご用件', '用件は', '用件を', 'どういった', 'なんの用', '何の件',
      'どのような', 'どんな', '何のお話', '用事は', 'どちらの件',

      // 会社確認系
      '社名', 'どちら様', '会社名', 'お名前', 'どこの', 'どちらから',
      'もう一度社名を', '社名をもう一度', '会社名をもう一度',

      // 聞き返し系
      'はい？', 'もしもし？', 'えっ？', '聞こえない', '聞き取れない',
      '聞こえませんでした', '聞こえません',

      // 再説明要求系（重複を排除）
      'なんでしょう', '何でしょうか',
      'もう一度教えて', 'もう一度説明', '再度教えて',
      'もう一度お聞かせ願えますか', 'もう一度お願いします',
      '用件教えて', '用件を教えて', '教えてください', '教えて'
    ],
    confidence: 0.85,
    priority: 2
  },
  // 担当者取次申し出（常時受付）
  transfer_handover: {
    keywords: [
      // 基本的な取次表現
      '担当者に代わります', '担当者に変わります', '担当の者に代わります', '担当の者に変わります',
      '代わります', '変わります', '替わります', '代わりますので', '変わりますので',

      // 呼び出し・お取り次ぎ系
      '担当者を', '担当の者に', '呼んできます', '呼びます', '呼んでき',
      'お取り次ぎします', 'お取り次ぎいたします', 'お繋ぎします',

      // 明確な確認系
      '確認してみます', '聞いてみます', '確認します',

      // 人員説明系
      '担当がおりますので', '担当がいますので', '詳しい者がおりますので',
      '詳しい者に', 'わかる者に', '上司に', '責任者に'
    ],
    confidence: 0.8,
    priority: 2
  }
};

// 文脈依存キーワード（会話の状態に応じて有効化）
const contextualPatterns = {
  // 初回質問直後のみ（「担当者はいらっしゃいますか？」への応答）
  afterInitialQuestion: {
    normal_response: {
      keywords: ['はい', 'います', 'おります'],
      confidence: 0.5
    },
    transfer_wait: {
      keywords: ['少々お待ち', 'お待ちください', '少しお待ち'],
      confidence: 0.6
    },
    transfer_confirm: {
      keywords: ['確認します', '確認いたします'],
      confidence: 0.6
    }
  },

  // 社名確認後の状態
  afterCompanyConfirmation: {
    normal_response: {
      keywords: ['はい', 'お世話になります', 'どうぞ'],
      confidence: 0.8
    }
  },

  // 用件説明直後の状態
  afterPurposeExplanation: {
    // 転送説明後の同意（実際に転送を実行）
    transfer_agreement: {
      keywords: ['わかりました', '分かりました', 'お願いします', 'はい、お願いします', 'よろしくお願いします', 'お話聞かせてください', '進めてください', 'いいですよ', '大丈夫です'],
      confidence: 0.9
    }
  },

  // 取次待ち状態（取次確定後）
  waitingForTransfer: {
    person_changed: {
      keywords: ['変わりました', '代わりました', '担当の', 'です', 'と申します', 'もしもし'],
      confidence: 0.7
    },
    transfer_confirmed: {
      keywords: ['確認します', '確認いたします'],
      confidence: 0.8
    }
  }
};

// 会話状態の定義
const conversationStates = {
  INITIAL: 'initial',                           // 初期状態
  AFTER_INITIAL_QUESTION: 'afterInitialQuestion',     // 初回質問直後
  AFTER_COMPANY_CONFIRMATION: 'afterCompanyConfirmation', // 社名確認後
  AFTER_PURPOSE_EXPLANATION: 'afterPurposeExplanation',   // 用件説明直後
  WAITING_FOR_TRANSFER: 'waitingForTransfer',  // 取次待ち
  CLOSING: 'closing'                           // 終話処理中
};

module.exports = {
  intentToTemplate,
  defaultTemplates,
  requiredTemplates,
  agentSettingsTemplates,
  globalPatterns,
  contextualPatterns,
  conversationStates
};