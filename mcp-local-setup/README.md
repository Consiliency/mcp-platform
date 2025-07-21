# MCP Local Development Setup

## Prerequisites
- Docker & Docker Compose installed (WSL2 or native)
- Git

## Installation
1. **Clone the repo**:
   ```bash
   git clone https://your-repo-url/mcp-local-setup.git
   cd mcp-local-setup
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Access the dashboard** in your browser at:
   ```
   http://localhost:8080/dashboard/index.html
   ```

4. **MCP Manifest** is available at:
   ```
   http://localhost:8080/.well-known/mcp-manifest.json
   ```

## CLI Aliases (WSL)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias mcp-code-indexer='curl -X POST http://localhost:8080/mcp/code-indexer'
alias mcp-notes-parser='curl -X POST http://localhost:8080/mcp/notes-parser'
```

Reload shell:
```bash
source ~/.bashrc
```

Now you can:
```bash
cat example.py | mcp-code-indexer
```

## Adding Your Own MCP Server

1. Build or clone your MCP project into this directory.
2. Add a service entry in `docker-compose.yml` with the same label convention:
   ```yaml
   labels:
     - "traefik.http.routers.<your_svc>.rule=PathPrefix(`/mcp/<your-svc>`)"
     - "traefik.http.services.<your_svc>.loadbalancer.server.port=8080"
   ```
3. Update `.well-known/mcp-manifest.json` with name, description, and URL.
4. `docker-compose up -d` auto‑deploys it behind Traefik.

## Included Services

- **code-indexer**: Splits source code into semantic chunks
- **notes-parser**: Indexes and retrieves meeting transcripts
- **playwright**: Browser automation and testing with Playwright (see [PLAYWRIGHT-MCP-README.md](PLAYWRIGHT-MCP-README.md))