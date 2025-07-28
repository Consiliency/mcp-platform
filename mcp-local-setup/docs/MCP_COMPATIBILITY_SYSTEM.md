# MCP Compatibility Management System

## Overview

The MCP Compatibility Management System provides platform-aware filtering and compatibility tracking for Model Context Protocol (MCP) servers. It ensures that only compatible tools are exposed to clients based on the current platform, preventing runtime errors and improving user experience.

## Architecture

### Components

1. **CompatibilityChecker Service** (`gateway/compatibility-checker.js`)
   - Detects the current platform (macOS, Windows, Linux, WSL)
   - Loads compatibility metadata for MCP servers
   - Filters tools based on platform support
   - Enhances tool descriptions with platform information

2. **Compatibility Metadata** (`compatibility/servers/*.json`)
   - JSON files defining platform support for each MCP server
   - Tracks supported features, limitations, and known issues
   - Specifies which tools are available on which platforms

3. **Gateway Integration** (`gateway/gateway-service-unified.js`)
   - Automatically filters tools during server initialization
   - Logs compatibility warnings and filtered tool counts
   - Provides API endpoints for querying compatibility

## Compatibility Metadata Schema

Each MCP server can have a compatibility file in `compatibility/servers/{server-id}.json`:

```json
{
  "id": "server-id",
  "name": "Human-readable name",
  "version": "1.0.0",
  "lastUpdated": "2025-07-27T22:00:00Z",
  "compatibility": {
    "platforms": {
      "darwin": {
        "supported": "full|partial|experimental|unsupported",
        "tested": true|false,
        "features": ["list", "of", "supported", "features"],
        "limitations": ["list", "of", "limitations"],
        "requirements": {
          "display": true,
          "permissions": ["screen-recording"]
        }
      },
      "win32": { ... },
      "linux": { ... },
      "wsl": { ... }
    },
    "tools": {
      "ToolName": {
        "platforms": ["darwin", "linux"],
        "parameters": {
          "paramName": {
            "platforms": ["darwin"]
          }
        },
        "alternativeTool": "OtherTool",
        "deprecationNotice": "Use OtherTool instead"
      }
    },
    "requirements": {
      "node": ">=16.0.0"
    }
  },
  "knownIssues": [
    {
      "id": "issue-id",
      "platforms": ["wsl"],
      "description": "Description of the issue",
      "workaround": "How to work around it",
      "severity": "high|medium|low"
    }
  ]
}
```

## Platform Detection

The system detects four platform types:
- `darwin` - macOS
- `win32` - Windows
- `linux` - Linux (non-WSL)
- `wsl` - Windows Subsystem for Linux

WSL is detected by checking for `/proc/version` containing "Microsoft" or "WSL".

## Tool Filtering Process

1. When a server registers its tools, the gateway checks for compatibility data
2. If the server has platform restrictions, incompatible tools are filtered out
3. Tools with platform-specific parameters have those parameters removed on unsupported platforms
4. Enhanced descriptions are added to indicate platform limitations

### Example

For snap-happy on WSL:
- Original tools: `TakeScreenshot`, `GetLastScreenshot`, `ListWindows`
- After filtering: Only `TakeScreenshot` remains
- `ListWindows` is filtered because it's macOS-only
- `GetLastScreenshot` is filtered due to known WSL issues

## API Endpoints

### Get Compatibility for All Servers
```
GET /api/gateway/compatibility
Headers: x-api-key: {api-key}

Response:
{
  "success": true,
  "platform": "wsl",
  "servers": [
    {
      "serverId": "snap-happy",
      "platform": "wsl",
      "supported": true,
      "level": "experimental",
      "limitations": [...],
      "knownIssues": [...]
    }
  ]
}
```

### Get Compatibility for Specific Server
```
GET /api/gateway/compatibility/{serverId}
Headers: x-api-key: {api-key}

Response:
{
  "success": true,
  "compatibility": {
    "serverId": "snap-happy",
    "name": "Snap Happy",
    "platform": "wsl",
    "supported": true,
    "level": "experimental",
    "tested": true,
    "limitations": [
      "Requires Windows-side execution via PowerShell",
      "Window listing not supported",
      "File creation issues reported"
    ],
    "knownIssues": [...],
    "features": ["screenshot-fullscreen"],
    "requirements": {
      "display": true,
      "permissions": ["windows-interop", "screen-capture"]
    }
  }
}
```

## Adding Compatibility Data

1. Create a new JSON file in `compatibility/servers/{server-id}.json`
2. Follow the schema defined above
3. Test on each platform to verify support levels
4. Document any platform-specific limitations or requirements

## Testing Compatibility

Use the provided test script to verify filtering:

```bash
node tests/phase8/test-compatibility-filtering.js
```

This will:
1. Check platform detection
2. Verify tool filtering is working
3. Confirm incompatible tools are removed
4. Display compatibility reports

## Best Practices

1. **Always test on target platforms** - Don't assume compatibility
2. **Document limitations clearly** - Help users understand what won't work
3. **Provide workarounds** - When possible, suggest alternatives
4. **Update regularly** - As MCPs evolve, update compatibility data
5. **Use semantic support levels**:
   - `full` - Everything works as designed
   - `partial` - Core features work, some limitations
   - `experimental` - May work but not officially supported
   - `unsupported` - Known not to work

## Future Enhancements

- Runtime capability detection for dynamic features
- Automatic compatibility testing framework
- Platform-specific configuration recommendations
- Alternative tool suggestions for unsupported features