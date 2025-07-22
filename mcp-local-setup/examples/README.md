# MCP Service Examples

This directory contains three example MCP (Model Context Protocol) services that demonstrate different patterns and capabilities. Each service implements the `MCPServiceInterface` and includes comprehensive documentation, Docker support, and health monitoring.

## Services Overview

### 1. Echo MCP (Port 3010)
A minimal echo service that demonstrates basic MCP structure.
- **Features**: Echo with transformations, delays, and header inspection
- **Use Case**: Testing, debugging, and understanding MCP basics
- **Dependencies**: Express only (no external services)

### 2. Todo MCP (Port 3011)
A full-featured todo service with PostgreSQL persistence.
- **Features**: CRUD operations, filtering, bulk operations, statistics
- **Use Case**: Demonstrating database integration and complex operations
- **Dependencies**: PostgreSQL (included via docker-compose)

### 3. Weather MCP (Port 3012)
A weather service with intelligent caching and optional real API integration.
- **Features**: Caching, batch requests, mock/real data modes
- **Use Case**: External API integration with caching strategies
- **Dependencies**: Optional OpenWeatherMap API key

## Quick Start

### Running Individual Services

```bash
# Echo service
cd echo-mcp
npm install
npm start

# Todo service (requires PostgreSQL)
cd todo-mcp
docker-compose up -d

# Weather service
cd weather-mcp
npm install
npm start
```

### Running All Services with Docker

Create a `docker-compose.yml` in the examples directory:

```yaml
version: '3.8'

services:
  echo-mcp:
    build: ./echo-mcp
    ports:
      - "3010:3010"
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: todouser
      POSTGRES_PASSWORD: todopass
      POSTGRES_DB: todos
    volumes:
      - todo_postgres_data:/var/lib/postgresql/data

  todo-mcp:
    build: ./todo-mcp
    ports:
      - "3011:3011"
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: todos
      DB_USER: todouser
      DB_PASSWORD: todopass
    depends_on:
      - postgres
    restart: unless-stopped

  weather-mcp:
    build: ./weather-mcp
    ports:
      - "3012:3012"
    environment:
      CACHE_TTL: 300
      # Optional: Add your OpenWeatherMap API key
      # WEATHER_API_KEY: your_api_key_here
    restart: unless-stopped

volumes:
  todo_postgres_data:
```

Then run:
```bash
docker-compose up -d
```

## Common Patterns

All services implement these common patterns:

### 1. Health Endpoint
```bash
GET /health
```
Returns service health with component checks and uptime.

### 2. Service Manifest
```bash
GET /
```
Returns service information, capabilities, and endpoints.

### 3. Error Handling
- Consistent JSON error responses
- Appropriate HTTP status codes
- Graceful degradation where applicable

### 4. Logging
- Morgan for HTTP request logging
- Console logging for important events
- Error logging with stack traces

### 5. Graceful Shutdown
- SIGTERM and SIGINT handling
- Proper cleanup of resources
- Database connection closing

## Testing the Services

### Health Checks
```bash
# Check all services
curl http://localhost:3010/health
curl http://localhost:3011/health
curl http://localhost:3012/health
```

### Basic Operations
```bash
# Echo service
curl -X POST http://localhost:3010/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello MCP!"}'

# Todo service
curl -X POST http://localhost:3011/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn MCP", "priority": "high"}'

# Weather service
curl http://localhost:3012/weather/London
```

## Architecture Notes

### Interface Implementation
All services extend `MCPServiceInterface` from `../../interfaces/mcp-service.interface.js`:
- `start()` - Initialize and start the service
- `stop()` - Graceful shutdown
- `health()` - Return health status
- `getManifest()` - Service metadata
- `getEndpoints()` - Available endpoints
- `getCapabilities()` - Service capabilities
- `getRequirements()` - Dependencies and environment

### Health Status
Services use the standard `HealthStatus` interface:
- Status levels: healthy, degraded, unhealthy
- Component checks (service, database, cache, etc.)
- Uptime tracking
- Issue reporting

### Docker Best Practices
- Multi-stage builds where applicable
- Non-root user execution
- Minimal base images (Alpine)
- Proper signal handling
- Health checks

## Environment Variables

Each service supports configuration through environment variables:

### Common
- `PORT` - Service port
- `NODE_ENV` - Node environment

### Service-Specific
- **Todo**: `DB_*` for PostgreSQL configuration
- **Weather**: `CACHE_TTL`, `WEATHER_API_KEY`

## Development

### Adding a New Service

1. Create a new directory under `examples/`
2. Implement the `MCPServiceInterface`
3. Add health checking logic
4. Create Dockerfile following the pattern
5. Add comprehensive README
6. Test all endpoints

### Best Practices
1. Always implement proper error handling
2. Use validation (Joi) for input data
3. Add request logging (Morgan)
4. Implement graceful shutdown
5. Document all endpoints
6. Include usage examples
7. Consider caching strategies
8. Monitor resource usage

## Troubleshooting

### Port Conflicts
If ports are already in use, override with environment variables:
```bash
PORT=8010 npm start
```

### Database Connection (Todo Service)
Ensure PostgreSQL is running and accessible:
```bash
docker-compose ps
docker-compose logs postgres
```

### Cache Issues (Weather Service)
Monitor cache performance:
```bash
curl http://localhost:3012/cache/stats
```

Clear cache if needed:
```bash
curl -X DELETE http://localhost:3012/cache
```

## License

All examples are MIT licensed.