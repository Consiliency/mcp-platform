# MCP Platform Deployment Guide

## Overview

This guide covers deploying the MCP Platform to various environments including Docker, Kubernetes, AWS, and other cloud providers.

## Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- Git
- Node.js 18+ (for CLI tools)
- Sufficient system resources (minimum 4GB RAM, 20GB storage)

## Local Development Deployment

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/mcp-platform.git
cd mcp-platform

# Run installation script
./install.sh

# Start services
docker-compose up -d
```

### Manual Setup

1. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

2. **Build services**:
```bash
docker-compose build
```

3. **Start platform**:
```bash
docker-compose up -d
```

4. **Verify deployment**:
```bash
mcp health
```

## Production Deployment

### Docker Compose Production

1. **Use production configuration**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

2. **Configure SSL/TLS**:
```yaml
# docker-compose.production.yml
services:
  traefik:
    command:
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
```

3. **Set resource limits**:
```yaml
services:
  filesystem-mcp:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Kubernetes Deployment

### Using Helm

1. **Add Helm repository**:
```bash
helm repo add mcp https://charts.mcp-platform.io
helm repo update
```

2. **Install MCP Platform**:
```bash
helm install mcp-platform mcp/platform \
  --namespace mcp \
  --create-namespace \
  --values values.yaml
```

3. **Custom values.yaml**:
```yaml
global:
  domain: mcp.example.com
  
ingress:
  enabled: true
  className: nginx
  tls:
    enabled: true
    issuer: letsencrypt-prod

services:
  filesystem:
    replicas: 3
    resources:
      requests:
        memory: "512Mi"
        cpu: "250m"
      limits:
        memory: "1Gi"
        cpu: "1000m"
```

### Manual Kubernetes Deployment

1. **Create namespace**:
```bash
kubectl create namespace mcp
```

2. **Apply configurations**:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/services.yaml
kubectl apply -f k8s/ingress.yaml
```

3. **Scale services**:
```bash
kubectl scale deployment filesystem-mcp --replicas=3 -n mcp
```

## AWS Deployment

### ECS Deployment

1. **Create task definitions**:
```bash
aws ecs register-task-definition --cli-input-json file://deploy/aws/task-definitions/mcp-platform.json
```

2. **Create ECS service**:
```bash
aws ecs create-service \
  --cluster mcp-cluster \
  --service-name mcp-platform \
  --task-definition mcp-platform:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration file://deploy/aws/network-config.json
```

3. **Configure Application Load Balancer**:
```bash
aws elbv2 create-load-balancer \
  --name mcp-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-12345678
```

### CloudFormation Deployment

```bash
aws cloudformation create-stack \
  --stack-name mcp-platform \
  --template-body file://deploy/aws/cloudformation/mcp-platform.yaml \
  --parameters file://deploy/aws/parameters.json \
  --capabilities CAPABILITY_IAM
```

## Google Cloud Platform Deployment

### Cloud Run Deployment

1. **Build and push images**:
```bash
gcloud builds submit --config=deploy/gcp/cloudbuild.yaml
```

2. **Deploy services**:
```bash
gcloud run deploy mcp-platform \
  --image gcr.io/project-id/mcp-platform \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### GKE Deployment

```bash
# Create cluster
gcloud container clusters create mcp-cluster \
  --num-nodes=3 \
  --zone=us-central1-a

# Get credentials
gcloud container clusters get-credentials mcp-cluster

# Deploy using kubectl
kubectl apply -f k8s/
```

## Azure Deployment

### Container Instances

```bash
az container create \
  --resource-group mcp-rg \
  --file deploy/azure/container-instances.yaml
```

### AKS Deployment

```bash
# Create AKS cluster
az aks create \
  --resource-group mcp-rg \
  --name mcp-cluster \
  --node-count 3 \
  --enable-addons monitoring

# Get credentials
az aks get-credentials --resource-group mcp-rg --name mcp-cluster

# Deploy
kubectl apply -f k8s/
```

## Configuration Management

### Environment Variables

Key environment variables for production:

```bash
# Core Configuration
MCP_ENV=production
MCP_PORT=8080
MCP_HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@db:5432/mcp
REDIS_URL=redis://redis:6379

# Security
JWT_SECRET=your-secret-key
API_KEY_SALT=your-salt

# Monitoring
SENTRY_DSN=https://key@sentry.io/project
PROMETHEUS_ENABLED=true
```

### Secrets Management

1. **Using Docker Secrets**:
```bash
echo "secret-value" | docker secret create jwt_secret -
```

2. **Using Kubernetes Secrets**:
```bash
kubectl create secret generic mcp-secrets \
  --from-literal=jwt-secret=your-secret \
  --from-literal=api-key-salt=your-salt
```

## Monitoring and Maintenance

### Health Checks

```bash
# Check platform health
curl http://localhost:8080/api/v1/health

# Check specific service
curl http://localhost:8080/api/v1/services/filesystem-mcp/health
```

### Logs

```bash
# Docker logs
docker-compose logs -f filesystem-mcp

# Kubernetes logs
kubectl logs -f deployment/filesystem-mcp -n mcp
```

### Metrics

Access Prometheus metrics:
```
http://localhost:9090/metrics
```

Access Grafana dashboards:
```
http://localhost:3000
```

## Backup and Recovery

### Automated Backups

```bash
# Schedule daily backups
mcp backup schedule --frequency daily --time 02:00
```

### Manual Backup

```bash
# Create backup
mcp backup create --name pre-deployment

# List backups
mcp backup list

# Restore backup
mcp backup restore --id backup-12345
```

## Troubleshooting

### Common Issues

1. **Service not starting**:
```bash
# Check logs
docker logs mcp-filesystem-1

# Check resource usage
docker stats
```

2. **Connection issues**:
```bash
# Test connectivity
mcp health --service filesystem-mcp

# Check network
docker network ls
docker network inspect mcp_default
```

3. **Performance issues**:
```bash
# Check resource limits
docker inspect mcp-filesystem-1 | grep -A 10 "Resources"

# Monitor metrics
curl http://localhost:9090/api/v1/query?query=container_memory_usage_bytes
```

## Security Best Practices

1. **Use strong secrets**:
```bash
# Generate secure secrets
openssl rand -base64 32
```

2. **Enable TLS everywhere**:
- Use Let's Encrypt for public endpoints
- Use self-signed certificates for internal communication

3. **Regular updates**:
```bash
# Check for updates
mcp update check

# Apply updates
mcp update apply
```

4. **Network isolation**:
- Use separate networks for different service tiers
- Implement firewall rules
- Use service mesh for internal communication

## Support

For deployment assistance:
- Check the troubleshooting section
- Review logs and metrics
- Open an issue on GitHub
- Contact support team

---

*Last updated: July 2025*