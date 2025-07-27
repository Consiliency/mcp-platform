# MCP SDK Development

This directory contains the Model Context Protocol (MCP) SDKs for JavaScript, Python, and Go. The SDKs provide a unified interface for interacting with MCP services.

## 📁 Directory Structure

```
sdk/
├── core/           # Core SDK interface shared by all language implementations
├── js/             # JavaScript/TypeScript SDK
├── python/         # Python SDK
└── go/             # Go SDK
```

## 🚧 Current Status

The SDKs are implemented and functional for local development but are **not yet published** to package managers. This is planned for Phase 9 of the roadmap.

### What's Working
- ✅ Core SDK interface implementation
- ✅ JavaScript SDK with TypeScript definitions
- ✅ Python SDK with async support
- ✅ Go SDK with context support
- ✅ Authentication (API key and username/password)
- ✅ Service discovery and connection
- ✅ Event handling system

### What's Planned
- 📦 NPM package publication (@mcp/sdk)
- 📦 PyPI package publication (mcp-sdk)
- 📦 Go module publication
- 📚 Comprehensive documentation site
- 🧪 Extended test coverage
- 🎯 Example applications

## 🛠️ Local Development Usage

### JavaScript/TypeScript

```javascript
// Direct import from local path
const MCPClient = require('/path/to/mcp-platform/sdk/js');

// Or add to package.json
{
  "dependencies": {
    "@mcp/sdk": "file:../path/to/mcp-platform/sdk/js"
  }
}

// Usage
const client = new MCPClient({ apiKey: 'your-key' });
await client.connect('your-key');
```

### Python

```python
# Add SDK to Python path
import sys
sys.path.append('/path/to/mcp-platform/sdk/python')

from mcp_sdk import MCPClient

# Usage
async with MCPClient({'api_key': 'your-key'}) as client:
    await client.connect('your-key')
    services = await client.list_services()
```

### Go

```go
// In go.mod
module your-project

require github.com/modelcontextprotocol/go-sdk v0.0.0

replace github.com/modelcontextprotocol/go-sdk => /path/to/mcp-platform/sdk/go

// Usage
import mcp "github.com/modelcontextprotocol/go-sdk"

client := mcp.NewClient(mcp.Config{APIKey: "your-key"})
```

## 🧪 Testing

Each SDK has its own test suite:

```bash
# JavaScript tests
cd js && npm test

# Python tests
cd python && python -m pytest

# Go tests
cd go && go test ./...
```

## 📖 Documentation

- [SDK Usage Guide](../docs/SDK_USAGE.md) - Comprehensive usage documentation
- [API Reference](../docs/API_CURRENT.md) - Current API endpoints
- Individual SDK READMEs in each language directory

## 🔧 Development

### Adding New Features

1. Update the core interface in `core/`
2. Implement in each language SDK
3. Add tests
4. Update documentation

### Code Style

- JavaScript: ESLint with standard config
- Python: Black formatter with PEP 8
- Go: gofmt and golint

## 🚀 Future Publishing

When the SDKs are ready for public release (Phase 9):

### NPM Publishing
```bash
cd js
npm version <version>
npm publish --access public
```

### PyPI Publishing
```bash
cd python
python setup.py sdist bdist_wheel
twine upload dist/*
```

### Go Module Publishing
```bash
cd go
git tag v<version>
git push origin v<version>
```

## 🤝 Contributing

See the main [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## 📝 License

MIT License - see [LICENSE](../LICENSE) file for details.

---

*Note: This is active development. APIs may change before the public release.*