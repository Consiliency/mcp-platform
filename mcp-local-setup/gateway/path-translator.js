/**
 * PathTranslator handles path translation between different platforms
 * and between host and container environments
 */
class PathTranslator {
  constructor(platformManager) {
    this.platformManager = platformManager;
    this.pathMappings = new Map();
  }

  /**
   * Add a path mapping for translation
   */
  addMapping(containerPath, hostPath) {
    this.pathMappings.set(containerPath, hostPath);
    // Also store reverse mapping
    this.pathMappings.set(hostPath, containerPath);
  }

  /**
   * Translate a path in a tool call or response
   */
  translatePath(path, direction = 'auto') {
    // Quick return if no translation needed
    if (!this.platformManager.platform.isWSL && !this.platformManager.platform.isDocker) {
      return path;
    }

    // Check if path matches any mapping
    for (const [from, to] of this.pathMappings) {
      if (path.startsWith(from)) {
        return path.replace(from, to);
      }
    }

    // WSL-specific translations
    if (this.platformManager.platform.isWSL) {
      // Windows path to WSL path
      if (path.match(/^[A-Z]:\\/i)) {
        return this.platformManager.translatePath(path, 'windows', 'wsl');
      }
      
      // WSL path that might need Windows path
      if (direction === 'toWindows' && path.startsWith('/')) {
        // Check if this is a Windows mount
        if (path.startsWith('/mnt/')) {
          return this.platformManager.translatePath(path, 'wsl', 'windows');
        }
      }
    }

    return path;
  }

  /**
   * Translate paths in tool arguments
   */
  translateToolArguments(toolName, args) {
    // Deep clone to avoid modifying original
    const translated = JSON.parse(JSON.stringify(args));

    // Known path fields by tool pattern
    const pathFields = {
      'read': ['path', 'file_path', 'directory'],
      'write': ['path', 'file_path', 'directory'],
      'create': ['path', 'file_path', 'directory'],
      'delete': ['path', 'file_path', 'directory'],
      'list': ['directory', 'path'],
      'move': ['source', 'destination', 'from', 'to'],
      'copy': ['source', 'destination', 'from', 'to']
    };

    // Find matching patterns
    for (const [pattern, fields] of Object.entries(pathFields)) {
      if (toolName.toLowerCase().includes(pattern)) {
        for (const field of fields) {
          if (translated[field]) {
            translated[field] = this.translatePath(translated[field]);
          }
        }
      }
    }

    // Also check for common path fields
    const commonFields = ['path', 'filePath', 'file_path', 'directory', 'dir', 'folder'];
    for (const field of commonFields) {
      if (translated[field] && typeof translated[field] === 'string') {
        translated[field] = this.translatePath(translated[field]);
      }
    }

    // Handle arrays of paths
    if (translated.paths && Array.isArray(translated.paths)) {
      translated.paths = translated.paths.map(p => this.translatePath(p));
    }

    return translated;
  }

  /**
   * Translate paths in tool responses
   */
  translateToolResponse(toolName, response) {
    if (!response || typeof response !== 'object') {
      return response;
    }

    // Deep clone
    const translated = JSON.parse(JSON.stringify(response));

    // Recursively translate paths in response
    const translateObject = (obj) => {
      if (typeof obj === 'string') {
        // Check if it looks like a path
        if (obj.match(/^[A-Z]:\\/i) || obj.startsWith('/')) {
          return this.translatePath(obj);
        }
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => translateObject(item));
      }

      if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          // Check if key suggests a path
          if (key.toLowerCase().includes('path') || 
              key.toLowerCase().includes('file') ||
              key.toLowerCase().includes('directory') ||
              key.toLowerCase().includes('folder')) {
            result[key] = translateObject(value);
          } else {
            result[key] = translateObject(value);
          }
        }
        return result;
      }

      return obj;
    };

    return translateObject(translated);
  }

  /**
   * Setup path mappings from server mounts configuration
   */
  setupMountsMapping(mounts) {
    for (const mount of mounts) {
      this.addMapping(mount.container, mount.host);
    }
  }

  /**
   * Get mapped path for display to user
   */
  getUserFriendlyPath(path) {
    // In WSL, prefer showing Windows paths for Windows mounts
    if (this.platformManager.platform.isWSL) {
      if (path.startsWith('/mnt/c/')) {
        return this.platformManager.translatePath(path, 'wsl', 'windows');
      }
    }
    return path;
  }
}

module.exports = PathTranslator;