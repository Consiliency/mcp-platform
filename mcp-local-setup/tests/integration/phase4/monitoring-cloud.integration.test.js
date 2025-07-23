/**
 * Integration tests for Monitoring + Cloud Deployment
 * Tests metrics collection and monitoring of cloud-deployed services
 */

const MetricsCollector = require('../../../monitoring/metrics/collector');
const AlertingSystem = require('../../../monitoring/alerts/alerting');
const AWSDeployment = require('../../../deploy/aws/deployment');
const GCPDeployment = require('../../../deploy/gcp/deployment');
const AzureDeployment = require('../../../deploy/azure/deployment');

describe('Monitoring + Cloud Integration', () => {
  let metricsCollector;
  let alertingSystem;
  let awsDeployment;
  let gcpDeployment;
  let azureDeployment;

  beforeEach(() => {
    metricsCollector = new MetricsCollector();
    alertingSystem = new AlertingSystem();
    awsDeployment = new AWSDeployment();
    gcpDeployment = new GCPDeployment();
    azureDeployment = new AzureDeployment();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AWS Monitoring Integration', () => {
    test('should collect metrics from AWS-deployed services', async () => {
      // Deploy a test service
      const deployment = await awsDeployment.deploy({
        serviceName: 'test-monitoring-service',
        region: 'us-east-1',
        memory: 512,
        cpu: 256
      });

      // Start monitoring the deployed service
      await metricsCollector.initializePrometheus();
      const metrics = await metricsCollector.collectServiceMetrics(deployment.serviceArn);

      expect(metrics).toHaveProperty('cpu_usage');
      expect(metrics).toHaveProperty('memory_usage');
      expect(metrics).toHaveProperty('request_count');
      expect(metrics).toHaveProperty('error_rate');
    });

    test('should trigger alerts for AWS service anomalies', async () => {
      const alertChannel = {
        type: 'slack',
        send: jest.fn()
      };
      
      await alertingSystem.addChannel('test-channel', alertChannel);
      
      // Create alert rule for high CPU
      await alertingSystem.createRule({
        name: 'aws-high-cpu',
        metric: 'cpu_usage',
        threshold: 80,
        comparison: '>',
        duration: 300,
        channels: ['test-channel']
      });

      // Simulate high CPU metric
      const mockMetrics = {
        cpu_usage: { value: 90, labels: { service: 'test-service', cloud: 'aws' } }
      };

      await alertingSystem.evaluateRules(mockMetrics);

      expect(alertChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          rule: 'aws-high-cpu',
          metric: 'cpu_usage',
          value: 90
        })
      );
    });
  });

  describe('GCP Monitoring Integration', () => {
    test('should collect metrics from GCP Cloud Run services', async () => {
      // Deploy a test service
      const deployment = await gcpDeployment.deploy({
        name: 'test-monitoring-service',
        project: 'test-project',
        region: 'us-central1',
        memory: '512Mi',
        cpu: 1
      });

      // Start monitoring
      const metrics = await metricsCollector.collectServiceMetrics(deployment.serviceUrl);

      expect(metrics).toHaveProperty('request_latency');
      expect(metrics).toHaveProperty('concurrent_requests');
      expect(metrics).toHaveProperty('cpu_utilization');
      expect(metrics).toHaveProperty('memory_utilization');
    });

    test('should integrate with GCP monitoring APIs', async () => {
      const gcpMetrics = await gcpDeployment.getMetrics('test-service');
      
      // Export to Prometheus format
      const prometheusMetrics = await metricsCollector.exportMetrics(gcpMetrics);
      
      expect(prometheusMetrics).toContain('gcp_cloud_run_request_count');
      expect(prometheusMetrics).toContain('gcp_cloud_run_request_latencies');
    });
  });

  describe('Azure Monitoring Integration', () => {
    test('should collect metrics from Azure Container Instances', async () => {
      // Deploy a test service
      const deployment = await azureDeployment.deploy({
        name: 'test-monitoring-service',
        resourceGroup: 'test-rg',
        location: 'eastus',
        memory: 1,
        cpu: 1
      });

      // Monitor the deployed container
      const metrics = await metricsCollector.collectServiceMetrics(deployment.containerName);

      expect(metrics).toHaveProperty('cpu_usage_percentage');
      expect(metrics).toHaveProperty('memory_usage_bytes');
      expect(metrics).toHaveProperty('network_bytes_received');
      expect(metrics).toHaveProperty('network_bytes_transmitted');
    });
  });

  describe('Cross-Cloud Monitoring', () => {
    test('should aggregate metrics across multiple cloud providers', async () => {
      // Deploy services to multiple clouds
      const awsService = await awsDeployment.deploy({
        serviceName: 'multi-cloud-aws',
        region: 'us-east-1'
      });

      const gcpService = await gcpDeployment.deploy({
        name: 'multi-cloud-gcp',
        project: 'test-project'
      });

      const azureService = await azureDeployment.deploy({
        name: 'multi-cloud-azure',
        resourceGroup: 'test-rg'
      });

      // Collect metrics from all services
      const allMetrics = await metricsCollector.collectMultiCloudMetrics([
        { provider: 'aws', service: awsService },
        { provider: 'gcp', service: gcpService },
        { provider: 'azure', service: azureService }
      ]);

      expect(allMetrics).toHaveProperty('aws');
      expect(allMetrics).toHaveProperty('gcp');
      expect(allMetrics).toHaveProperty('azure');
      expect(allMetrics).toHaveProperty('aggregated');
      expect(allMetrics.aggregated).toHaveProperty('total_request_count');
      expect(allMetrics.aggregated).toHaveProperty('average_cpu_usage');
    });

    test('should create unified dashboards for multi-cloud deployments', async () => {
      const dashboardConfig = {
        name: 'Multi-Cloud MCP Platform',
        panels: [
          { type: 'graph', metric: 'request_rate', clouds: ['aws', 'gcp', 'azure'] },
          { type: 'gauge', metric: 'cpu_usage', clouds: ['aws', 'gcp', 'azure'] },
          { type: 'table', metric: 'error_count', clouds: ['aws', 'gcp', 'azure'] }
        ]
      };

      const dashboard = await metricsCollector.createDashboard(dashboardConfig);
      
      expect(dashboard).toHaveProperty('url');
      expect(dashboard.panels).toHaveLength(3);
      expect(dashboard.datasources).toContain('prometheus');
    });
  });

  describe('Alert Integration Across Clouds', () => {
    test('should correlate alerts from different cloud providers', async () => {
      const alerts = [];
      
      // Setup alert collection
      alertingSystem.on('alert', (alert) => alerts.push(alert));

      // Simulate alerts from different clouds
      await alertingSystem.processCloudAlert({
        provider: 'aws',
        service: 'mcp-filesystem',
        type: 'high-memory',
        value: 95
      });

      await alertingSystem.processCloudAlert({
        provider: 'gcp',
        service: 'mcp-filesystem',
        type: 'high-latency',
        value: 2000
      });

      // Check correlation
      const correlation = await alertingSystem.correlateAlerts(alerts);
      
      expect(correlation).toHaveProperty('related');
      expect(correlation.related).toBe(true);
      expect(correlation.service).toBe('mcp-filesystem');
      expect(correlation.possibleCause).toContain('memory pressure');
    });
  });

  describe('Performance Monitoring', () => {
    test('should track deployment performance metrics', async () => {
      const deploymentMetrics = {
        aws: { deployTime: 45000, startupTime: 12000 },
        gcp: { deployTime: 30000, startupTime: 8000 },
        azure: { deployTime: 60000, startupTime: 15000 }
      };

      // Track deployment performance
      for (const [cloud, metrics] of Object.entries(deploymentMetrics)) {
        await metricsCollector.trackDeployment(cloud, metrics);
      }

      const performanceReport = await metricsCollector.getPerformanceReport();
      
      expect(performanceReport.fastest).toBe('gcp');
      expect(performanceReport.averageDeployTime).toBe(45000);
      expect(performanceReport.recommendations).toContain('Consider using GCP for time-critical deployments');
    });
  });
});