#!/usr/bin/env node

/**
 * Schema Validator for MCP Service Definitions
 * Validates service definitions against the enhanced-service.schema.json
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class SchemaValidator {
  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(this.ajv);
    
    // Load the schema
    const schemaPath = path.join(__dirname, '../schemas/enhanced-service.schema.json');
    this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    this.validate = this.ajv.compile(this.schema);
  }

  /**
   * Validate a single service definition
   * @param {Object} service - Service definition object
   * @returns {Object} Validation result with valid flag and errors array
   */
  validateService(service) {
    const valid = this.validate(service);
    return {
      valid,
      errors: valid ? [] : this.validate.errors
    };
  }

  /**
   * Validate all services in a catalog
   * @param {Object} catalog - Complete catalog object
   * @returns {Object} Validation results with overall status and per-service errors
   */
  validateCatalog(catalog) {
    const results = {
      valid: true,
      totalServices: 0,
      validServices: 0,
      invalidServices: 0,
      errors: {}
    };

    if (!catalog.servers || !Array.isArray(catalog.servers)) {
      results.valid = false;
      results.errors.catalog = ['Catalog must have a "servers" array'];
      return results;
    }

    results.totalServices = catalog.servers.length;

    for (const service of catalog.servers) {
      const validation = this.validateService(service);
      
      if (validation.valid) {
        results.validServices++;
      } else {
        results.valid = false;
        results.invalidServices++;
        results.errors[service.id || 'unknown'] = validation.errors.map(err => ({
          path: err.instancePath,
          message: err.message,
          params: err.params
        }));
      }
    }

    return results;
  }

  /**
   * Validate a catalog file
   * @param {string} filePath - Path to catalog file
   * @returns {Object} Validation results
   */
  validateFile(filePath) {
    try {
      const catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return this.validateCatalog(catalog);
    } catch (error) {
      return {
        valid: false,
        errors: {
          file: [`Error reading or parsing file: ${error.message}`]
        }
      };
    }
  }

  /**
   * Format validation errors for display
   * @param {Object} results - Validation results
   * @returns {string} Formatted error string
   */
  formatErrors(results) {
    let output = [];
    
    if (results.valid) {
      output.push('✅ All services validated successfully!');
      output.push(`   Total services: ${results.totalServices}`);
    } else {
      output.push('❌ Validation failed!');
      output.push(`   Valid services: ${results.validServices}/${results.totalServices}`);
      output.push('');
      output.push('Errors:');
      
      for (const [serviceId, errors] of Object.entries(results.errors)) {
        output.push(`\n  Service: ${serviceId}`);
        for (const error of errors) {
          output.push(`    - ${error.path || 'root'}: ${error.message}`);
          if (error.params && Object.keys(error.params).length > 0) {
            output.push(`      params: ${JSON.stringify(error.params)}`);
          }
        }
      }
    }
    
    return output.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node schema-validator.js <catalog-file>');
    console.log('Example: node schema-validator.js ../enhanced-catalog.json');
    process.exit(1);
  }
  
  const filePath = path.resolve(args[0]);
  const validator = new SchemaValidator();
  
  console.log(`Validating: ${filePath}\n`);
  
  const results = validator.validateFile(filePath);
  console.log(validator.formatErrors(results));
  
  process.exit(results.valid ? 0 : 1);
}

module.exports = SchemaValidator;