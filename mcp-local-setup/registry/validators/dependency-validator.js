#!/usr/bin/env node

/**
 * Dependency Validator for MCP Services
 * Checks for circular dependencies and validates dependency relationships
 */

const fs = require('fs');
const path = require('path');

class DependencyValidator {
  constructor() {
    this.services = new Map();
    this.visited = new Set();
    this.recursionStack = new Set();
  }

  /**
   * Load services from catalog
   * @param {Object} catalog - Catalog object
   */
  loadCatalog(catalog) {
    this.services.clear();
    
    if (!catalog.servers || !Array.isArray(catalog.servers)) {
      throw new Error('Invalid catalog: missing servers array');
    }
    
    for (const service of catalog.servers) {
      this.services.set(service.id, {
        ...service,
        dependencies: service.dependencies || []
      });
    }
  }

  /**
   * Detect circular dependencies using DFS
   * @param {string} serviceId - Service ID to start from
   * @param {Array} path - Current path for error reporting
   * @returns {Object|null} Circular dependency info or null
   */
  detectCircularDependency(serviceId, path = []) {
    if (!this.services.has(serviceId)) {
      return {
        type: 'missing',
        service: serviceId,
        path: [...path, serviceId]
      };
    }

    if (this.recursionStack.has(serviceId)) {
      return {
        type: 'circular',
        service: serviceId,
        path: [...path, serviceId]
      };
    }

    if (this.visited.has(serviceId)) {
      return null;
    }

    this.visited.add(serviceId);
    this.recursionStack.add(serviceId);
    path.push(serviceId);

    const service = this.services.get(serviceId);
    for (const dep of service.dependencies) {
      const result = this.detectCircularDependency(dep, [...path]);
      if (result) {
        return result;
      }
    }

    this.recursionStack.delete(serviceId);
    return null;
  }

  /**
   * Validate all dependencies in the catalog
   * @returns {Object} Validation results
   */
  validateDependencies() {
    const results = {
      valid: true,
      circularDependencies: [],
      missingDependencies: [],
      dependencyGraph: {},
      warnings: []
    };

    // Reset state
    this.visited.clear();
    this.recursionStack.clear();

    // Check each service for circular dependencies
    for (const [serviceId, service] of this.services) {
      const issue = this.detectCircularDependency(serviceId);
      
      if (issue) {
        results.valid = false;
        if (issue.type === 'circular') {
          // Find the cycle in the path
          const cycleStart = issue.path.indexOf(issue.service);
          const cycle = issue.path.slice(cycleStart);
          
          // Only add unique cycles
          const cycleKey = cycle.sort().join('->');
          const existingCycle = results.circularDependencies.find(c => 
            c.services.sort().join('->') === cycleKey
          );
          
          if (!existingCycle) {
            results.circularDependencies.push({
              services: cycle.slice(0, -1), // Remove duplicate last element
              path: issue.path
            });
          }
        } else if (issue.type === 'missing') {
          results.missingDependencies.push({
            service: issue.path[issue.path.length - 2],
            missingDependency: issue.service,
            path: issue.path
          });
        }
      }

      // Build dependency graph
      results.dependencyGraph[serviceId] = service.dependencies;
    }

    // Add warnings for services with many dependencies
    for (const [serviceId, service] of this.services) {
      if (service.dependencies.length > 5) {
        results.warnings.push({
          service: serviceId,
          message: `Service has ${service.dependencies.length} dependencies, consider refactoring`,
          type: 'high-dependency-count'
        });
      }
    }

    // Check for orphaned services (no dependents and no dependencies)
    const servicesWithDependents = new Set();
    for (const [_, service] of this.services) {
      for (const dep of service.dependencies) {
        servicesWithDependents.add(dep);
      }
    }

    for (const [serviceId, service] of this.services) {
      if (service.dependencies.length === 0 && !servicesWithDependents.has(serviceId)) {
        results.warnings.push({
          service: serviceId,
          message: 'Service has no dependencies and no dependents',
          type: 'orphaned'
        });
      }
    }

    return results;
  }

  /**
   * Get the dependency order for starting services
   * @returns {Array} Array of service IDs in dependency order
   */
  getStartupOrder() {
    const order = [];
    const visited = new Set();
    const temp = new Set();

    const visit = (serviceId) => {
      if (temp.has(serviceId)) {
        throw new Error(`Circular dependency detected at ${serviceId}`);
      }
      if (visited.has(serviceId)) {
        return;
      }

      temp.add(serviceId);
      
      const service = this.services.get(serviceId);
      if (service) {
        for (const dep of service.dependencies) {
          if (this.services.has(dep)) {
            visit(dep);
          }
        }
      }

      temp.delete(serviceId);
      visited.add(serviceId);
      order.push(serviceId);
    };

    for (const serviceId of this.services.keys()) {
      if (!visited.has(serviceId)) {
        visit(serviceId);
      }
    }

    return order;
  }

  /**
   * Format validation results for display
   * @param {Object} results - Validation results
   * @returns {string} Formatted string
   */
  formatResults(results) {
    let output = [];

    if (results.valid) {
      output.push('✅ All dependencies validated successfully!');
    } else {
      output.push('❌ Dependency validation failed!');
    }

    if (results.circularDependencies.length > 0) {
      output.push('\n🔄 Circular Dependencies:');
      for (const circular of results.circularDependencies) {
        output.push(`   ${circular.services.join(' → ')} → ${circular.services[0]}`);
      }
    }

    if (results.missingDependencies.length > 0) {
      output.push('\n❓ Missing Dependencies:');
      for (const missing of results.missingDependencies) {
        output.push(`   Service "${missing.service}" depends on missing service "${missing.missingDependency}"`);
      }
    }

    if (results.warnings.length > 0) {
      output.push('\n⚠️  Warnings:');
      for (const warning of results.warnings) {
        output.push(`   ${warning.service}: ${warning.message}`);
      }
    }

    try {
      const order = this.getStartupOrder();
      output.push('\n📋 Recommended startup order:');
      output.push('   ' + order.join(' → '));
    } catch (error) {
      output.push('\n❌ Cannot determine startup order due to circular dependencies');
    }

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
      return this.validateDependencies();
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
    console.log('Usage: node dependency-validator.js <catalog-file>');
    console.log('Example: node dependency-validator.js ../enhanced-catalog.json');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const validator = new DependencyValidator();

  console.log(`Validating dependencies in: ${filePath}\n`);

  const results = validator.validateFile(filePath);
  
  if (results.error) {
    console.error(`Error: ${results.error}`);
    process.exit(1);
  }

  console.log(validator.formatResults(results));
  process.exit(results.valid ? 0 : 1);
}

module.exports = DependencyValidator;