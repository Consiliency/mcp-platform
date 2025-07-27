/**
 * Transport Module Index
 * Exports all available transport implementations
 */

const GrpcTransport = require('./grpc/grpc-transport');
const UnixSocketTransport = require('./unix/unix-socket-transport');
const NamedPipeTransport = require('./named-pipe/named-pipe-transport');
const TransportPluginLoader = require('./transport-plugin-loader');
const TransportOptimizer = require('./transport-optimizer');

// Export individual transports
module.exports = {
  GrpcTransport,
  UnixSocketTransport,
  NamedPipeTransport,
  TransportPluginLoader,
  TransportOptimizer,
  
  // Factory function for creating transports
  createTransport(type, config) {
    switch (type) {
      case 'grpc':
        return new GrpcTransport(config);
      case 'unix':
      case 'unix-socket':
        return new UnixSocketTransport(config);
      case 'named-pipe':
      case 'pipe':
        return new NamedPipeTransport(config);
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  },
  
  // Get all available transport types
  getAvailableTypes() {
    return ['grpc', 'unix', 'unix-socket', 'named-pipe', 'pipe'];
  }
};