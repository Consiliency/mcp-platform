#!/bin/bash

# Test Snap-Happy screenshot through MCP Gateway

echo "🚀 Testing Snap-Happy screenshot capability..."

# Take a screenshot
echo "📸 Taking screenshot..."
RESPONSE=$(curl -s -X POST http://127.0.0.1:8090/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mcp-gateway-default-key" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snap-happy:TakeScreenshot",
      "arguments": {}
    },
    "id": 1
  }')

# Check if we got a result
if echo "$RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
  # Extract base64 image data
  IMAGE_DATA=$(echo "$RESPONSE" | jq -r '.result')
  
  # Save to file
  echo "$IMAGE_DATA" | base64 -d > mcp-screenshot.png
  
  echo "✅ Screenshot saved to: mcp-screenshot.png"
  echo "📏 File size: $(ls -lh mcp-screenshot.png | awk '{print $5}')"
else
  echo "❌ Error taking screenshot:"
  echo "$RESPONSE" | jq '.error'
fi