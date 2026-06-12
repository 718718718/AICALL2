const AgentSettings = require('../models/AgentSettings');
const { 
  intentToTemplate, 
  defaultTemplates, 
  requiredTemplates,
  globalPatterns,
  contextualPatterns,
  conversationStates 
} = require('../config/templates');

class ConversationEngine {
  constructor() {
    // テンプレート設定の整合性チェック
    this.validateTemplateConfiguration();
    
    // call_logic.mdに完全準拠した応答パターン
    this.responsePatterns = {
      // A: 普通の応答（「はい」「お世話になります」）
      normal_response: {
        keywords: ['はい', 'お世話になります', 'どうぞ', '私です', '担当です', 'お疲れ様', 'よろしく', '承知', '了解', '少々お待ち', '少しお待ち', '確認します', '確認いたします', '変わります', '代わります'],
        confidence: 0.8
      },
      // B: 聞き返し（「はい？」）
      // B: 聞き返し（「はい？」「もしもし？」等）- globalPatternsに統合済みのため削除,
      // C: 明確化要求（統合された） - globalPatternsで処理されるため、ここでは不要
      // company_confirmationは削除されました
      // D: 担当者不在
      absent: {
        keywords: ['不在', 'いない', 'いません', '席を外し', '出張', '会議', '休み', '外出', '他の電話', 'おりません'],
        confidence: 0.85
      },
      // E: 新規電話お断り
      rejection: {
        keywords: ['お断り', '必要ない', 'いらない', '結構です', '営業お断り', '間に合って', '受け付けない'],
        confidence: 0.9
      },
      // F: HP/メール誘導
      website_redirect: {
        keywords: ['ホームページ', 'HP', 'Web', 'メール', 'サイト', 'フォーム', '問い合わせフォーム', 'ウェブ'],
        confidence: 0.85
      },
      // 用件確認
      purpose_inquiry: {
        keywords: ['ご用件', '用件は', 'どういった', 'なんの用', '何の件', 'どのような', 'どちら様', 'どんな', 'いかが', '何か', '目的', '内容'],
        confidence: 0.85
      },
      // 終話の合図
      closing_signal: {
        keywords: ['失礼します', '失礼いたします', 'ありがとうございました', 'では失礼', 'それでは'],
        confidence: 0.9
      },
      // 担当者変更（担当者が電話に出た場合 / 顧客が担当者に代わる場合）
      person_changed: {
        keywords: ['変わりました', '代わりました', '担当の', 'です', 'と申します', 'もしもし', '私が', '私は', '担当者に代わります', '担当者に変わります', '代わります', '変わります'],
        confidence: 0.8
      },
      // 無音
      silent: {
        keywords: [],
        confidence: 0.9,
        timeout: 2000 // 2秒間無音で自己紹介開始
      }
    };

    // 会話状態管理
    this.conversationStates = new Map();
  }

  // 会話を初期化
  initializeConversation(callId, agentSettings, forceReset = false) {
    // 既に存在する場合でも、forceResetがtrueなら再初期化
    if (this.conversationStates.has(callId) && !forceReset) {
      console.log(`[ConversationEngine] Conversation already exists for ${callId}, skipping initialization`);
      return this.conversationStates.get(callId);
    }
    
    // 既存の会話状態があれば削除（新しい通話のため）
    if (this.conversationStates.has(callId)) {
      console.log(`[ConversationEngine] Force resetting conversation for ${callId}`);
      this.conversationStates.delete(callId);
    }
    
    console.log(`[ConversationEngine] Initializing NEW conversation for ${callId}`);
    console.log(`[ConversationEngine] Agent settings:`, JSON.stringify(agentSettings, null, 2));
    
    if (!agentSettings) {
      console.error(`[ConversationEngine] ERROR: No agent settings provided for call ${callId}`);
      return null;
    }
    
    const state = {
      callId,
      currentPhase: 'INITIAL', // INITIAL: 初回待機状態
      conversationState: conversationStates.AFTER_INITIAL_QUESTION, // 初回質問直後の状態
      turnCount: 0,
      silentCount: 0,
      clarificationCount: 0, // 聞き返し回数（1回まで）
      lastResponse: null,
      agentSettings,
      shouldHandoff: false,
      handoffReason: null,
      conversationHistory: [],
      lastSpeechTime: Date.now(),
      continuousSilentCount: 0,
      customerSpokeFirst: false,
      hasIntroduced: false, // 自己紹介済みフラグ
      hasGivenPurpose: false, // 用件説明済みフラグ
      waitingForClosing: false, // 終話待機中フラグ
      closingTimer: null, // 終話タイマー
      waitingForTransfer: false, // 取次待ちフラグ
      transferConfirmed: false // 取次確定フラグ
    };

    this.conversationStates.set(callId, state);
    console.log(`[ConversationEngine] Successfully initialized conversation for ${callId}`);
    return state;
  }
  
  // 会話が存在するか確認
  hasConversation(callId) {
    return this.conversationStates.has(callId);
  }
  
  // 会話状態を更新
  updateConversationState(callId, updates) {
    const state = this.conversationStates.get(callId);
    if (state) {
      Object.assign(state, updates);
      this.conversationStates.set(callId, state);
    }
  }
  
  // 会話状態を取得
  getConversationState(callId) {
    return this.conversationStates.get(callId);
  }

  // 音声認識結果を分類（call_logic.md準拠）
  classifyResponse(speechText, callId) {
    console.log(`[ConversationEngine] Classifying response for callId: ${callId}`);
    console.log(`[ConversationEngine] Speech text: "${speechText}"`);
    
    const state = this.conversationStates.get(callId);
    if (!state) {
      console.log(`[ConversationEngine] No state found for callId: ${callId}`);
      return {
        intent: 'unknown',
        confidence: 0,
        shouldHandoff: false,
        nextAction: 'continue'
      };
    }

    // 無音または空の応答をチェック
    if (!speechText || speechText.trim() === '') {
      state.continuousSilentCount++;
      state.silentCount++;
      
      // 初回の無音（2秒後）は自己紹介を開始
      if (!state.hasIntroduced && state.silentCount === 1) {
        console.log('[ConversationEngine] Initial silence detected - will introduce');
        return {
          intent: 'initial_silence',
          confidence: 1.0,
          shouldHandoff: false,
          nextAction: 'introduce'
        };
      }
      
      // 連続して3回以上無音の場合のみ通話終了
      if (state.continuousSilentCount >= 3) {
        return {
          intent: 'silent_end',
          confidence: 1.0,
          shouldHandoff: false,
          nextAction: 'end_call'
        };
      }
      
      return {
        intent: 'silent',
        confidence: 1.0,
        shouldHandoff: false,
        nextAction: 'continue'
      };
    }

    // 音声入力があった場合、連続無音カウントをリセット
    state.continuousSilentCount = 0;
    state.lastSpeechTime = Date.now();
    
    // 会話履歴に追加
    state.conversationHistory.push({
      speaker: 'customer',
      message: speechText,
      timestamp: Date.now()
    });
    
    const normalizedText = speechText.toLowerCase().trim();
    
    // まずグローバルパターン（例外処理）をチェック
    let bestMatch = {
      intent: 'unknown',
      confidence: 0,
      shouldHandoff: false,
      nextAction: 'continue'
    };
    
    console.log(`[ConversationEngine] Checking global patterns first...`);
    let globalMatch = null;
    for (const [intent, pattern] of Object.entries(globalPatterns)) {
      const matchScore = this.calculateMatchScore(normalizedText, pattern.keywords, intent);
      if (matchScore > 0) {
        globalMatch = {
          intent,
          confidence: matchScore,
          shouldHandoff: false,
          nextAction: 'continue'
        };
        console.log(`[ConversationEngine] Global pattern matched: ${intent} with confidence ${matchScore}`);
        break; // グローバルパターンが見つかったら即座に採用
      }
    }
    
    // グローバルパターンが見つかった場合は優先使用
    if (globalMatch) {
      bestMatch = globalMatch;
      console.log(`[ConversationEngine] Using global pattern: ${bestMatch.intent}`);
    } else {
      // グローバルパターンがない場合のみ、文脈依存パターンをチェック
      console.log(`[ConversationEngine] No strong global match, checking contextual patterns...`);
      console.log(`[ConversationEngine] Current conversation state: ${state.conversationState}`);
      
      // 会話状態に応じたパターンセットを選択
      let contextPatterns = {};
      
      switch (state.conversationState) {
        case conversationStates.AFTER_INITIAL_QUESTION:
          console.log(`[ConversationEngine] Using afterInitialQuestion patterns`);
          contextPatterns = contextualPatterns.afterInitialQuestion || {};
          break;
        case conversationStates.AFTER_COMPANY_CONFIRMATION:
          console.log(`[ConversationEngine] Using afterCompanyConfirmation patterns`);
          contextPatterns = contextualPatterns.afterCompanyConfirmation || {};
          break;
        case conversationStates.AFTER_PURPOSE_EXPLANATION:
          console.log(`[ConversationEngine] Using afterPurposeExplanation patterns`);
          contextPatterns = contextualPatterns.afterPurposeExplanation || {};
          break;
        case conversationStates.WAITING_FOR_TRANSFER:
          console.log(`[ConversationEngine] Using waitingForTransfer patterns`);
          contextPatterns = contextualPatterns.waitingForTransfer || {};
          break;
        default:
          console.log(`[ConversationEngine] Using afterInitialQuestion patterns (default)`);
          contextPatterns = contextualPatterns.afterInitialQuestion || {};
      }
      
      // 文脈依存パターンでマッチング
      for (const [intent, pattern] of Object.entries(contextPatterns)) {
        const matchScore = this.calculateMatchScore(normalizedText, pattern.keywords, intent);
        if (matchScore > bestMatch.confidence) {
          bestMatch = {
            intent,
            confidence: matchScore,
            shouldHandoff: false,
            nextAction: 'continue'
          };
          console.log(`[ConversationEngine] Contextual pattern matched: ${intent} with confidence ${matchScore}`);
        }
      }
    }

    console.log(`[ConversationEngine] Best match intent: ${bestMatch.intent}, confidence: ${bestMatch.confidence}`);
    
    // call_logic.md に基づいた対応分岐
    switch (bestMatch.intent) {
      // D, E, F: 即終了パターン
      case 'absent':
        console.log('[ConversationEngine] 担当者不在 - 終話へ');
        state.currentPhase = 'CLOSING';
        bestMatch.nextAction = 'respond_and_end';
        break;
        
      case 'rejection':
        console.log('[ConversationEngine] 新規お断り - 終話へ');
        state.currentPhase = 'CLOSING';
        bestMatch.nextAction = 'respond_and_end';
        break;
        
      case 'website_redirect':
        console.log('[ConversationEngine] HP/メール誘導 - 終話へ');
        state.currentPhase = 'CLOSING';
        bestMatch.nextAction = 'respond_and_end';
        break;
      
      // B: 聞き返し（1回まで） - 直前のメッセージを繰り返し
      case 'clarification_request':
        console.log('[ConversationEngine] 明確化要求 - clarificationテンプレートを使用');
        // 明確化要求は常に同じテンプレートで応答（回数制限なし）
        bestMatch.nextAction = 'clarify';
        break;
      
      
      // 用件確認への対応（10秒ピッチ）- グローバル対応で重複防止強化
      case 'purpose_inquiry':
        if (!state.hasGivenPurpose) {
          console.log('[ConversationEngine] 用件説明（10秒ピッチ）- グローバルパターンから発火');
          state.hasGivenPurpose = true;
          state.conversationState = conversationStates.AFTER_PURPOSE_EXPLANATION;
          bestMatch.nextAction = 'give_purpose';
        } else {
          console.log('[ConversationEngine] セールスピッチ重複検出 - 既に実行済みのため positive_response に変更');
          bestMatch.intent = 'positive_response';
          bestMatch.nextAction = 'positive_response';
        }
        break;
      
      // A: 通常の応答（肯定的応答）
      case 'normal_response':
        console.log('[ConversationEngine] 肯定的応答検出 - positive_responseテンプレートを使用');
        if (!state.hasIntroduced) {
          state.hasIntroduced = true;
          // 現在の状態を維持（次の段階への遷移は別の処理で行う）
        }
        bestMatch.nextAction = 'positive_response';
        break;
      
      // 取次待機（「少々お待ちください」等）
      case 'transfer_wait':
        console.log('[ConversationEngine] 取次待機検出 - WAITING_FOR_TRANSFER状態へ移行（転送フラグなし）');
        state.waitingForTransfer = true;
        state.conversationState = conversationStates.WAITING_FOR_TRANSFER;
        bestMatch.nextAction = 'positive_response';
        break;
      
      // 取次確定（「確認します」等）
      case 'transfer_confirmed':
      case 'transfer_confirm':
        console.log(`[ConversationEngine] ${bestMatch.intent}検出 - 転送準備状態へ移行`);
        state.waitingForTransfer = true;
        state.transferConfirmed = true;
        state.conversationState = conversationStates.WAITING_FOR_TRANSFER;
        bestMatch.shouldHandoff = false;  // We handle transfer via simple transfer, not handoff
        bestMatch.nextAction = 'trigger_transfer';  // Special action to trigger simple transfer
        break;
      
      // 取次手続き（「担当者を呼んできます」「代わります」等）
      case 'transfer_handover':
        console.log('[ConversationEngine] 取次手続き検出 - 待機状態へ移行');
        state.waitingForTransfer = true;
        state.transferConfirmed = true;
        state.conversationState = conversationStates.WAITING_FOR_TRANSFER;
        bestMatch.nextAction = 'positive_response';
        break;
      
      // 担当者変更（新しい担当者が電話に出た場合）
      case 'person_changed':
        console.log('[ConversationEngine] 担当者変更検出 - 再度説明を開始');
        bestMatch.nextAction = 'transfer_explanation';
        state.hasIntroduced = false; // 再度説明が必要なのでリセット
        state.waitingForTransfer = false; // 取次待ち終了
        state.transferConfirmed = false;
        state.conversationState = conversationStates.AFTER_PURPOSE_EXPLANATION; // 再説明後の状態
        break;
      
      // 終話の合図を検出
      case 'closing_signal':
        console.log('[ConversationEngine] 終話合図検出 - 0.7-1.2秒待機');
        state.waitingForClosing = true;
        bestMatch.nextAction = 'prepare_closing';
        break;
    }

    // unknown の場合の改善されたハンドリング
    if (bestMatch.intent === 'unknown') {
      console.log('[ConversationEngine] Unknown intent - applying context-aware handling');
      bestMatch = this.handleUnknownWithContext(state, speechText, bestMatch);
    }

    // 会話のターン数をチェック
    state.turnCount++;
    if (state.turnCount >= 10 && !bestMatch.shouldHandoff) {
      bestMatch.shouldHandoff = true;
      bestMatch.nextAction = 'handoff';
      state.handoffReason = 'Extended conversation';
    }

    state.lastResponse = bestMatch;
    this.conversationStates.set(callId, state);

    return bestMatch;
  }

  // キーワードマッチングスコアを計算（重み付きスコアリング）
  calculateMatchScore(text, keywords, intent = null) {
    if (!keywords || keywords.length === 0) return 0;

    // 重要なキーワードとその重み設定
    const keywordWeights = {
      // 取次確定系（高優先度）
      '少々お待ち': 1.5,
      'お待ちください': 1.5, 
      '少しお待ち': 1.5,
      '確認します': 1.3,
      '確認いたします': 1.3,
      
      // 取次手続き系（高優先度）
      '担当者を': 1.4,
      '担当の者に': 1.4,
      '代わります': 1.4,
      '変わります': 1.4,
      '呼んでき': 1.3,
      '聞いてき': 1.3,
      
      // 基本応答系（中優先度）
      'はい': 1.2,
      'います': 1.2,
      'おります': 1.2,
      
      // その他（標準）
      'default': 1.0
    };

    let totalWeight = 0;
    let matchedWeight = 0;
    
    for (const keyword of keywords) {
      const weight = keywordWeights[keyword] || keywordWeights['default'];
      totalWeight += weight;
      
      if (text.includes(keyword)) {
        matchedWeight += weight;
      }
    }

    const weightedScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    
    // person_changed の特別処理：取次確定後は少ないキーワードでも確実に認識
    if (intent === 'person_changed') {
      const changeKeywords = ['変わりました', '代わりました'];
      const contextKeywords = ['もしもし', '担当の', 'です', 'と申します'];
      
      const hasChangeKeyword = changeKeywords.some(keyword => text.includes(keyword));
      const hasContextKeyword = contextKeywords.some(keyword => text.includes(keyword));
      
      // 「変わりました」「代わりました」があり、文脈キーワードがあれば高スコア
      if (hasChangeKeyword && hasContextKeyword) {
        return 0.85; // 担当者変更として確実に認識
      }
      
      // 「変わりました」「代わりました」だけでも十分なスコア
      if (hasChangeKeyword) {
        return 0.75;
      }
    }

    // 重み付きスコアが一定以上の場合、少し補正を加える
    if (weightedScore >= 0.6) {
      return Math.min(weightedScore * 1.2, 1.0); // 1.2倍して最大1.0にクリップ
    }

    return weightedScore;
  }

  // コンテキストを考慮したunknown処理
  handleUnknownWithContext(state, speechText, currentMatch) {
    console.log('[ConversationEngine] Applying context-aware unknown handling');
    
    // 会話の文脈を分析
    const conversationContext = this.analyzeConversationContext(state);
    
    // 用件説明後の場合、より親切な応答を使用
    if (state.hasGivenPurpose) {
      console.log('[ConversationEngine] Purpose already given - using context-aware response');
      return {
        intent: 'unknown_after_purpose',
        confidence: 0.7,
        shouldHandoff: false,
        nextAction: 'continue'
      };
    }
    
    // 顧客が何か言おうとしているが理解できない場合の判定
    if (speechText && speechText.length > 5) {
      console.log('[ConversationEngine] Customer seems engaged - using helpful unknown response');
      return {
        intent: 'unknown_context_aware',
        confidence: 0.6,
        shouldHandoff: false,
        nextAction: 'continue'
      };
    }
    
    // 連続してunknownが発生している場合の対応
    if (state.turnCount > 2 && state.lastResponse?.intent === 'unknown') {
      console.log('[ConversationEngine] Multiple unknown responses - preparing for handoff');
      return {
        intent: 'unknown',
        confidence: 0.5,
        shouldHandoff: true,
        nextAction: 'handoff',
        handoffReason: 'Multiple unclear responses'
      };
    }
    
    return currentMatch;
  }

  // 会話コンテキストを分析
  analyzeConversationContext(state) {
    const recentMessages = state.conversationHistory.slice(-3);
    const customerMessages = recentMessages.filter(msg => msg.speaker === 'customer');
    
    return {
      hasGivenPurpose: state.hasGivenPurpose,
      recentCustomerEngagement: customerMessages.length > 0,
      conversationLength: state.turnCount,
      lastIntent: state.lastResponse?.intent
    };
  }

  // 応答メッセージを生成
  async generateResponse(callId, intent, customVariables = {}) {
    console.log(`[ConversationEngine] Generating response for call ${callId}, intent: ${intent}`);
    
    const state = this.conversationStates.get(callId);
    if (!state) {
      console.error(`[ConversationEngine] ERROR: No conversation state found for call ${callId}`);
      // 初期応答を返す
      return await this.getDefaultInitialResponse();
    }
    
    if (!state.agentSettings) {
      console.error(`[ConversationEngine] ERROR: No agent settings in state for call ${callId}`);
      // 初期応答を返す
      return await this.getDefaultInitialResponse();
    }
    
    // 最初の顧客の発話（もしもし等）には、通常の挨拶で応答
    if (state.turnCount === 0 || (state.customerSpokeFirst && state.turnCount === 1)) {
      console.log(`[ConversationEngine] First customer interaction - providing initial greeting`);
      const { companyName, serviceName, representativeName, targetDepartment } = state.agentSettings;
      if (companyName && representativeName && serviceName && targetDepartment) {
        const initialMessage = `お世話になります。${companyName}の${representativeName}と申します。${serviceName}のご案内でお電話しました。本日、${targetDepartment}のご担当者さまはいらっしゃいますでしょうか？`;
        return initialMessage;
      }
      return await this.getDefaultInitialResponse();
    }
    
    // 直前のメッセージ繰り返し処理
    if (intent === 'repeat_last_message') {
      console.log('[ConversationEngine] 直前のメッセージを繰り返します');
      // カスタム変数から直前のAIメッセージを取得
      if (customVariables.lastAiMessage) {
        console.log(`[ConversationEngine] 繰り返しメッセージ: ${customVariables.lastAiMessage}`);
        return customVariables.lastAiMessage;
      }
      // フォールバック: clarificationテンプレートを使用
      return await this.getDefaultResponse('clarification', callId);
    }

    // 「不在」「結構です」への適切な応答
    if (intent === 'absent' || (state.conversationHistory.length > 0 && 
        state.conversationHistory[state.conversationHistory.length - 1].message?.includes('不在'))) {
      return await this.getDefaultResponse('absent', callId);
    }
    
    if (intent === 'rejection' || (state.conversationHistory.length > 0 && 
        state.conversationHistory[state.conversationHistory.length - 1].message?.includes('結構'))) {
      return await this.getDefaultResponse('rejection', callId);
    }

    // agentSettingsから直接設定を取得
    let agentSettings = state.agentSettings;
    
    // 設定から最初の応答を作成
    if (intent === 'initial' || intent === 'silent') {
      const { companyName, serviceName, representativeName, targetDepartment } = agentSettings;
      if (companyName && representativeName && serviceName && targetDepartment) {
        const initialMessage = `お世話になります。${companyName}の${representativeName}と申します。${serviceName}のご案内でお電話しました。本日、${targetDepartment}のご担当者さまはいらっしゃいますでしょうか？`;
        console.log(`[ConversationEngine] Generated initial message: ${initialMessage}`);
        return initialMessage;
      }
    }
    
    // デフォルト応答を使用する（カスタマイズ設定を考慮）
    const finalResponse = await this.getDefaultResponse(intent, callId);
    
    // AI応答を会話履歴に追加
    if (state && finalResponse) {
      state.conversationHistory.push({
        speaker: 'ai',
        message: finalResponse,
        timestamp: Date.now()
      });
    }

    return finalResponse;
  }

  // デフォルトの初期応答を取得
  async getDefaultInitialResponse() {
    // まずはデフォルトテンプレートシステムを使用
    try {
      const defaultResponse = await this.getDefaultResponse('initial', null);
      if (defaultResponse) {
        return defaultResponse;
      }
    } catch (error) {
      console.error('[ConversationEngine] Error getting default initial response:', error);
    }

    // 最終フォールバック（基本的には使われない想定）
    return 'お世話になります。わたくしAIコールシステムの佐藤と申します。AIアシスタントサービスのご案内でお電話しました。本日、営業の担当者さまはいらっしゃいますでしょうか？';
  }

  // AgentSettingsから応答を取得（call_logic.md完全準拠）
  async getDefaultResponse(intent, callId) {
    console.log(`[ConversationEngine] Getting response for intent: ${intent}, callId: ${callId}`);
    
    // callIdがあれば、まずAgentSettingsから設定を取得
    let templateResponse = null;
    if (callId) {
      const state = this.conversationStates.get(callId);
      if (state && state.agentSettings) {
        console.log(`[ConversationEngine] Using manual template processing for intent: ${intent}`);
        // 統一されたprocessTemplateメソッドを使用（aiConfigurationも必要）
        const callSession = await require('../models/CallSession').findById(callId);
        if (callSession && callSession.aiConfiguration) {
          templateResponse = this.processTemplate(intent, callSession.aiConfiguration);
        } else {
          // フォールバック用の空オブジェクト
          templateResponse = this.processTemplate(intent, {});
        }
        
        if (templateResponse) {
          console.log(`[ConversationEngine] Successfully got template response: ${templateResponse}`);
          return templateResponse;
        }
      } else {
        console.log(`[ConversationEngine] No agent settings in state for callId: ${callId}`);
      }
    }

    // フォールバック用のデフォルト応答
    const fallbackResponses = {
      // 基本的な応答のみをフォールバックとして保持
      initial: 'お世話になります。AIコールシステム株式会社です。営業部のご担当者さまはいらっしゃいますでしょうか？',
      absent: '承知しました。では、また改めてお電話いたします。ありがとうございました。',
      rejection: '承知いたしました。本日は突然のご連絡、失礼いたしました。よろしくお願いいたします。',
      website_redirect: '承知しました。御社ホームページの問い合わせフォームからご連絡いたします。ありがとうございました。',
      closing: '本日はありがとうございました。失礼いたします。',
      unknown: '申し訳ございません。もう一度お聞きしてもよろしいでしょうか？',
      unknown_context_aware: '申し訳ございません。もう一度お聞きしてもよろしいでしょうか？'
    };

    const fallbackResponse = fallbackResponses[intent] || fallbackResponses.unknown;
    console.log(`[ConversationEngine] Using fallback response for intent ${intent}: ${fallbackResponse}`);
    return fallbackResponse;
  }

  // 手動でテンプレート処理を行う
  processTemplate(templateName, aiConfiguration) {
    console.log(`[ConversationEngine] Processing template: ${templateName}`);
    
    const actualTemplateName = intentToTemplate[templateName] || templateName;
    console.log(`[ConversationEngine] Mapped to template: ${actualTemplateName}`);
    
    // aiConfigurationから変数の値を準備（統一処理）
    const vars = {
      companyName: aiConfiguration.companyName || 'AIコールシステム株式会社',
      serviceName: aiConfiguration.serviceName || 'AIアシスタントサービス',
      representativeName: aiConfiguration.representativeName || '佐藤',
      targetDepartment: aiConfiguration.targetDepartment || '営業部',
      serviceDescription: aiConfiguration.serviceDescription || '新規テレアポや掘り起こしなどの営業電話を人間に代わって生成AIが電話をかけるというサービスを提供している',
      targetPerson: aiConfiguration.targetPerson || '営業の担当者さま',
      selfIntroduction: `${aiConfiguration.companyName || 'AIコールシステム株式会社'}の${aiConfiguration.representativeName || '佐藤'}と申します`
    };
    
    // sales_pitchテンプレートは削除されたため、このブロックは不要
    
    // その他のテンプレートは従来通りdefaultTemplatesを使用
    const template = defaultTemplates[actualTemplateName];
    if (!template) return null;
    
    // テンプレート変数を置換
    let processed = template;
    Object.keys(vars).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, vars[key]);
    });
    
    return processed;
  }

  // 会話フローの次のステップを決定
  determineNextStep(callId, currentIntent) {
    const state = this.conversationStates.get(callId);
    if (!state) return 'continue';

    // 会話フローのステートマシン（改善版）
    const flowTransitions = {
      initial: {
        normal_response: 'purpose_explanation',
        company_inquiry: 'clarification_request',
        purpose_inquiry: 'purpose_explanation',
        absent: 'schedule_callback',
        rejection: 'polite_end',
        website_redirect: 'provide_website',
        silent: 'check_connection'
      },
      purpose_explanation: {
        normal_response: 'detailed_explanation',
        rejection: 'polite_end',
        unclear: 'clarification',
        unknown: 'context_aware_help'
      },
      clarification: {
        unclear: 'handoff', // 複数回の確認が必要な場合は引き継ぎ
        rejection: 'polite_end',
        silent: 'check_connection'
      },
      clarification_request: {
        normal_response: 'purpose_explanation',
        rejection: 'polite_end',
        unclear: 'clarification'
      },
      detailed_explanation: {
        rejection: 'polite_end',
        unclear: 'clarification'
      }
    };

    const currentPhase = state.currentPhase || 'initial';
    const transitions = flowTransitions[currentPhase] || {};
    const nextStep = transitions[currentIntent] || 'continue';

    console.log(`[ConversationEngine] Flow transition: ${currentPhase} -> ${currentIntent} -> ${nextStep}`);

    // ステート更新
    if (nextStep !== 'continue') {
      state.currentPhase = nextStep;
      this.conversationStates.set(callId, state);
    }

    return nextStep;
  }

  // 引き継ぎ判定
  shouldHandoffToHuman(callId) {
    const state = this.conversationStates.get(callId);
    if (!state) return false;

    // 引き継ぎ条件
    const handoffConditions = [
      state.shouldHandoff === true,
      state.turnCount >= 10,
      state.clarificationCount >= 3,
      state.lastResponse?.intent === 'transfer_ready'
    ];

    return handoffConditions.some(condition => condition === true);
  }

  // 会話分析レポートを生成
  generateConversationReport(callId) {
    const state = this.conversationStates.get(callId);
    if (!state) return null;

    return {
      callId,
      totalTurns: state.turnCount,
      silentResponses: state.silentCount,
      clarificationRequests: state.clarificationCount,
      finalIntent: state.lastResponse?.intent,
      handoffRecommended: state.shouldHandoff,
      handoffReason: state.handoffReason,
      conversationPhase: state.currentPhase
    };
  }

  // 終話待機処理（0.7〜1.2秒待機）
  async handleClosingWithDelay(callId, callback) {
    const state = this.conversationStates.get(callId);
    if (!state) return;
    
    // 0.7〜1.2秒のランダム待機時間
    const waitTime = Math.floor(Math.random() * 500 + 700); // 700-1200ms
    console.log(`[ConversationEngine] 終話待機: ${waitTime}ms`);
    
    state.waitingForClosing = true;
    state.closingTimer = setTimeout(() => {
      console.log('[ConversationEngine] 終話待機完了 - 通話終了');
      if (callback && typeof callback === 'function') {
        callback();
      }
      this.clearConversation(callId);
    }, waitTime);
    
    this.conversationStates.set(callId, state);
  }
  
  // 会話状態をクリア
  clearConversation(callId) {
    console.log(`[ConversationEngine] Clearing conversation state for ${callId}`);
    const state = this.conversationStates.get(callId);
    
    // 終話タイマーがあればクリア
    if (state && state.closingTimer) {
      clearTimeout(state.closingTimer);
    }
    
    this.conversationStates.delete(callId);
  }
  
  // 新しい通話のために会話履歴を完全にリセット
  resetConversationForNewCall(callId, agentSettings) {
    console.log(`[ConversationEngine] Resetting conversation for new call: ${callId}`);
    // 既存の状態を完全に削除
    this.clearConversation(callId);
    // 新しい状態を作成
    return this.initializeConversation(callId, agentSettings, true);
  }

  // カスタムインテント検出器を追加
  addCustomIntent(name, keywords, confidence = 0.8) {
    this.responsePatterns[name] = {
      keywords,
      confidence
    };
  }

  // 会話履歴から学習（将来の拡張用）
  async learnFromHistory(callSessions) {
    // 成功した会話パターンを分析
    const successfulPatterns = callSessions
      .filter(session => session.callResult === '成功')
      .map(session => ({
        transcript: session.transcript,
        duration: session.duration,
        handoffTime: session.handoffTime
      }));

    // パターン分析と最適化のロジックをここに実装
    // 現在はプレースホルダー
    return {
      patternsAnalyzed: successfulPatterns.length,
      optimizationsApplied: 0
    };
  }

  // テンプレート設定の整合性をチェック
  validateTemplateConfiguration() {
    console.log('[ConversationEngine] Validating template configuration...');
    
    const missingTemplates = [];
    const unmappedIntents = [];
    
    // 必須テンプレートの存在チェック
    for (const requiredTemplate of requiredTemplates) {
      if (!defaultTemplates[requiredTemplate]) {
        missingTemplates.push(requiredTemplate);
      }
    }
    
    // インテントマッピングの存在チェック（sales_pitchは特別処理されるので除外）
    for (const [intent, templateName] of Object.entries(intentToTemplate)) {
      if (templateName === 'sales_pitch') {
        // sales_pitchは特別処理されるため、defaultTemplatesに存在しなくても問題なし
        continue;
      }
      if (!defaultTemplates[templateName]) {
        unmappedIntents.push(`${intent} -> ${templateName}`);
      }
    }
    
    // 警告ログ出力
    if (missingTemplates.length > 0) {
      console.warn(`[ConversationEngine] Missing required templates: ${missingTemplates.join(', ')}`);
    }
    
    if (unmappedIntents.length > 0) {
      console.warn(`[ConversationEngine] Unmapped intents: ${unmappedIntents.join(', ')}`);
    }
    
    if (missingTemplates.length === 0 && unmappedIntents.length === 0) {
      console.log('[ConversationEngine] Template configuration validation passed');
    }
    
    return {
      isValid: missingTemplates.length === 0 && unmappedIntents.length === 0,
      missingTemplates,
      unmappedIntents
    };
  }
}

module.exports = new ConversationEngine();