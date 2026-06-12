#!/bin/bash

# 色付きの出力用関数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    AI Call System - 安全起動スクリプト        ${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# プロジェクトのルートディレクトリを設定
PROJECT_ROOT="/root/work_claude/PJ_AI-"
BACKEND_DIR="${PROJECT_ROOT}/backend"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
LOG_DIR="/tmp/ai-call-system"

# ログディレクトリの作成
mkdir -p "$LOG_DIR"

# 1. 前提条件の確認
echo -e "${YELLOW}🔍 システム要件を確認中...${NC}"

# Node.jsの確認
if ! command -v node &> /dev/null; then
    echo -e "${RED}   ❌ Node.jsがインストールされていません${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ Node.js $(node --version)${NC}"

# プロジェクトディレクトリの確認
if [ ! -d "$PROJECT_ROOT" ]; then
    echo -e "${RED}   ❌ プロジェクトディレクトリが見つかりません: $PROJECT_ROOT${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ プロジェクトディレクトリ: $PROJECT_ROOT${NC}"

# 2. 既存プロセスのクリーンアップ
echo ""
echo -e "${YELLOW}🧹 既存プロセスをクリーンアップ中...${NC}"

# バックエンドプロセスの終了
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}   ポート 5001 を解放中...${NC}"
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# フロントエンドプロセスの終了
for port in 3000 3001 3002; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}   ポート $port を解放中...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
done

echo -e "${GREEN}   ✓ プロセスクリーンアップ完了${NC}"

# 3. 環境変数ファイルの確認
echo ""
echo -e "${YELLOW}📋 環境変数ファイルを確認中...${NC}"

# backend/.envの確認
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}   ❌ backend/.envファイルが見つかりません${NC}"
    echo -e "${YELLOW}   backend/.envファイルを作成してください${NC}"
    exit 1
fi
echo -e "${GREEN}   ✓ backend/.env確認完了${NC}"

# frontend/.env.localの確認と作成
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo -e "${YELLOW}   .env.localファイルを作成します...${NC}"
    cat > "$FRONTEND_DIR/.env.local" << 'EOF'
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

# 4. 依存関係の確認
echo ""
echo -e "${YELLOW}📦 依存関係を確認中...${NC}"

# バックエンドの依存関係
cd "$BACKEND_DIR"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   バックエンドの依存関係をインストール中...${NC}"
    npm install --no-fund --no-audit
    if [ $? -ne 0 ]; then
        echo -e "${RED}   ❌ バックエンドの依存関係インストールに失敗${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}   ✓ バックエンド依存関係確認完了${NC}"

# フロントエンドの依存関係
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   フロントエンドの依存関係をインストール中...${NC}"
    npm install --no-fund --no-audit
    if [ $? -ne 0 ]; then
        echo -e "${RED}   ❌ フロントエンドの依存関係インストールに失敗${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}   ✓ フロントエンド依存関係確認完了${NC}"

# 5. バックエンドサーバーの起動
echo ""
echo -e "${YELLOW}🚀 バックエンドサーバーを起動中...${NC}"
cd "$BACKEND_DIR"

# nodeコマンドで直接起動（npmを使わない）
echo -e "${YELLOW}   node server.js を実行中...${NC}"
node server.js > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# バックエンドの起動確認
echo -e "${YELLOW}   バックエンドの起動を待機中...${NC}"
BACKEND_READY=false
for i in {1..30}; do
    if curl -s http://localhost:5000/health > /dev/null 2>&1; then
        BACKEND_READY=true
        echo -e "${GREEN}   ✓ バックエンドサーバーが起動しました (PID: $BACKEND_PID)${NC}"
        break
    fi
    sleep 1
    if [ $((i % 5)) -eq 0 ]; then
        echo -e "${YELLOW}   待機中... ($i/30秒)${NC}"
    fi
done

if [ "$BACKEND_READY" = false ]; then
    echo -e "${RED}   ❌ バックエンドサーバーの起動に失敗しました${NC}"
    echo -e "${YELLOW}   ログを確認してください: $LOG_DIR/backend.log${NC}"
    tail -20 "$LOG_DIR/backend.log"
    exit 1
fi

# 6. フロントエンドサーバーの起動
echo ""
echo -e "${YELLOW}🎨 フロントエンドサーバーを起動中...${NC}"
cd "$FRONTEND_DIR"

# npxで直接Next.jsを起動
echo -e "${YELLOW}   npx next dev を実行中...${NC}"
npx next dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# フロントエンドの起動確認
echo -e "${YELLOW}   フロントエンドの起動を待機中...${NC}"
FRONTEND_READY=false
FRONTEND_PORT=3000

# 使用されるポートを確認
for i in {1..30}; do
    for port in 3000 3001 3002; do
        if curl -s http://localhost:$port > /dev/null 2>&1; then
            FRONTEND_PORT=$port
            FRONTEND_READY=true
            echo -e "${GREEN}   ✓ フロントエンドサーバーが起動しました (PID: $FRONTEND_PID, Port: $FRONTEND_PORT)${NC}"
            break 2
        fi
    done
    sleep 1
    if [ $((i % 5)) -eq 0 ]; then
        echo -e "${YELLOW}   待機中... ($i/30秒)${NC}"
    fi
done

if [ "$FRONTEND_READY" = false ]; then
    echo -e "${RED}   ❌ フロントエンドサーバーの起動に失敗しました${NC}"
    echo -e "${YELLOW}   ログを確認してください: $LOG_DIR/frontend.log${NC}"
    tail -20 "$LOG_DIR/frontend.log"
    exit 1
fi

# 7. ngrokの設定（オプション）
echo ""
echo -e "${YELLOW}🌐 ngrokの設定（オプション）${NC}"

# ngrokの確認
NGROK_PATH=""
if [ -x "${PROJECT_ROOT}/tools/ngrok" ]; then
    NGROK_PATH="${PROJECT_ROOT}/tools/ngrok"
    echo -e "${GREEN}   ✓ ngrok (local) が利用可能${NC}"
elif command -v ngrok &> /dev/null; then
    NGROK_PATH="ngrok"
    echo -e "${GREEN}   ✓ ngrok (system) が利用可能${NC}"
else
    echo -e "${YELLOW}   ⚠️ ngrokがインストールされていません（外部アクセスが必要な場合は後で設定してください）${NC}"
fi

# ngrokが利用可能な場合の起動オプション
if [ ! -z "$NGROK_PATH" ]; then
    echo -e "${YELLOW}   ngrokトンネルを起動しますか？ [y/N]${NC}"
    read -t 10 -r START_NGROK
    if [ "$START_NGROK" = "y" ] || [ "$START_NGROK" = "Y" ]; then
        if ! pgrep -x "ngrok" > /dev/null; then
            echo -e "${YELLOW}   ngrokを起動中...${NC}"
            $NGROK_PATH http 5001 > "$LOG_DIR/ngrok.log" 2>&1 &
            NGROK_PID=$!
            sleep 3
            
            # ngrok URLの取得
            NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"\(.*\)"/\1/')
            if [ ! -z "$NGROK_URL" ]; then
                echo -e "${GREEN}   ✓ ngrokトンネル起動完了${NC}"
                echo -e "${BLUE}   Public URL: $NGROK_URL${NC}"
            fi
        else
            echo -e "${GREEN}   ✓ ngrokは既に起動しています${NC}"
        fi
    fi
fi

# 8. 起動完了メッセージ
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✨ システム起動完了！${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

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
if [ ! -z "$NGROK_PID" ]; then
    echo -e "   Ngrok PID: $NGROK_PID"
fi
echo ""

echo -e "${GREEN}📝 ログファイル:${NC}"
echo -e "   Backend: $LOG_DIR/backend.log"
echo -e "   Frontend: $LOG_DIR/frontend.log"
if [ ! -z "$NGROK_PID" ]; then
    echo -e "   Ngrok: $LOG_DIR/ngrok.log"
fi
echo ""

# PIDファイルの保存
cat > "/tmp/ai-call-system.pids" << EOF
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
NGROK_PID=${NGROK_PID:-}
FRONTEND_PORT=$FRONTEND_PORT
EOF

echo -e "${YELLOW}💡 管理コマンド:${NC}"
echo -e "   システム停止: ./stop-system.sh"
echo -e "   バックエンドログ: tail -f $LOG_DIR/backend.log"
echo -e "   フロントエンドログ: tail -f $LOG_DIR/frontend.log"
echo ""

echo -e "${GREEN}✅ ブラウザで http://localhost:${FRONTEND_PORT} にアクセスしてください${NC}"
echo ""

# ログ監視オプション
echo -e "${YELLOW}📝 リアルタイムログを表示しますか？ [y/N]${NC}"
read -t 10 -r SHOW_LOGS
if [ "$SHOW_LOGS" = "y" ] || [ "$SHOW_LOGS" = "Y" ]; then
    echo -e "${BLUE}リアルタイムログ表示中... (Ctrl+Cで終了)${NC}"
    echo ""
    echo -e "${YELLOW}=== バックエンドログ ===${NC}"
    tail -f "$LOG_DIR/backend.log" &
    TAIL_BACKEND=$!
    
    echo ""
    echo -e "${YELLOW}=== フロントエンドログ ===${NC}"
    tail -f "$LOG_DIR/frontend.log" &
    TAIL_FRONTEND=$!
    
    # Ctrl+Cで終了時の処理
    trap "echo -e '\n${YELLOW}ログ表示を終了しました${NC}'; kill $TAIL_BACKEND $TAIL_FRONTEND 2>/dev/null; exit" INT
    wait
else
    echo -e "${GREEN}システムはバックグラウンドで実行中です${NC}"
fi