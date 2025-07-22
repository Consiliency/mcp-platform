#!/usr/bin/env node

/**
 * Version Validator for MCP Services
 * Validates version compatibility between services and clients
 */

const fs = require('fs');
const path = require('path');
const semver = require('semver');

class VersionValidator {
  constructor() {
    this.services = new Map();
    this.versionCompatibility = {};
  }

  /**
   * Load catalog data
   * @param {Object} catalog - Catalog object
   */
  loadCatalog(catalog) {
    this.services.clear();
    
    if (!catalog.servers || !Array.isArray(catalog.servers)) {
      throw new Error('Invalid catalog: missing servers array');
    }

    for (const service of catalog.servers) {
      this.services.set(service.id, service);
    }

    this.versionCompatibility = catalog.versionCompatibility || {};
  }

  /**
   * Parse version string safely
   * @param {string} version - Version string
   * @returns {string|null} Clean semver string or null
   */
  parseVersion(version) {
    if (!version) return null;
    
    // Handle special cases
    if (version === 'latest') return null;
    if (version.startsWith('^') || version.startsWith('~')) {
      return version.substring(1);
    }
    if (version.startsWith('>=')) {
      return version.substring(2).split(' ')[0];
    }
    
    return semver.valid(version);
  }

  /**
   * Check if a service version is compatible with client requirements
   * @param {string} serviceVersion - Service version
   * @param {Object} compatibilityInfo - Compatibility information
   * @param {string} clientName - Client name
   * @returns {Object} Compatibility result
   */
  checkClientCompatibility(serviceVersion, compatibilityInfo, clientName) {
    if (!compatibilityInfo || !compatibilityInfo.compatibleClients) {
      return { compatible: true, reason: 'No compatibility constraints defined' };
    }

    const clientRequirement = compatibilityInfo.compatibleClients[clientName];
    if (!clientRequirement) {
      return { compatible: true, reason: 'No specific requirement for this client' };
    }

    // For now, we'll assume the client requirement is a minimum version
    // In practice, you'd need to know the actual client version
    return { 
      compatible: true, 
      reason: `Client must be ${clientRequirement}`,
      requirement: clientRequirement
    };
  }

  /**
   * Validate version compatibility for all services
   * @returns {Object} Validation results
   */
  validateVersions() {
    const results = {
      valid: true,
      invalidVersions: [],
      compatibilityIssues: [],
      warnings: [],
      summary: {
        totalServices: this.services.size,
        servicesWithVersion: 0,
        servicesWithoutVersion: 0,
        compatibilityChecks: 0
      }
    };

    for (const [serviceId, service] of this.services) {
      // Check if service has a valid version
      if (!service.version) {
        results.warnings.push({
          service: serviceId,
          message: 'Service has no version specified',
          type: 'missing-version'
        });
        results.summary.servicesWithoutVersion++;
        continue;
      }

      const parsedVersion = this.parseVersion(service.version);
      if (!parsedVersion) {
        results.valid = false;
        results.invalidVersions.push({
          service: serviceId,
          version: service.version,
          message: 'Invalid semver format'
        });
        continue;
      }

      results.summary.servicesWithVersion++;

      // Check version compatibility
      const compatInfo = this.versionCompatibility[service.version];
      if (compatInfo) {
        results.summary.compatibilityChecks++;

        // Check protocol version compatibility
        if (compatInfo.minProtocolVersion || compatInfo.maxProtocolVersion) {
          results.warnings.push({
            service: serviceId,
            message: `Requires protocol version ${compatInfo.minProtocolVersion || '0.0.0'} - ${compatInfo.maxProtocolVersion || '∞'}`,
            type: 'protocol-constraint'
          });
        }

        // Check client compatibility
        if (service.clients && Array.isArray(service.clients)) {
          for (const client of service.clients) {
            const compatibility = this.checkClientCompatibility(
              service.version,
              compatInfo,
              client
            );

            if (compatibility.requirement) {
              results.warnings.push({
                service: serviceId,
                client: client,
                message: compatibility.reason,
                type: 'client-compatibility'
              });
            }
          }
        }
      }

      // Check dependencies version compatibility
      if (service.dependencies && Array.isArray(service.dependencies)) {
        for (const depId of service.dependencies) {
          const dep = this.services.get(depId);
          if (!dep) continue;

          if (!dep.version) {
            results.warnings.push({
              service: serviceId,
              dependency: depId,
              message: 'Dependency has no version specified',
              type: 'dependency-version-missing'
            });
            continue;
          }

          // Compare major versions for compatibility
          const serviceVer = semver.parse(parsedVersion);
          const depVer = semver.parse(this.parseVersion(dep.version));

          if (serviceVer && depVer) {
            // Warn if dependency has a different major version
            if (serviceVer.major !== depVer.major) {
              results.warnings.push({
                service: serviceId,
                dependency: depId,
                message: `Major version mismatch: ${service.version} depends on ${dep.version}`,
                type: 'major-version-mismatch'
              });
            }

            // Error if service depends on a newer version
            if (semver.gt(depVer.version, serviceVer.version)) {
              results.valid = false;
              results.compatibilityIssues.push({
                service: serviceId,
                dependency: depId,
                serviceVersion: service.version,
                dependencyVersion: dep.version,
                message: 'Service depends on a newer version'
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Generate a compatibility matrix
   * @returns {Object} Compatibility matrix
   */
  generateCompatibilityMatrix() {
    const matrix = {
      services: {},
      clients: new Set(),
      protocolVersions: new Set()
    };

    for (const [serviceId, service] of this.services) {
      const serviceInfo = {
        version: service.version,
        clients: service.clients || [],
        dependencies: {}
      };

      // Add clients to the set
      if (service.clients) {
        service.clients.forEach(client => matrix.clients.add(client));
      }

      // Add dependency versions
      if (service.dependencies) {
        for (const depId of service.dependencies) {
          const dep = this.services.get(depId);
          if (dep) {
            serviceInfo.dependencies[depId] = dep.version;
          }
        }
      }

      // Add protocol version info if available
      const compatInfo = this.versionCompatibility[service.version];
      if (compatInfo) {
        if (compatInfo.minProtocolVersion) {
          matrix.protocolVersions.add(compatInfo.minProtocolVersion);
        }
        if (compatInfo.maxProtocolVersion) {
          matrix.protocolVersions.add(compatInfo.maxProtocolVersion);
        }
      }

      matrix.services[serviceId] = serviceInfo;
    }

    return matrix;
  }

  /**
   * Format validation results for display
   * @param {Object} results - Validation results
   * @returns {string} Formatted string
   */
  formatResults(results) {
    let output = [];

    output.push('Version Validation Results');
    output.push('=' .repeat(50));

    if (results.valid) {
      output.push('✅ All versions are valid and compatible!');
    } else {
      output.push('❌ Version validation failed!');
    }

    output.push('\n📊 Summary:');
    output.push(`   Total services: ${results.summary.totalServices}`);
    output.push(`   With version: ${results.summary.servicesWithVersion}`);
    output.push(`   Without version: ${results.summary.servicesWithoutVersion}`);
    output.push(`   Compatibility checks: ${results.summary.compatibilityChecks}`);

    if (results.invalidVersions.length > 0) {
      output.push('\n❌ Invalid Versions:');
      for (const invalid of results.invalidVersions) {
        output.push(`   ${invalid.service}: "${invalid.version}" - ${invalid.message}`);
      }
    }

    if (results.compatibilityIssues.length > 0) {
      output.push('\n🚫 Compatibility Issues:');
      for (const issue of results.compatibilityIssues) {
        output.push(`   ${issue.service} (${issue.serviceVersion}) → ${issue.dependency} (${issue.dependencyVersion})`);
        output.push(`     ${issue.message}`);
      }
    }

    if (results.warnings.length > 0) {
      output.push('\n⚠️  Warnings:');
      const warningsByType = {};
      
      for (const warning of results.warnings) {
        if (!warningsByType[warning.type]) {
          warningsByType[warning.type] = [];
        }
        warningsByType[warning.type].push(warning);
      }

      for (const [type, warnings] of Object.entries(warningsByType)) {
        output.push(`\n   ${type.replace(/-/g, ' ').toUpperCase()}:`);
        for (const warning of warnings) {
          if (warning.client) {
            output.push(`     ${warning.service} + ${warning.client}: ${warning.message}`);
          } else if (warning.dependency) {
            output.push(`     ${warning.service} → ${warning.dependency}: ${warning.message}`);
          } else {
            output.push(`     ${warning.service}: ${warning.message}`);
          }
        }
      }
    }

    // Generate compatibility matrix summary
    const matrix = this.generateCompatibilityMatrix();
    output.push('\n📋 Compatibility Matrix:');
    output.push(`   Services: ${Object.keys(matrix.services).length}`);
    output.push(`   Supported clients: ${Array.from(matrix.clients).join(', ')}`);
    output.push(`   Protocol versions: ${Array.from(matrix.protocolVersions).join(', ') || 'Not specified'}`);

    return output.join('\n');
  }

  /**
   * Validate a catalog file
   * @param {string} filePath - Path to catalog file
   * @returns {Object} Validation results
   */
  validateFile(filePath) {
    try {
      const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.loadCatalog(catalog);
      return this.validateVersions();
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node version-validator.js <catalog-file>');
    console.log('Example: node version-validator.js ../enhanced-catalog.json');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const validator = new VersionValidator();

  console.log(`Validating versions in: ${filePath}\n`);

  const results = validator.validateFile(filePath);
  
  if (results.error) {
    console.error(`Error: ${results.error}`);
    process.exit(1);
  }

  console.log(validator.formatResults(results));
  process.exit(results.valid ? 0 : 1);
}

module.exports = VersionValidator;