#!/usr/bin/env python3
"""
Simple test to check MCP server availability and take screenshots
"""

import requests
import json
import sys

GATEWAY_URL = "http://127.0.0.1:8090"
API_KEY = "mcp-gateway-default-key"

def check_gateway():
    """Check if gateway is running"""
    try:
        response = requests.get(f"{GATEWAY_URL}/health", 
                              headers={"X-API-Key": API_KEY},
                              timeout=5)
        if response.status_code == 200:
            print("✅ Gateway is running")
            return True
        else:
            print(f"❌ Gateway returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Gateway not accessible: {e}")
        return False

def list_servers():
    """List available MCP servers"""
    try:
        response = requests.get(f"{GATEWAY_URL}/servers",
                              headers={"X-API-Key": API_KEY},
                              timeout=5)
        if response.status_code == 200:
            servers = response.json()
            print("\n📋 Available MCP Servers:")
            for server_id, info in servers.items():
                status = "🟢 Running" if info.get("status") == "running" else "🔴 Stopped"
                print(f"   - {server_id}: {status}")
            return servers
        else:
            print(f"❌ Failed to list servers: {response.status_code}")
            return {}
    except Exception as e:
        print(f"❌ Error listing servers: {e}")
        return {}

def list_tools(server):
    """List tools available for a server"""
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-MCP-Server": server
    }
    
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/list",
        "params": {},
        "id": 1
    }
    
    try:
        response = requests.post(f"{GATEWAY_URL}/mcp", headers=headers, json=payload, timeout=10)
        result = response.json()
        
        if "result" in result and "tools" in result["result"]:
            tools = result["result"]["tools"]
            print(f"\n🔧 Tools for {server}:")
            for tool in tools:
                print(f"   - {tool['name']}: {tool.get('description', 'No description')}")
            return tools
        else:
            print(f"❌ No tools found for {server}")
            return []
    except Exception as e:
        print(f"❌ Error listing tools: {e}")
        return []

def main():
    print("🔍 MCP Screenshot Tools Investigation")
    print("=" * 50)
    
    # Check gateway
    if not check_gateway():
        print("\n⚠️  Please ensure the MCP gateway is running:")
        print("   cd mcp-local-setup && ./launch.sh")
        sys.exit(1)
    
    # List servers
    servers = list_servers()
    
    # Check for screenshot-capable servers
    screenshot_servers = []
    
    for server_id in servers:
        if "puppeteer" in server_id.lower():
            print(f"\n🎭 Found Puppeteer server: {server_id}")
            tools = list_tools(server_id)
            if tools:
                screenshot_servers.append(("puppeteer", server_id))
        
        elif "snap" in server_id.lower() and "happy" in server_id.lower():
            print(f"\n📸 Found Snap-Happy server: {server_id}")
            tools = list_tools(server_id)
            if tools:
                screenshot_servers.append(("snap-happy", server_id))
    
    if not screenshot_servers:
        print("\n⚠️  No screenshot-capable MCP servers found!")
        print("   Please configure Puppeteer and/or Snap-Happy servers")
    else:
        print(f"\n✅ Found {len(screenshot_servers)} screenshot-capable server(s)")
        print("\n   To test screenshots, run: python test-screenshot-comparison.py")

if __name__ == "__main__":
    main()