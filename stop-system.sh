#!/bin/bash

# 色付きの出力用関数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    AI Call System - システム停止スクリプト    ${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

echo -e "${YELLOW}🛑 システムを停止中...${NC}"

# 1. Node.jsプロセスを停止
echo -e "${YELLOW}   Node.jsプロセスを停止中...${NC}"
pkill -f "node.*server" 2>/dev/null
pkill -f "nodemon" 2>/dev/null
pkill -f "next dev" 2>/dev/null

# 2. ポートを使用しているプロセスを強制終了
echo -e "${YELLOW}   ポートを解放中...${NC}"
lsof -ti:5001 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:3002 | xargs kill -9 2>/dev/null

# 3. ngrokを停止（オプション）
echo -e "${YELLOW}   ngrokを停止しますか？ (y/n)${NC}"
read -r STOP_NGROK
if [ "$STOP_NGROK" = "y" ]; then
    pkill -f "ngrok" 2>/dev/null
    echo -e "${GREEN}   ✓ ngrokを停止しました${NC}"
else
    echo -e "${BLUE}   ngrokは実行したままにします${NC}"
fi

# 4. ログファイルをクリーンアップ（オプション）
echo -e "${YELLOW}   ログファイルを削除しますか？ (y/n)${NC}"
read -r CLEAN_LOGS
if [ "$CLEAN_LOGS" = "y" ]; then
    rm -f /tmp/backend.log 2>/dev/null
    rm -f /tmp/frontend.log 2>/dev/null
    rm -f /tmp/ngrok.log 2>/dev/null
    echo -e "${GREEN}   ✓ ログファイルを削除しました${NC}"
else
    echo -e "${BLUE}   ログファイルは保持されます${NC}"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✅ システムが正常に停止しました${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${YELLOW}💡 再起動するには: ./start-system.sh${NC}"
echo ""