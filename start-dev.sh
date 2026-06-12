#!/bin/bash

# Start development servers for both backend and frontend

echo "🚀 Starting AI Call System Development Environment..."
echo ""

# Kill any existing processes on ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:5000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start backend in background
echo "📦 Starting Backend Server (port 5000)..."
cd backend && npm run dev &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting Frontend Server (port 3000)..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Development environment started!"
echo "   Backend:  http://localhost:5000"
echo "   Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    echo "👋 Goodbye!"
    exit 0
}

# Register cleanup function
trap cleanup INT TERM

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID