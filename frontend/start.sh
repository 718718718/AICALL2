#!/bin/bash

# Frontend start script
echo "🎨 Starting Frontend Development Server..."

# Kill any existing process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Use npx to run next directly
npx next dev

# Alternative if npx doesn't work:
# node_modules/.bin/next dev