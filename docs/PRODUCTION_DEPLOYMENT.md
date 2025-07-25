# MCP Platform Production Deployment Guide

Complete guide for deploying the MCP Platform to production environments including cloud providers, Kubernetes, and on-premises infrastructure.

## Table of Contents

1. [Production Architecture](#production-architecture)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Options](#deployment-options)
4. [Docker Compose Production](#docker-compose-production)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Cloud Provider Deployments](#cloud-provider-deployments)
   - [AWS Deployment](#aws-deployment)
   - [Google Cloud Platform](#google-cloud-platform)
   - [Microsoft Azure](#microsoft-azure)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [Load Balancing](#load-balancing)
9. [High Availability](#high-availability)
10. [Monitoring & Observability](#monitoring--observability)
11. [Backup & Disaster Recovery](#backup--disaster-recovery)
12. [Security Hardening](#security-hardening)
13. [Performance Optimization](#performance-optimization)

## Production Architecture

### Reference Architecture

```
                            ┌─────────────────┐
                            │   Load Balancer │
                            │  (AWS ALB/NLB)  │
                            └────────┬────────┘
                                     │
                      ┌──────────────┴──────────────┐
                      │                             │
              ┌───────▼────────┐           ┌───────▼────────┐
              │  Traefik Edge   │           │  Traefik Edge   │
              │   Router (1)    │           │   Router (2)    │
              └───────┬────────┘           └───────┬────────┘
                      │                             │
         ┌────────────┴─────────────┬───────────────┴────────────┐
         │                          │                             │
    ┌────▼─────┐            ┌──────▼──────┐              ┌──────▼──────┐
    │Filesystem│            │     Git     │              │  PostgreSQL │
    │ MCP (HA) │            │  MCP (HA)   │              │   MCP (HA)  │
    └──────────┘            └─────────────┘              └─────────────┘
         │                          │                             │
         └──────────────────────────┴─────────────────────────────┘
                                    │
                           ┌────────▼────────┐
                           │   Shared State  │
                           │  (Redis/etcd)   │
                           └─────────────────┘
```

### Component Overview

- **Load Balancer**: Distributes traffic across multiple Traefik instances
- **Traefik Routers**: Handle routing, SSL termination, and service discovery
- **MCP Services**: Stateless service instances with horizontal scaling
- **Shared State**: Redis/etcd for session management and coordination
- **Data Layer**: Persistent storage for databases and file systems

## Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] Minimum 3 nodes for HA (5 recommended)
- [ ] Each node: 4 vCPUs, 16GB RAM minimum
- [ ] Network: 10Gbps interconnect recommended
- [ ] Storage: SSD-backed persistent volumes
- [ ] Load balancer with health checking
- [ ] SSL certificates (wildcard recommended)
- [ ] Container registry access
- [ ] Monitoring infrastructure

### Security Requirements

- [ ] Network segmentation configured
- [ ] Firewall rules defined
- [ ] SSL/TLS certificates obtained
- [ ] Secrets management system
- [ ] Backup encryption keys
- [ ] Audit logging enabled
- [ ] Security scanning tools

### Operational Requirements

- [ ] CI/CD pipeline configured
- [ ] Monitoring dashboards set up
- [ ] Alert routing configured
- [ ] Backup strategy defined
- [ ] Disaster recovery plan
- [ ] Runbook documentation
- [ ] On-call rotation

## Deployment Options

### Option 1: Docker Compose (Small Scale)

Best for: Small teams, single-server deployments

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  traefik:
    image: traefik:2.10
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/production:/etc/traefik
      - ./certs:/certs
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G

  filesystem-mcp:
    image: mcp-platform/filesystem:${VERSION:-latest}
    restart: always
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
```

### Option 2: Kubernetes (Enterprise Scale)

Best for: Large teams, multi-region deployments

### Option 3: Managed Container Services

Best for: Teams wanting managed infrastructure

## Docker Compose Production

### Production Configuration

```bash
# Create production directory
mkdir -p /opt/mcp-platform
cd /opt/mcp-platform

# Create production compose file
cat > docker-compose.production.yml << 'EOF'
version: '3.8'

x-default-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "10"

services:
  traefik:
    image: traefik:2.10
    container_name: mcp-traefik
    restart: always
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
      - ./traefik/dynamic:/etc/traefik/dynamic
    logging: *default-logging
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G

  redis:
    image: redis:7-alpine
    container_name: mcp-redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    logging: *default-logging

  filesystem-mcp:
    image: ${REGISTRY}/mcp-filesystem:${VERSION:-latest}
    restart: always
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://default:${REDIS_PASSWORD}@redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - LOG_LEVEL=info
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.filesystem.rule=PathPrefix(\`/mcp/filesystem\`)"
      - "traefik.http.routers.filesystem.entrypoints=websecure"
      - "traefik.http.routers.filesystem.tls.certresolver=letsencrypt"
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    logging: *default-logging
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  redis-data:
  postgres-data:
  letsencrypt:

networks:
  default:
    name: mcp-network
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
EOF
```

### Environment Configuration

```bash
# Create production .env file
cat > .env.production << 'EOF'
# Registry
REGISTRY=registry.example.com/mcp

# Version
VERSION=1.0.0

# Security
JWT_SECRET=your-production-jwt-secret
REDIS_PASSWORD=your-redis-password
API_KEY_SALT=your-api-key-salt

# Database
DATABASE_URL=postgresql://mcp:password@postgres:5432/mcp_prod
DATABASE_POOL_SIZE=20

# Monitoring
SENTRY_DSN=https://key@sentry.io/project
PROMETHEUS_ENABLED=true

# Features
FEATURE_FLAGS_URL=http://feature-flags:8080
RATE_LIMIT_ENABLED=true
EOF
```

### Deployment Script

```bash
#!/bin/bash
# deploy.sh - Production deployment script

set -e

# Configuration
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"

# Pre-deployment checks
echo "Running pre-deployment checks..."
docker compose -f $COMPOSE_FILE config > /dev/null
docker compose -f $COMPOSE_FILE pull

# Backup current state
echo "Creating backup..."
./scripts/backup.sh pre-deployment

# Deploy
echo "Deploying services..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d

# Wait for health
echo "Waiting for services to be healthy..."
./scripts/wait-for-health.sh

# Run post-deployment tests
echo "Running post-deployment tests..."
./scripts/post-deployment-test.sh

echo "Deployment complete!"
```

## Kubernetes Deployment

### Helm Chart Installation

```bash
# Add MCP Helm repository
helm repo add mcp https://charts.mcp-platform.io
helm repo update

# Create namespace
kubectl create namespace mcp-platform

# Create secrets
kubectl create secret generic mcp-secrets \
  --from-literal=jwt-secret=$JWT_SECRET \
  --from-literal=redis-password=$REDIS_PASSWORD \
  -n mcp-platform

# Install with Helm
helm install mcp-platform mcp/platform \
  --namespace mcp-platform \
  --values values.production.yaml
```

### Production Values

```yaml
# values.production.yaml
global:
  imageRegistry: registry.example.com
  imagePullSecrets:
    - name: registry-secret
  
replicaCount: 3

image:
  tag: "1.0.0"
  pullPolicy: IfNotPresent

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: mcp.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mcp-tls
      hosts:
        - mcp.example.com

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

persistence:
  enabled: true
  storageClass: "ssd-retain"
  size: 100Gi

redis:
  enabled: true
  auth:
    enabled: true
    existingSecret: mcp-secrets
  persistence:
    enabled: true
    size: 10Gi

postgresql:
  enabled: true
  auth:
    existingSecret: mcp-secrets
  primary:
    persistence:
      enabled: true
      size: 100Gi

monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true
    adminPassword: changeme
```

### Kubernetes Manifests

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-filesystem
  namespace: mcp-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-filesystem
  template:
    metadata:
      labels:
        app: mcp-filesystem
    spec:
      containers:
      - name: filesystem
        image: registry.example.com/mcp-filesystem:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: jwt-secret
        resources:
          limits:
            memory: "1Gi"
            cpu: "1000m"
          requests:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Cloud Provider Deployments

### AWS Deployment

#### ECS with Fargate

```bash
# Task definition
cat > task-definition.json << 'EOF'
{
  "family": "mcp-platform",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "mcp-filesystem",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/mcp-filesystem:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:mcp-jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/mcp-platform",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# Create service
aws ecs create-service \
  --cluster mcp-cluster \
  --service-name mcp-platform \
  --task-definition mcp-platform:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345,subnet-67890],securityGroups=[sg-12345],assignPublicIp=ENABLED}"
```

#### CloudFormation Template

```yaml
# cloudformation.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: MCP Platform Production Stack

Parameters:
  VPCId:
    Type: AWS::EC2::VPC::Id
    Description: VPC for deployment
  
  SubnetIds:
    Type: List<AWS::EC2::Subnet::Id>
    Description: Subnets for deployment

Resources:
  MCPCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: mcp-platform
      CapacityProviders:
        - FARGATE
        - FARGATE_SPOT

  MCPTaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: mcp-platform
      NetworkMode: awsvpc
      RequiresCompatibilities:
        - FARGATE
      Cpu: '1024'
      Memory: '2048'
      ContainerDefinitions:
        - Name: mcp-filesystem
          Image: !Sub '${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/mcp-filesystem:latest'
          PortMappings:
            - ContainerPort: 3000
          Environment:
            - Name: NODE_ENV
              Value: production

  MCPService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref MCPCluster
      ServiceName: mcp-platform
      TaskDefinition: !Ref MCPTaskDefinition
      DesiredCount: 3
      LaunchType: FARGATE
      NetworkConfiguration:
        AwsvpcConfiguration:
          Subnets: !Ref SubnetIds
          AssignPublicIp: ENABLED

  ApplicationLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: mcp-alb
      Subnets: !Ref SubnetIds
      SecurityGroups:
        - !Ref ALBSecurityGroup

  ALBSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for MCP ALB
      VpcId: !Ref VPCId
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
```

### Google Cloud Platform

#### Cloud Run Deployment

```bash
# Build and push image
gcloud builds submit --tag gcr.io/${PROJECT_ID}/mcp-filesystem

# Deploy to Cloud Run
gcloud run deploy mcp-filesystem \
  --image gcr.io/${PROJECT_ID}/mcp-filesystem \
  --platform managed \
  --region us-central1 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --port 3000 \
  --set-env-vars NODE_ENV=production \
  --set-secrets JWT_SECRET=mcp-jwt-secret:latest
```

#### GKE with Terraform

```hcl
# main.tf
resource "google_container_cluster" "mcp_cluster" {
  name     = "mcp-platform"
  location = "us-central1"

  node_pool {
    name       = "default-pool"
    node_count = 3

    node_config {
      machine_type = "n1-standard-4"
      
      oauth_scopes = [
        "https://www.googleapis.com/auth/cloud-platform"
      ]
    }

    autoscaling {
      min_node_count = 3
      max_node_count = 10
    }
  }

  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
  }
}

resource "google_container_node_pool" "mcp_nodes" {
  name       = "mcp-node-pool"
  cluster    = google_container_cluster.mcp_cluster.name
  node_count = 3

  node_config {
    preemptible  = false
    machine_type = "n1-standard-4"

    metadata = {
      disable-legacy-endpoints = "true"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring",
    ]
  }
}
```

### Microsoft Azure

#### Container Instances

```bash
# Create resource group
az group create --name mcp-platform-rg --location eastus

# Deploy container instance
az container create \
  --resource-group mcp-platform-rg \
  --name mcp-filesystem \
  --image mcpregistry.azurecr.io/mcp-filesystem:latest \
  --cpu 1 \
  --memory 1 \
  --ports 3000 \
  --environment-variables NODE_ENV=production \
  --secure-environment-variables JWT_SECRET=$JWT_SECRET
```

#### AKS Deployment

```bash
# Create AKS cluster
az aks create \
  --resource-group mcp-platform-rg \
  --name mcp-aks-cluster \
  --node-count 3 \
  --node-vm-size Standard_DS2_v2 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group mcp-platform-rg --name mcp-aks-cluster

# Deploy application
kubectl apply -f kubernetes/
```

## SSL/TLS Configuration

### Let's Encrypt with Cert-Manager

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.11.0/cert-manager.yaml

# Create ClusterIssuer
cat << EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Manual SSL Configuration

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/ssl/certs/mcp.crt;
    ssl_certificate_key /etc/ssl/private/mcp.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    location / {
        proxy_pass http://mcp-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Load Balancing

### HAProxy Configuration

```cfg
# haproxy.cfg
global
    maxconn 4096
    log stdout local0
    
defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms
    option httplog
    
frontend mcp_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/mcp.pem
    redirect scheme https if !{ ssl_fc }
    
    default_backend mcp_backend
    
backend mcp_backend
    balance roundrobin
    option httpchk GET /health
    
    server mcp1 10.0.1.10:3000 check
    server mcp2 10.0.1.11:3000 check
    server mcp3 10.0.1.12:3000 check
```

### NGINX Load Balancer

```nginx
# nginx-lb.conf
upstream mcp_backend {
    least_conn;
    server mcp1.internal:3000 max_fails=3 fail_timeout=30s;
    server mcp2.internal:3000 max_fails=3 fail_timeout=30s;
    server mcp3.internal:3000 max_fails=3 fail_timeout=30s;
    
    keepalive 32;
}

server {
    listen 80;
    listen 443 ssl http2;
    
    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Health check
        proxy_next_upstream error timeout http_503;
        proxy_connect_timeout 2s;
        proxy_read_timeout 30s;
    }
}
```

## High Availability

### Multi-Region Setup

```yaml
# multi-region-deployment.yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-global
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
spec:
  type: LoadBalancer
  selector:
    app: mcp-platform
  ports:
    - port: 443
      targetPort: 3000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-platform-us-east
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-platform
      region: us-east
  template:
    metadata:
      labels:
        app: mcp-platform
        region: us-east
    spec:
      nodeSelector:
        failure-domain.beta.kubernetes.io/region: us-east-1
      containers:
      - name: mcp
        image: mcp-platform:latest
        env:
        - name: REGION
          value: us-east-1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-platform-us-west
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-platform
      region: us-west
  template:
    metadata:
      labels:
        app: mcp-platform
        region: us-west
    spec:
      nodeSelector:
        failure-domain.beta.kubernetes.io/region: us-west-2
      containers:
      - name: mcp
        image: mcp-platform:latest
        env:
        - name: REGION
          value: us-west-2
```

### Database Replication

```yaml
# postgres-ha.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: mcp-postgres
spec:
  instances: 3
  
  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "256MB"
      effective_cache_size: "1GB"
      
  bootstrap:
    initdb:
      database: mcp_production
      owner: mcp
      
  monitoring:
    enabled: true
    
  backup:
    enabled: true
    retentionPolicy: "30d"
    target: "s3://mcp-backups/postgres"
```

## Monitoring & Observability

### Prometheus Configuration

```yaml
# prometheus-config.yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'mcp-platform'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - mcp-platform
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

rule_files:
  - '/etc/prometheus/rules/*.yml'
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "title": "MCP Platform Production",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (service)"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) by (service)"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))"
          }
        ]
      }
    ]
  }
}
```

## Backup & Disaster Recovery

### Automated Backup Strategy

```bash
#!/bin/bash
# backup-production.sh

# Configuration
BACKUP_DIR="/backups/mcp-platform"
S3_BUCKET="s3://mcp-backups"
RETENTION_DAYS=30

# Create backup
echo "Starting production backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mcp-backup-${TIMESTAMP}"

# Backup databases
echo "Backing up databases..."
kubectl exec -n mcp-platform postgres-0 -- pg_dumpall -U postgres > ${BACKUP_DIR}/${BACKUP_NAME}-postgres.sql

# Backup configurations
echo "Backing up configurations..."
kubectl get all,cm,secret -n mcp-platform -o yaml > ${BACKUP_DIR}/${BACKUP_NAME}-k8s.yaml

# Backup persistent volumes
echo "Backing up volumes..."
kubectl exec -n mcp-platform backup-job -- tar czf - /data > ${BACKUP_DIR}/${BACKUP_NAME}-volumes.tar.gz

# Upload to S3
echo "Uploading to S3..."
aws s3 cp ${BACKUP_DIR}/${BACKUP_NAME}* ${S3_BUCKET}/

# Clean old backups
echo "Cleaning old backups..."
find ${BACKUP_DIR} -name "mcp-backup-*" -mtime +${RETENTION_DAYS} -delete

echo "Backup complete!"
```

### Disaster Recovery Plan

```yaml
# dr-plan.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: disaster-recovery-plan
data:
  runbook.md: |
    # MCP Platform Disaster Recovery Runbook
    
    ## 1. Assessment (5 minutes)
    - Check monitoring dashboards
    - Identify affected services
    - Determine scope of outage
    
    ## 2. Communication (5 minutes)
    - Update status page
    - Notify stakeholders
    - Create incident channel
    
    ## 3. Failover (10-15 minutes)
    - Switch DNS to DR region
    - Verify DR services are healthy
    - Scale up DR capacity
    
    ## 4. Recovery (Variable)
    - Restore from latest backup
    - Replay transaction logs
    - Verify data integrity
    
    ## 5. Validation (15 minutes)
    - Run smoke tests
    - Check critical paths
    - Monitor error rates
    
    ## 6. Post-Mortem
    - Document timeline
    - Identify root cause
    - Create action items
```

## Security Hardening

### Network Policies

```yaml
# network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mcp-network-policy
  namespace: mcp-platform
spec:
  podSelector:
    matchLabels:
      app: mcp-platform
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: mcp-platform
    - podSelector:
        matchLabels:
          app: traefik
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: mcp-platform
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
```

### Security Scanning

```yaml
# security-scan.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: security-scan
  namespace: mcp-platform
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: trivy
            image: aquasec/trivy:latest
            command:
            - sh
            - -c
            - |
              trivy image --severity HIGH,CRITICAL mcp-platform:latest
              trivy image --severity HIGH,CRITICAL postgres:14
              trivy image --severity HIGH,CRITICAL redis:7
          restartPolicy: Never
```

## Performance Optimization

### Caching Strategy

```yaml
# redis-cache.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
data:
  redis.conf: |
    maxmemory 2gb
    maxmemory-policy allkeys-lru
    save 900 1
    save 300 10
    save 60 10000
    rdbcompression yes
    rdbchecksum yes
```

### Resource Optimization

```yaml
# resource-optimization.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: mcp-quota
  namespace: mcp-platform
spec:
  hard:
    requests.cpu: "100"
    requests.memory: 200Gi
    limits.cpu: "200"
    limits.memory: 400Gi
    persistentvolumeclaims: "10"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-platform
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

## Next Steps

- [Operations Manual](OPERATIONS_MANUAL.md) - Day-to-day operations
- [Security Guide](SECURITY_GUIDE.md) - Security best practices
- [Monitoring Guide](MONITORING_GUIDE.md) - Set up monitoring
- [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md) - Common issues

## Support

- **Production Support**: support@mcp-platform.io
- **Emergency Hotline**: +1-xxx-xxx-xxxx
- **Slack Channel**: #mcp-production
- **Documentation**: [docs.mcp-platform.io](https://docs.mcp-platform.io)