# MCP IDE Extensions

This directory contains IDE extensions for MCP (Model Context Protocol) that provide rich development experience across multiple editors.

## Features

- **Code Completion**: Context-aware suggestions for MCP services and methods
- **Hover Information**: Detailed documentation for services on hover
- **Diagnostics**: Real-time validation of MCP configuration files
- **Code Actions**: Quick fixes for common issues
- **Service Management**: UI panels for managing MCP services
- **Debugging Support**: Integrated debugging for MCP services
- **Multi-language Support**: Works with JavaScript, TypeScript, Python, and Go

## Supported IDEs

### VS Code Extension

The VS Code extension provides the most comprehensive MCP support:

```bash
cd vscode
npm install
npm run compile
```

Features:
- Full Language Server Protocol integration
- Service explorer in sidebar
- Health monitoring panel
- Integrated debugging
- Code snippets
- Custom file type support for `.mcp.json` files

### IntelliJ Plugin

The IntelliJ plugin supports all JetBrains IDEs:

```bash
cd intellij
./gradlew build
```

Features:
- Code completion contributor
- Configuration file validation
- Documentation provider
- Tool window for service management
- Run configurations for MCP services

### Vim/Neovim Plugin

The Vim plugin provides MCP support for terminal-based editing:

```vim
" Add to your .vimrc or init.vim
set runtimepath+=~/path/to/mcp-ide-extensions/vim

" Configure
let g:mcp_api_key = 'your-api-key'
let g:mcp_endpoint = 'http://localhost:8080'
```

Features:
- Commands for service management
- Omni-completion support
- Diagnostics with signs
- Service browser
- nvim-cmp integration (Neovim)

## Architecture

The IDE extensions share a common core implementation:

```
ide/
├── core/
│   ├── ide-extension.js      # Main implementation
│   ├── language-server.js    # LSP server
│   └── mock-sdk.js          # Mock SDK for testing
├── vscode/                  # VS Code extension
├── intellij/               # IntelliJ plugin
└── vim/                    # Vim/Neovim plugin
```

## Language Server Protocol

The extensions use a shared Language Server that provides:

- Completion suggestions
- Hover information
- Diagnostics
- Code actions
- Command execution

## Testing

Run integration tests:

```bash
npm test
```

This verifies that the IDE extensions properly integrate with the MCP SDK.

## Configuration

All IDE extensions support these configuration options:

- `apiKey`: MCP SDK authentication key
- `endpoint`: MCP platform endpoint
- `enableDiagnostics`: Enable/disable configuration validation
- `autoComplete`: Enable/disable auto-completion

## Development

To work on the IDE extensions:

1. Clone the repository
2. Install dependencies: `npm install`
3. Make changes to the core implementation
4. Run tests: `npm test`
5. Build specific IDE extension
6. Test in the target IDE

## Usage Examples

### VS Code

```javascript
// Auto-completion for MCP methods
mcp.connectService('postgres-mcp', {
  host: 'localhost',
  database: 'myapp'
});

// Hover over service IDs for documentation
const db = await mcp.getService('postgres-mcp');
```

### IntelliJ

```java
// Import MCP SDK
import com.mcp.SDK;

// Use with auto-completion
SDK.installService("redis-mcp", config);
```

### Vim

```vim
" Commands
:MCPShowServices
:MCPInstallService postgres-mcp
:MCPHealthCheck

" Key mappings
<leader>ms  " Show services
<leader>mi  " Install service
<leader>mh  " Health check
```

## Contributing

When adding new features:

1. Update the core implementation in `core/ide-extension.js`
2. Add corresponding UI/UX in each IDE extension
3. Update tests
4. Document the feature

## License

MIT