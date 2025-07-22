# Todo MCP Service

A full-featured todo service with PostgreSQL persistence, demonstrating a production-ready MCP service with database integration, validation, and comprehensive CRUD operations.

## Features

- Complete CRUD operations for todos
- PostgreSQL persistence with automatic table creation
- Advanced filtering and sorting
- Bulk operations
- Statistics endpoint
- Input validation with Joi
- Priority levels (low, medium, high)
- Due date tracking
- Tag support
- Automatic timestamp tracking

## Installation

```bash
npm install
```

## Usage

### Running with Docker Compose (Recommended)

```bash
# Start PostgreSQL and Todo service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Running locally

First, ensure PostgreSQL is running and accessible. Then:

```bash
# Install dependencies
npm install

# Set environment variables
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=todos
export DB_USER=todouser
export DB_PASSWORD=todopass

# Run the service
npm start

# Development mode with auto-reload
npm run dev
```

## API Endpoints

### Service Manifest
```bash
GET /
```

Returns service information including version, capabilities, and endpoints.

### Health Check
```bash
GET /health
```

Returns health status including database connectivity check.

Example response:
```json
{
  "status": "healthy",
  "service": "todo-mcp",
  "version": "1.0.0",
  "uptime": 300,
  "timestamp": "2024-01-15T10:30:45.123Z",
  "checks": {
    "service": "healthy",
    "database": "healthy",
    "memory": "healthy"
  },
  "issues": []
}
```

### List Todos
```bash
GET /todos?completed=false&priority=high&tag=urgent&sort=due_date&order=asc
```

Query parameters:
- `completed` - Filter by completion status (true/false)
- `priority` - Filter by priority (low/medium/high)
- `tag` - Filter by tag
- `sort` - Sort field (created_at, updated_at, due_date, priority, title)
- `order` - Sort order (asc/desc)

### Get Single Todo
```bash
GET /todos/:id
```

### Create Todo
```bash
POST /todos
Content-Type: application/json

{
  "title": "Complete project documentation",
  "description": "Write comprehensive docs for the new API",
  "priority": "high",
  "due_date": "2024-01-20T10:00:00Z",
  "tags": ["documentation", "api", "urgent"]
}
```

### Update Todo
```bash
PATCH /todos/:id
Content-Type: application/json

{
  "completed": true,
  "tags": ["documentation", "api", "completed"]
}
```

### Delete Todo
```bash
DELETE /todos/:id
```

### Bulk Complete
```bash
POST /todos/bulk/complete
Content-Type: application/json

{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```

### Get Statistics
```bash
GET /todos/stats
```

Response:
```json
{
  "total": "25",
  "completed": "10",
  "pending": "15",
  "high_priority": "5",
  "medium_priority": "12",
  "low_priority": "8",
  "overdue": "3"
}
```

## Examples

### Using curl

```bash
# Create a todo
curl -X POST http://localhost:3011/todos \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "description": "Milk, eggs, bread",
    "priority": "medium",
    "tags": ["shopping", "personal"]
  }'

# List all pending high-priority todos
curl "http://localhost:3011/todos?completed=false&priority=high"

# Update a todo
curl -X PATCH http://localhost:3011/todos/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Get statistics
curl http://localhost:3011/todos/stats

# Bulk complete todos
curl -X POST http://localhost:3011/todos/bulk/complete \
  -H "Content-Type: application/json" \
  -d '{"ids": ["id1", "id2", "id3"]}'
```

### Using JavaScript

```javascript
// Create a todo
const todo = await fetch('http://localhost:3011/todos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Learn MCP',
    description: 'Study Model Context Protocol',
    priority: 'high',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['learning', 'mcp']
  })
});
const newTodo = await todo.json();

// Get all todos with filtering
const response = await fetch('http://localhost:3011/todos?completed=false&sort=priority');
const { todos, count } = await response.json();

// Update todo
await fetch(`http://localhost:3011/todos/${newTodo.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ completed: true })
});
```

## Database Schema

The service automatically creates the following table:

```sql
CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT FALSE,
    priority VARCHAR(10) DEFAULT 'medium',
    tags TEXT[] DEFAULT '{}',
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Environment Variables

- `PORT` - Server port (default: 3011)
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name (default: todos)
- `DB_USER` - Database user (default: todouser)
- `DB_PASSWORD` - Database password (default: todopass)
- `NODE_ENV` - Node environment (default: production)

## Error Handling

The service includes comprehensive error handling:
- 400 for validation errors
- 404 for not found resources
- 500 for server errors
- 503 when database is unavailable

All errors return a consistent JSON format:
```json
{
  "error": "Error description"
}
```

## Development

The service extends `MCPServiceInterface` and implements:
- Database connection pooling
- Automatic table creation on startup
- Graceful shutdown handling
- Health checks including database connectivity
- Request validation with Joi
- Comprehensive logging with Morgan

## License

MIT