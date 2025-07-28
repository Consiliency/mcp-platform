#!/usr/bin/env python3
"""
Test script to compare Puppeteer and Snap-Happy MCP servers for taking screenshots
"""

import requests
import json
import base64
from datetime import datetime
import time
import sys

GATEWAY_URL = "http://127.0.0.1:8090"
API_KEY = "mcp-gateway-default-key"
TARGET_URL = "http://localhost:8090/dashboard/catalog.html"

def call_mcp_tool(server, tool_name, params=None):
    """Call an MCP tool through the gateway"""
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-MCP-Server": server
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
    
    try:
        response = requests.post(f"{GATEWAY_URL}/mcp", headers=headers, json=payload, timeout=30)
        return response.json()
    except requests.exceptions.Timeout:
        return {"error": {"message": "Request timed out after 30 seconds"}}
    except Exception as e:
        return {"error": {"message": f"Request failed: {str(e)}"}}

def save_screenshot(base64_data, filename):
    """Save base64 screenshot data to file"""
    try:
        image_data = base64.b64decode(base64_data)
        with open(filename, 'wb') as f:
            f.write(image_data)
        print(f"✅ Screenshot saved to: {filename}")
        print(f"   Size: {len(image_data):,} bytes")
        return True
    except Exception as e:
        print(f"❌ Failed to save screenshot: {e}")
        return False

def test_puppeteer():
    """Test Puppeteer MCP server"""
    print("\n🎭 Testing Puppeteer MCP Server")
    print("=" * 50)
    
    # First, check if Puppeteer server is available
    print("Checking Puppeteer server availability...")
    
    # Navigate to the catalog page
    print(f"\n1️⃣ Navigating to {TARGET_URL}...")
    start_time = time.time()
    
    result = call_mcp_tool("puppeteer", "puppeteer_navigate", {
        "url": TARGET_URL
    })
    
    elapsed = time.time() - start_time
    print(f"   Navigation took: {elapsed:.2f}s")
    
    if "error" in result:
        print(f"   ❌ Error: {result['error'].get('message', 'Unknown error')}")
        return False
    else:
        print("   ✅ Navigation successful")
    
    # Wait a bit for page to load
    time.sleep(2)
    
    # Take screenshot
    print("\n2️⃣ Taking screenshot with Puppeteer...")
    start_time = time.time()
    
    result = call_mcp_tool("puppeteer", "puppeteer_screenshot", {})
    
    elapsed = time.time() - start_time
    print(f"   Screenshot took: {elapsed:.2f}s")
    
    if "result" in result:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"puppeteer_catalog_{timestamp}.png"
        if save_screenshot(result["result"], filename):
            return True
    else:
        print(f"   ❌ Error: {result.get('error', {}).get('message', 'Unknown error')}")
        return False

def test_snap_happy():
    """Test Snap-Happy MCP server"""
    print("\n📸 Testing Snap-Happy MCP Server")
    print("=" * 50)
    
    # Note: Snap-Happy takes screenshots of the entire screen or specific windows
    # It doesn't navigate to URLs like Puppeteer
    
    print("\n1️⃣ Taking full screen screenshot...")
    start_time = time.time()
    
    result = call_mcp_tool("snap-happy-native", "snap-happy:TakeScreenshot", {})
    
    elapsed = time.time() - start_time
    print(f"   Screenshot took: {elapsed:.2f}s")
    
    if "result" in result and isinstance(result["result"], str):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"snaphappy_fullscreen_{timestamp}.png"
        if save_screenshot(result["result"], filename):
            print("\n   ℹ️  Note: Snap-Happy captures the entire screen.")
            print("   To capture the catalog page specifically, ensure it's visible on screen.")
            return True
    else:
        error = result.get("error", {})
        print(f"   ❌ Error: {error.get('message', 'Unknown error')}")
        return False

def main():
    print("🚀 MCP Screenshot Tool Comparison Test")
    print("Testing Puppeteer vs Snap-Happy for capturing catalog page")
    print("\n⚠️  Prerequisites:")
    print("   - MCP Gateway running at http://localhost:8090")
    print("   - Catalog page accessible at http://localhost:8090/dashboard/catalog.html")
    print("   - Both Puppeteer and Snap-Happy MCP servers configured")
    
    # Test Puppeteer
    puppeteer_success = test_puppeteer()
    
    # Test Snap-Happy
    snap_happy_success = test_snap_happy()
    
    # Summary
    print("\n📊 Test Summary")
    print("=" * 50)
    print(f"Puppeteer: {'✅ Success' if puppeteer_success else '❌ Failed'}")
    print(f"Snap-Happy: {'✅ Success' if snap_happy_success else '❌ Failed'}")
    
    print("\n🔍 Key Differences:")
    print("   - Puppeteer: Can navigate to URLs and capture specific pages")
    print("   - Snap-Happy: Captures screen/window content (requires page to be visible)")
    print("   - Puppeteer: Better for automated web testing")
    print("   - Snap-Happy: Better for capturing desktop applications or visible content")

if __name__ == "__main__":
    main()