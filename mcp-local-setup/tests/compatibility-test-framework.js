const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * MCP Compatibility Testing Framework
 * 
 * Automatically tests MCP servers for compatibility across platforms
 * and generates compatibility reports.
 */
class CompatibilityTestFramework {
  constructor(gatewayUrl = 'http://localhost:8090', apiKey = null) {
    this.gatewayUrl = gatewayUrl;
    this.apiKey = apiKey || process.env.GATEWAY_API_KEY || 'mcp-gateway-default-key';
    this.testResults = new Map();
    this.outputDir = path.join(__dirname, 'compatibility-reports');
  }

  /**
   * Test a single MCP server
   */
  async testServer(serverId) {
    console.log(`\nTesting ${serverId}...`);
    const results = {
      serverId,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      tests: {},
      errors: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };

    try {
      // 1. Check if server is running
      results.tests.serverStatus = await this.testServerStatus(serverId);
      
      // 2. Get available tools
      results.tests.toolDiscovery = await this.testToolDiscovery(serverId);
      
      // 3. Test each tool
      if (results.tests.toolDiscovery.passed) {
        results.tests.toolExecution = await this.testToolExecution(serverId, results.tests.toolDiscovery.tools);
      }
      
      // 4. Test compatibility filtering
      results.tests.compatibilityFiltering = await this.testCompatibilityFiltering(serverId);
      
      // 5. Test runtime capabilities
      results.tests.runtimeCapabilities = await this.testRuntimeCapabilities(serverId);
      
      // 6. Performance testing
      results.tests.performance = await this.testPerformance(serverId);
      
    } catch (error) {
      results.errors.push({
        test: 'general',
        error: error.message,
        stack: error.stack
      });
    }

    // Calculate summary
    this.calculateSummary(results);
    
    // Store results
    this.testResults.set(serverId, results);
    
    return results;
  }

  /**
   * Test server status
   */
  async testServerStatus(serverId) {
    const test = {
      name: 'Server Status',
      passed: false,
      details: {}
    };

    try {
      const response = await axios.get(`${this.gatewayUrl}/api/gateway/servers`, {
        headers: { 'x-api-key': this.apiKey }
      });

      const servers = response.data.servers;
      const server = servers.find(s => s.id === serverId);
      
      if (server) {
        test.details = server;
        test.passed = server.status === 'healthy';
        test.message = `Server status: ${server.status}`;
      } else {
        test.message = 'Server not found';
      }
    } catch (error) {
      test.error = error.message;
    }

    return test;
  }

  /**
   * Test tool discovery
   */
  async testToolDiscovery(serverId) {
    const test = {
      name: 'Tool Discovery',
      passed: false,
      tools: [],
      details: {}
    };

    try {
      const response = await axios.get(`${this.gatewayUrl}/api/gateway/tools`, {
        headers: { 'x-api-key': this.apiKey }
      });

      const allTools = response.data.tools;
      const serverTools = allTools.filter(tool => tool.name.startsWith(`${serverId}:`));
      
      test.tools = serverTools;
      test.details.totalTools = allTools.length;
      test.details.serverTools = serverTools.length;
      test.passed = serverTools.length > 0;
      test.message = `Found ${serverTools.length} tools for ${serverId}`;
    } catch (error) {
      test.error = error.message;
    }

    return test;
  }

  /**
   * Test tool execution
   */
  async testToolExecution(serverId, tools) {
    const test = {
      name: 'Tool Execution',
      passed: true,
      results: []
    };

    // Test safe read-only tools
    const safeTools = tools.filter(tool => 
      tool.name.includes('list') || 
      tool.name.includes('get') || 
      tool.name.includes('read') ||
      tool.name.includes('info')
    );

    for (const tool of safeTools.slice(0, 3)) { // Test up to 3 tools
      const toolTest = {
        tool: tool.name,
        passed: false,
        response: null,
        error: null
      };

      try {
        // Build appropriate parameters based on tool
        const params = this.buildTestParameters(tool);
        
        const response = await axios.post(
          `${this.gatewayUrl}/mcp`,
          {
            jsonrpc: '2.0',
            id: Date.now(),
            method: tool.name,
            params
          },
          {
            headers: { 'x-api-key': this.apiKey },
            timeout: 5000
          }
        );

        if (response.data.result) {
          toolTest.passed = true;
          toolTest.response = 'Success';
        } else if (response.data.error) {
          toolTest.error = response.data.error.message;
        }
      } catch (error) {
        toolTest.error = error.message;
      }

      test.results.push(toolTest);
      if (!toolTest.passed) {
        test.passed = false;
      }
    }

    return test;
  }

  /**
   * Build test parameters for a tool
   */
  buildTestParameters(tool) {
    const toolName = tool.name.toLowerCase();
    
    // Filesystem tools
    if (toolName.includes('filesystem')) {
      if (toolName.includes('list')) {
        return { path: '/tmp' };
      }
      if (toolName.includes('read')) {
        return { path: '/etc/hosts' };
      }
    }
    
    // Memory/knowledge tools
    if (toolName.includes('memory') || toolName.includes('knowledge')) {
      if (toolName.includes('list')) {
        return {};
      }
      if (toolName.includes('get')) {
        return { id: 'test' };
      }
    }
    
    // Default empty params
    return {};
  }

  /**
   * Test compatibility filtering
   */
  async testCompatibilityFiltering(serverId) {
    const test = {
      name: 'Compatibility Filtering',
      passed: false,
      details: {}
    };

    try {
      const response = await axios.get(
        `${this.gatewayUrl}/api/gateway/compatibility/${serverId}`,
        {
          headers: { 'x-api-key': this.apiKey }
        }
      );

      const compat = response.data.compatibility;
      test.details = {
        platform: compat.platform,
        supported: compat.supported,
        level: compat.level,
        limitations: compat.limitations,
        knownIssues: compat.knownIssues?.length || 0
      };
      
      test.passed = compat.supported;
      test.message = `Compatibility level: ${compat.level}`;
    } catch (error) {
      test.error = error.message;
    }

    return test;
  }

  /**
   * Test runtime capabilities
   */
  async testRuntimeCapabilities(serverId) {
    const test = {
      name: 'Runtime Capabilities',
      passed: false,
      details: {}
    };

    try {
      const response = await axios.get(
        `${this.gatewayUrl}/api/gateway/compatibility/${serverId}?enhanced=true`,
        {
          headers: { 'x-api-key': this.apiKey }
        }
      );

      const enhanced = response.data.compatibility;
      if (enhanced.runtime) {
        test.details = {
          canRun: enhanced.runtime.canRun,
          overallSupport: enhanced.runtime.overallSupport,
          missingRequirements: enhanced.runtime.missingRequirements
        };
        
        test.passed = enhanced.runtime.canRun;
        test.message = `Can run: ${enhanced.runtime.canRun}`;
      } else {
        test.message = 'No runtime data available';
      }
    } catch (error) {
      test.error = error.message;
    }

    return test;
  }

  /**
   * Test performance
   */
  async testPerformance(serverId) {
    const test = {
      name: 'Performance',
      passed: true,
      metrics: {
        toolDiscovery: 0,
        toolExecution: 0
      }
    };

    try {
      // Measure tool discovery time
      const startDiscovery = Date.now();
      await axios.get(`${this.gatewayUrl}/api/gateway/tools`, {
        headers: { 'x-api-key': this.apiKey }
      });
      test.metrics.toolDiscovery = Date.now() - startDiscovery;

      // Measure simple tool execution
      const startExecution = Date.now();
      await axios.post(
        `${this.gatewayUrl}/mcp`,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'initialize',
          params: {
            protocolVersion: '1.0.0',
            capabilities: {}
          }
        },
        {
          headers: { 'x-api-key': this.apiKey },
          timeout: 5000
        }
      );
      test.metrics.toolExecution = Date.now() - startExecution;

      // Set thresholds
      if (test.metrics.toolDiscovery > 1000) {
        test.passed = false;
        test.message = 'Tool discovery too slow';
      }
      if (test.metrics.toolExecution > 500) {
        test.passed = false;
        test.message = 'Tool execution too slow';
      }

      if (test.passed) {
        test.message = 'Performance within acceptable limits';
      }
    } catch (error) {
      test.error = error.message;
      test.passed = false;
    }

    return test;
  }

  /**
   * Calculate test summary
   */
  calculateSummary(results) {
    for (const [testName, testResult] of Object.entries(results.tests)) {
      results.summary.total++;
      
      if (testResult.passed) {
        results.summary.passed++;
      } else if (testResult.error) {
        results.summary.failed++;
      } else {
        results.summary.skipped++;
      }
    }
    
    results.summary.successRate = results.summary.total > 0 
      ? Math.round((results.summary.passed / results.summary.total) * 100)
      : 0;
  }

  /**
   * Test all servers
   */
  async testAllServers() {
    console.log('Starting compatibility tests for all servers...\n');
    
    try {
      // Get list of all servers
      const response = await axios.get(`${this.gatewayUrl}/api/gateway/servers`, {
        headers: { 'x-api-key': this.apiKey }
      });
      
      const servers = response.data.servers;
      console.log(`Found ${servers.length} servers to test`);
      
      // Test each server
      for (const server of servers) {
        await this.testServer(server.id);
      }
      
      // Generate reports
      await this.generateReports();
      
      return this.testResults;
    } catch (error) {
      console.error('Failed to test servers:', error.message);
      throw error;
    }
  }

  /**
   * Generate compatibility reports
   */
  async generateReports() {
    console.log('\nGenerating compatibility reports...');
    
    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Generate individual server reports
    for (const [serverId, results] of this.testResults) {
      const reportPath = path.join(this.outputDir, `${serverId}-compatibility.json`);
      await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
      console.log(`  Generated report: ${reportPath}`);
    }
    
    // Generate summary report
    const summary = this.generateSummaryReport();
    const summaryPath = path.join(this.outputDir, 'compatibility-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`  Generated summary: ${summaryPath}`);
    
    // Generate markdown report
    const markdown = this.generateMarkdownReport();
    const markdownPath = path.join(this.outputDir, 'compatibility-report.md');
    await fs.writeFile(markdownPath, markdown);
    console.log(`  Generated markdown: ${markdownPath}`);
  }

  /**
   * Generate summary report
   */
  generateSummaryReport() {
    const summary = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      totalServers: this.testResults.size,
      results: []
    };
    
    for (const [serverId, results] of this.testResults) {
      summary.results.push({
        serverId,
        summary: results.summary,
        errors: results.errors.length
      });
    }
    
    return summary;
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport() {
    let markdown = '# MCP Compatibility Test Report\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n`;
    markdown += `Platform: ${process.platform}\n\n`;
    
    for (const [serverId, results] of this.testResults) {
      markdown += `## ${serverId}\n\n`;
      markdown += `Success Rate: ${results.summary.successRate}% (${results.summary.passed}/${results.summary.total})\n\n`;
      
      markdown += '### Test Results\n\n';
      for (const [testName, testResult] of Object.entries(results.tests)) {
        const status = testResult.passed ? '✓' : '✗';
        markdown += `- **${testResult.name}**: ${status} ${testResult.message || ''}\n`;
        
        if (testResult.error) {
          markdown += `  - Error: ${testResult.error}\n`;
        }
      }
      
      if (results.errors.length > 0) {
        markdown += '\n### Errors\n\n';
        for (const error of results.errors) {
          markdown += `- ${error.test}: ${error.error}\n`;
        }
      }
      
      markdown += '\n---\n\n';
    }
    
    return markdown;
  }
}

// Export for use as module
module.exports = CompatibilityTestFramework;

// Run if executed directly
if (require.main === module) {
  const framework = new CompatibilityTestFramework();
  framework.testAllServers().then(() => {
    console.log('\nAll tests completed!');
  }).catch(error => {
    console.error('Test framework error:', error);
    process.exit(1);
  });
}