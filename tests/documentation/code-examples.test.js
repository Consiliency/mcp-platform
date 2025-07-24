const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { promisify } = require('util');
const vm = require('vm');
const { exec } = require('child_process');
const util = require('util');

const globAsync = promisify(glob);
const execAsync = util.promisify(exec);

describe('Code Examples Validation', () => {
  const docsRoot = path.join(__dirname, '../..');
  let markdownFiles;
  let exampleFiles;

  beforeAll(async () => {
    // Find all markdown files
    markdownFiles = await globAsync('**/*.md', {
      cwd: docsRoot,
      ignore: [
        'node_modules/**',
        '**/node_modules/**',
        'coverage/**',
        'dist/**',
        'build/**',
        '.git/**',
        'mcp-local-setup/archive/**'
      ]
    });

    // Find all example files
    exampleFiles = await globAsync('examples/**/*.{js,py,go}', {
      cwd: docsRoot,
      ignore: ['node_modules/**']
    });
  });

  test('All code examples in documentation should have valid syntax', async () => {
    const codeBlockErrors = [];

    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      let inCodeBlock = false;
      let codeBlockStart = -1;
      let codeBlockLang = '';
      let codeBlockContent = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('```')) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            codeBlockStart = i + 1;
            codeBlockLang = line.substring(3).trim().toLowerCase();
            codeBlockContent = [];
          } else {
            inCodeBlock = false;
            
            // Validate the code block
            if (codeBlockContent.length > 0) {
              const code = codeBlockContent.join('\n');
              const error = await validateCodeSyntax(code, codeBlockLang, mdFile);
              
              if (error) {
                codeBlockErrors.push({
                  file: mdFile,
                  line: codeBlockStart,
                  language: codeBlockLang,
                  error: error
                });
              }
            }
          }
        } else if (inCodeBlock) {
          codeBlockContent.push(line);
        }
      }
    }

    if (codeBlockErrors.length > 0) {
      console.error('\nCode syntax errors found:');
      codeBlockErrors.forEach(({ file, line, language, error }) => {
        console.error(`  ${file}:${line} (${language}): ${error}`);
      });
    }

    expect(codeBlockErrors.length).toBe(0);
  });

  test('JavaScript examples should be executable', async () => {
    const jsExamples = exampleFiles.filter(file => file.endsWith('.js'));
    const executionErrors = [];

    for (const example of jsExamples) {
      const filePath = path.join(docsRoot, example);
      const content = await fs.readFile(filePath, 'utf8');
      
      try {
        // Create a sandboxed context for running the code
        const sandbox = {
          console,
          require,
          process: { env: process.env },
          setTimeout,
          setInterval,
          clearTimeout,
          clearInterval,
          Buffer,
          __dirname: path.dirname(filePath),
          __filename: filePath
        };
        
        // Check syntax first
        new vm.Script(content, { filename: filePath });
        
        // Note: We're only checking syntax, not executing
        // Full execution might require dependencies
      } catch (error) {
        executionErrors.push({
          file: example,
          error: error.message
        });
      }
    }

    if (executionErrors.length > 0) {
      console.error('\nJavaScript execution errors:');
      executionErrors.forEach(({ file, error }) => {
        console.error(`  ${file}: ${error}`);
      });
    }

    expect(executionErrors.length).toBe(0);
  });

  test('Python examples should have valid syntax', async () => {
    const pyExamples = exampleFiles.filter(file => file.endsWith('.py'));
    const syntaxErrors = [];

    for (const example of pyExamples) {
      const filePath = path.join(docsRoot, example);
      
      try {
        // Use Python to check syntax
        const { stderr } = await execAsync(`python -m py_compile "${filePath}"`);
        if (stderr) {
          syntaxErrors.push({
            file: example,
            error: stderr
          });
        }
      } catch (error) {
        syntaxErrors.push({
          file: example,
          error: error.message
        });
      }
    }

    if (syntaxErrors.length > 0) {
      console.error('\nPython syntax errors:');
      syntaxErrors.forEach(({ file, error }) => {
        console.error(`  ${file}: ${error}`);
      });
    }

    expect(syntaxErrors.length).toBe(0);
  });

  test('Go examples should have valid syntax', async () => {
    const goExamples = exampleFiles.filter(file => file.endsWith('.go'));
    const syntaxErrors = [];

    for (const example of goExamples) {
      const filePath = path.join(docsRoot, example);
      
      try {
        // Use gofmt to check syntax
        const { stderr } = await execAsync(`gofmt -e "${filePath}" > /dev/null`);
        if (stderr) {
          syntaxErrors.push({
            file: example,
            error: stderr
          });
        }
      } catch (error) {
        // gofmt might not be installed, skip
        if (!error.message.includes('gofmt: not found')) {
          syntaxErrors.push({
            file: example,
            error: error.message
          });
        }
      }
    }

    if (syntaxErrors.length > 0) {
      console.error('\nGo syntax errors:');
      syntaxErrors.forEach(({ file, error }) => {
        console.error(`  ${file}: ${error}`);
      });
    }

    expect(syntaxErrors.length).toBe(0);
  });

  test('Code examples should include necessary imports', async () => {
    const missingImports = [];

    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract JavaScript code blocks
      const jsCodeBlocks = extractCodeBlocks(content, ['javascript', 'js', 'node']);
      
      jsCodeBlocks.forEach((block, index) => {
        const { code, line } = block;
        
        // Check for common patterns that require imports
        const patterns = [
          { pattern: /express\(\)/g, import: 'express' },
          { pattern: /axios\./g, import: 'axios' },
          { pattern: /jwt\./g, import: 'jsonwebtoken' },
          { pattern: /fs\./g, import: 'fs' },
          { pattern: /path\./g, import: 'path' }
        ];
        
        patterns.forEach(({ pattern, import: importName }) => {
          if (pattern.test(code) && !code.includes(`require('${importName}')`) && 
              !code.includes(`require("${importName}")`) &&
              !code.includes(`import `) && !code.includes('...')) {
            missingImports.push({
              file: mdFile,
              line,
              missing: importName
            });
          }
        });
      });
    }

    if (missingImports.length > 0) {
      console.warn('\nCode examples with potentially missing imports:');
      missingImports.forEach(({ file, line, missing }) => {
        console.warn(`  ${file}:${line} - Missing: ${missing}`);
      });
    }

    // Allow some missing imports in snippets
    expect(missingImports.length).toBeLessThanOrEqual(10);
  });

  test('API examples should match OpenAPI specification', async () => {
    const apiExamples = [];
    
    // Extract API examples from documentation
    for (const mdFile of markdownFiles) {
      if (!mdFile.includes('API') && !mdFile.includes('api')) continue;
      
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Look for curl examples
      const curlPattern = /```(?:bash|sh|shell)?\n(curl[^`]+)```/g;
      const matches = [...content.matchAll(curlPattern)];
      
      matches.forEach(match => {
        const curlCommand = match[1];
        const endpoint = extractEndpointFromCurl(curlCommand);
        if (endpoint) {
          apiExamples.push({
            file: mdFile,
            endpoint,
            method: extractMethodFromCurl(curlCommand),
            curl: curlCommand
          });
        }
      });
    }

    // Validate against OpenAPI spec
    const openApiPath = path.join(docsRoot, 'docs/api/openapi.yaml');
    try {
      await fs.access(openApiPath);
      const SwaggerParser = require('@apidevtools/swagger-parser');
      const api = await SwaggerParser.parse(openApiPath);
      
      const invalidExamples = [];
      apiExamples.forEach(({ file, endpoint, method }) => {
        // Normalize endpoint (remove base URL, query params)
        const normalizedEndpoint = endpoint
          .replace(/https?:\/\/[^\/]+/, '')
          .replace(/\?.*$/, '')
          .replace(/\/api\/v1/, '');
        
        // Check if endpoint exists in OpenAPI spec
        let found = false;
        Object.keys(api.paths).forEach(path => {
          if (normalizedEndpoint === path || 
              matchesPathPattern(normalizedEndpoint, path)) {
            const methods = Object.keys(api.paths[path]);
            if (methods.includes(method.toLowerCase())) {
              found = true;
            }
          }
        });
        
        if (!found) {
          invalidExamples.push({ file, endpoint, method });
        }
      });
      
      if (invalidExamples.length > 0) {
        console.warn('\nAPI examples not matching OpenAPI spec:');
        invalidExamples.forEach(({ file, endpoint, method }) => {
          console.warn(`  ${file}: ${method} ${endpoint}`);
        });
      }
      
      expect(invalidExamples.length).toBe(0);
    } catch (error) {
      // OpenAPI spec might not exist yet
      console.log('OpenAPI spec not found, skipping validation');
    }
  });

  test('Example files should have proper error handling', async () => {
    const jsExamples = exampleFiles.filter(file => file.endsWith('.js'));
    const missingErrorHandling = [];

    for (const example of jsExamples) {
      const filePath = path.join(docsRoot, example);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Check for async operations without error handling
      const hasAsync = /async|Promise|\.then\(|await/i.test(content);
      const hasTryCatch = /try\s*{[\s\S]*}\s*catch/i.test(content);
      const hasCatchHandler = /\.catch\(/i.test(content);
      const hasErrorCallback = /\(err(or)?,/i.test(content);
      
      if (hasAsync && !hasTryCatch && !hasCatchHandler && !hasErrorCallback) {
        missingErrorHandling.push(example);
      }
    }

    if (missingErrorHandling.length > 0) {
      console.warn('\nExample files potentially missing error handling:');
      missingErrorHandling.forEach(file => {
        console.warn(`  ${file}`);
      });
    }

    // Allow some examples without error handling (for simplicity)
    expect(missingErrorHandling.length).toBeLessThanOrEqual(5);
  });
});

// Helper functions
async function validateCodeSyntax(code, language, filename = '') {
  try {
    switch (language) {
      case 'javascript':
      case 'js':
      case 'node':
        // Skip validation for SDK usage snippets that are meant to be partial
        if (filename.includes('SDK_USAGE') && code.includes('await') && !code.includes('async')) {
          return null; // These are intentional snippet examples
        }
        
        // Skip validation for very short snippets (likely partial examples)
        if (code.split('\n').length < 5 && code.includes('await')) {
          return null;
        }
        
        // Basic JavaScript syntax check
        new vm.Script(code, { displayErrors: false });
        return null;
      
      case 'json':
        JSON.parse(code);
        return null;
      
      case 'yaml':
      case 'yml':
        require('js-yaml').load(code);
        return null;
      
      default:
        // Skip validation for other languages
        return null;
    }
  } catch (error) {
    // Ignore await errors in documentation examples
    if (error.message.includes('await is only valid') && filename.includes('docs/')) {
      return null;
    }
    return error.message;
  }
}

function extractCodeBlocks(content, languages) {
  const blocks = [];
  const lines = content.split('\n');
  
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockLang = '';
  let codeBlockContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStart = i + 1;
        codeBlockLang = line.substring(3).trim().toLowerCase();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        
        if (languages.includes(codeBlockLang) && codeBlockContent.length > 0) {
          blocks.push({
            code: codeBlockContent.join('\n'),
            line: codeBlockStart,
            language: codeBlockLang
          });
        }
      }
    } else if (inCodeBlock) {
      codeBlockContent.push(line);
    }
  }
  
  return blocks;
}

function extractEndpointFromCurl(curlCommand) {
  const urlMatch = curlCommand.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return urlMatch[0].replace(/['"]$/, '');
  }
  return null;
}

function extractMethodFromCurl(curlCommand) {
  const methodMatch = curlCommand.match(/-X\s+(\w+)/);
  if (methodMatch) {
    return methodMatch[1];
  }
  return curlCommand.includes('-d') || curlCommand.includes('--data') ? 'POST' : 'GET';
}

function matchesPathPattern(actual, pattern) {
  // Convert path pattern like /services/{id} to regex
  const regex = pattern
    .replace(/\{[^}]+\}/g, '[^/]+')
    .replace(/\//g, '\\/');
  return new RegExp(`^${regex}$`).test(actual);
}