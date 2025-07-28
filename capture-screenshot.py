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

# Call the screenshot tool using tools/call
print("Taking screenshot...")
payload = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 1,
    "params": {
        "name": "snap-happy:TakeScreenshot",
        "arguments": {}
    }
}

try:
    response = requests.post(url, json=payload, headers=headers)
    result = response.json()
    
    if "result" in result:
        # Extract the screenshot data
        screenshot_data = result["result"]
        
        # Handle different possible response formats
        if isinstance(screenshot_data, dict):
            # It might be wrapped in a content array or have a data field
            if "content" in screenshot_data:
                content = screenshot_data["content"]
                if isinstance(content, list) and len(content) > 0:
                    screenshot_data = content[0].get("data", content[0].get("text", ""))
                else:
                    screenshot_data = content
            elif "data" in screenshot_data:
                screenshot_data = screenshot_data["data"]
            elif "screenshot" in screenshot_data:
                screenshot_data = screenshot_data["screenshot"]
        
        # Remove data URL prefix if present
        if isinstance(screenshot_data, str) and screenshot_data.startswith("data:image/png;base64,"):
            screenshot_data = screenshot_data.split(",")[1]
        
        # Decode and save the screenshot
        if screenshot_data:
            img_data = base64.b64decode(screenshot_data)
            filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            
            with open(filename, "wb") as f:
                f.write(img_data)
            
            print(f"✓ Screenshot saved as {filename}")
            print(f"  Size: {len(img_data):,} bytes")
            
            # Also save to a fixed filename for easy viewing
            with open("latest_screenshot.png", "wb") as f:
                f.write(img_data)
            print(f"✓ Also saved as latest_screenshot.png")
        else:
            print("✗ No valid screenshot data received")
            print(f"Response: {json.dumps(result, indent=2)}")
    else:
        print(f"✗ Error: {json.dumps(result, indent=2)}")
        
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()