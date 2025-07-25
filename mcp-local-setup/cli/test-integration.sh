#!/bin/bash

# Integration test for transport CLI commands
# This script tests the new transport commands with mock data

echo "Testing MCP Transport CLI Commands"
echo "=================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Start mock servers in background
echo "Starting mock servers..."
node test-transport-commands.js &
MOCK_PID=$!

# Wait for servers to start
sleep 2

# Function to run test
run_test() {
    local cmd="$1"
    local desc="$2"
    echo -n "Testing: $desc... "
    
    if $cmd > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        return 1
    fi
}

# Run tests
echo ""
echo "Running tests..."
echo ""

# Transport commands
run_test "node mcp-cli.js transport list" "List transports"
run_test "node mcp-cli.js transport status" "Transport status"
run_test "node mcp-cli.js transport test stdio" "Test stdio transport"
run_test "node mcp-cli.js transport test http" "Test HTTP transport"
run_test "node mcp-cli.js transport metrics" "Transport metrics"
run_test "node mcp-cli.js transport metrics -t http" "Transport metrics filtered"

# Server commands
run_test "node mcp-cli.js server list" "List servers"
run_test "node mcp-cli.js server info filesystem-server" "Server info"
run_test "node mcp-cli.js server logs filesystem-server" "Server logs"

# JSON output tests
echo ""
echo "Testing JSON output..."
run_test "node mcp-cli.js transport list --json" "Transport list JSON"
run_test "node mcp-cli.js server list --json" "Server list JSON"

# Kill mock servers
echo ""
echo "Cleaning up..."
kill $MOCK_PID 2>/dev/null

echo ""
echo "Integration tests complete!"