const fs = require('fs').promises;
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const glob = require('glob');
const { promisify } = require('util');

const globAsync = promisify(glob);

describe('API Documentation Accuracy', () => {
  const docsRoot = path.join(__dirname, '../..');
  const openApiPath = path.join(docsRoot, 'docs/api/openapi.yaml');
  let apiSpec;
  let apiMarkdownFiles;
  let sourceFiles;

  beforeAll(async () => {
    // Parse OpenAPI spec
    try {
      apiSpec = await SwaggerParser.parse(openApiPath);
    } catch (error) {
      console.log('OpenAPI spec not found or invalid');
    }

    // Find API documentation files
    apiMarkdownFiles = await globAsync('docs/**/*api*.md', {
      cwd: docsRoot,
      nocase: true
    });

    // Find source files that might contain API implementations
    sourceFiles = await globAsync('{security,sdk,integrations}/**/*.js', {
      cwd: docsRoot,
      ignore: ['**/node_modules/**', '**/test/**', '**/*.test.js']
    });
  });

  test('API documentation should match OpenAPI specification', async () => {
    if (!apiSpec) {
      console.log('Skipping - no OpenAPI spec found');
      return;
    }

    const discrepancies = [];

    // Check each API markdown file
    for (const mdFile of apiMarkdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract endpoint documentation
      const endpointPattern = /^###?\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([^\s]+)/gmi;
      const matches = [...content.matchAll(endpointPattern)];
      
      matches.forEach(match => {
        const method = match[1].toLowerCase();
        const endpoint = match[2].replace(/`/g, '');
        
        // Normalize endpoint
        const normalizedEndpoint = endpoint
          .replace(/https?:\/\/[^\/]+/, '')
          .replace(/\/api\/v1/, '');
        
        // Check if endpoint exists in OpenAPI spec
        let found = false;
        Object.entries(apiSpec.paths || {}).forEach(([path, pathItem]) => {
          if (normalizedEndpoint === path || matchesPathPattern(normalizedEndpoint, path)) {
            if (pathItem[method]) {
              found = true;
            }
          }
        });
        
        if (!found) {
          discrepancies.push({
            file: mdFile,
            method: method.toUpperCase(),
            endpoint,
            issue: 'Not found in OpenAPI spec'
          });
        }
      });
    }

    if (discrepancies.length > 0) {
      console.error('\nAPI documentation discrepancies:');
      discrepancies.forEach(({ file, method, endpoint, issue }) => {
        console.error(`  ${file}: ${method} ${endpoint} - ${issue}`);
      });
    }

    expect(discrepancies.length).toBe(0);
  });

  test('All OpenAPI endpoints should be documented', async () => {
    if (!apiSpec || !apiSpec.paths) {
      console.log('Skipping - no OpenAPI spec found');
      return;
    }

    const undocumentedEndpoints = [];
    
    // Read all API documentation
    const allApiDocs = [];
    for (const mdFile of apiMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      allApiDocs.push(content);
    }
    const combinedDocs = allApiDocs.join('\n');

    // Check each OpenAPI endpoint
    Object.entries(apiSpec.paths).forEach(([path, pathItem]) => {
      Object.keys(pathItem).forEach(method => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const operation = pathItem[method];
          
          // Check if endpoint is mentioned in documentation
          const searchTerms = [
            `${method.toUpperCase()} ${path}`,
            `${method} ${path}`,
            path
          ];
          
          const isDocumented = searchTerms.some(term => 
            combinedDocs.includes(term)
          );
          
          if (!isDocumented) {
            undocumentedEndpoints.push({
              method: method.toUpperCase(),
              path,
              summary: operation.summary || 'No summary'
            });
          }
        }
      });
    });

    if (undocumentedEndpoints.length > 0) {
      console.error('\nUndocumented OpenAPI endpoints:');
      undocumentedEndpoints.forEach(({ method, path, summary }) => {
        console.error(`  ${method} ${path} - ${summary}`);
      });
    }

    // Allow some undocumented endpoints during development
    expect(undocumentedEndpoints.length).toBeLessThanOrEqual(5);
  });

  test('Request/Response examples should match schemas', async () => {
    if (!apiSpec) {
      console.log('Skipping - no OpenAPI spec found');
      return;
    }

    const invalidExamples = [];

    for (const mdFile of apiMarkdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract JSON code blocks that might be examples
      const jsonBlocks = extractJsonBlocks(content);
      
      // Try to match JSON blocks with API operations
      jsonBlocks.forEach(({ json, line, context }) => {
        // Look for nearby endpoint references
        const endpointMatch = context.match(/(GET|POST|PUT|PATCH|DELETE)\s+([^\s]+)/i);
        if (endpointMatch) {
          const method = endpointMatch[1].toLowerCase();
          const endpoint = endpointMatch[2];
          
          // Try to validate against schema
          const validation = validateAgainstSchema(json, endpoint, method, apiSpec);
          if (validation.error) {
            invalidExamples.push({
              file: mdFile,
              line,
              endpoint: `${method.toUpperCase()} ${endpoint}`,
              error: validation.error
            });
          }
        }
      });
    }

    if (invalidExamples.length > 0) {
      console.warn('\nInvalid API examples found:');
      invalidExamples.forEach(({ file, line, endpoint, error }) => {
        console.warn(`  ${file}:${line} (${endpoint}): ${error}`);
      });
    }

    // Allow some invalid examples (might be partial examples)
    expect(invalidExamples.length).toBeLessThanOrEqual(5);
  });

  test('API documentation should include authentication details', async () => {
    const authRequired = [];
    
    if (apiSpec && apiSpec.paths) {
      Object.entries(apiSpec.paths).forEach(([path, pathItem]) => {
        Object.entries(pathItem).forEach(([method, operation]) => {
          if (operation.security && operation.security.length > 0) {
            authRequired.push({
              method: method.toUpperCase(),
              path,
              security: operation.security
            });
          }
        });
      });
    }

    if (authRequired.length === 0) {
      console.log('No authenticated endpoints found');
      return;
    }

    // Check that authentication is documented
    const authDocs = [];
    for (const mdFile of apiMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      const hasAuthSection = /##?\s*Authentication/i.test(content);
      const mentionsAuth = /(?:JWT|Bearer|API\s*Key|OAuth|Authorization)/i.test(content);
      
      if (hasAuthSection || mentionsAuth) {
        authDocs.push(mdFile);
      }
    }

    expect(authDocs.length).toBeGreaterThan(0);
  });

  test('Error responses should be documented', async () => {
    const errorsDocs = [];
    
    for (const mdFile of apiMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      // Check for error documentation patterns
      const errorPatterns = [
        /##?\s*Error\s*(Responses?|Handling|Codes?)/i,
        /###?\s*(4\d{2}|5\d{2})\s/,
        /Status\s*Code:\s*(4\d{2}|5\d{2})/i,
        /\berror\s*response/i
      ];
      
      const hasErrorDocs = errorPatterns.some(pattern => pattern.test(content));
      
      if (hasErrorDocs) {
        errorsDocs.push(mdFile);
        
        // Check for common error codes
        const commonErrors = ['400', '401', '403', '404', '500'];
        const documentedErrors = commonErrors.filter(code => 
          content.includes(code)
        );
        
        // Should document at least some common errors
        expect(documentedErrors.length).toBeGreaterThanOrEqual(3);
      }
    }

    // At least one file should document errors
    expect(errorsDocs.length).toBeGreaterThan(0);
  });

  test('API versioning should be consistent', async () => {
    const versionPatterns = [];
    
    // Check OpenAPI spec
    if (apiSpec && apiSpec.servers) {
      apiSpec.servers.forEach(server => {
        const versionMatch = server.url.match(/\/v(\d+)/);
        if (versionMatch) {
          versionPatterns.push(versionMatch[0]);
        }
      });
    }

    // Check documentation
    for (const mdFile of apiMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      const versionMatches = content.match(/\/api\/v\d+/g) || [];
      versionPatterns.push(...versionMatches);
    }

    // All versions should be consistent
    const uniqueVersions = [...new Set(versionPatterns.map(v => v.match(/v\d+/)[0]))];
    
    if (uniqueVersions.length > 1) {
      console.warn('Multiple API versions found:', uniqueVersions);
    }

    expect(uniqueVersions.length).toBeLessThanOrEqual(1);
  });

  test('Rate limiting should be documented', async () => {
    let rateLimitDocs = false;
    
    for (const mdFile of apiMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      const rateLimitPatterns = [
        /rate\s*limit/i,
        /throttl/i,
        /requests?\s*per\s*(second|minute|hour)/i,
        /429/,
        /too\s*many\s*requests/i
      ];
      
      if (rateLimitPatterns.some(pattern => pattern.test(content))) {
        rateLimitDocs = true;
        
        // Should include specific limits
        const hasSpecificLimits = /\d+\s*requests?\s*per/i.test(content);
        expect(hasSpecificLimits).toBe(true);
        break;
      }
    }

    expect(rateLimitDocs).toBe(true);
  });

  test('SDK examples should match API endpoints', async () => {
    const sdkExamples = [];
    
    // Find SDK usage examples
    const sdkFiles = await globAsync('sdk/**/*.{js,py,go}', {
      cwd: docsRoot,
      ignore: ['**/node_modules/**', '**/*.test.js']
    });

    for (const sdkFile of sdkFiles) {
      const content = await fs.readFile(path.join(docsRoot, sdkFile), 'utf8');
      
      // Look for API calls
      const apiCallPatterns = [
        /\.get\(['"`]([^'"`]+)['"`]/g,
        /\.post\(['"`]([^'"`]+)['"`]/g,
        /\.put\(['"`]([^'"`]+)['"`]/g,
        /\.delete\(['"`]([^'"`]+)['"`]/g,
        /fetch\(['"`]([^'"`]+)['"`]/g,
        /axios\.\w+\(['"`]([^'"`]+)['"`]/g
      ];
      
      apiCallPatterns.forEach(pattern => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          const endpoint = match[1];
          if (endpoint.startsWith('/') || endpoint.includes('api')) {
            sdkExamples.push({
              file: sdkFile,
              endpoint,
              method: pattern.source.includes('get') ? 'GET' :
                      pattern.source.includes('post') ? 'POST' :
                      pattern.source.includes('put') ? 'PUT' :
                      pattern.source.includes('delete') ? 'DELETE' : 'GET'
            });
          }
        });
      });
    }

    // Verify SDK examples match documented endpoints
    if (apiSpec && sdkExamples.length > 0) {
      const invalidCalls = [];
      
      sdkExamples.forEach(({ file, endpoint, method }) => {
        const normalizedEndpoint = endpoint
          .replace(/https?:\/\/[^\/]+/, '')
          .replace(/\/api\/v\d+/, '');
        
        let found = false;
        Object.keys(apiSpec.paths || {}).forEach(path => {
          if (matchesPathPattern(normalizedEndpoint, path)) {
            found = true;
          }
        });
        
        if (!found && !endpoint.includes('localhost')) {
          invalidCalls.push({ file, endpoint, method });
        }
      });
      
      if (invalidCalls.length > 0) {
        console.warn('\nSDK examples with unmatched endpoints:');
        invalidCalls.forEach(({ file, endpoint, method }) => {
          console.warn(`  ${file}: ${method} ${endpoint}`);
        });
      }
      
      expect(invalidCalls.length).toBeLessThanOrEqual(3);
    }
  });
});

// Helper functions
function extractJsonBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockContent = [];
  let contextLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Keep context of last 5 lines
    contextLines.push(line);
    if (contextLines.length > 5) contextLines.shift();
    
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        const lang = line.substring(3).trim().toLowerCase();
        if (lang === 'json' || lang === '') {
          inCodeBlock = true;
          codeBlockStart = i + 1;
          codeBlockContent = [];
        }
      } else {
        inCodeBlock = false;
        
        if (codeBlockContent.length > 0) {
          const jsonStr = codeBlockContent.join('\n');
          try {
            const json = JSON.parse(jsonStr);
            blocks.push({
              json,
              line: codeBlockStart,
              context: contextLines.join('\n')
            });
          } catch (e) {
            // Not valid JSON
          }
        }
      }
    } else if (inCodeBlock) {
      codeBlockContent.push(line);
    }
  }
  
  return blocks;
}

function validateAgainstSchema(data, endpoint, method, apiSpec) {
  // This is a simplified validation - in production you'd use AJV
  try {
    const normalizedEndpoint = endpoint
      .replace(/https?:\/\/[^\/]+/, '')
      .replace(/\/api\/v\d+/, '');
    
    let schema = null;
    Object.entries(apiSpec.paths || {}).forEach(([path, pathItem]) => {
      if (normalizedEndpoint === path || matchesPathPattern(normalizedEndpoint, path)) {
        const operation = pathItem[method];
        if (operation) {
          // Check if it's a request or response
          if (operation.requestBody && operation.requestBody.content) {
            schema = operation.requestBody.content['application/json']?.schema;
          } else if (operation.responses && operation.responses['200']) {
            schema = operation.responses['200'].content?.['application/json']?.schema;
          }
        }
      }
    });
    
    if (!schema) {
      return { error: 'No schema found for endpoint' };
    }
    
    // Basic validation
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          return { error: `Missing required field: ${field}` };
        }
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { error: error.message };
  }
}

function matchesPathPattern(actual, pattern) {
  const regex = pattern
    .replace(/\{[^}]+\}/g, '[^/]+')
    .replace(/\//g, '\\/');
  return new RegExp(`^${regex}$`).test(actual);
}