#!/bin/bash

echo "🚀 AI Call System - 開発環境起動"
echo "================================"
echo ""

# クリーンアップ
echo "🧹 既存プロセスをクリーンアップ中..."
pkill -f "node.*server.js" 2>/dev/null
pkill -f "next dev" 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Backend起動
echo "📦 Backend起動中 (ポート 5001)..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

# 少し待つ
sleep 3

# Frontend起動
echo "🎨 Frontend起動中 (ポート 3000)..."
cd frontend
npx next dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 起動完了!"
echo ""
echo "📍 アクセスURL:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5001"
echo ""
echo "🔐 管理者ログイン:"
echo "   Email:    admin@example.com"
echo "   Password: password123"
echo ""
echo "⛔ 終了するには Ctrl+C を押してください"
echo ""

# Ctrl+Cで終了時の処理
trap 'echo ""; echo "🛑 サーバーを停止中..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -f "node.*server.js" 2>/dev/null; pkill -f "next dev" 2>/dev/null; exit' INT

# プロセスを待機
wait