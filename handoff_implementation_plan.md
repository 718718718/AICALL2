# AI通話取次機能 実装プラン

## 1. 機能概要

一斉コール中に、システム利用者（担当者）がタイミングを見て自分の電話でAIに代わって顧客と話すことができる機能を実装します。

### 主要機能
- AI通話中のリアルタイム監視
- 担当者による任意のタイミングでの介入
- スムーズな通話引き継ぎ
- 担当者の電話番号とアカウントの紐付け管理

## 2. システムアーキテクチャ

### 2.1 現在の構成
```
顧客 <-> Twilio <-> AI音声システム(CoeFont) <-> バックエンドサーバー
                                                    ↓
                                               WebSocket
                                                    ↓
                                              フロントエンド(モニタリング)
```

### 2.2 取次機能追加後の構成
```
顧客 <-> Twilio Conference <-> AI音声システム(CoeFont)
              ↑                        ↓
              |                   バックエンドサーバー
              |                        ↓
         担当者の電話             WebSocket
                                      ↓
                                フロントエンド(モニタリング/取次制御)
```

## 3. データベース設計

### 3.1 Userモデルの拡張
```javascript
// backend/models/User.js に追加
{
  // 既存フィールド...
  
  // 取次機能用の電話番号
  handoffPhoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // 日本の電話番号形式のバリデーション
        return /^(\+81|0)[0-9]{9,10}$/.test(v);
      },
      message: 'Invalid phone number format'
    }
  },
  
  // 取次機能の有効/無効
  handoffEnabled: {
    type: Boolean,
    default: false
  },
  
  // 取次時の通知設定
  handoffNotifications: {
    sms: { type: Boolean, default: false },
    email: { type: Boolean, default: true },
    webPush: { type: Boolean, default: true }
  }
}
```

### 3.2 CallSessionモデルの拡張
```javascript
// backend/models/CallSession.js に追加
{
  // 既存フィールド...
  
  // 取次関連情報
  handoffDetails: {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date,
    connectedAt: Date,
    disconnectedAt: Date,
    handoffPhoneNumber: String,
    handoffCallSid: String,
    handoffMethod: {
      type: String,
      enum: ['manual', 'auto', 'ai-triggered'],
      default: 'manual'
    }
  },
  
  // Conference情報（既存）
  conferenceSid: String,
  
  // 通話の参加者情報
  participants: [{
    type: {
      type: String,
      enum: ['customer', 'ai', 'agent']
    },
    callSid: String,
    phoneNumber: String,
    joinedAt: Date,
    leftAt: Date,
    isMuted: Boolean,
    isOnHold: Boolean
  }]
}
```

## 4. バックエンドAPI設計

### 4.1 ユーザー電話番号管理API

#### 電話番号の登録/更新
```
PUT /api/users/handoff-phone
Body: {
  phoneNumber: "+819012345678",
  enabled: true,
  notifications: {
    sms: false,
    email: true,
    webPush: true
  }
}
```

#### 電話番号の検証
```
POST /api/users/verify-handoff-phone
Body: {
  phoneNumber: "+819012345678"
}
Response: {
  isValid: true,
  canReceiveCalls: true,
  carrier: "NTT Docomo"
}
```

### 4.2 取次制御API

#### 取次リクエスト
```
POST /api/calls/:callId/handoff
Body: {
  method: "phone", // "phone" or "webrtc"
  phoneNumber: "+819012345678" // オプション（ユーザー設定から取得可能）
}
Response: {
  success: true,
  handoffCallSid: "CA123...",
  status: "connecting"
}
```

#### 取次状態の取得
```
GET /api/calls/:callId/handoff-status
Response: {
  isHandoffAvailable: true,
  currentParticipants: ["customer", "ai"],
  handoffInProgress: false,
  assignedAgent: null
}
```

#### AIのミュート/アンミュート
```
PUT /api/calls/:callId/ai-control
Body: {
  action: "mute" // "mute", "unmute", "remove"
}
```

### 4.3 Conference管理API（既存の拡張）

#### 担当者を Conference に追加
```
POST /api/calls/:callId/conference/add-agent
Body: {
  agentId: "user123",
  phoneNumber: "+819012345678",
  role: "supervisor" // "supervisor" or "participant"
}
```

## 5. フロントエンドUI設計

### 5.1 ユーザー設定画面の追加

```typescript
// frontend/app/settings/handoff/page.tsx
interface HandoffSettings {
  phoneNumber: string;
  enabled: boolean;
  notifications: {
    sms: boolean;
    email: boolean;
    webPush: boolean;
  };
}
```

### 5.2 通話モニター画面の機能拡張

```typescript
// frontend/components/call-monitor/HandoffControls.tsx
interface HandoffControlsProps {
  callId: string;
  callStatus: string;
  isHandoffAvailable: boolean;
  onHandoff: () => void;
}

// 取次ボタンの状態管理
enum HandoffButtonState {
  AVAILABLE = 'available',      // 取次可能
  CONNECTING = 'connecting',    // 接続中
  CONNECTED = 'connected',       // 接続済み
  UNAVAILABLE = 'unavailable'   // 取次不可
}
```

### 5.3 リアルタイム通話参加者表示

```typescript
// frontend/components/call-monitor/ParticipantsList.tsx
interface Participant {
  type: 'customer' | 'ai' | 'agent';
  name: string;
  phoneNumber: string;
  status: 'connected' | 'connecting' | 'disconnected';
  isMuted: boolean;
  isOnHold: boolean;
  duration: number;
}
```

## 6. Twilio インテグレーション設計

### 6.1 Conference モードへの移行

現在の直接通話モードから Conference モードへ移行：

```javascript
// backend/controllers/twilioVoiceController.js
exports.handleIncomingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  const callId = generateCallId();
  
  // Conference を作成
  const dial = twiml.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
    statusCallback: `/api/twilio/conference/events/${callId}`,
    statusCallbackEvent: 'start end join leave mute hold'
  }, `call-${callId}`);
  
  res.type('text/xml').send(twiml.toString());
};
```

### 6.2 担当者の電話を Conference に追加

```javascript
// backend/services/handoffService.js
exports.connectAgentToCall = async (callId, agentPhoneNumber) => {
  const call = await twilioClient.calls.create({
    to: agentPhoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: `${BASE_URL}/api/twilio/agent-conference/${callId}`,
    statusCallback: `${BASE_URL}/api/twilio/agent-status/${callId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
  });
  
  return call.sid;
};
```

### 6.3 取次時の音声制御

```javascript
// backend/services/conferenceService.js
exports.handleHandoff = async (callId, agentCallSid) => {
  const conferenceName = `call-${callId}`;
  
  // 1. 顧客に取次メッセージを再生
  await playMessageToConference(conferenceName, '担当者にお繋ぎします。少々お待ちください。');
  
  // 2. AIをミュート
  await muteParticipant(conferenceName, 'ai');
  
  // 3. 担当者が接続されたら
  // - AIを Conference から削除
  // - 顧客に接続完了メッセージ
  
  // 4. WebSocket で状態を通知
  webSocketService.broadcastCallEvent('handoff-complete', {
    callId,
    agentCallSid,
    timestamp: new Date()
  });
};
```

## 7. 実装フロー

### 7.1 取次処理のシーケンス

```
1. 担当者が取次ボタンをクリック
   ↓
2. フロントエンドがバックエンドAPIを呼び出し
   ↓
3. バックエンドが担当者の電話番号を取得
   ↓
4. Twilioで担当者の電話に発信
   ↓
5. 担当者が応答
   ↓
6. 担当者を Conference に追加
   ↓
7. AIをミュートまたは Conference から削除
   ↓
8. WebSocket で全クライアントに通知
   ↓
9. フロントエンドUIを更新
```

### 7.2 エラーハンドリング

```javascript
// 取次失敗時の処理
const handoffErrors = {
  NO_PHONE_NUMBER: '担当者の電話番号が設定されていません',
  PHONE_BUSY: '担当者の電話が話し中です',
  NO_ANSWER: '担当者が応答しませんでした',
  TWILIO_ERROR: 'Twilioサービスエラーが発生しました',
  CONFERENCE_ERROR: 'Conference接続エラーが発生しました'
};
```

## 8. セキュリティ考慮事項

### 8.1 認証・認可
- 取次操作は認証済みユーザーのみ実行可能
- 自分が担当する通話のみ取次可能
- 管理者は全通話の取次が可能

### 8.2 電話番号の保護
- 電話番号は暗号化して保存
- フロントエンドには部分的にマスクして表示
- APIレスポンスでは最小限の情報のみ返す

### 8.3 通話録音とプライバシー
- 取次前後の録音設定を管理
- 個人情報保護法に準拠した録音通知

## 9. テスト計画

### 9.1 単体テスト
- 電話番号バリデーション
- Conference API の動作確認
- WebSocket イベントの送受信

### 9.2 統合テスト
- 取次フロー全体のテスト
- エラーケースのテスト
- 同時複数取次のテスト

### 9.3 負荷テスト
- 複数同時通話での取次
- WebSocket 接続数の上限確認

## 10. 実装優先順位

### Phase 1: 基本機能（必須）
1. ユーザーモデルへの電話番号追加
2. Conference モードへの移行
3. 手動取次機能の実装
4. 基本的なUI実装

### Phase 2: 改善機能
1. 取次前のプレビュー機能
2. AIの段階的なフェードアウト
3. 取次履歴の記録と分析
4. 通知機能の実装

### Phase 3: 高度な機能
1. 自動取次条件の設定
2. 複数担当者への同時通知
3. スキルベースルーティング
4. 取次後のAI再参加機能

## 11. 質問事項の確認

実装前に確認が必要な事項：

1. **電話番号の形式**
   - 国際電話番号形式（+81）を使用するか？
   - 固定電話/携帯電話の制限はあるか？

2. **取次タイミング**
   - AIの応答中でも即座に取次可能にするか？
   - 顧客の発話中は取次を制限するか？

3. **取次後の動作**
   - AIは完全に切断するか、待機状態にするか？
   - 担当者が切断した後、AIに戻すオプションは必要か？

4. **通知方法**
   - SMS通知は必要か？
   - Slack/Teams連携は必要か？

5. **録音設定**
   - 取次前後で録音を継続するか？
   - 録音の保存期間は？

これらの確認事項について、ご要望をお聞かせください。