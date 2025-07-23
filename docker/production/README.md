# MCP Production Docker Setup

This directory contains production-ready Docker configurations for the MCP platform.

## Overview

The production setup includes:
- Multi-stage builds for minimal image size
- Non-root user execution
- Health monitoring system
- Resource limits and constraints
- Graceful shutdown handling
- Security scanning in build pipeline

## Components

### 1. Production Dockerfiles

#### Node.js Service (node.Dockerfile)
- Multi-stage build with security scanning
- Runs as non-root user (nodejs:1001)
- Includes dumb-init for proper signal handling
- Built-in health checks
- Optimized for production workloads

#### Python Service (python.Dockerfile)
- Multi-stage build with security scanning
- Runs as non-root user (python:1001)
- Virtual environment isolation
- Built-in health checks
- Optimized dependencies

### 2. Health Monitoring System

The health monitor provides:
- Liveness probes for container orchestration
- Readiness probes for load balancer integration
- Startup probes for initialization tracking
- Service dependency checking
- Prometheus-compatible metrics endpoint

#### Endpoints:
- `/health` - Overall system health
- `/health/live` - Liveness probe
- `/health/ready` - Readiness probe
- `/health/startup` - Startup probe
- `/metrics` - Prometheus metrics

### 3. Production Compose Configuration

The `docker-compose.production.yml` includes:
- Resource limits for all services
- Health checks for automatic recovery
- Production-grade logging
- Network isolation
- Volume management

## Deployment

### Prerequisites

1. Docker Engine 20.10+
2. Docker Compose 2.0+
3. SSL certificates for HTTPS
4. Environment configuration

### Setup Steps

1. **Copy environment configuration:**
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with your values
   ```

2. **Generate SSL certificates:**
   ```bash
   mkdir -p docker/production/ssl
   # Add your cert.pem and key.pem files
   ```

3. **Build images:**
   ```bash
   docker-compose -f docker-compose.production.yml build
   ```

4. **Start services:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d
   ```

5. **Check health status:**
   ```bash
   curl http://localhost:9090/health
   ```

## Monitoring

### Health Checks

All services include health checks that are used by Docker for:
- Automatic container restart on failure
- Load balancer health verification
- Kubernetes liveness/readiness probes

### Metrics

Prometheus-compatible metrics are available at:
```
http://localhost:9090/metrics
```

Example metrics:
- `health_uptime_seconds` - Service uptime
- `health_services_total` - Total monitored services
- `health_services_healthy` - Number of healthy services
- `health_services_unhealthy` - Number of unhealthy services

## Security

### Build-time Security

- Security scanning with npm audit and Snyk
- Minimal base images (Alpine Linux)
- No development dependencies in production
- Explicit dependency versions

### Runtime Security

- Non-root user execution
- Read-only root filesystem (where applicable)
- No unnecessary capabilities
- Network isolation between services

### SSL/TLS

- TLS 1.2+ only
- Strong cipher suites
- HSTS headers enabled
- Certificate pinning support

## Resource Management

### CPU Limits

| Service | Limit | Reservation |
|---------|-------|-------------|
| API | 1.0 CPU | 0.5 CPU |
| Worker | 2.0 CPU | 1.0 CPU |
| Health Monitor | 0.25 CPU | 0.1 CPU |
| Redis | 0.5 CPU | 0.25 CPU |
| PostgreSQL | 1.0 CPU | 0.5 CPU |
| Nginx | 0.5 CPU | 0.25 CPU |

### Memory Limits

| Service | Limit | Reservation |
|---------|-------|-------------|
| API | 512MB | 256MB |
| Worker | 1GB | 512MB |
| Health Monitor | 128MB | 64MB |
| Redis | 256MB | 128MB |
| PostgreSQL | 1GB | 512MB |
| Nginx | 256MB | 128MB |

## Graceful Shutdown

All services implement graceful shutdown:

1. Stop accepting new connections
2. Wait for existing connections to complete
3. Clean up resources (database, cache, etc.)
4. Exit cleanly

Default shutdown timeout: 30 seconds

## Troubleshooting

### Check Service Logs
```bash
docker-compose -f docker-compose.production.yml logs -f [service-name]
```

### View Health Status
```bash
curl http://localhost:9090/health | jq .
```

### Inspect Resource Usage
```bash
docker stats
```

### Manual Health Check
```bash
docker exec mcp-api node /app/health/health-monitor.js --check readiness
```

## Scaling

### Horizontal Scaling

To scale services horizontally:
```bash
docker-compose -f docker-compose.production.yml up -d --scale api=3 --scale worker=5
```

### Load Balancing

Nginx automatically load balances between scaled instances using least_conn algorithm.

## Maintenance

### Update Images
```bash
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

### Backup Data
```bash
# Backup PostgreSQL
docker exec mcp-postgres pg_dump -U mcp mcp > backup.sql

# Backup Redis
docker exec mcp-redis redis-cli BGSAVE
```

### Clean Up
```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove unused volumes (careful!)
docker volume prune
```