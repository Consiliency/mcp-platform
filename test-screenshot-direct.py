#!/usr/bin/env python3

import requests
import json
import base64

# Test the screenshot tool through MCP gateway using direct method call
url = "http://localhost:8090/mcp"
headers = {
    "X-API-Key": "mcp-gateway-default-key",
    "Content-Type": "application/json"
}

# Call the screenshot tool using the namespaced method directly
print("Taking screenshot...")
payload = {
    "jsonrpc": "2.0",
    "method": "mcp__snap_happy__TakeScreenshot",
    "id": 3,
    "params": {}
}

try:
    response = requests.post(url, json=payload, headers=headers)
    result = response.json()
    print(f"Status: {response.status_code}")
    
    if "result" in result:
        # The screenshot should be in base64 format
        screenshot_data = result.get("result", {})
        
        # Handle different response formats
        if isinstance(screenshot_data, str):
            # Direct base64 string
            data = screenshot_data
        elif isinstance(screenshot_data, dict):
            # Could be {"data": "base64..."} or {"content": [{"type": "image", "data": "base64..."}]}
            data = screenshot_data.get("data") or screenshot_data.get("screenshot")
            if not data and "content" in screenshot_data:
                content = screenshot_data["content"]
                if isinstance(content, list) and len(content) > 0:
                    data = content[0].get("data")
        else:
            data = None
            
        if data:
            # Remove data URL prefix if present
            if data.startswith("data:image/png;base64,"):
                data = data.split(",")[1]
            
            # Decode and save
            img_data = base64.b64decode(data)
            with open("screenshot.png", "wb") as f:
                f.write(img_data)
            print("Screenshot saved as screenshot.png")
            print(f"Screenshot data size: {len(img_data)} bytes")
        else:
            print("No screenshot data found in response")
            print(f"Response structure: {json.dumps(result, indent=2)}")
    else:
        print(f"Error: {json.dumps(result, indent=2)}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()