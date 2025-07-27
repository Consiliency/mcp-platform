# MCP Local Setup Troubleshooting Guide

This guide covers common issues and solutions for the MCP Local Setup platform.

## Table of Contents
- [Gateway Issues](#gateway-issues)
- [Server Issues](#server-issues)
- [Dashboard Issues](#dashboard-issues)
- [Network Issues](#network-issues)
- [Docker Issues](#docker-issues)
- [UI/CSS Issues](#uicss-issues)

## Gateway Issues

### Gateway Not Starting

**Symptoms:**
- Gateway service fails to start
- Error messages about port conflicts
- Cannot access http://localhost:8090

**Solutions:**
1. Check if port 8090 is already in use:
   ```bash
   lsof -i :8090
   ```

2. Check gateway logs:
   ```bash
   docker logs mcp-gateway
   # or for native mode:
   tail -f gateway.log
   ```

3. Verify configuration:
   ```bash
   cat gateway-config.json
   ```

### MCP Servers Not Connecting

**Symptoms:**
- Servers show as "stopped" in dashboard
- No tools available from servers
- Connection timeout errors

**Solutions:**
1. Check server logs:
   ```bash
   docker logs mcp-server-<name>
   ```

2. Verify network connectivity:
   ```bash
   curl http://localhost:8090/api/gateway/health
   ```

3. Restart the gateway:
   ```bash
   docker-compose restart gateway
   ```

## Server Issues

### Server Installation Fails

**Symptoms:**
- "Failed to install server" error
- Docker build errors
- Missing dependencies

**Solutions:**
1. Check Docker is running:
   ```bash
   docker ps
   ```

2. Clean Docker cache:
   ```bash
   docker system prune -a
   ```

3. Manually build the server:
   ```bash
   cd servers/<server-name>
   docker build -t mcp-server-<name> .
   ```

### Server Tools Not Available

**Symptoms:**
- Server running but no tools listed
- "0 tools" shown in dashboard
- Tools not appearing in Claude

**Solutions:**
1. Check server health:
   ```bash
   curl http://localhost:8090/api/gateway/servers/<server-id>/health
   ```

2. Verify server configuration:
   ```bash
   cat servers/<server-name>/config.json
   ```

3. Restart the server:
   ```bash
   docker-compose restart mcp-server-<name>
   ```

## Dashboard Issues

### Dashboard Not Loading

**Symptoms:**
- Blank page at http://localhost:8090
- 404 errors for dashboard files
- JavaScript errors in console

**Solutions:**
1. Check nginx is running:
   ```bash
   docker ps | grep nginx
   ```

2. Verify dashboard files exist:
   ```bash
   ls -la dashboard/
   ```

3. Check nginx configuration:
   ```bash
   docker exec mcp-nginx cat /etc/nginx/nginx.conf
   ```

### API Errors in Dashboard

**Symptoms:**
- "Failed to load servers" error
- Authentication errors
- CORS errors

**Solutions:**
1. Verify API key:
   ```bash
   curl -H "X-API-Key: mcp-gateway-default-key" \
     http://localhost:8090/api/gateway/servers
   ```

2. Check CORS configuration in gateway

3. Clear browser cache and cookies

## Network Issues

### Cannot Access Services

**Symptoms:**
- Connection refused errors
- Timeout errors
- Services unreachable

**Solutions:**
1. Check Docker network:
   ```bash
   docker network ls
   docker network inspect mcp-network
   ```

2. Verify port mappings:
   ```bash
   docker-compose ps
   ```

3. Check firewall rules:
   ```bash
   # Linux
   sudo iptables -L
   # Mac
   sudo pfctl -s rules
   ```

## Docker Issues

### Containers Not Starting

**Symptoms:**
- Docker containers fail to start
- "Port already in use" errors

**Solutions:**
1. Check for conflicting services:
   ```bash
   # Check what's using port 8090
   lsof -i :8090
   # Check what's using port 80
   sudo lsof -i :80
   ```

2. Stop conflicting services or change ports in `docker-compose.yml`

3. Restart Docker:
   ```bash
   # Linux
   sudo systemctl restart docker
   # Mac
   # Restart Docker Desktop from the menu
   ```

## UI/CSS Issues

### Auto-Start Toggles Not Visible

**Symptoms:**
- Toggle switches on catalog page are invisible
- Toggles exist in DOM but cannot be seen
- No console errors reported

**Root Cause:**
Missing CSS variables that the toggle styles depend on.

**Solutions:**
1. Run the CSS diagnostic script in browser console:
   ```javascript
   // Check if CSS variables are defined
   const styles = getComputedStyle(document.documentElement);
   console.log('--primary:', styles.getPropertyValue('--primary'));
   console.log('--gray-400:', styles.getPropertyValue('--gray-400'));
   console.log('--gray-600:', styles.getPropertyValue('--gray-600'));
   ```

2. If variables are empty/undefined, apply the fix:
   ```javascript
   const style = document.createElement('style');
   style.textContent = `
     :root {
       --primary: #3498db;
       --primary-dark: #2980b9;
       --secondary: #2ecc71;
       --danger: #e74c3c;
       --warning: #f39c12;
       --info: #3498db;
       --gray-100: #f8f9fa;
       --gray-200: #e9ecef;
       --gray-300: #dee2e6;
       --gray-400: #ced4da;
       --gray-500: #adb5bd;
       --gray-600: #6c757d;
       --gray-700: #495057;
       --gray-800: #343a40;
       --gray-900: #212529;
     }
   `;
   document.head.appendChild(style);
   ```

3. Permanent fix: Ensure CSS variables are defined in base styles

### Bridge Service Not Exposing Tools

**Symptoms:**
- Gateway reports 0 tools despite servers running
- stdio servers show as "running" but no tools available
- HTTP servers work fine but stdio servers don't

**Root Cause:**
Bug in `gateway-service-unified.js` where only auto-start servers were being initialized.

**Fix Applied:**
Modified line 349 in `gateway/gateway-service-unified.js`:
```javascript
// Before (buggy):
if (this.config.gateway.autoStartServers.includes(serverId)) {
  await this.startStdioServer(server);
}

// After (fixed):
// Start all stdio servers (not just auto-start ones)
await this.startStdioServer(server);
```

**Verification:**
After fix, gateway should show tools from all configured servers:
```bash
curl -X GET http://localhost:8090/api/gateway/tools \
  -H "X-API-Key: mcp-gateway-default-key" | jq '.tools | length'
# Should return non-zero count
```

## Getting Help

If you continue to experience issues:

1. Check the [GitHub Issues](https://github.com/your-repo/issues)
2. Enable debug logging:
   ```bash
   export DEBUG=mcp:*
   ```
3. Collect logs:
   ```bash
   docker-compose logs > debug.log
   ```
4. Join our [Discord community](https://discord.gg/your-invite)