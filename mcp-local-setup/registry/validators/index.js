/**
 * MCP Registry Validators
 * 
 * This module exports all available validators for the MCP service registry.
 */

const SchemaValidator = require('./schema-validator');
const DependencyValidator = require('./dependency-validator');
const VersionValidator = require('./version-validator');

/**
 * Run all validators on a catalog file
 * @param {string} filePath - Path to catalog file
 * @returns {Object} Combined validation results
 */
function validateAll(filePath) {
  const results = {
    valid: true,
    schema: null,
    dependencies: null,
    versions: null,
    summary: {
      passed: [],
      failed: []
    }
  };

  // Run schema validation
  console.log('Running schema validation...');
  const schemaValidator = new SchemaValidator();
  results.schema = schemaValidator.validateFile(filePath);
  
  if (results.schema.valid) {
    results.summary.passed.push('schema');
  } else {
    results.summary.failed.push('schema');
    results.valid = false;
  }

  // Run dependency validation
  console.log('Running dependency validation...');
  const depValidator = new DependencyValidator();
  results.dependencies = depValidator.validateFile(filePath);
  
  if (results.dependencies.valid) {
    results.summary.passed.push('dependencies');
  } else {
    results.summary.failed.push('dependencies');
    results.valid = false;
  }

  // Run version validation
  console.log('Running version validation...');
  const versionValidator = new VersionValidator();
  results.versions = versionValidator.validateFile(filePath);
  
  if (results.versions.valid) {
    results.summary.passed.push('versions');
  } else {
    results.summary.failed.push('versions');
    results.valid = false;
  }

  return results;
}

/**
 * Format combined validation results
 * @param {Object} results - Combined validation results
 * @returns {string} Formatted output
 */
function formatResults(results) {
  let output = [];
  
  output.push('=' .repeat(60));
  output.push('MCP REGISTRY VALIDATION RESULTS');
  output.push('=' .repeat(60));
  
  if (results.valid) {
    output.push('\n✅ ALL VALIDATIONS PASSED!\n');
  } else {
    output.push('\n❌ VALIDATION FAILED!\n');
  }
  
  output.push('Summary:');
  output.push(`  Passed: ${results.summary.passed.join(', ') || 'none'}`);
  output.push(`  Failed: ${results.summary.failed.join(', ') || 'none'}`);
  
  output.push('\n' + '-'.repeat(60));
  
  // Schema validation results
  output.push('\n📋 SCHEMA VALIDATION:');
  if (results.schema.valid) {
    output.push('   ✅ Passed');
    if (results.schema.totalServices !== undefined) {
      output.push(`   Total services: ${results.schema.totalServices}`);
    }
  } else {
    output.push('   ❌ Failed');
    if (results.schema.errors) {
      for (const [service, errors] of Object.entries(results.schema.errors)) {
        output.push(`   Service: ${service}`);
        for (const error of errors) {
          output.push(`     - ${error.message || error}`);
        }
      }
    }
  }
  
  // Dependency validation results
  output.push('\n🔗 DEPENDENCY VALIDATION:');
  if (results.dependencies.valid) {
    output.push('   ✅ Passed');
  } else {
    output.push('   ❌ Failed');
    if (results.dependencies.circularDependencies && results.dependencies.circularDependencies.length > 0) {
      output.push('   Circular dependencies found:');
      for (const circular of results.dependencies.circularDependencies) {
        output.push(`     - ${circular.services.join(' → ')}`);
      }
    }
    if (results.dependencies.missingDependencies && results.dependencies.missingDependencies.length > 0) {
      output.push('   Missing dependencies:');
      for (const missing of results.dependencies.missingDependencies) {
        output.push(`     - ${missing.service} → ${missing.missingDependency}`);
      }
    }
  }
  
  // Version validation results
  output.push('\n🔢 VERSION VALIDATION:');
  if (results.versions.valid) {
    output.push('   ✅ Passed');
    if (results.versions.summary) {
      output.push(`   Services with version: ${results.versions.summary.servicesWithVersion}/${results.versions.summary.totalServices}`);
    }
  } else {
    output.push('   ❌ Failed');
    if (results.versions.invalidVersions && results.versions.invalidVersions.length > 0) {
      output.push('   Invalid versions:');
      for (const invalid of results.versions.invalidVersions) {
        output.push(`     - ${invalid.service}: ${invalid.version}`);
      }
    }
  }
  
  output.push('\n' + '=' .repeat(60));
  
  return output.join('\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node index.js <catalog-file>');
    console.log('Example: node index.js ../enhanced-catalog.json');
    process.exit(1);
  }
  
  const filePath = require('path').resolve(args[0]);
  console.log(`Validating catalog: ${filePath}\n`);
  
  const results = validateAll(filePath);
  console.log(formatResults(results));
  
  process.exit(results.valid ? 0 : 1);
}

module.exports = {
  SchemaValidator,
  DependencyValidator,
  VersionValidator,
  validateAll,
  formatResults
};