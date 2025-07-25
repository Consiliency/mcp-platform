# MCP Platform Operations Manual

Comprehensive guide for operating and maintaining the MCP Platform in production environments.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring](#monitoring)
3. [Log Management](#log-management)
4. [Performance Tuning](#performance-tuning)
5. [Backup Procedures](#backup-procedures)
6. [Update & Upgrade](#update--upgrade)
7. [Troubleshooting](#troubleshooting)
8. [Emergency Procedures](#emergency-procedures)
9. [Maintenance Windows](#maintenance-windows)
10. [Capacity Planning](#capacity-planning)

## Daily Operations

### Morning Checklist

```bash
#!/bin/bash
# morning-check.sh - Daily operations checklist

echo "=== MCP Platform Morning Check ==="
echo "Date: $(date)"

# 1. Check service health
echo -e "\n[1/8] Checking service health..."
mcp health

# 2. Check disk space
echo -e "\n[2/8] Checking disk space..."
df -h | grep -E "^/|mcp"

# 3. Check memory usage
echo -e "\n[3/8] Checking memory usage..."
free -h

# 4. Check error logs
echo -e "\n[4/8] Checking recent errors..."
mcp logs --level error --since 24h | tail -20

# 5. Check backup status
echo -e "\n[5/8] Checking backup status..."
mcp backup status

# 6. Check certificate expiry
echo -e "\n[6/8] Checking SSL certificates..."
mcp tls check

# 7. Check pending updates
echo -e "\n[7/8] Checking for updates..."
mcp update check

# 8. Generate morning report
echo -e "\n[8/8] Generating report..."
mcp report daily --email ops@example.com
```

### Service Management

#### Starting Services

```bash
# Start all services
mcp start

# Start specific service
mcp start filesystem

# Start with specific profile
mcp profile switch production && mcp start

# Rolling restart
mcp restart --rolling --delay 30s
```

#### Stopping Services

```bash
# Graceful shutdown
mcp stop --graceful --timeout 300s

# Stop specific service
mcp stop postgres

# Emergency stop
mcp stop --force
```

#### Service Health Checks

```bash
# Check all services
mcp health

# Detailed health check
mcp health --verbose

# Check specific service
mcp health filesystem

# Continuous monitoring
watch -n 5 mcp health
```

### User Management

```bash
# List users
mcp user list

# Create user
mcp user create --username john --email john@example.com

# Update user permissions
mcp user update john --role admin

# Disable user
mcp user disable john

# Generate API key
mcp user apikey generate --user john --expires 30d
```

## Monitoring

### Metrics Collection

#### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 30s
  evaluation_interval: 30s
  external_labels:
    cluster: 'production'
    region: 'us-east-1'

scrape_configs:
  - job_name: 'mcp-platform'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    
  - job_name: 'mcp-services'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - mcp-platform
```

#### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `mcp_request_rate` | Requests per second | > 1000 rps |
| `mcp_error_rate` | Error percentage | > 1% |
| `mcp_response_time_p95` | 95th percentile latency | > 500ms |
| `mcp_cpu_usage` | CPU utilization | > 80% |
| `mcp_memory_usage` | Memory utilization | > 85% |
| `mcp_disk_usage` | Disk space used | > 90% |
| `mcp_active_connections` | Open connections | > 5000 |

### Grafana Dashboards

#### Service Overview Dashboard

```json
{
  "dashboard": {
    "title": "MCP Service Overview",
    "panels": [
      {
        "title": "Request Rate by Service",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
        "targets": [{
          "expr": "sum(rate(mcp_requests_total[5m])) by (service)"
        }]
      },
      {
        "title": "Error Rate",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
        "targets": [{
          "expr": "sum(rate(mcp_errors_total[5m])) by (service) / sum(rate(mcp_requests_total[5m])) by (service)"
        }]
      },
      {
        "title": "Response Time (p95)",
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 8},
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(mcp_request_duration_seconds_bucket[5m])) by (le, service))"
        }]
      }
    ]
  }
}
```

### Alert Configuration

```yaml
# alerts.yml
groups:
  - name: mcp_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(mcp_errors_total[5m])) by (service) 
          / sum(rate(mcp_requests_total[5m])) by (service) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate for {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.service }}"
          
      - alert: ServiceDown
        expr: up{job="mcp-services"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"
          
      - alert: HighMemoryUsage
        expr: |
          (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
```

### Alert Routing

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alerts@mcp-platform.io'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'default'
    email_configs:
      - to: 'ops@example.com'
      
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'your-pagerduty-key'
      
  - name: 'slack'
    slack_configs:
      - api_url: 'your-slack-webhook'
        channel: '#mcp-alerts'
```

## Log Management

### Log Collection

```yaml
# filebeat.yml
filebeat.inputs:
  - type: docker
    containers:
      path: "/var/lib/docker/containers"
      ids:
        - "*"
    processors:
      - add_docker_metadata: ~
      - decode_json_fields:
          fields: ["message"]
          target: ""
          overwrite_keys: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "mcp-logs-%{+yyyy.MM.dd}"

logging.level: info
logging.to_files: true
```

### Log Analysis

```bash
# Search for errors
mcp logs --search "error" --since 1h

# Get logs for specific request
mcp logs --request-id "abc-123-def"

# Export logs
mcp logs export --from "2024-01-01" --to "2024-01-31" --format json

# Real-time log streaming
mcp logs -f --filter "level:error OR level:warn"
```

### Log Retention Policy

```bash
# Configure retention
cat > log-retention.json << EOF
{
  "policies": [
    {
      "name": "production-logs",
      "pattern": "mcp-logs-*",
      "phases": {
        "hot": {
          "min_age": "0ms",
          "actions": {
            "rollover": {
              "max_size": "50GB",
              "max_age": "7d"
            }
          }
        },
        "warm": {
          "min_age": "7d",
          "actions": {
            "shrink": {
              "number_of_shards": 1
            },
            "forcemerge": {
              "max_num_segments": 1
            }
          }
        },
        "delete": {
          "min_age": "30d",
          "actions": {
            "delete": {}
          }
        }
      }
    }
  ]
}
EOF
```

## Performance Tuning

### Database Optimization

```sql
-- PostgreSQL tuning
ALTER SYSTEM SET shared_buffers = '4GB';
ALTER SYSTEM SET effective_cache_size = '12GB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Create indexes
CREATE INDEX CONCURRENTLY idx_requests_timestamp ON requests(created_at);
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);

-- Analyze tables
ANALYZE;
```

### Service Optimization

```yaml
# service-optimization.yml
services:
  filesystem-mcp:
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
      - UV_THREADPOOL_SIZE=16
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
      replicas: 3
    healthcheck:
      interval: 30s
      timeout: 10s
      retries: 3
```

### Caching Configuration

```javascript
// redis-config.js
module.exports = {
  redis: {
    cluster: true,
    nodes: [
      { host: 'redis-1', port: 6379 },
      { host: 'redis-2', port: 6379 },
      { host: 'redis-3', port: 6379 }
    ],
    options: {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true
    }
  },
  cache: {
    ttl: 3600, // 1 hour
    max: 10000, // max items
    strategy: 'LRU'
  }
};
```

## Backup Procedures

### Automated Backup Schedule

```yaml
# backup-schedule.yml
schedules:
  - name: daily-backup
    cron: "0 2 * * *"
    type: incremental
    retention: 7d
    
  - name: weekly-backup
    cron: "0 3 * * 0"
    type: full
    retention: 30d
    
  - name: monthly-backup
    cron: "0 4 1 * *"
    type: full
    retention: 365d
    archive: s3://mcp-backups/monthly/
```

### Backup Script

```bash
#!/bin/bash
# backup.sh - Production backup script

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/mcp-${BACKUP_DATE}"
S3_BUCKET="s3://mcp-backups/production"

echo "Starting backup: ${BACKUP_DATE}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Backup databases
echo "Backing up databases..."
pg_dump -h postgres -U mcp -d mcp_production > "${BACKUP_DIR}/postgres.sql"
mongodump --uri mongodb://mongo:27017/mcp --out "${BACKUP_DIR}/mongodb"

# Backup configurations
echo "Backing up configurations..."
kubectl get all,cm,secret -n mcp-platform -o yaml > "${BACKUP_DIR}/k8s-resources.yaml"
cp -r /etc/mcp "${BACKUP_DIR}/config"

# Backup volumes
echo "Backing up persistent volumes..."
tar -czf "${BACKUP_DIR}/volumes.tar.gz" /var/lib/mcp/data

# Create manifest
cat > "${BACKUP_DIR}/manifest.json" << EOF
{
  "timestamp": "${BACKUP_DATE}",
  "version": "$(mcp --version)",
  "type": "full",
  "components": ["database", "config", "volumes"],
  "size": "$(du -sh ${BACKUP_DIR} | cut -f1)"
}
EOF

# Compress backup
tar -czf "${BACKUP_DIR}.tar.gz" -C "$(dirname ${BACKUP_DIR})" "$(basename ${BACKUP_DIR})"

# Upload to S3
aws s3 cp "${BACKUP_DIR}.tar.gz" "${S3_BUCKET}/"

# Verify backup
aws s3 ls "${S3_BUCKET}/mcp-${BACKUP_DATE}.tar.gz"

# Clean up local files
rm -rf "${BACKUP_DIR}" "${BACKUP_DIR}.tar.gz"

echo "Backup completed: ${S3_BUCKET}/mcp-${BACKUP_DATE}.tar.gz"
```

### Restore Procedures

```bash
#!/bin/bash
# restore.sh - Restore from backup

BACKUP_FILE=$1
RESTORE_DIR="/tmp/restore-$(date +%Y%m%d_%H%M%S)"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file>"
  exit 1
fi

echo "Restoring from: ${BACKUP_FILE}"

# Download backup
aws s3 cp "${BACKUP_FILE}" /tmp/backup.tar.gz

# Extract backup
mkdir -p "${RESTORE_DIR}"
tar -xzf /tmp/backup.tar.gz -C "${RESTORE_DIR}"

# Stop services
mcp stop --all

# Restore databases
psql -h postgres -U mcp -d mcp_production < "${RESTORE_DIR}/*/postgres.sql"
mongorestore --uri mongodb://mongo:27017/mcp --dir "${RESTORE_DIR}/*/mongodb/mcp"

# Restore configurations
kubectl apply -f "${RESTORE_DIR}/*/k8s-resources.yaml"

# Restore volumes
tar -xzf "${RESTORE_DIR}/*/volumes.tar.gz" -C /

# Start services
mcp start --all

# Verify restoration
mcp health --verbose

echo "Restoration completed"
```

## Update & Upgrade

### Pre-Update Checklist

```bash
#!/bin/bash
# pre-update-check.sh

echo "=== Pre-Update Checklist ==="

# 1. Check current version
echo "[1/7] Current version:"
mcp --version

# 2. Check system resources
echo "[2/7] System resources:"
df -h
free -h

# 3. Create backup
echo "[3/7] Creating backup..."
mcp backup create --name "pre-update-$(date +%Y%m%d)"

# 4. Check for breaking changes
echo "[4/7] Checking release notes..."
mcp update check --show-breaking-changes

# 5. Test in staging
echo "[5/7] Run tests in staging first!"
read -p "Have you tested in staging? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

# 6. Schedule maintenance window
echo "[6/7] Maintenance window scheduled?"
read -p "Confirm maintenance window is scheduled (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

# 7. Notify users
echo "[7/7] Users notified?"
read -p "Confirm users have been notified (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

echo "Pre-update checklist complete!"
```

### Update Procedure

```bash
#!/bin/bash
# update-platform.sh

set -e

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

echo "Updating MCP Platform to version ${VERSION}"

# 1. Pull new images
echo "Pulling images..."
docker pull mcp-platform/traefik:${VERSION}
docker pull mcp-platform/filesystem:${VERSION}
docker pull mcp-platform/git:${VERSION}

# 2. Update configuration
echo "Updating configuration..."
sed -i "s/VERSION=.*/VERSION=${VERSION}/" .env

# 3. Run database migrations
echo "Running migrations..."
docker run --rm \
  --network mcp-network \
  mcp-platform/migrations:${VERSION} \
  migrate up

# 4. Rolling update
echo "Performing rolling update..."
docker compose up -d --no-deps --scale filesystem-mcp=6 filesystem-mcp
sleep 30
docker compose up -d --no-deps --scale filesystem-mcp=3 filesystem-mcp

# 5. Verify update
echo "Verifying update..."
mcp health --wait --timeout 300

echo "Update completed successfully!"
```

### Rollback Procedure

```bash
#!/bin/bash
# rollback.sh

PREVIOUS_VERSION=$1
if [ -z "$PREVIOUS_VERSION" ]; then
  echo "Usage: $0 <previous-version>"
  exit 1
fi

echo "Rolling back to version ${PREVIOUS_VERSION}"

# 1. Stop current version
mcp stop --all

# 2. Restore previous version
docker compose down
sed -i "s/VERSION=.*/VERSION=${PREVIOUS_VERSION}/" .env
docker compose up -d

# 3. Restore database if needed
read -p "Restore database backup? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ./restore.sh "s3://mcp-backups/production/pre-update-backup.tar.gz"
fi

# 4. Verify rollback
mcp health --verbose

echo "Rollback completed"
```

## Troubleshooting

### Common Issues

#### Service Won't Start

```bash
# Check logs
docker logs mcp-filesystem-1 --tail 100

# Check resources
docker stats --no-stream

# Check configuration
docker compose config

# Force recreate
docker compose up -d --force-recreate filesystem-mcp
```

#### High Memory Usage

```bash
# Find memory-consuming processes
ps aux --sort=-%mem | head -20

# Check container memory
docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}"

# Clear caches
echo 3 > /proc/sys/vm/drop_caches

# Restart service with memory limit
docker update --memory 2g mcp-filesystem-1
```

#### Database Connection Issues

```bash
# Test connection
psql -h postgres -U mcp -d mcp_production -c "SELECT 1"

# Check connection pool
mcp db connections

# Reset connections
mcp db reset-connections

# Check firewall
iptables -L -n | grep 5432
```

### Debug Mode

```bash
# Enable debug logging
export MCP_DEBUG=true
export LOG_LEVEL=debug

# Start with debug
mcp start --debug

# Debug specific service
docker run -it --rm \
  --network mcp-network \
  -e DEBUG=* \
  mcp-platform/filesystem:latest \
  node --inspect=0.0.0.0:9229 server.js
```

### Performance Profiling

```bash
# CPU profiling
mcp profile cpu --duration 30s --service filesystem

# Memory profiling
mcp profile heap --service filesystem

# Generate flame graph
mcp profile flame --output flame.svg
```

## Emergency Procedures

### Service Outage Response

```yaml
# emergency-response.yml
procedures:
  total_outage:
    steps:
      - notify: [oncall, management]
      - assess: 
          - check_monitoring_dashboard
          - identify_affected_services
          - determine_root_cause
      - mitigate:
          - switch_to_dr_site
          - scale_remaining_services
          - enable_read_only_mode
      - communicate:
          - update_status_page
          - send_customer_notification
          - create_incident_channel
      - resolve:
          - fix_root_cause
          - restore_services
          - verify_functionality
      - postmortem:
          - document_timeline
          - identify_improvements
          - schedule_review_meeting
```

### Emergency Contacts

```yaml
# contacts.yml
oncall:
  primary: "+1-555-0123"
  secondary: "+1-555-0124"
  escalation: "+1-555-0125"

teams:
  infrastructure:
    email: "infra@example.com"
    slack: "#mcp-infra"
  
  database:
    email: "dba@example.com"
    slack: "#mcp-database"
  
  security:
    email: "security@example.com"
    slack: "#mcp-security"

vendors:
  aws:
    support: "+1-800-xxx-xxxx"
    account_id: "123456789"
  
  datadog:
    support: "support@datadoghq.com"
```

### Disaster Recovery

```bash
#!/bin/bash
# disaster-recovery.sh

echo "=== Disaster Recovery Procedure ==="

# 1. Activate DR site
echo "[1/5] Activating DR site..."
kubectl config use-context dr-cluster
kubectl scale deployment --all --replicas=3 -n mcp-platform

# 2. Update DNS
echo "[2/5] Updating DNS..."
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch file://dr-dns-change.json

# 3. Verify DR services
echo "[3/5] Verifying DR services..."
kubectl get pods -n mcp-platform
kubectl exec -n mcp-platform deployment/mcp-platform -- mcp health

# 4. Restore latest backup
echo "[4/5] Restoring from backup..."
./restore.sh "s3://mcp-backups/dr/latest.tar.gz"

# 5. Notify stakeholders
echo "[5/5] Sending notifications..."
./notify.sh --template dr-activation --recipients all

echo "DR activation complete!"
```

## Maintenance Windows

### Planning Maintenance

```yaml
# maintenance-window.yml
window:
  scheduled: "2024-01-20T02:00:00Z"
  duration: "4h"
  type: "planned"
  
tasks:
  - name: "Database maintenance"
    duration: "2h"
    impact: "Read-only mode"
    
  - name: "Platform upgrade"
    duration: "1h"
    impact: "Service unavailable"
    
  - name: "Security patches"
    duration: "30m"
    impact: "Rolling restart"
    
notifications:
  - advance: "1w"
    channels: ["email", "status-page"]
    
  - advance: "1d"
    channels: ["email", "slack", "status-page"]
    
  - advance: "1h"
    channels: ["all"]
```

### Maintenance Mode

```bash
# Enable maintenance mode
mcp maintenance enable --message "Scheduled maintenance in progress"

# Check maintenance status
mcp maintenance status

# Disable maintenance mode
mcp maintenance disable

# Partial maintenance
mcp maintenance enable --services postgres,filesystem
```

## Capacity Planning

### Resource Monitoring

```sql
-- Historical usage analysis
WITH daily_metrics AS (
  SELECT 
    date_trunc('day', timestamp) as day,
    service,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY cpu_usage) as p95_cpu,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY memory_usage) as p95_memory,
    max(request_rate) as peak_rps
  FROM metrics
  WHERE timestamp > NOW() - INTERVAL '30 days'
  GROUP BY 1, 2
)
SELECT 
  service,
  avg(p95_cpu) as avg_p95_cpu,
  max(p95_cpu) as max_p95_cpu,
  avg(p95_memory) as avg_p95_memory,
  max(p95_memory) as max_p95_memory,
  avg(peak_rps) as avg_peak_rps,
  max(peak_rps) as max_peak_rps
FROM daily_metrics
GROUP BY service
ORDER BY avg_p95_cpu DESC;
```

### Growth Projections

```python
# capacity-planning.py
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import matplotlib.pyplot as plt

# Load historical data
df = pd.read_csv('metrics-history.csv')
df['date'] = pd.to_datetime(df['date'])

# Calculate growth rate
model = LinearRegression()
df['days'] = (df['date'] - df['date'].min()).dt.days

for metric in ['cpu', 'memory', 'requests']:
    model.fit(df[['days']], df[metric])
    
    # Project 6 months
    future_days = np.array([[180]])
    projection = model.predict(future_days)[0]
    
    growth_rate = (projection - df[metric].iloc[-1]) / df[metric].iloc[-1] * 100
    
    print(f"{metric} growth rate: {growth_rate:.1f}% over 6 months")
    print(f"Projected {metric}: {projection:.0f}")
```

### Scaling Recommendations

```yaml
# scaling-plan.yml
current_capacity:
  nodes: 6
  cpu_per_node: 8
  memory_per_node: 32GB
  storage_per_node: 500GB

projected_needs_6m:
  nodes: 9
  cpu_per_node: 8
  memory_per_node: 64GB
  storage_per_node: 1TB

recommendations:
  immediate:
    - add_memory: "Upgrade nodes to 64GB RAM"
    - add_cache: "Deploy Redis cluster for caching"
    
  3_months:
    - add_nodes: "Add 2 additional nodes"
    - optimize_queries: "Implement query optimization"
    
  6_months:
    - add_nodes: "Add 1 more node"
    - storage_expansion: "Migrate to distributed storage"
```

## Runbooks

### Service Restart Runbook

```markdown
# Service Restart Runbook

## When to Use
- Service is unresponsive
- After configuration changes
- Memory/CPU issues resolved

## Steps

1. **Verify the issue**
   ```bash
   mcp health <service>
   curl http://localhost:8080/mcp/<service>/health
   ```

2. **Check logs**
   ```bash
   mcp logs <service> --tail 100
   ```

3. **Graceful restart**
   ```bash
   mcp restart <service> --graceful
   ```

4. **Verify restart**
   ```bash
   mcp health <service> --wait
   ```

5. **Check metrics**
   - CPU usage normal
   - Memory usage normal
   - Response times normal

## Escalation
If service doesn't start after 3 attempts, escalate to on-call engineer.
```

### Database Failover Runbook

```markdown
# Database Failover Runbook

## When to Use
- Primary database unresponsive
- Replication lag > 5 minutes
- Hardware failure on primary

## Steps

1. **Verify primary is down**
   ```bash
   psql -h primary-db -U mcp -c "SELECT 1" || echo "Primary is down"
   ```

2. **Check replica status**
   ```bash
   psql -h replica-db -U mcp -c "SELECT pg_is_in_recovery()"
   ```

3. **Promote replica**
   ```bash
   psql -h replica-db -U postgres -c "SELECT pg_promote()"
   ```

4. **Update connection string**
   ```bash
   mcp config set DATABASE_URL "postgresql://mcp@replica-db/mcp_production"
   ```

5. **Restart services**
   ```bash
   mcp restart --all
   ```

6. **Verify functionality**
   ```bash
   mcp health --verbose
   ```

## Recovery
Once primary is restored, set up as new replica.
```

## Best Practices

### Operational Excellence

1. **Automate Everything**
   - Use scripts for routine tasks
   - Implement CI/CD for deployments
   - Automate monitoring and alerting

2. **Document Everything**
   - Keep runbooks updated
   - Document all procedures
   - Maintain change logs

3. **Test Regularly**
   - Test backup restoration
   - Practice disaster recovery
   - Conduct failure scenarios

4. **Monitor Proactively**
   - Set up predictive alerts
   - Track trends
   - Plan capacity ahead

5. **Communicate Effectively**
   - Regular status updates
   - Clear escalation paths
   - Documented procedures

### Security Operations

1. **Regular Audits**
   ```bash
   mcp security audit --full
   ```

2. **Update Regularly**
   ```bash
   mcp security update --check
   ```

3. **Monitor Access**
   ```bash
   mcp security access-log --suspicious
   ```

4. **Rotate Credentials**
   ```bash
   mcp security rotate-keys --all
   ```

## Next Steps

- [Security Guide](SECURITY_GUIDE.md) - Security operations
- [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md) - Advanced troubleshooting
- [API Reference](API_REFERENCE.md) - API operations

## Support

- **Operations Support**: ops@mcp-platform.io
- **Emergency Line**: +1-xxx-xxx-xxxx
- **Slack Channel**: #mcp-operations