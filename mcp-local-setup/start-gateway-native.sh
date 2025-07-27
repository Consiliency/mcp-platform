#!/bin/bash

echo "🚀 Starting MCP Gateway in Native Mode (for WSL display access)"
echo "=================================================="

# Kill any existing gateway process
pkill -f "node.*gateway/server.js" || true

# Install dependencies if needed
cd gateway
if [ ! -d "node_modules" ]; then
    echo "📦 Installing gateway dependencies..."
    npm install
fi

# Set environment for WSL
export NODE_ENV=production
export GATEWAY_MODE=native
export CONFIG_PATH=./gateway-config.json

# Start the gateway
echo "🔧 Starting gateway server..."
node server.js &
GATEWAY_PID=$!

echo "✅ Gateway started with PID: $GATEWAY_PID"
echo "🔗 Gateway URL: http://127.0.0.1:8090"
echo "🎯 Dashboard: http://127.0.0.1:8090/dashboard/"
echo ""
echo "To stop: kill $GATEWAY_PID"

# Wait for interrupt
trap "kill $GATEWAY_PID; exit" INT TERM
wait $GATEWAY_PID