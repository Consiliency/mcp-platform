# MCP Local Setup Debug Summary

## Overview
This document summarizes the debugging session for two critical issues:
1. Auto-start toggle switches not visible on the catalog page
2. Bridge service not exposing tools from stdio MCP servers

## Issue 1: Invisible Toggle Switches

### Problem Description
- Auto-start toggle switches were implemented but not visible on the catalog page
- Toggles existed in the DOM (4 elements found) but were visually hidden
- No JavaScript errors in console

### Diagnostic Process
1. Created diagnostic script to check DOM elements
2. Verified toggles were being created and added to DOM
3. Inspected CSS properties and styling
4. Discovered CSS variables were undefined

### Root Cause
Missing CSS variables that the toggle styles depended on:
- `--primary` (undefined)
- `--gray-400` (undefined) 
- `--gray-600` (undefined)

### Solution
Created `fix-css-variables.js` script to inject missing CSS variables:
```javascript
const style = document.createElement('style');
style.textContent = `
  :root {
    --primary: #3498db;
    --gray-400: #ced4da;
    --gray-600: #6c757d;
    /* ... other variables ... */
  }
`;
document.head.appendChild(style);
```

## Issue 2: Bridge Service Tool Discovery

### Problem Description
- MCP Gateway showed 0 tools despite 4 servers running
- stdio servers appeared as "running" but exposed no tools
- Only HTTP servers were working correctly

### Diagnostic Process
1. Enabled debug logging for gateway service
2. Traced server initialization flow
3. Found stdio servers weren't being started properly
4. Located bug in `loadStdioServers()` method

### Root Cause
Bug in `gateway-service-unified.js` line 349:
```javascript
// Only servers in autoStartServers list were being started
if (this.config.gateway.autoStartServers.includes(serverId)) {
  await this.startStdioServer(server);
}
```

### Solution
Modified to start ALL stdio servers:
```javascript
// Start all stdio servers (not just auto-start ones)
await this.startStdioServer(server);
```

### Results
- Gateway now shows 29 tools from 4 servers
- All stdio servers properly connect and expose their tools
- Auto-start configuration still works for restart behavior

## Files Modified

1. `/home/jenner/code/mcps/mcp-local-setup/gateway/gateway-service-unified.js`
   - Fixed line 349 to start all stdio servers

2. Documentation Updated:
   - `README.md` - Added gateway configuration instructions
   - `client-configs/README.md` - Added both CLI and settings.json methods
   - `gateway/README.md` - Updated gateway-specific docs
   - `docs/TROUBLESHOOTING.md` - Created comprehensive troubleshooting guide

## Diagnostic Scripts Created

1. `debug-catalog.js` - Check catalog manager state
2. `check-css.js` - Diagnose CSS variable issues  
3. `fix-css-variables.js` - Apply CSS variable fix
4. `take-screenshot.js` - Attempt screenshot capture
5. `/tmp/debug-catalog-load.js` - Test server API loading

## Key Learnings

1. **CSS Dependencies**: Always ensure CSS variables are defined when using them in styles
2. **Initialization Logic**: Be careful with conditional initialization - consider whether ALL items need initialization vs just specific ones
3. **Debug Approach**: Start with DOM inspection, then trace back through JavaScript logic, finally check styling
4. **Tool Discovery**: MCP tool discovery requires proper server connection and initialization

## Recommendations

1. Add CSS variable definitions to a base stylesheet to prevent future issues
2. Add integration tests for toggle visibility
3. Add unit tests for server initialization logic
4. Consider adding visual regression testing for UI components
5. Improve error reporting when servers fail to expose tools