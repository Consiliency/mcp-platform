# Playwright MCP Integration

This document explains how the Playwright MCP server is integrated into the local MCP development setup.

## Overview

The Playwright MCP server provides browser automation capabilities through the Model Context Protocol. It allows you to:
- Control browser automation
- Take screenshots
- Navigate pages
- Interact with page elements
- Execute JavaScript in browser context
- Manage multiple tabs

## Architecture

The Playwright MCP server runs as a Docker container built from the local `playwright-mcp` directory. It's exposed through Traefik reverse proxy at `/mcp/playwright`.

### Key Components:
- **Docker Build**: Uses the Dockerfile from `../playwright-mcp` directory
- **Port**: Internal port 3000, exposed via Traefik
- **Browser Storage**: Persistent volume for browser installations
- **Headless Mode**: Runs in headless mode with Chromium

## Directory Structure

```
mcps/
├── mcp-local-setup/          # This setup
│   ├── docker-compose.yml    # Contains playwright_mcp service
│   └── .well-known/
│       └── mcp-manifest.json # Includes playwright service
└── playwright-mcp/           # Source code for Playwright MCP
    ├── Dockerfile            # Multi-stage build
    ├── src/                  # Server implementation
    └── package.json          # Dependencies
```

## Usage

1. **Start the service**:
   ```bash
   cd mcp-local-setup
   docker-compose up -d playwright_mcp
   ```

2. **Access via dashboard**:
   - Open http://localhost:8080/dashboard/index.html
   - Find the "playwright" service
   - Use the interface to send commands

3. **Direct API access**:
   ```bash
   curl -X POST http://localhost:8080/mcp/playwright \
     -H "Content-Type: application/json" \
     -d '{"command": "navigate", "url": "https://example.com"}'
   ```

## Environment Variables

- `PLAYWRIGHT_BROWSERS_PATH`: Set to `/ms-playwright` for consistent browser storage

## Volumes

- `playwright-browsers`: Persistent storage for browser installations to avoid re-downloading

## Development

To make changes to the Playwright MCP server:

1. Edit code in `../playwright-mcp/src/`
2. Rebuild the container:
   ```bash
   docker-compose build playwright_mcp
   docker-compose up -d playwright_mcp
   ```

## CLI Alias

Add to your shell configuration:
```bash
alias mcp-playwright='curl -X POST http://localhost:8080/mcp/playwright'
```

Usage:
```bash
echo '{"command": "screenshot", "selector": "body"}' | mcp-playwright
```

## Troubleshooting

- **Browser not launching**: Check Docker logs with `docker-compose logs playwright_mcp`
- **Permission issues**: The container runs as the `node` user
- **Memory issues**: Browsers can be memory-intensive; ensure Docker has sufficient resources