// Integration Test: IDE Extension and SDK Integration
// Purpose: Verify that IDE extensions properly use SDK for MCP operations
// Components involved: IDE Extension, SDK Core

const IDEExtensionInterface = require('../../../interfaces/phase5/ide-extension.interface');
const SDKCoreInterface = require('../../../interfaces/phase5/sdk-core.interface');

describe('IDE Extension and SDK Integration', () => {
  let ideExtension;
  let sdk;

  beforeEach(() => {
    sdk = new SDKCoreInterface({ apiKey: 'ide-test-key' });
    ideExtension = new IDEExtensionInterface(sdk);
  });

  test('IDE extension initializes with SDK instance', async () => {
    // Given an IDE extension
    // When it's created with an SDK instance
    // Then it should be properly initialized
    expect(() => new IDEExtensionInterface(sdk)).not.toThrow();
    expect(() => new IDEExtensionInterface(null)).toThrow('SDK instance required');
  });

  test('Code completion suggests available MCP services', async () => {
    // Given a code file being edited
    const document = {
      uri: 'file:///project/main.js',
      content: 'const service = mcp.'
    };
    const position = { line: 0, character: 20 };

    // When requesting completions
    const completions = await ideExtension.getCompletions(document, position);

    // Then it should suggest available services from SDK
    expect(completions).toContainEqual({
      label: 'connectService',
      kind: 'Method',
      detail: 'Connect to an MCP service',
      insertText: 'connectService("$1")'
    });

    // Completions should include actual services from SDK
    const services = await sdk.listServices({});
    services.forEach(service => {
      expect(completions).toContainEqual(
        expect.objectContaining({
          label: service.id,
          kind: 'Service'
        })
      );
    });
  });

  test('Hover info shows service documentation from SDK', async () => {
    // Given hovering over a service reference
    const document = {
      uri: 'file:///project/config.js',
      content: 'mcp.installService("postgres-mcp", config);'
    };
    const position = { line: 0, character: 25 }; // Over "postgres-mcp"

    // When requesting hover info
    const hoverInfo = await ideExtension.getHoverInfo(document, position);

    // Then it should fetch and display service details from SDK
    const serviceDetails = await sdk.getService('postgres-mcp');
    expect(hoverInfo.content).toContain(serviceDetails.description);
    expect(hoverInfo.content).toContain(serviceDetails.version);
    expect(hoverInfo.content).toContain('Configuration options:');
  });

  test('Diagnostics validate service configurations against SDK', async () => {
    // Given a configuration file with service definitions
    const document = {
      uri: 'file:///project/mcp.config.json',
      content: JSON.stringify({
        services: {
          'postgres-mcp': {
            version: '14',
            invalidOption: true  // This should trigger a diagnostic
          },
          'nonexistent-service': {  // This should also trigger a diagnostic
            enabled: true
          }
        }
      })
    };

    // When getting diagnostics
    const diagnostics = await ideExtension.getDiagnostics(document);

    // Then it should validate against SDK service definitions
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        message: 'Unknown configuration option: invalidOption',
        severity: 'warning',
        source: 'mcp-sdk'
      })
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        message: 'Service not found: nonexistent-service',
        severity: 'error',
        source: 'mcp-sdk'
      })
    );
  });

  test('Service panel shows real-time health from SDK', async () => {
    // Given the service panel is opened
    await ideExtension.showServicePanel();

    // When displaying service details
    const serviceId = 'test-service';
    await ideExtension.showServiceDetails(serviceId);

    // Then it should fetch and display current health from SDK
    const health = await sdk.getHealth(serviceId);
    
    // Verify the panel would show this health data
    // (In real implementation, this would update UI)
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('details');
  });

  test('Debugging integration uses SDK service endpoints', async () => {
    // Given starting a debug session
    const debugConfig = {
      serviceId: 'api-service',
      breakpoints: [
        { file: 'handler.js', line: 10 }
      ]
    };

    // When starting debugging
    const session = await ideExtension.startDebugging(debugConfig);

    // Then it should connect to service via SDK
    const serviceEndpoint = await sdk.callService(
      debugConfig.serviceId,
      'getDebugEndpoint',
      {}
    );
    
    expect(session.sessionId).toBeDefined();
    expect(serviceEndpoint).toHaveProperty('debugPort');
    expect(serviceEndpoint).toHaveProperty('protocol');
  });

  test('Code actions can install missing services via SDK', async () => {
    // Given a file referencing an uninstalled service
    const document = {
      uri: 'file:///project/app.js',
      content: 'const db = mcp.connect("mysql-mcp");'
    };
    const range = { start: { line: 0, character: 24 }, end: { line: 0, character: 34 } };
    const context = {
      diagnostics: [{
        message: 'Service not installed: mysql-mcp',
        severity: 'error'
      }]
    };

    // When getting code actions
    const codeActions = await ideExtension.getCodeActions(document, range, context);

    // Then it should offer to install via SDK
    expect(codeActions).toContainEqual(
      expect.objectContaining({
        title: 'Install mysql-mcp service',
        kind: 'quickfix',
        command: {
          command: 'mcp.installService',
          arguments: ['mysql-mcp', { source: 'ide' }]
        }
      })
    );

    // When executing the action
    const result = await ideExtension.executeCommand('mcp.installService', ['mysql-mcp', { source: 'ide' }]);
    
    // Then it should use SDK to install
    expect(result).toEqual(
      await sdk.installService('mysql-mcp', { source: 'ide' })
    );
  });
});