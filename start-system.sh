#!/bin/bash

# 色付きの出力用関数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    AI Call System - 完全起動スクリプト        ${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# プロジェクトのルートディレクトリを設定
PROJECT_ROOT="/root/work_claude/PJ_AI-"
BACKEND_DIR="${PROJECT_ROOT}/backend"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"

# 1. 既存プロセスのクリーンアップ
echo -e "${YELLOW}🧹 既存プロセスをクリーンアップ中...${NC}"
pkill -f "node.*server" 2>/dev/null
pkill -f "nodemon" 2>/dev/null
pkill -f "next dev" 2>/dev/null
lsof -ti:5000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:3002 | xargs kill -9 2>/dev/null
sleep 2

# 2. ngrokの確認と起動
echo -e "${YELLOW}🌐 ngrokトンネルを確認中...${NC}"
if ! pgrep -x "ngrok" > /dev/null; then
    echo -e "${GREEN}   ngrokを起動します...${NC}"
    ngrok http 5000 > /tmp/ngrok.log 2>&1 &
    sleep 5
else
    echo -e "${GREEN}   ✓ ngrokは既に起動しています${NC}"
fi

# 3. ngrok URLの取得とTwilio設定
echo -e "${YELLOW}🔧 ngrok URLを取得してTwilioを設定中...${NC}"
cd $BACKEND_DIR
if [ -f "setup-ngrok-twilio.js" ]; then
    node setup-ngrok-twilio.js
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}   ✓ Twilio Webhookを更新しました${NC}"
    else
        echo -e "${RED}   ⚠️ Twilioの更新に失敗しました（手動で設定が必要）${NC}"
    fi
else
    echo -e "${YELLOW}   setup-ngrok-twilio.jsが見つかりません${NC}"
fi

# 4. バックエンドサーバーの起動
echo ""
echo -e "${YELLOW}🚀 バックエンドサーバーを起動中...${NC}"
cd $BACKEND_DIR

# .envファイルの存在確認
if [ ! -f ".env" ]; then
    echo -e "${RED}   ❌ .envファイルが見つかりません！${NC}"
    echo -e "${YELLOW}   backend/.envファイルを作成してください${NC}"
    exit 1
fi

# バックエンド起動
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}   ✓ バックエンドサーバー起動 (PID: $BACKEND_PID)${NC}"

# バックエンドの起動待機
echo -e "${YELLOW}   サーバーの起動を待機中...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:5000/health > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ バックエンドサーバーが応答しました${NC}"
        break
    fi
    sleep 2
done

# 5. フロントエンドサーバーの起動
echo ""
echo -e "${YELLOW}🎨 フロントエンドサーバーを起動中...${NC}"
cd $FRONTEND_DIR

# .env.localファイルの存在確認
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}   .env.localファイルを作成します...${NC}"
    cat > .env.local << EOF
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
BACKEND_URL=http://localhost:5000

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

# App Name
NEXT_PUBLIC_APP_NAME=AI Call System
EOF
    echo -e "${GREEN}   ✓ .env.localファイルを作成しました${NC}"
fi

# フロントエンド起動
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}   ✓ フロントエンドサーバー起動 (PID: $FRONTEND_PID)${NC}"

# フロントエンドの起動待機とポート確認
echo -e "${YELLOW}   フロントエンドの起動を待機中...${NC}"
sleep 5

# 実際に使用されているポートを確認
FRONTEND_PORT=3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
        if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null ; then
            FRONTEND_PORT=3003
        else
            FRONTEND_PORT=3002
        fi
    else
        FRONTEND_PORT=3001
    fi
else
    FRONTEND_PORT=3000
fi

# 6. 起動状態の確認
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✨ システム起動完了！${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ngrok URLの取得と表示
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"\(.*\)"/\1/')
if [ ! -z "$NGROK_URL" ]; then
    echo -e "${GREEN}📞 Twilio Webhook URL:${NC}"
    echo -e "   Voice: ${NGROK_URL}/api/twilio/voice"
    echo -e "   Status: ${NGROK_URL}/api/twilio/status"
    echo ""
fi

echo -e "${GREEN}🌐 アクセスURL:${NC}"
echo -e "   Frontend: ${BLUE}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "   Backend API: ${BLUE}http://localhost:5000${NC}"
echo ""

echo -e "${GREEN}📧 ログイン情報:${NC}"
echo -e "   Email: admin@example.com"
echo -e "   Password: admin123"
echo ""

echo -e "${GREEN}📋 プロセス情報:${NC}"
echo -e "   Backend PID: $BACKEND_PID"
echo -e "   Frontend PID: $FRONTEND_PID"
echo ""

echo -e "${YELLOW}💡 停止方法:${NC}"
echo -e "   ./stop-system.sh または Ctrl+C"
echo ""

echo -e "${GREEN}✅ ブラウザで http://localhost:${FRONTEND_PORT} にアクセスしてください${NC}"
echo ""

# ログの監視（オプション）
echo -e "${YELLOW}📝 ログを表示しますか？ (y/n)${NC}"
read -r SHOW_LOGS
if [ "$SHOW_LOGS" = "y" ]; then
    echo -e "${BLUE}バックエンドログ:${NC}"
    tail -f /tmp/backend.log &
    TAIL_PID=$!
    
    # Ctrl+Cで終了時の処理
    trap "kill $BACKEND_PID $FRONTEND_PID $TAIL_PID 2>/dev/null; exit" INT
    wait
else
    echo -e "${GREEN}システムはバックグラウンドで実行中です${NC}"
    echo -e "${YELLOW}ログを見るには: tail -f /tmp/backend.log${NC}"
fi