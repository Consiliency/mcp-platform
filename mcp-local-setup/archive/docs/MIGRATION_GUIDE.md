# MCP Platform Migration Guide

Comprehensive guide for migrating between MCP Platform versions and deployment environments.

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Version Migration](#version-migration)
3. [Environment Migration](#environment-migration)
4. [Data Migration](#data-migration)
5. [Service Migration](#service-migration)
6. [Breaking Changes](#breaking-changes)
7. [Rollback Procedures](#rollback-procedures)
8. [Migration Tools](#migration-tools)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

## Migration Overview

### Migration Types

| Type | Description | Downtime | Risk |
|------|-------------|----------|------|
| **Patch Update** | Bug fixes (e.g., 5.0.0 → 5.0.1) | None | Low |
| **Minor Update** | New features (e.g., 5.0.0 → 5.1.0) | Minimal | Low |
| **Major Update** | Breaking changes (e.g., 5.0.0 → 6.0.0) | Required | Medium |
| **Environment** | Dev → Staging → Production | Varies | Medium |
| **Platform** | Docker → Kubernetes | Required | High |

### Pre-Migration Checklist

```bash
#!/bin/bash
# pre-migration-check.sh

echo "=== Pre-Migration Checklist ==="

# 1. Check current version
echo "[1/10] Current version:"
mcp --version

# 2. Check target version compatibility
echo "[2/10] Target version compatibility:"
mcp migration check --target-version 6.0.0

# 3. Backup current state
echo "[3/10] Creating backup..."
mcp backup create --name "pre-migration-$(date +%Y%m%d-%H%M%S)"

# 4. Export configuration
echo "[4/10] Exporting configuration..."
mcp config export > config-backup.json

# 5. Document current services
echo "[5/10] Documenting services..."
mcp services list --format json > services-backup.json

# 6. Check disk space
echo "[6/10] Checking disk space..."
df -h | grep -E "/$|/var|/opt"

# 7. Verify database connectivity
echo "[7/10] Verifying database..."
mcp db ping

# 8. Test in staging
echo "[8/10] Have you tested in staging? (y/n)"
read -r response
if [[ "$response" != "y" ]]; then
    echo "Please test in staging first!"
    exit 1
fi

# 9. Schedule maintenance window
echo "[9/10] Is maintenance window scheduled? (y/n)"
read -r response
if [[ "$response" != "y" ]]; then
    echo "Please schedule maintenance window!"
    exit 1
fi

# 10. Notify users
echo "[10/10] Have users been notified? (y/n)"
read -r response
if [[ "$response" != "y" ]]; then
    echo "Please notify users!"
    exit 1
fi

echo "Pre-migration checklist complete!"
```

## Version Migration

### Upgrading from v4.x to v5.x

#### Breaking Changes
- JWT token format changed
- API endpoint structure updated
- Configuration file format migrated to JSON
- Database schema updates

#### Migration Steps

```bash
# 1. Stop services
mcp stop --all

# 2. Backup everything
mcp backup create --full --name "v4-final-backup"

# 3. Export v4 configuration
mcp config export --format v4 > config-v4.json

# 4. Run migration tool
mcp migrate --from 4.x --to 5.x \
  --config config-v4.json \
  --output config-v5.json

# 5. Update platform
curl -fsSL https://github.com/your-org/mcp-platform/raw/main/migrate-5.0.sh | bash

# 6. Apply new configuration
mcp config import --file config-v5.json

# 7. Run database migrations
mcp db migrate --version 5.0

# 8. Start services
mcp start --all

# 9. Verify migration
mcp health --verbose
mcp migration verify --version 5.0
```

### Upgrading from v5.x to v6.x

#### Major Changes
- Microservices architecture
- New authentication system
- Enhanced security features
- Kubernetes-native deployment

#### Step-by-Step Migration

##### Step 1: Prepare Environment

```bash
# Check requirements
mcp migration requirements --target 6.0

# Install migration tools
npm install -g @mcp-platform/migration-cli@6.0

# Validate current installation
mcp migration validate --source 5.x
```

##### Step 2: Data Migration

```bash
# Export all data
mcp migration export-data \
  --version 5.x \
  --output /backup/mcp-v5-data \
  --include services,config,users,keys

# Transform data for v6
mcp migration transform \
  --source /backup/mcp-v5-data \
  --target 6.0 \
  --output /backup/mcp-v6-data

# Validate transformed data
mcp migration validate-data \
  --data /backup/mcp-v6-data \
  --schema v6
```

##### Step 3: Service Migration

```yaml
# migration-plan.yaml
version: 6.0
migration:
  strategy: rolling
  phases:
    - name: infrastructure
      services:
        - traefik
        - redis
        - postgres
      timeout: 30m
      
    - name: core-services
      services:
        - auth-service
        - config-service
        - registry-service
      timeout: 45m
      
    - name: mcp-services
      services:
        - filesystem-mcp
        - git-mcp
        - browser-mcp
      timeout: 60m
      parallel: true
```

```bash
# Execute migration plan
mcp migration execute --plan migration-plan.yaml --verbose
```

##### Step 4: Configuration Migration

```javascript
// config-transformer.js
const transformConfig = (v5Config) => {
  return {
    version: "6.0",
    platform: {
      ...v5Config.platform,
      architecture: "microservices"
    },
    auth: {
      providers: {
        jwt: {
          algorithm: "RS256",
          keyRotation: {
            enabled: true,
            interval: "30d"
          }
        },
        oauth2: v5Config.oauth || {}
      }
    },
    services: v5Config.services.map(service => ({
      ...service,
      deployment: {
        type: "kubernetes",
        replicas: service.instances || 1,
        resources: {
          requests: {
            cpu: "100m",
            memory: "128Mi"
          },
          limits: {
            cpu: service.maxCpu || "1000m",
            memory: service.maxMemory || "1Gi"
          }
        }
      }
    }))
  };
};
```

##### Step 5: Post-Migration Validation

```bash
# Run comprehensive tests
mcp migration test --comprehensive

# Verify all services
mcp services verify --all

# Check data integrity
mcp migration verify-data \
  --compare-with /backup/mcp-v5-data

# Performance baseline
mcp benchmark --save baseline-v6
```

## Environment Migration

### Development to Staging

```bash
#!/bin/bash
# dev-to-staging.sh

SOURCE_ENV="development"
TARGET_ENV="staging"

echo "Migrating from $SOURCE_ENV to $TARGET_ENV"

# 1. Export development configuration
mcp config export --env $SOURCE_ENV > config-dev.json

# 2. Transform for staging
jq '.environment = "staging" | 
    .api.host = "staging-api.mcp-platform.io" |
    .security.tls.enabled = true' config-dev.json > config-staging.json

# 3. Export service data
mcp backup create --env $SOURCE_ENV --data-only

# 4. Deploy to staging
mcp deploy --env $TARGET_ENV --config config-staging.json

# 5. Import data
mcp restore --env $TARGET_ENV --data-only --latest

# 6. Run smoke tests
mcp test smoke --env $TARGET_ENV
```

### Staging to Production

```yaml
# production-migration.yaml
migration:
  name: "Staging to Production - v5.0"
  source:
    environment: staging
    snapshot: "staging-snapshot-20250724"
  target:
    environment: production
    region: us-east-1
    
  steps:
    - name: pre-flight
      actions:
        - validate_source
        - check_target_capacity
        - verify_backups
        
    - name: data_sync
      actions:
        - export_staging_data
        - transform_for_production
        - encrypt_sensitive_data
        
    - name: configuration
      actions:
        - update_endpoints
        - configure_ssl
        - set_production_limits
        
    - name: deployment
      strategy: blue_green
      actions:
        - deploy_blue_environment
        - run_health_checks
        - switch_traffic
        - monitor_metrics
        
    - name: validation
      actions:
        - functional_tests
        - performance_tests
        - security_scan
```

## Data Migration

### Database Migration

#### PostgreSQL Migration

```sql
-- 1. Create migration tracking table
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64),
    status VARCHAR(20) DEFAULT 'pending'
);

-- 2. Example migration: Add new columns
BEGIN;

-- Add new columns with defaults
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS deployment_type VARCHAR(20) DEFAULT 'docker',
ADD COLUMN IF NOT EXISTS health_check_config JSONB DEFAULT '{}';

-- Migrate existing data
UPDATE services 
SET deployment_type = CASE 
    WHEN config->>'orchestrator' = 'kubernetes' THEN 'kubernetes'
    ELSE 'docker'
END;

-- Create new indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_deployment_type 
ON services(deployment_type);

-- Record migration
INSERT INTO migrations (version, name, checksum, status)
VALUES ('5.0.0', 'add_deployment_features', 'sha256...', 'completed');

COMMIT;
```

#### MongoDB Migration

```javascript
// mongodb-migration.js
const migrate = async (db) => {
  // 1. Update schema version
  await db.collection('_migrations').insertOne({
    version: '5.0.0',
    startedAt: new Date(),
    status: 'in_progress'
  });

  // 2. Transform documents
  const bulk = db.collection('services').initializeUnorderedBulkOp();
  
  await db.collection('services').find({}).forEach(doc => {
    bulk.find({ _id: doc._id }).updateOne({
      $set: {
        schemaVersion: '5.0',
        deployment: {
          type: doc.orchestrator || 'docker',
          replicas: doc.instances || 1
        }
      },
      $unset: {
        orchestrator: "",
        instances: ""
      }
    });
  });
  
  await bulk.execute();

  // 3. Create new indexes
  await db.collection('services').createIndex(
    { 'deployment.type': 1 },
    { background: true }
  );

  // 4. Mark migration complete
  await db.collection('_migrations').updateOne(
    { version: '5.0.0' },
    { 
      $set: { 
        completedAt: new Date(), 
        status: 'completed' 
      }
    }
  );
};
```

### File System Migration

```bash
#!/bin/bash
# filesystem-migration.sh

SOURCE_PATH="/old/data/path"
TARGET_PATH="/new/data/path"

# 1. Create target structure
mkdir -p "$TARGET_PATH"/{services,configs,backups,logs}

# 2. Migrate with rsync (preserving attributes)
rsync -avzP \
  --exclude='*.tmp' \
  --exclude='*.log' \
  "$SOURCE_PATH/" "$TARGET_PATH/"

# 3. Update permissions
find "$TARGET_PATH" -type d -exec chmod 755 {} \;
find "$TARGET_PATH" -type f -exec chmod 644 {} \;

# 4. Update symbolic links
ln -sf "$TARGET_PATH" /var/lib/mcp/data

# 5. Verify migration
echo "Comparing source and target..."
diff -qr "$SOURCE_PATH" "$TARGET_PATH" | grep -v "\.log$"
```

## Service Migration

### Docker to Kubernetes

#### Service Definition Transformation

```yaml
# docker-compose.yml (source)
version: '3.8'
services:
  filesystem-mcp:
    image: mcp-platform/filesystem:5.0
    ports:
      - "3001:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/data
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
```

```yaml
# kubernetes-deployment.yaml (target)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: filesystem-mcp
  namespace: mcp-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: filesystem-mcp
  template:
    metadata:
      labels:
        app: filesystem-mcp
    spec:
      containers:
      - name: filesystem
        image: mcp-platform/filesystem:5.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        resources:
          limits:
            cpu: "1"
            memory: 1Gi
          requests:
            cpu: "100m"
            memory: 128Mi
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: filesystem-data
---
apiVersion: v1
kind: Service
metadata:
  name: filesystem-mcp
  namespace: mcp-platform
spec:
  selector:
    app: filesystem-mcp
  ports:
  - port: 3000
    targetPort: 3000
```

#### Migration Script

```bash
#!/bin/bash
# docker-to-k8s-migration.sh

# 1. Export Docker services
docker compose config > docker-services.yaml

# 2. Convert to Kubernetes manifests
kompose convert -f docker-services.yaml -o k8s-manifests/

# 3. Apply custom transformations
for file in k8s-manifests/*.yaml; do
  # Add namespace
  yq eval '.metadata.namespace = "mcp-platform"' -i "$file"
  
  # Add resource limits
  yq eval '.spec.template.spec.containers[0].resources.requests.cpu = "100m"' -i "$file"
  yq eval '.spec.template.spec.containers[0].resources.requests.memory = "128Mi"' -i "$file"
done

# 4. Create namespace and apply manifests
kubectl create namespace mcp-platform
kubectl apply -f k8s-manifests/

# 5. Migrate volumes
./migrate-volumes.sh

# 6. Verify migration
kubectl get all -n mcp-platform
```

### Service-by-Service Migration

```yaml
# rolling-migration.yaml
migration:
  strategy: rolling
  order:
    - group: infrastructure
      services: [postgres, redis, traefik]
      canary: false
      
    - group: core
      services: [auth-service, config-service]
      canary: true
      canaryPercentage: 10
      canaryDuration: 1h
      
    - group: mcp-services
      services: [filesystem-mcp, git-mcp, browser-mcp]
      canary: true
      canaryPercentage: 20
      canaryDuration: 2h
      parallel: true
      
  rollback:
    automatic: true
    conditions:
      - errorRate: "> 5%"
      - latency: "> 500ms"
      - healthCheck: "failing"
```

## Breaking Changes

### v4.x to v5.x Breaking Changes

| Component | v4.x | v5.x | Migration Required |
|-----------|------|------|-------------------|
| **API Auth** | Bearer token | JWT with refresh | Update client code |
| **Config Format** | YAML | JSON | Convert config files |
| **Service Names** | Snake case | Kebab case | Update references |
| **Database Schema** | Single table | Multi-table | Run migrations |
| **API Endpoints** | `/api/` | `/api/v1/` | Update API calls |

### v5.x to v6.x Breaking Changes

| Component | v5.x | v6.x | Migration Required |
|-----------|------|------|-------------------|
| **Architecture** | Monolithic | Microservices | Redeploy services |
| **Authentication** | JWT only | Multi-provider | Update auth config |
| **Deployment** | Docker Compose | Kubernetes | Convert manifests |
| **Configuration** | File-based | API-based | Use config API |
| **Networking** | Bridge | Service mesh | Configure mesh |

### API Migration Examples

#### v4.x API Call
```bash
curl -X GET http://localhost:8080/api/services \
  -H "Authorization: Bearer token123"
```

#### v5.x API Call
```bash
curl -X GET http://localhost:8080/api/v1/services \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

#### v6.x API Call
```bash
curl -X GET https://api.mcp-platform.io/api/v1/services \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "X-API-Version: 6.0"
```

## Rollback Procedures

### Automated Rollback

```bash
#!/bin/bash
# rollback.sh

VERSION_TO_ROLLBACK=$1
BACKUP_ID=$2

echo "Rolling back to version $VERSION_TO_ROLLBACK"

# 1. Stop current services
mcp stop --all --force

# 2. Restore previous version binaries
mcp version restore $VERSION_TO_ROLLBACK

# 3. Restore configuration
mcp config restore --backup-id $BACKUP_ID

# 4. Restore data
mcp backup restore --id $BACKUP_ID --data-only

# 5. Start services with previous version
mcp start --all --version $VERSION_TO_ROLLBACK

# 6. Verify rollback
mcp health --verbose
mcp version --current
```

### Manual Rollback

```bash
# 1. Identify the issue
mcp logs --since 1h --level error
mcp status --detailed

# 2. Stop affected services
mcp stop filesystem-mcp git-mcp

# 3. Restore from backup
cd /opt/mcp-platform
tar -xzf /backups/mcp-backup-20250724.tar.gz

# 4. Restore database
psql mcp_production < /backups/db-backup-20250724.sql

# 5. Revert configuration
cp /backups/config-20250724.json /etc/mcp/config.json

# 6. Start services
docker compose -f docker-compose.v5.yml up -d

# 7. Verify services
for service in $(mcp services list --format names); do
  mcp health $service || echo "Service $service unhealthy"
done
```

### Database Rollback

```sql
-- PostgreSQL rollback
BEGIN;

-- Revert schema changes
ALTER TABLE services DROP COLUMN deployment_type;
ALTER TABLE services DROP COLUMN health_check_config;
DROP INDEX idx_services_deployment_type;

-- Restore data from backup table
INSERT INTO services SELECT * FROM services_backup_v4;

-- Update migration tracking
UPDATE migrations 
SET status = 'rolled_back' 
WHERE version = '5.0.0';

COMMIT;
```

## Migration Tools

### MCP Migration CLI

```bash
# Install migration CLI
npm install -g @mcp-platform/migrate

# Check available commands
mcp-migrate --help

# Common operations
mcp-migrate check --from 4.0 --to 5.0
mcp-migrate plan --source ./v4-config --target ./v5-config
mcp-migrate execute --plan migration-plan.yaml
mcp-migrate verify --version 5.0
mcp-migrate rollback --to 4.0
```

### Migration Dashboard

```javascript
// migration-dashboard.js
const express = require('express');
const app = express();

app.get('/migration/status', async (req, res) => {
  const status = await getMigrationStatus();
  res.json({
    currentVersion: status.current,
    targetVersion: status.target,
    progress: status.progress,
    steps: status.steps.map(step => ({
      name: step.name,
      status: step.status,
      startTime: step.startTime,
      endTime: step.endTime,
      logs: step.logs
    }))
  });
});

app.post('/migration/control/:action', async (req, res) => {
  const { action } = req.params;
  
  switch (action) {
    case 'pause':
      await pauseMigration();
      break;
    case 'resume':
      await resumeMigration();
      break;
    case 'rollback':
      await rollbackMigration();
      break;
  }
  
  res.json({ action, status: 'completed' });
});
```

### Validation Tools

```python
# validate-migration.py
import json
import yaml
from jsonschema import validate

def validate_config(config_file, schema_version):
    """Validate configuration against schema"""
    with open(config_file, 'r') as f:
        config = json.load(f)
    
    schema = load_schema(schema_version)
    
    try:
        validate(instance=config, schema=schema)
        print(f"✓ Configuration valid for version {schema_version}")
        return True
    except Exception as e:
        print(f"✗ Configuration invalid: {e}")
        return False

def check_compatibility(source_version, target_version):
    """Check if migration path is supported"""
    migration_paths = {
        "4.0": ["4.1", "5.0"],
        "4.1": ["4.2", "5.0"],
        "5.0": ["5.1", "6.0"],
        "5.1": ["5.2", "6.0"]
    }
    
    return target_version in migration_paths.get(source_version, [])

def estimate_downtime(source_version, target_version, data_size):
    """Estimate migration downtime"""
    base_time = {
        "patch": 0,      # No downtime
        "minor": 300,    # 5 minutes
        "major": 1800    # 30 minutes
    }
    
    version_diff = get_version_difference(source_version, target_version)
    data_factor = data_size / (1024 * 1024 * 1024)  # GB
    
    estimated_seconds = base_time[version_diff] + (data_factor * 60)
    
    return {
        "estimated_downtime": estimated_seconds,
        "readable": format_duration(estimated_seconds),
        "confidence": "high" if version_diff == "patch" else "medium"
    }
```

## Troubleshooting

### Common Migration Issues

#### Issue: Services Won't Start After Migration

```bash
# Diagnosis
mcp logs --all --since 10m
mcp status --verbose

# Common fixes
# 1. Check configuration compatibility
mcp config validate

# 2. Verify database migrations
mcp db status

# 3. Check file permissions
find /var/lib/mcp -type d -exec chmod 755 {} \;
find /var/lib/mcp -type f -exec chmod 644 {} \;

# 4. Reset service state
mcp services reset --all
```

#### Issue: Data Loss During Migration

```bash
# Prevention
always_backup_before_migration=true

# Recovery
# 1. Stop all services
mcp stop --all --force

# 2. Restore from backup
mcp backup list
mcp backup restore --id backup_12345 --data-only

# 3. Verify data integrity
mcp data verify --checksum
```

#### Issue: Performance Degradation

```bash
# Diagnosis
mcp metrics --service all --duration 1h
mcp benchmark --compare-with baseline

# Optimization
# 1. Rebuild indexes
mcp db reindex

# 2. Clear caches
mcp cache clear --all

# 3. Optimize configuration
mcp config optimize --auto
```

### Migration Logs

```bash
# View migration logs
tail -f /var/log/mcp/migration.log

# Search for errors
grep -i error /var/log/mcp/migration.log

# Export logs for analysis
mcp logs export \
  --service migration \
  --from "2025-07-24T00:00:00Z" \
  --to "2025-07-24T23:59:59Z" \
  --output migration-analysis.json
```

## Best Practices

### 1. Planning

- **Test in Non-Production First**
  - Always test migrations in dev/staging
  - Use production-like data volumes
  - Simulate production load

- **Create Detailed Migration Plan**
  - Document each step
  - Identify rollback points
  - Estimate downtime

- **Communication**
  - Notify users well in advance
  - Provide status updates
  - Have emergency contacts ready

### 2. Execution

- **Backup Everything**
  ```bash
  mcp backup create --full --verify
  ```

- **Monitor Progress**
  ```bash
  watch -n 5 'mcp migration status'
  ```

- **Validate Each Step**
  ```bash
  mcp migration verify --step-by-step
  ```

### 3. Post-Migration

- **Thorough Testing**
  ```bash
  mcp test all --comprehensive
  ```

- **Performance Baseline**
  ```bash
  mcp benchmark --save post-migration
  ```

- **Document Lessons Learned**
  - What went well
  - What could be improved
  - Update runbooks

### 4. Automation

```yaml
# automated-migration.yaml
automation:
  pre_checks:
    - backup_verification
    - disk_space_check
    - dependency_validation
    
  migration:
    - stop_services
    - backup_data
    - update_platform
    - migrate_data
    - update_configuration
    - start_services
    
  post_checks:
    - health_verification
    - data_integrity
    - performance_baseline
    
  notifications:
    - slack: "#mcp-migrations"
    - email: "ops@example.com"
```

## Migration Schedule Template

```markdown
# Migration Schedule: v5.0 to v6.0

## Timeline
- **T-7 days**: Announce maintenance window
- **T-3 days**: Final testing in staging
- **T-1 day**: Final reminder to users
- **T-0**: Begin migration

## Maintenance Window
- **Date**: 2025-07-30
- **Time**: 02:00 - 06:00 UTC
- **Expected Downtime**: 2 hours
- **Maximum Downtime**: 4 hours

## Team Assignments
- **Migration Lead**: John Doe
- **Database Team**: Jane Smith, Bob Johnson
- **Platform Team**: Alice Brown, Charlie Davis
- **On-Call**: Emergency Team

## Rollback Decision Points
1. After service stop (T+15m)
2. After data migration (T+45m)
3. After service start (T+75m)
4. After validation (T+90m)

## Success Criteria
- All services healthy
- Data integrity verified
- Performance within 10% of baseline
- No critical errors in logs
```

## Next Steps

- [Operations Manual](OPERATIONS_MANUAL.md) - Day-to-day operations
- [Production Deployment](PRODUCTION_DEPLOYMENT.md) - Deployment strategies
- [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md) - Common issues

---

*Last updated: July 2025 | Version: 5.0*