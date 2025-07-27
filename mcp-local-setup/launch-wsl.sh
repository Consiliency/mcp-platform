#!/bin/bash
# WSL-specific launch script for MCP Platform

# Detect if running in WSL
if ! grep -qi microsoft /proc/version; then
    echo "This script is designed for WSL. Use launch.sh for other systems."
    exit 1
fi

# Set environment variables if not set
export HOME="${HOME:-/home/$USER}"
export USER="${USER:-$(whoami)}"

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Change to script directory
cd "$(dirname "$0")"

# Check if .env exists, create if not
if [ ! -f .env ]; then
    echo "Creating .env file with WSL defaults..."
    cat > .env << EOF
HOME=$HOME
USER=$USER
MCP_GATEWAY_API_KEY=mcp-gateway-default-key
EOF
fi

# Regenerate docker-compose.yml
echo "Generating Docker Compose configuration..."
node scripts/registry-manager.js generate

# Start services
echo "Starting MCP Platform services..."
docker compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 5

# Check service status
echo ""
echo "Service Status:"
docker compose ps

# Display access information
echo ""
echo "MCP Platform is running!"
echo ""
echo "Access points:"
echo "  - Gateway: http://localhost:8090"
echo "  - Dashboard: http://localhost:8080/dashboard"
echo "  - Traefik Dashboard: http://localhost:8080/dashboard/"
echo ""
echo "Gateway Configuration for Claude Code:"
echo '  {
    "mcpServers": {
      "mcp-gateway": {
        "url": "http://localhost:8090/mcp",
        "headers": {
          "X-API-Key": "mcp-gateway-default-key"
        }
      }
    }
  }'
echo ""
echo "To stop all services: docker compose down"
echo "To view logs: docker compose logs -f [service-name]"