#!/bin/bash
# MCP Platform Launch Script
# Cross-platform launcher for Linux, macOS, and WSL

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Platform detection
PLATFORM="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -qi microsoft /proc/version 2>/dev/null; then
        PLATFORM="wsl"
    else
        PLATFORM="linux"
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
fi

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MCP_HOME="${MCP_HOME:-$SCRIPT_DIR}"
API_PORT="${API_PORT:-3000}"
TRAEFIK_PORT="${TRAEFIK_PORT:-8080}"
DASHBOARD_URL="http://localhost:${API_PORT}/catalog.html"
TRAEFIK_URL="http://localhost:${TRAEFIK_PORT}"

# PID file for tracking services
PID_FILE="$MCP_HOME/.mcp-services.pid"

# Functions
print_header() {
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN}          MCP Platform Launcher                 ${NC}"
    echo -e "${CYAN}================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}→ $1${NC}"
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing_deps+=("Docker")
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("Node.js")
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "Please install missing dependencies:"
        echo "  - Docker: https://docs.docker.com/get-docker/"
        echo "  - Node.js: https://nodejs.org/"
        exit 1
    fi
}

# Check if services are already running
check_running_services() {
    if [ -f "$PID_FILE" ]; then
        print_warning "MCP services may already be running"
        echo "Run './launch.sh stop' to stop them first"
        exit 1
    fi
}

# Start Docker services
start_docker_services() {
    print_info "Starting Docker services..."
    
    # Check if docker-compose.yml exists
    if [ ! -f "$MCP_HOME/docker-compose.yml" ]; then
        print_error "docker-compose.yml not found"
        exit 1
    fi
    
    # Start Traefik
    cd "$MCP_HOME"
    
    # Try docker compose v2 first (modern syntax)
    local docker_output=$(docker compose up -d 2>&1)
    local docker_exit_code=$?
    
    # Check if command succeeded (exit code 0)
    if [ $docker_exit_code -eq 0 ]; then
        print_success "Docker services started"
        return 0
    fi
    
    # Check if it's just the WSL warning
    if echo "$docker_output" | grep -q "could not be found in this WSL"; then
        # Try without capturing output to see if it works
        docker compose up -d >/dev/null 2>&1
        if [ $? -eq 0 ]; then
            print_success "Docker services started (WSL mode)"
            return 0
        fi
    fi
    
    # Try docker-compose v1 (legacy)
    if command -v "docker-compose" &> /dev/null; then
        if docker-compose up -d 2>&1 | grep -v "could not be found in this WSL" >/dev/null; then
            print_success "Docker services started"
            return 0
        fi
    fi
    
    # If both fail, check if Docker is accessible
    if ! docker ps &>/dev/null; then
        print_warning "Docker is not accessible. This might be a WSL issue."
        print_info "Continuing without Docker services (limited functionality)"
        print_info "To fix: Enable WSL integration in Docker Desktop settings"
        return 0
    else
        print_error "Failed to start Docker services"
        exit 1
    fi
}

# Install API dependencies
install_api_dependencies() {
    if [ ! -d "$MCP_HOME/api/node_modules" ]; then
        print_info "Installing API dependencies..."
        cd "$MCP_HOME/api"
        npm install --silent
        print_success "API dependencies installed"
    fi
}

# Start API server
start_api_server() {
    print_info "Starting API server..."
    
    # Check if API directory exists
    if [ ! -d "$MCP_HOME/api" ]; then
        print_error "API directory not found"
        exit 1
    fi
    
    # Install dependencies if needed
    install_api_dependencies
    
    # Start the API server in background
    cd "$MCP_HOME/api"
    nohup node index.js > "$MCP_HOME/api-server.log" 2>&1 &
    local api_pid=$!
    
    # Save PID
    echo "API_PID=$api_pid" >> "$PID_FILE"
    
    # Wait for API to be ready
    local retries=0
    while ! curl -s "http://localhost:$API_PORT/health" > /dev/null 2>&1; do
        if [ $retries -gt 30 ]; then
            print_error "API server failed to start"
            kill $api_pid 2>/dev/null || true
            exit 1
        fi
        sleep 1
        retries=$((retries + 1))
    done
    
    print_success "API server started (PID: $api_pid)"
}

# Display service information
display_info() {
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}       MCP Platform Started Successfully!       ${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${CYAN}Service URLs:${NC}"
    echo -e "  Dashboard:    ${BLUE}$DASHBOARD_URL${NC}"
    echo -e "  Traefik:      ${BLUE}$TRAEFIK_URL${NC}"
    echo -e "  API Health:   ${BLUE}http://localhost:$API_PORT/health${NC}"
    echo ""
    
    # Platform-specific instructions
    case $PLATFORM in
        wsl)
            echo -e "${YELLOW}WSL Users:${NC}"
            echo "  Access from Windows at the same URLs"
            ;;
        macos)
            echo -e "${YELLOW}macOS Users:${NC}"
            echo "  Use Cmd+Click to open URLs in browser"
            ;;
    esac
    
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  Stop services:    ./launch.sh stop"
    echo "  View logs:        ./launch.sh logs"
    echo "  Service status:   ./launch.sh status"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
}

# Stop all services
stop_services() {
    print_info "Stopping MCP services..."
    
    # Stop API server
    if [ -f "$PID_FILE" ]; then
        source "$PID_FILE"
        if [ ! -z "$API_PID" ]; then
            kill $API_PID 2>/dev/null || true
            print_success "API server stopped"
        fi
        rm -f "$PID_FILE"
    fi
    
    # Stop Docker services
    cd "$MCP_HOME"
    docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    print_success "Docker services stopped"
}

# Show logs
show_logs() {
    echo -e "${CYAN}=== API Server Logs ===${NC}"
    if [ -f "$MCP_HOME/api-server.log" ]; then
        tail -n 50 "$MCP_HOME/api-server.log"
    else
        echo "No API logs found"
    fi
    
    echo ""
    echo -e "${CYAN}=== Docker Service Logs ===${NC}"
    cd "$MCP_HOME"
    docker compose logs --tail=50 2>/dev/null || docker-compose logs --tail=50 2>/dev/null || true
}

# Show status
show_status() {
    echo -e "${CYAN}=== Service Status ===${NC}"
    echo ""
    
    # Check API
    if curl -s "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
        print_success "API server is running"
    else
        print_error "API server is not running"
    fi
    
    # Check Docker services
    echo ""
    cd "$MCP_HOME"
    docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null || true
}

# Signal handler for graceful shutdown
cleanup() {
    echo ""
    print_info "Shutting down services..."
    stop_services
    exit 0
}

# Main execution
main() {
    case "${1:-start}" in
        start)
            print_header
            check_dependencies
            check_running_services
            start_docker_services
            start_api_server
            display_info
            
            # Set up signal handler
            trap cleanup INT TERM
            
            # Keep script running
            while true; do
                sleep 1
            done
            ;;
            
        stop)
            stop_services
            ;;
            
        restart)
            stop_services
            sleep 2
            exec "$0" start
            ;;
            
        logs)
            show_logs
            ;;
            
        status)
            show_status
            ;;
            
        *)
            echo "Usage: $0 {start|stop|restart|logs|status}"
            echo ""
            echo "Commands:"
            echo "  start    - Start all MCP services (default)"
            echo "  stop     - Stop all services"
            echo "  restart  - Restart all services"
            echo "  logs     - Show service logs"
            echo "  status   - Show service status"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"