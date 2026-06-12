#!/bin/bash

echo "🚀 AI Call System - シンプル起動"
echo "================================"

# 既存プロセスをクリーンアップ
echo "🧹 クリーンアップ中..."
pkill -f "node.*server.js" 2>/dev/null
pkill -f "next dev" 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Backend起動
echo ""
echo "📦 Backend起動中 (ポート 5001)..."
cd backend
node server.js > backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 少し待つ
sleep 3

# Frontend起動
echo "🎨 Frontend起動中 (ポート 3000)..."
cd frontend
npx next dev > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# 起動を待つ
echo "⏳ サーバー起動待機中..."
sleep 5

# 起動確認
BACKEND_OK=false
FRONTEND_OK=false

if lsof -i :5001 | grep -q LISTEN; then
    BACKEND_OK=true
fi

if lsof -i :3000 | grep -q LISTEN; then
    FRONTEND_OK=true
fi

echo ""
echo "================================"
if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
    echo "✅ 起動成功！"
    echo ""
    echo "📍 アクセスURL:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend:  http://localhost:5001"
    echo ""
    echo "🔐 ログイン情報:"
    echo "   Email:    admin@example.com"
    echo "   Password: password123"
    echo ""
    echo "📝 ログファイル:"
    echo "   Backend:  backend/backend.log"
    echo "   Frontend: frontend/frontend.log"
else
    echo "❌ 起動に失敗しました"
    if [ "$BACKEND_OK" = false ]; then
        echo "   - Backend が起動していません"
    fi
    if [ "$FRONTEND_OK" = false ]; then
        echo "   - Frontend が起動していません"
    fi
    echo ""
    echo "ログを確認してください:"
    echo "  cat backend/backend.log"
    echo "  cat frontend/frontend.log"
fi
echo "================================"
echo ""
echo "⛔ 終了するには: pkill -f node"