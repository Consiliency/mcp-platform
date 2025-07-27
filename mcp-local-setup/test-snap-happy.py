#!/usr/bin/env python3
"""
Test script for Snap-Happy MCP server through the gateway
"""

import requests
import json
import base64
from datetime import datetime

GATEWAY_URL = "http://127.0.0.1:8090"
API_KEY = "mcp-gateway-default-key"

def call_mcp_tool(tool_name, params=None):
    """Call an MCP tool through the gateway"""
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
    }
    
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": params or {}
        },
        "id": 1
    }
    
    response = requests.post(f"{GATEWAY_URL}/mcp", headers=headers, json=payload)
    return response.json()

def save_screenshot(base64_data, filename):
    """Save base64 screenshot data to file"""
    image_data = base64.b64decode(base64_data)
    with open(filename, 'wb') as f:
        f.write(image_data)
    print(f"✅ Screenshot saved to: {filename}")

def main():
    print("🚀 Testing Snap-Happy MCP Server")
    print("=" * 50)
    
    # Test 1: List available windows (macOS only)
    print("\n1️⃣ Listing available windows...")
    try:
        result = call_mcp_tool("snap-happy:ListWindows")
        if "result" in result:
            windows = result["result"]
            print(f"Found {len(windows) if isinstance(windows, list) else 0} windows")
            if isinstance(windows, list) and windows:
                for window in windows[:5]:  # Show first 5
                    print(f"  - {window.get('title', 'Untitled')} ({window.get('application', 'Unknown')})")
        else:
            print("  ⚠️  Could not list windows (might not be on macOS)")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    # Test 2: Take a screenshot
    print("\n2️⃣ Taking a screenshot...")
    try:
        result = call_mcp_tool("snap-happy:TakeScreenshot")
        if "result" in result and isinstance(result["result"], str):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"screenshot_{timestamp}.png"
            save_screenshot(result["result"], filename)
            print(f"  📐 Screenshot size: {len(result['result'])} bytes (base64)")
        else:
            error = result.get("error", {})
            print(f"  ❌ Error: {error.get('message', 'Unknown error')}")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    # Test 3: Get last screenshot
    print("\n3️⃣ Getting last screenshot...")
    try:
        result = call_mcp_tool("snap-happy:GetLastScreenshot")
        if "result" in result and isinstance(result["result"], str):
            filename = "last_screenshot.png"
            save_screenshot(result["result"], filename)
        else:
            error = result.get("error", {})
            print(f"  ❌ Error: {error.get('message', 'Unknown error')}")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    print("\n✨ Test complete!")

if __name__ == "__main__":
    main()