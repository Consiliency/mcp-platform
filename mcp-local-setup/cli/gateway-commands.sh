#!/bin/bash
# MCP Gateway CLI Commands

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MCP_HOME="${MCP_HOME:-$HOME/.mcp-platform}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Gateway management functions
gateway_start() {
    echo -e "${GREEN}Starting MCP Gateway...${NC}"
    
    # Check if running in Docker
    if docker ps --format "{{.Names}}" | grep -q "gateway"; then
        echo -e "${YELLOW}Gateway is already running in Docker${NC}"
        return 0
    fi
    
    # Start gateway locally
    cd "$SCRIPT_DIR/../gateway" || exit 1
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing gateway dependencies..."
        npm install
    fi
    
    # Start in background
    nohup node server.js > "$MCP_HOME/logs/gateway.log" 2>&1 &
    echo $! > "$MCP_HOME/gateway.pid"
    
    echo -e "${GREEN}Gateway started (PID: $(cat "$MCP_HOME/gateway.pid"))${NC}"
    echo "Endpoint: http://localhost:8090/mcp"
    echo "Logs: $MCP_HOME/logs/gateway.log"
}

gateway_stop() {
    echo -e "${YELLOW}Stopping MCP Gateway...${NC}"
    
    # Check for Docker container
    if docker ps --format "{{.Names}}" | grep -q "gateway"; then
        docker stop mcp-local-setup-gateway-1
        echo -e "${GREEN}Gateway stopped (Docker)${NC}"
        return 0
    fi
    
    # Stop local process
    if [ -f "$MCP_HOME/gateway.pid" ]; then
        PID=$(cat "$MCP_HOME/gateway.pid")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm "$MCP_HOME/gateway.pid"
            echo -e "${GREEN}Gateway stopped (PID: $PID)${NC}"
        else
            echo -e "${YELLOW}Gateway process not found${NC}"
            rm "$MCP_HOME/gateway.pid"
        fi
    else
        echo -e "${YELLOW}No gateway PID file found${NC}"
    fi
}

gateway_status() {
    echo -e "${GREEN}MCP Gateway Status${NC}"
    echo "=================="
    
    # Check health endpoint
    if curl -s http://localhost:8090/health > /dev/null 2>&1; then
        echo -e "Status: ${GREEN}Online${NC}"
        
        # Get gateway info
        HEALTH=$(curl -s http://localhost:8090/health)
        echo "Health: $HEALTH"
        
        # Check for API key
        API_KEY="${MCP_GATEWAY_API_KEY:-mcp-gateway-default-key}"
        
        # Get server status
        SERVERS=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:8090/api/gateway/servers)
        if [ $? -eq 0 ]; then
            echo -e "\n${GREEN}Connected Servers:${NC}"
            echo "$SERVERS" | jq -r '.servers[] | "- \(.id): \(.status) (\(.toolCount) tools)"' 2>/dev/null || echo "$SERVERS"
        fi
        
        # Get tools count
        TOOLS=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:8090/api/gateway/tools)
        if [ $? -eq 0 ]; then
            TOOL_COUNT=$(echo "$TOOLS" | jq -r '.count' 2>/dev/null || echo "unknown")
            echo -e "\nTotal Tools: ${GREEN}$TOOL_COUNT${NC}"
        fi
    else
        echo -e "Status: ${RED}Offline${NC}"
        
        # Check if process is running
        if [ -f "$MCP_HOME/gateway.pid" ]; then
            PID=$(cat "$MCP_HOME/gateway.pid")
            if kill -0 "$PID" 2>/dev/null; then
                echo -e "${YELLOW}Process is running but not responding${NC}"
                echo "Check logs: $MCP_HOME/logs/gateway.log"
            fi
        fi
    fi
}

gateway_logs() {
    if [ -f "$MCP_HOME/logs/gateway.log" ]; then
        tail -f "$MCP_HOME/logs/gateway.log"
    else
        echo -e "${YELLOW}No gateway logs found${NC}"
        echo "Gateway may be running in Docker. Try: docker logs mcp-local-setup-gateway-1"
    fi
}

config_generate() {
    CLIENT="${1:-all}"
    API_KEY="${MCP_GATEWAY_API_KEY:-mcp-gateway-default-key}"
    
    echo -e "${GREEN}Generating MCP Gateway configuration${NC}"
    echo "===================================="
    
    case "$CLIENT" in
        "claude-code"|"claude")
            echo -e "\n${GREEN}Claude Code Configuration:${NC}"
            echo "claude mcp add unified-gateway --transport sse http://localhost:8090/mcp --header \"X-API-Key: $API_KEY\""
            ;;
        "cursor")
            echo -e "\n${GREEN}Cursor Configuration:${NC}"
            echo "Add to .cursor/mcp.json:"
            cat << EOF
{
  "mcpServers": {
    "unified-gateway": {
      "type": "sse",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "X-API-Key": "$API_KEY"
      }
    }
  }
}
EOF
            ;;
        "claude-desktop")
            echo -e "\n${GREEN}Claude Desktop Configuration:${NC}"
            echo "Add to claude_desktop_config.json:"
            cat << EOF
{
  "mcpServers": {
    "unified-gateway": {
      "type": "sse",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "X-API-Key": "$API_KEY"
      }
    }
  }
}
EOF
            ;;
        "vscode")
            echo -e "\n${GREEN}VS Code Configuration:${NC}"
            echo "Add to .vscode/mcp.json:"
            cat << EOF
{
  "mcp": {
    "servers": {
      "unified-gateway": {
        "type": "sse",
        "url": "http://localhost:8090/mcp",
        "headers": {
          "X-API-Key": "$API_KEY"
        }
      }
    }
  }
}
EOF
            ;;
        "all"|*)
            config_generate "claude-code"
            config_generate "cursor"
            config_generate "claude-desktop"
            config_generate "vscode"
            ;;
    esac
}

# Main command handler
case "${1}" in
    "start")
        gateway_start
        ;;
    "stop")
        gateway_stop
        ;;
    "restart")
        gateway_stop
        sleep 2
        gateway_start
        ;;
    "status")
        gateway_status
        ;;
    "logs")
        gateway_logs
        ;;
    "generate")
        config_generate "${2}"
        ;;
    *)
        echo "MCP Gateway Commands:"
        echo "  mcp gateway start    - Start the gateway"
        echo "  mcp gateway stop     - Stop the gateway"
        echo "  mcp gateway restart  - Restart the gateway"
        echo "  mcp gateway status   - Show gateway status"
        echo "  mcp gateway logs     - Show gateway logs"
        echo ""
        echo "Configuration Commands:"
        echo "  mcp config generate [client]  - Generate client configuration"
        echo "    Clients: claude-code, cursor, claude-desktop, vscode, all"
        ;;
esac