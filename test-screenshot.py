#!/usr/bin/env python3

import requests
import json
import base64

# Test the screenshot tool through MCP gateway
url = "http://localhost:8090/mcp"
headers = {
    "X-API-Key": "mcp-gateway-default-key",
    "Content-Type": "application/json"
}

# Call the screenshot tool
print("Taking screenshot...")
payload = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 2,
    "params": {
        "name": "mcp__snap_happy__TakeScreenshot",
        "arguments": {}
    }
}

try:
    response = requests.post(url, json=payload, headers=headers)
    result = response.json()
    print(f"Status: {response.status_code}")
    
    if "result" in result:
        # The screenshot should be in base64 format
        screenshot_data = result["result"]
        if isinstance(screenshot_data, dict) and "data" in screenshot_data:
            screenshot_data = screenshot_data["data"]
        
        # Save the screenshot
        if screenshot_data:
            # Remove data URL prefix if present
            if screenshot_data.startswith("data:image/png;base64,"):
                screenshot_data = screenshot_data.split(",")[1]
            
            # Decode and save
            img_data = base64.b64decode(screenshot_data)
            with open("screenshot.png", "wb") as f:
                f.write(img_data)
            print("Screenshot saved as screenshot.png")
            print(f"Screenshot data size: {len(img_data)} bytes")
        else:
            print("No screenshot data received")
    else:
        print(f"Error: {json.dumps(result, indent=2)}")
        
except Exception as e:
    print(f"Error: {e}")