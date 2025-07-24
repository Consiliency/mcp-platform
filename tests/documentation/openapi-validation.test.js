const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv = require('ajv');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

describe('OpenAPI Specification Validation', () => {
  const openApiPath = path.join(__dirname, '../../docs/api/openapi.yaml');
  let apiSpec;
  let ajv;

  beforeAll(async () => {
    // Initialize AJV for JSON Schema validation
    ajv = new Ajv({ 
      allErrors: true,
      strict: false
    });
  });

  test('OpenAPI spec file should exist', async () => {
    await expect(fs.access(openApiPath)).resolves.not.toThrow();
  });

  test('OpenAPI spec should be valid YAML', async () => {
    const yamlContent = await fs.readFile(openApiPath, 'utf8');
    expect(() => yaml.load(yamlContent)).not.toThrow();
    apiSpec = yaml.load(yamlContent);
  });

  test('OpenAPI spec should be valid according to OpenAPI 3.0 schema', async () => {
    // Validate and dereference the API specification
    const api = await SwaggerParser.validate(openApiPath);
    expect(api).toBeDefined();
    expect(api.openapi).toBe('3.0.3');
  });

  test('OpenAPI spec should have required metadata', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    
    // Check info section
    expect(api.info).toBeDefined();
    expect(api.info.title).toBeDefined();
    expect(api.info.version).toBeDefined();
    expect(api.info.description).toBeDefined();
    
    // Check servers
    expect(api.servers).toBeDefined();
    expect(api.servers.length).toBeGreaterThan(0);
    
    // Check paths
    expect(api.paths).toBeDefined();
    expect(Object.keys(api.paths).length).toBeGreaterThan(0);
  });

  test('All paths should have proper HTTP methods', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    
    Object.entries(api.paths).forEach(([path, pathItem]) => {
      const methods = Object.keys(pathItem).filter(key => validMethods.includes(key));
      expect(methods.length).toBeGreaterThan(0);
      
      methods.forEach(method => {
        const operation = pathItem[method];
        expect(operation.summary).toBeDefined();
        expect(operation.operationId).toBeDefined();
        expect(operation.responses).toBeDefined();
      });
    });
  });

  test('All responses should have valid status codes', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    const validStatusCodes = /^[1-5]\d{2}$|^default$/;
    
    Object.entries(api.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        if (operation.responses) {
          Object.keys(operation.responses).forEach(statusCode => {
            expect(statusCode).toMatch(validStatusCodes);
          });
        }
      });
    });
  });

  test('All schema references should be valid', async () => {
    // This will throw if any $ref is invalid
    const api = await SwaggerParser.dereference(openApiPath);
    expect(api).toBeDefined();
  });

  test('Security schemes should be properly defined', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    
    if (api.components && api.components.securitySchemes) {
      expect(Object.keys(api.components.securitySchemes).length).toBeGreaterThan(0);
      
      Object.entries(api.components.securitySchemes).forEach(([name, scheme]) => {
        expect(scheme.type).toBeDefined();
        expect(['apiKey', 'http', 'oauth2', 'openIdConnect']).toContain(scheme.type);
      });
    }
  });

  test('All required properties in schemas should be defined', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    
    if (api.components && api.components.schemas) {
      Object.entries(api.components.schemas).forEach(([schemaName, schema]) => {
        if (schema.required && schema.properties) {
          schema.required.forEach(requiredProp => {
            expect(schema.properties[requiredProp]).toBeDefined();
          });
        }
      });
    }
  });

  test('All examples should be valid according to their schemas', async () => {
    const api = await SwaggerParser.dereference(openApiPath);
    
    Object.entries(api.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        // Check request body examples
        if (operation.requestBody && operation.requestBody.content) {
          Object.entries(operation.requestBody.content).forEach(([contentType, mediaType]) => {
            if (mediaType.example && mediaType.schema) {
              const validate = ajv.compile(mediaType.schema);
              const valid = validate(mediaType.example);
              if (!valid) {
                console.error(`Invalid example in ${method.toUpperCase()} ${path}:`, validate.errors);
              }
              expect(valid).toBe(true);
            }
          });
        }
        
        // Check response examples
        if (operation.responses) {
          Object.entries(operation.responses).forEach(([statusCode, response]) => {
            if (response.content) {
              Object.entries(response.content).forEach(([contentType, mediaType]) => {
                if (mediaType.example && mediaType.schema) {
                  const validate = ajv.compile(mediaType.schema);
                  const valid = validate(mediaType.example);
                  if (!valid) {
                    console.error(`Invalid response example in ${method.toUpperCase()} ${path} (${statusCode}):`, validate.errors);
                  }
                  expect(valid).toBe(true);
                }
              });
            }
          });
        }
      });
    });
  });

  test('API paths should follow RESTful conventions', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    const pathPattern = /^\/[a-z0-9-]+(\/{[a-zA-Z]+})?([\/a-z0-9-]+(\/{[a-zA-Z]+})?)*$/;
    
    Object.keys(api.paths).forEach(path => {
      expect(path).toMatch(pathPattern);
      
      // Check for proper resource naming
      const segments = path.split('/').filter(s => s && !s.includes('{'));
      segments.forEach(segment => {
        // Resources should be plural nouns
        expect(segment).toMatch(/^[a-z]+s?$/);
      });
    });
  });

  test('All operations should have appropriate tags', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    const definedTags = api.tags ? api.tags.map(t => t.name) : [];
    
    Object.entries(api.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        if (operation.tags) {
          operation.tags.forEach(tag => {
            expect(definedTags).toContain(tag);
          });
        }
      });
    });
  });

  test('Parameter names should be consistent across the API', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    const parameterNames = new Map();
    
    Object.entries(api.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        if (operation.parameters) {
          operation.parameters.forEach(param => {
            if (!parameterNames.has(param.name)) {
              parameterNames.set(param.name, []);
            }
            parameterNames.get(param.name).push({
              path,
              method,
              in: param.in,
              schema: param.schema
            });
          });
        }
      });
    });
    
    // Check that parameters with the same name have consistent schemas
    parameterNames.forEach((occurrences, paramName) => {
      if (occurrences.length > 1) {
        const firstSchema = JSON.stringify(occurrences[0].schema);
        occurrences.forEach(occurrence => {
          expect(JSON.stringify(occurrence.schema)).toBe(firstSchema);
        });
      }
    });
  });

  test('Content types should be consistent', async () => {
    const api = await SwaggerParser.parse(openApiPath);
    const contentTypes = new Set();
    
    Object.entries(api.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        // Check request content types
        if (operation.requestBody && operation.requestBody.content) {
          Object.keys(operation.requestBody.content).forEach(ct => contentTypes.add(ct));
        }
        
        // Check response content types
        if (operation.responses) {
          Object.values(operation.responses).forEach(response => {
            if (response.content) {
              Object.keys(response.content).forEach(ct => contentTypes.add(ct));
            }
          });
        }
      });
    });
    
    // Should primarily use JSON
    expect(contentTypes.has('application/json')).toBe(true);
  });
});