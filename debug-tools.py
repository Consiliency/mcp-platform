#!/usr/bin/env python3

import requests
import json

# First, get the list of tools to see their exact names
url = "http://localhost:8090/mcp"
headers = {
    "X-API-Key": "mcp-gateway-default-key",
    "Content-Type": "application/json"
}

print("Getting list of available tools...")
payload = {
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
}

response = requests.post(url, json=payload, headers=headers)
result = response.json()

if "result" in result and "tools" in result["result"]:
    tools = result["result"]["tools"]
    print(f"\nFound {len(tools)} tools\n")
    
    # Find screenshot tools
    screenshot_tools = [t for t in tools if "screenshot" in t["name"].lower()]
    
    print("Screenshot tools:")
    for tool in screenshot_tools:
        print(f"  Name: {tool['name']}")
        print(f"  Description: {tool['description'][:80]}...")
        print()
    
    # Try calling the TakeScreenshot tool
    take_screenshot = next((t for t in screenshot_tools if "TakeScreenshot" in t["name"]), None)
    
    if take_screenshot:
        print(f"\nAttempting to call: {take_screenshot['name']}")
        
        # Try direct method call first
        print("\n1. Trying direct method call...")
        payload = {
            "jsonrpc": "2.0",
            "method": take_screenshot['name'],
            "id": 2,
            "params": {}
        }
        response = requests.post(url, json=payload, headers=headers)
        print(f"Response: {response.json()}")
        
        # Try tools/call with full name
        print("\n2. Trying tools/call with full name...")
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "id": 3,
            "params": {
                "name": take_screenshot['name'],
                "arguments": {}
            }
        }
        response = requests.post(url, json=payload, headers=headers)
        print(f"Response: {response.json()}")
else:
    print(f"Error: {json.dumps(result, indent=2)}")