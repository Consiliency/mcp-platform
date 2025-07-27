/**
 * Integration tests for Advanced Transport Extensions (FEATURE-8.1)
 */

const { GrpcTransport, UnixSocketTransport, NamedPipeTransport, TransportPluginLoader } = require('../../../mcp-local-setup/bridge/transports');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const Module = require('module');

describe('Advanced Transport Extensions', () => {
  describe('gRPC Transport', () => {
    let transport;
    
    beforeEach(() => {
      transport = new GrpcTransport({
        host: 'localhost',
        port: 50051,
        credentials: 'insecure'
      });
    });
    
    afterEach(async () => {
      if (transport && transport.isConnected()) {
        await transport.close();
      }
    });
    
    test('should create gRPC transport instance', () => {
      expect(transport).toBeDefined();
      expect(transport.type).toBe('grpc');
      expect(transport.config.host).toBe('localhost');
      expect(transport.config.port).toBe(50051);
    });
    
    test('should handle connection lifecycle', async () => {
      // Mock require to avoid missing dependencies
      const originalRequire = Module.prototype.require;
      Module.prototype.require = jest.fn((id) => {
        if (id === '@grpc/grpc-js') {
          return {
            credentials: {
              createInsecure: () => 'insecure-creds'
            },
            loadPackageDefinition: () => ({
              mcp: {
                MCPService: function() {
                  this.communicate = () => ({
                    on: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn()
                  });
                }
              }
            })
          };
        }
        if (id === '@grpc/proto-loader') {
          return {
            load: jest.fn().mockResolvedValue({})
          };
        }
        return originalRequire.call(this, id);
      });
      
      try {
        await transport.initialize();
        expect(transport.client).toBeDefined();
      } finally {
        Module.prototype.require = originalRequire;
      }
    });
    
    test('should serialize and deserialize messages', () => {
      const message = {
        type: 'request',
        payload: { method: 'test', params: { foo: 'bar' } }
      };
      
      const serialized = transport._serializeMessage(message);
      expect(serialized.type).toBe('request');
      expect(serialized.payload).toBe(JSON.stringify(message.payload));
      expect(serialized.id).toBeDefined();
      expect(serialized.timestamp).toBeDefined();
      
      const deserialized = transport._deserializeMessage(serialized);
      expect(deserialized.type).toBe(message.type);
      expect(deserialized.payload).toEqual(message.payload);
    });
  });
  
  describe('Unix Socket Transport', () => {
    let transport;
    const socketPath = path.join(os.tmpdir(), `test-${Date.now()}.sock`);
    
    beforeEach(() => {
      transport = new UnixSocketTransport({
        socketPath,
        mode: 'server'
      });
    });
    
    afterEach(async () => {
      if (transport) {
        await transport.close();
      }
      // Clean up socket file
      try {
        await fs.unlink(socketPath);
      } catch (e) {
        // Ignore if doesn't exist
      }
    });
    
    test('should create Unix socket transport instance', () => {
      expect(transport).toBeDefined();
      expect(transport.type).toBe('unix');
      expect(transport.config.socketPath).toBe(socketPath);
    });
    
    test('should handle client-server communication', async () => {
      // Start server
      const serverConnected = new Promise(resolve => {
        transport.once('client-connect', resolve);
      });
      
      await transport.connect();
      
      // Create client
      const client = new UnixSocketTransport({
        socketPath,
        mode: 'client'
      });
      
      const clientConnected = new Promise(resolve => {
        client.once('connect', resolve);
      });
      
      await client.connect();
      await serverConnected;
      await clientConnected;
      
      // Test message exchange
      const messageReceived = new Promise(resolve => {
        transport.once('message', resolve);
      });
      
      await client.send({ type: 'test', data: 'hello' });
      const received = await messageReceived;
      
      expect(received.type).toBe('test');
      expect(received.data).toBe('hello');
      
      await client.close();
    });
  });
  
  describe('Named Pipe Transport', () => {
    let transport;
    const pipeName = `test-pipe-${Date.now()}`;
    
    beforeEach(() => {
      transport = new NamedPipeTransport({
        pipeName,
        mode: 'server'
      });
    });
    
    afterEach(async () => {
      if (transport) {
        await transport.close();
      }
    });
    
    test('should create Named Pipe transport instance', () => {
      expect(transport).toBeDefined();
      expect(transport.type).toBe('named-pipe');
      expect(transport.config.pipeName).toBe(pipeName);
    });
    
    test('should construct correct pipe path', () => {
      if (os.platform() === 'win32') {
        expect(transport.pipePath).toBe(`\\\\.\\pipe\\${pipeName}`);
      } else {
        expect(transport.pipePath).toBe(`/tmp/${pipeName}.sock`);
      }
    });
    
    test('should handle message framing', () => {
      const messages = [];
      transport.on('message', msg => messages.push(msg));
      
      // Simulate data with multiple messages
      transport.buffer = '';
      transport._handleData('{"type":"msg1"}\n{"type":"msg2"}\n{"type":"msg3');
      
      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('msg1');
      expect(messages[1].type).toBe('msg2');
      expect(transport.buffer).toBe('{"type":"msg3');
    });
  });
  
  describe('Transport Plugin Loader', () => {
    let loader;
    const pluginDir = path.join(os.tmpdir(), `plugins-${Date.now()}`);
    
    beforeEach(async () => {
      await fs.mkdir(pluginDir, { recursive: true });
      loader = new TransportPluginLoader({
        pluginDir,
        autoLoad: false
      });
    });
    
    afterEach(async () => {
      // Clean up plugin directory
      try {
        await fs.rmdir(pluginDir, { recursive: true });
      } catch (e) {
        // Ignore
      }
    });
    
    test('should create plugin loader instance', () => {
      expect(loader).toBeDefined();
      expect(loader.config.pluginDir).toBe(pluginDir);
    });
    
    test('should validate transport classes', () => {
      // Valid transport class
      class ValidTransport {
        async connect() {}
        async send() {}
        async close() {}
      }
      
      expect(() => {
        loader._validateTransportClass(ValidTransport, 'valid');
      }).not.toThrow();
      
      // Invalid transport class
      class InvalidTransport {
        async connect() {}
        // Missing send and close methods
      }
      
      expect(() => {
        loader._validateTransportClass(InvalidTransport, 'invalid');
      }).toThrow('must implement send() method');
    });
    
    test('should load plugin from descriptor', async () => {
      // Create a test transport plugin
      const transportCode = `
        class TestTransport {
          async connect() { return true; }
          async send(msg) { return true; }
          async close() { return true; }
        }
        module.exports = TestTransport;
      `;
      
      await fs.writeFile(
        path.join(pluginDir, 'test-transport.js'),
        transportCode
      );
      
      // Create plugin descriptor with full path
      const descriptor = {
        name: 'test-plugin',
        transport: {
          path: path.join(pluginDir, 'test-transport.js')
        },
        metadata: {
          version: '1.0.0'
        },
        path: pluginDir
      };
      
      await fs.writeFile(
        path.join(pluginDir, 'test-plugin.json'),
        JSON.stringify(descriptor)
      );
      
      // Initialize loader with mock factory
      const mockFactory = {};
      await loader.initialize(mockFactory);
      
      // Load plugins
      await loader.loadPlugins();
      
      // Check plugin was loaded
      const plugin = loader.getPlugin('test-plugin');
      expect(plugin).toBeDefined();
      expect(plugin.metadata.version).toBe('1.0.0');
    });
    
    test('should create plugin descriptor', () => {
      const descriptor = TransportPluginLoader.createPluginDescriptor({
        name: 'custom-transport',
        version: '2.0.0',
        description: 'Custom transport implementation',
        transportPath: './custom-transport.js',
        type: 'custom'
      });
      
      expect(descriptor.name).toBe('custom-transport');
      expect(descriptor.version).toBe('2.0.0');
      expect(descriptor.transport.path).toBe('./custom-transport.js');
      expect(descriptor.transport.type).toBe('custom');
    });
  });
});