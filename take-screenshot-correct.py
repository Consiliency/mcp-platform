#!/usr/bin/env python3

import requests
import json
import base64
from datetime import datetime

# MCP gateway configuration
url = "http://localhost:8090/mcp"
headers = {
    "X-API-Key": "mcp-gateway-default-key",
    "Content-Type": "application/json"
}

# First, let's find out what the actual tool format is
print("Checking available tools...")
payload = {
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
}

response = requests.post(url, json=payload, headers=headers)
result = response.json()

if "result" in result and "tools" in result["result"]:
    tools = result["result"]["tools"]
    # Find TakeScreenshot tool
    screenshot_tool = next((t for t in tools if "TakeScreenshot" in t["name"]), None)
    
    if screenshot_tool:
        print(f"Found screenshot tool: {screenshot_tool['name']}")
        
        # Try using the direct method call with mcp__ prefix
        print("\n1. Trying as direct method...")
        payload = {
            "jsonrpc": "2.0",
            "method": screenshot_tool['name'],
            "id": 2,
            "params": {}
        }
        response = requests.post(url, json=payload, headers=headers)
        result = response.json()
        
        if "error" in result:
            print(f"Direct method failed: {result['error']['message']}")
            
            # Try using the internal format
            print("\n2. Trying with internal format (snap-happy:TakeScreenshot)...")
            payload = {
                "jsonrpc": "2.0",
                "method": "snap-happy:TakeScreenshot",
                "id": 3,
                "params": {}
            }
            response = requests.post(url, json=payload, headers=headers)
            result = response.json()
        
        if "result" in result:
            print("Success! Processing screenshot...")
            print(f"Response structure: {type(result['result'])}")
            
            screenshot_data = result["result"]
            
            # Handle different possible response formats
            if isinstance(screenshot_data, dict):
                print(f"Result keys: {list(screenshot_data.keys())}")
                if "content" in screenshot_data:
                    content = screenshot_data["content"]
                    if isinstance(content, list) and len(content) > 0:
                        screenshot_data = content[0].get("data", content[0].get("text", ""))
                elif "data" in screenshot_data:
                    screenshot_data = screenshot_data["data"]
                elif "screenshot" in screenshot_data:
                    screenshot_data = screenshot_data["screenshot"]
            
            # Remove data URL prefix if present
            if isinstance(screenshot_data, str) and screenshot_data.startswith("data:image/png;base64,"):
                screenshot_data = screenshot_data.split(",")[1]
            
            # Decode and save
            if screenshot_data and isinstance(screenshot_data, str):
                try:
                    # Clean up any whitespace
                    screenshot_data = screenshot_data.strip()
                    img_data = base64.b64decode(screenshot_data)
                    filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                    
                    with open(filename, "wb") as f:
                        f.write(img_data)
                    
                    print(f"✓ Screenshot saved as {filename}")
                    print(f"  Size: {len(img_data):,} bytes")
                    
                    # Also save to a fixed filename
                    with open("latest_screenshot.png", "wb") as f:
                        f.write(img_data)
                    print(f"✓ Also saved as latest_screenshot.png")
                except Exception as e:
                    print(f"Error decoding screenshot: {e}")
                    print(f"Data type: {type(screenshot_data)}")
                    print(f"Data preview: {str(screenshot_data)[:100]}...")
            else:
                print("No valid screenshot data found in response")
                print(f"Result was: {json.dumps(result, indent=2)}")
        else:
            print(f"Error: {json.dumps(result, indent=2)}")
else:
    print("Could not get tools list")