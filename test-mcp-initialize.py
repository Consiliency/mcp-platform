#!/usr/bin/env python3

import requests
import json

# Test the MCP initialize handshake
url = "http://localhost:8090/mcp"
headers = {
    "X-API-Key": "mcp-gateway-default-key",
    "Content-Type": "application/json"
}

# Send initialize request
print("Testing MCP initialize...")
payload = {
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
        "protocolVersion": "0.1.0",
        "capabilities": {
            "tools": True,
            "prompts": True,
            "resources": True
        },
        "clientInfo": {
            "name": "test-client",
            "version": "1.0.0"
        }
    }
}

try:
    response = requests.post(url, json=payload, headers=headers)
    result = response.json()
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(result, indent=2)}")
    
    if "result" in result and "capabilities" in result["result"]:
        caps = result["result"]["capabilities"]
        if "tools" in caps:
            print(f"\nServer supports {len(caps['tools'])} tools")
            # Show first few tools
            tools = list(caps['tools'].items())[:5]
            for name, desc in tools:
                print(f"  - {name}: {desc.get('description', 'No description')[:60]}...")
                
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()