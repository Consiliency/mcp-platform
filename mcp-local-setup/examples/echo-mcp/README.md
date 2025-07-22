# Echo MCP Service

A minimal MCP (Model Context Protocol) echo service that returns what it receives. This service demonstrates the basic structure of an MCP service with health checking and various echo transformations.

## Features

- Basic echo functionality - returns exactly what is sent
- Echo with configurable delay (up to 10 seconds)
- Echo with transformations (uppercase, lowercase, reverse, base64)
- Health endpoint with memory usage monitoring
- Full request header echoing
- Supports both JSON and plain text content

## Installation

```bash
npm install
```

## Usage

### Running locally

```bash
# Default port 3010
npm start

# Custom port
PORT=8080 npm start

# Development mode with auto-reload
npm run dev
```

### Running with Docker

```bash
# Build the image
docker build -t echo-mcp .

# Run the container
docker run -p 3010:3010 echo-mcp
```

## API Endpoints

### Service Manifest
```bash
GET /
```

Returns the service manifest including version, capabilities, and available endpoints.

### Health Check
```bash
GET /health
```

Returns health status including uptime, memory usage, and any issues.

Example response:
```json
{
  "status": "healthy",
  "service": "echo-mcp",
  "version": "1.0.0",
  "uptime": 120,
  "timestamp": "2024-01-15T10:30:45.123Z",
  "checks": {
    "service": "healthy",
    "memory": "healthy"
  },
  "issues": []
}
```

### Basic Echo
```bash
POST /echo
Content-Type: application/json

{"message": "Hello, World!"}
```

Response:
```json
{
  "echo": {"message": "Hello, World!"},
  "timestamp": "2024-01-15T10:30:45.123Z",
  "headers": {
    "content-type": "application/json",
    ...
  }
}
```

### Echo with Delay
```bash
POST /echo/delay/2000
Content-Type: application/json

{"message": "Delayed response"}
```

Echoes the data after a 2-second delay.

### Echo with Transformation
```bash
POST /echo/transform/uppercase
Content-Type: application/json

{"message": "make me uppercase"}
```

Available transformations:
- `uppercase` - Converts to uppercase
- `lowercase` - Converts to lowercase
- `reverse` - Reverses the string
- `base64` - Encodes as base64

Response:
```json
{
  "original": {"message": "make me uppercase"},
  "transformed": "{\"MESSAGE\":\"MAKE ME UPPERCASE\"}",
  "transformType": "uppercase",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## Examples

### Using curl

```bash
# Basic echo
curl -X POST http://localhost:3010/echo \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Plain text echo
curl -X POST http://localhost:3010/echo \
  -H "Content-Type: text/plain" \
  -d 'Hello, plain text!'

# Echo with 1-second delay
curl -X POST http://localhost:3010/echo/delay/1000 \
  -H "Content-Type: application/json" \
  -d '{"delayed": true}'

# Transform to uppercase
curl -X POST http://localhost:3010/echo/transform/uppercase \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'

# Health check
curl http://localhost:3010/health
```

### Using JavaScript

```javascript
// Basic echo
const response = await fetch('http://localhost:3010/echo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello from JS!' })
});
const data = await response.json();
console.log(data);

// Echo with transformation
const transformed = await fetch('http://localhost:3010/echo/transform/base64', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ secret: 'encode me' })
});
const result = await transformed.json();
console.log(result.transformed); // Base64 encoded
```

## Environment Variables

- `PORT` - Server port (default: 3010)
- `NODE_ENV` - Node environment (default: production)

## Error Handling

The service includes comprehensive error handling:
- 404 for unknown endpoints (returns available endpoints)
- 400 for invalid transformation types
- 500 for internal server errors
- 503 when service is unhealthy

## Development

The service extends the `MCPServiceInterface` and implements all required methods:
- `start()` - Starts the Express server
- `stop()` - Gracefully shuts down the server
- `health()` - Returns current health status
- `getManifest()` - Returns service metadata
- `getEndpoints()` - Lists available endpoints
- `getCapabilities()` - Lists service capabilities
- `getRequirements()` - Lists service requirements

## License

MIT