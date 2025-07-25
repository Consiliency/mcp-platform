# MCP Python SDK

Python SDK for Model Context Protocol services.

## Installation

```bash
pip install mcp-sdk
```

## Quick Start

```python
import asyncio
from mcp_sdk import MCPClient

async def main():
    # Create client
    async with MCPClient({'api_key': 'your-api-key'}) as client:
        # Authenticate
        await client.connect('your-api-key')
        
        # List services
        services = await client.list_services()
        
        # Connect to a service
        db = await client.connect_service('postgres-mcp')
        
        # Call service methods
        result = await db.query({'sql': 'SELECT * FROM users'})

asyncio.run(main())
```