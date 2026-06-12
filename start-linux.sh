#!/bin/bash

# 色付きの出力用関数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    AI Call System - Linux起動スクリプト       ${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# プロジェクトのルートディレクトリを設定（Linux環境用）
PROJECT_ROOT="/root/work_claude/PJ_AI-"
BACKEND_DIR="${PROJECT_ROOT}/backend"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
LOG_DIR="/tmp/ai-call-system"

# ログディレクトリの作成
mkdir -p "$LOG_DIR"

# 前提条件の確認
echo -e "${YELLOW}🔍 システム要件を確認中...${NC}"

# Node.jsの確認
if ! command -v node &> /dev/null; then
    echo -e "${RED}   ❌ Node.jsがインストールされていません${NC}"
    echo -e "${YELLOW}   Node.jsをインストールしてから再実行してください${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ Node.js $(node --version)${NC}"

# npmの確認
if ! command -v npm &> /dev/null; then
    echo -e "${RED}   ❌ npmがインストールされていません${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ npm $(npm --version)${NC}"

# ngrokの確認（ローカルパス優先）
NGROK_PATH=""
if [ -x "${PROJECT_ROOT}/tools/ngrok" ]; then
    NGROK_PATH="${PROJECT_ROOT}/tools/ngrok"
    echo -e "${GREEN}   ✓ ngrok (local) $($NGROK_PATH version | head -1)${NC}"
elif command -v ngrok &> /dev/null; then
    NGROK_PATH="ngrok"
    echo -e "${GREEN}   ✓ ngrok (system) $(ngrok version | head -1)${NC}"
else
    echo -e "${RED}   ❌ ngrokがインストールされていません${NC}"
    echo -e "${YELLOW}   ngrokをインストールしてから再実行してください${NC}"
    exit 1
fi

# curlの確認
if ! command -v curl &> /dev/null; then
    echo -e "${RED}   ❌ curlがインストールされていません${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ curl${NC}"

# プロジェクトディレクトリの確認
if [ ! -d "$PROJECT_ROOT" ]; then
    echo -e "${RED}   ❌ プロジェクトディレクトリが見つかりません: $PROJECT_ROOT${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ プロジェクトディレクトリ: $PROJECT_ROOT${NC}"

# 1. 既存プロセスのクリーンアップ
echo ""
echo -e "${YELLOW}🧹 既存プロセスをクリーンアップ中...${NC}"

# プロセスの終了（Linux用）
pkill -f "node.*server" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

# ポートを使用しているプロセスを終了
for port in 5001 3000 3001 3002; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}   ポート $port を使用中のプロセスを終了します...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    fi
done

sleep 2
echo -e "${GREEN}   ✓ プロセスクリーンアップ完了${NC}"

# 2. 環境変数ファイルの確認
echo ""
echo -e "${YELLOW}📋 環境変数ファイルを確認中...${NC}"

# backend/.envの確認
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}   ❌ backend/.envファイルが見つかりません${NC}"
    echo -e "${YELLOW}   backend/.envファイルを作成してください${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ backend/.env確認完了${NC}"

# MongoDB Atlas接続の確認
if ! grep -q "mongodb+srv://" "$BACKEND_DIR/.env"; then
    echo -e "${RED}   ❌ MongoDB Atlas接続文字列が設定されていません${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ MongoDB Atlas設定確認完了${NC}"

# 3. 依存関係の確認とインストール
echo ""
echo -e "${YELLOW}📦 依存関係を確認中...${NC}"

# バックエンドの依存関係確認
cd "$BACKEND_DIR"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   バックエンドの依存関係をインストールしています...${NC}"
    npm install
fi
echo -e "${GREEN}   ✓ バックエンド依存関係確認完了${NC}"

# フロントエンドの依存関係確認
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   フロントエンドの依存関係をインストールしています...${NC}"
    npm install
fi
echo -e "${GREEN}   ✓ フロントエンド依存関係確認完了${NC}"

# 4. ngrokの確認と起動
echo ""
echo -e "${YELLOW}🌐 ngrokトンネルを確認中...${NC}"

if ! pgrep -x "ngrok" > /dev/null; then
    echo -e "${GREEN}   ngrokを起動します...${NC}"
    nohup $NGROK_PATH http 5001 > "$LOG_DIR/ngrok.log" 2>&1 &
    sleep 5
    
    # ngrokの起動確認
    if ! pgrep -x "ngrok" > /dev/null; then
        echo -e "${RED}   ❌ ngrokの起動に失敗しました${NC}"
        echo -e "${YELLOW}   ログを確認してください: $LOG_DIR/ngrok.log${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}   ✓ ngrokは既に起動しています${NC}"
fi

# ngrok APIの接続確認
for i in {1..10}; do
    if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ ngrok APIに接続しました${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}   ❌ ngrok APIに接続できません${NC}"
        exit 1
    fi
    sleep 1
done

# 5. ngrok URLの取得とTwilio設定
echo -e "${YELLOW}🔧 ngrok URLを取得してTwilioを設定中...${NC}"
cd "$BACKEND_DIR"

if [ -f "setup-ngrok-twilio.js" ]; then
    node setup-ngrok-twilio.js
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}   ✓ Twilio Webhookを更新しました${NC}"
    else
        echo -e "${RED}   ⚠️ Twilioの更新に失敗しました（手動で設定が必要な場合があります）${NC}"
    fi
else
    echo -e "${YELLOW}   setup-ngrok-twilio.jsが見つかりません${NC}"
fi

# 6. バックエンドサーバーの起動
echo ""
echo -e "${YELLOW}🚀 バックエンドサーバーを起動中...${NC}"
cd "$BACKEND_DIR"

# バックエンド起動
nohup npm run dev > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}   ✓ バックエンドサーバー起動 (PID: $BACKEND_PID)${NC}"

# バックエンドの起動待機
echo -e "${YELLOW}   サーバーの起動を待機中...${NC}"
for i in {1..15}; do
    if curl -s http://localhost:5000/health > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ バックエンドサーバーが応答しました${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}   ❌ バックエンドサーバーの起動に失敗しました${NC}"
        echo -e "${YELLOW}   ログを確認してください: $LOG_DIR/backend.log${NC}"
        exit 1
    fi
    sleep 2
done

# 7. フロントエンドサーバーの起動
echo ""
echo -e "${YELLOW}🎨 フロントエンドサーバーを起動中...${NC}"
cd "$FRONTEND_DIR"

# .env.localファイルの確認と作成
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}   .env.localファイルを作成します...${NC}"
    cat > .env.local << 'EOF'
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
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}   ✓ フロントエンドサーバー起動 (PID: $FRONTEND_PID)${NC}"

# フロントエンドの起動待機とポート確認
echo -e "${YELLOW}   フロントエンドの起動を待機中...${NC}"
sleep 5

# 実際に使用されているポートを確認
FRONTEND_PORT=3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null 2>&1; then
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

# フロントエンドの接続確認
for i in {1..10}; do
    if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ フロントエンドサーバーが応答しました (ポート: $FRONTEND_PORT)${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}   ❌ フロントエンドサーバーの起動に失敗しました${NC}"
        echo -e "${YELLOW}   ログを確認してください: $LOG_DIR/frontend.log${NC}"
        exit 1
    fi
    sleep 2
done

# 8. 起動状態の確認と表示
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✨ システム起動完了！${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ngrok URLの取得と表示
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"\(.*\)"/\1/' 2>/dev/null)
if [ ! -z "$NGROK_URL" ]; then
    echo -e "${GREEN}📞 Twilio Webhook URL:${NC}"
    echo -e "   Voice: ${NGROK_URL}/api/twilio/voice"
    echo -e "   Status: ${NGROK_URL}/api/twilio/status"
    echo ""
fi

echo -e "${GREEN}🌐 アクセスURL:${NC}"
echo -e "   Frontend: ${BLUE}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "   Backend API: ${BLUE}http://localhost:5000${NC}"
if [ ! -z "$NGROK_URL" ]; then
    echo -e "   Public URL: ${BLUE}${NGROK_URL}${NC}"
fi
echo ""

echo -e "${GREEN}📧 ログイン情報:${NC}"
echo -e "   Email: admin@example.com"
echo -e "   Password: admin123"
echo ""

echo -e "${GREEN}📋 プロセス情報:${NC}"
echo -e "   Backend PID: $BACKEND_PID"
echo -e "   Frontend PID: $FRONTEND_PID"
echo -e "   Ngrok PID: $(pgrep -x 'ngrok' || echo 'N/A')"
echo ""

echo -e "${GREEN}📝 ログファイル:${NC}"
echo -e "   Backend: $LOG_DIR/backend.log"
echo -e "   Frontend: $LOG_DIR/frontend.log"
echo -e "   Ngrok: $LOG_DIR/ngrok.log"
echo ""

echo -e "${YELLOW}💡 管理コマンド:${NC}"
echo -e "   システム停止: ./stop-system.sh"
echo -e "   バックエンドログ: tail -f $LOG_DIR/backend.log"
echo -e "   フロントエンドログ: tail -f $LOG_DIR/frontend.log"
echo -e "   プロセス確認: ps aux | grep -E '(node|ngrok)'"
echo ""

echo -e "${GREEN}✅ ブラウザで http://localhost:${FRONTEND_PORT} にアクセスしてください${NC}"
echo ""

# PIDファイルの保存（停止スクリプト用）
cat > "/tmp/ai-call-system.pids" << EOF
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
NGROK_PID=$(pgrep -x 'ngrok' || echo '')
FRONTEND_PORT=$FRONTEND_PORT
EOF

# ログの監視オプション
echo -e "${YELLOW}📝 ログを表示しますか？ [y/N]${NC}"
read -t 10 -r SHOW_LOGS
if [ "$SHOW_LOGS" = "y" ] || [ "$SHOW_LOGS" = "Y" ]; then
    echo -e "${BLUE}リアルタイムログ表示中... (Ctrl+Cで終了)${NC}"
    echo -e "${YELLOW}バックエンドログ:${NC}"
    tail -f "$LOG_DIR/backend.log" &
    TAIL_PID=$!
    
    # Ctrl+Cで終了時の処理
    trap "echo -e '\n${YELLOW}ログ表示を終了しました${NC}'; kill $TAIL_PID 2>/dev/null; exit" INT
    wait
else
    echo -e "${GREEN}システムはバックグラウンドで実行中です${NC}"
    echo -e "${YELLOW}手動でログを確認する場合: tail -f $LOG_DIR/backend.log${NC}"
fi