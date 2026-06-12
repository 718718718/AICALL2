#!/bin/bash

# Backend start script
echo "📦 Starting Backend Development Server..."

# Kill any existing process on port 5001
lsof -ti:5001 | xargs kill -9 2>/dev/null || true

# Run nodemon directly
npx nodemon server.js