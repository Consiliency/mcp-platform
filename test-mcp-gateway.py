#!/usr/bin/env python3

import requests
import json

# Test the MCP gateway
url = "http://localhost:8090/mcp"
headers = {
    "X-API-Key": "mcp-gateway-default-key",
    "Content-Type": "application/json"
}

# Test tools/list
print("Testing tools/list...")
payload = {
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
}

try:
    response = requests.post(url, json=payload, headers=headers)
    result = response.json()
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(result, indent=2)}")
    
    if "result" in result and "tools" in result["result"]:
        tools = result["result"]["tools"]
        print(f"\nFound {len(tools)} tools:")
        for tool in tools:
            print(f"  - {tool.get('name', 'Unknown')}: {tool.get('description', 'No description')[:60]}...")
except Exception as e:
    print(f"Error: {e}")