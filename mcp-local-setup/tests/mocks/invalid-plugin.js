/**
 * Invalid plugin for testing validation
 */

class InvalidPlugin {
  // Missing required methods
  getMetadata() {
    return { name: 'invalid' };
  }
}

module.exports = InvalidPlugin;