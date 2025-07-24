const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { promisify } = require('util');

const globAsync = promisify(glob);

describe('Documentation Consistency Checks', () => {
  const docsRoot = path.join(__dirname, '../..');
  let allMarkdownFiles;
  let allSourceFiles;
  let packageJson;

  beforeAll(async () => {
    // Find all markdown files
    allMarkdownFiles = await globAsync('**/*.md', {
      cwd: docsRoot,
      ignore: [
        'node_modules/**',
        '**/node_modules/**', 
        'coverage/**', 
        '.git/**',
        'mcp-local-setup/archive/**',
        'ide/node_modules/**'
      ]
    });

    // Find all source files
    allSourceFiles = await globAsync('**/*.{js,ts,py,go}', {
      cwd: docsRoot,
      ignore: ['node_modules/**', 'coverage/**', 'build/**', 'dist/**']
    });

    // Load package.json
    packageJson = JSON.parse(
      await fs.readFile(path.join(docsRoot, 'package.json'), 'utf8')
    );
  });

  test('Project name should be consistent across documentation', async () => {
    const projectNames = new Map();
    const expectedName = packageJson.name || 'MCP';

    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      // Look for project name patterns
      const patterns = [
        /(?:^|\s)MCP(?:\s|$)/g,
        /(?:^|\s)mcp(?:\s|$)/g,
        /Model Context Protocol/g,
        /@mcp\/\w+/g
      ];

      patterns.forEach(pattern => {
        const matches = content.match(pattern) || [];
        matches.forEach(match => {
          const name = match.trim();
          if (!projectNames.has(name)) {
            projectNames.set(name, []);
          }
          projectNames.get(name).push(mdFile);
        });
      });
    }

    // Check for inconsistent naming
    const inconsistencies = [];
    projectNames.forEach((files, name) => {
      if (name !== 'MCP' && name !== 'Model Context Protocol' && !name.startsWith('@mcp/')) {
        inconsistencies.push({ name, count: files.length });
      }
    });

    if (inconsistencies.length > 0) {
      console.warn('\nInconsistent project naming found:');
      inconsistencies.forEach(({ name, count }) => {
        console.warn(`  "${name}" used ${count} times`);
      });
    }

    expect(inconsistencies.length).toBeLessThanOrEqual(2);
  });

  test('Version numbers should be consistent', async () => {
    const versionPattern = /\b\d+\.\d+\.\d+\b/g;
    const versions = new Map();
    const currentVersion = packageJson.version;

    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      const matches = content.match(versionPattern) || [];
      
      matches.forEach(version => {
        if (!versions.has(version)) {
          versions.set(version, []);
        }
        versions.get(version).push(mdFile);
      });
    }

    // Check for outdated versions
    const outdatedVersions = [];
    versions.forEach((files, version) => {
      if (version !== currentVersion && files.length > 1) {
        outdatedVersions.push({
          version,
          files: files.slice(0, 3),
          count: files.length
        });
      }
    });

    if (outdatedVersions.length > 0) {
      console.warn(`\nPotentially outdated versions (current: ${currentVersion}):`);
      outdatedVersions.forEach(({ version, files, count }) => {
        console.warn(`  v${version} found in ${count} files`);
      });
    }

    // Allow some version references (for migration guides, etc.)
    expect(outdatedVersions.length).toBeLessThanOrEqual(5);
  });

  test('Code style should be consistent in examples', async () => {
    const codeStyles = {
      quotes: { single: 0, double: 0 },
      semicolons: { with: 0, without: 0 },
      indentation: { spaces2: 0, spaces4: 0, tabs: 0 }
    };

    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      const codeBlocks = extractJavaScriptCodeBlocks(content);
      
      codeBlocks.forEach(code => {
        // Check quotes
        const singleQuotes = (code.match(/'/g) || []).length;
        const doubleQuotes = (code.match(/"/g) || []).length;
        if (singleQuotes > doubleQuotes * 2) codeStyles.quotes.single++;
        else if (doubleQuotes > singleQuotes * 2) codeStyles.quotes.double++;

        // Check semicolons
        const lines = code.split('\n').filter(l => l.trim());
        const withSemi = lines.filter(l => l.endsWith(';')).length;
        const withoutSemi = lines.filter(l => 
          !l.endsWith(';') && !l.endsWith('{') && !l.endsWith('}') && l.trim()
        ).length;
        if (withSemi > withoutSemi) codeStyles.semicolons.with++;
        else if (withoutSemi > withSemi) codeStyles.semicolons.without++;

        // Check indentation
        const indentMatch = code.match(/^( +)/m);
        if (indentMatch) {
          const indent = indentMatch[1].length;
          if (indent === 2) codeStyles.indentation.spaces2++;
          else if (indent === 4) codeStyles.indentation.spaces4++;
        } else if (code.includes('\t')) {
          codeStyles.indentation.tabs++;
        }
      });
    }

    // Check for consistency
    Object.entries(codeStyles).forEach(([style, counts]) => {
      const values = Object.values(counts);
      const total = values.reduce((a, b) => a + b, 0);
      if (total > 0) {
        const maxCount = Math.max(...values);
        const consistency = (maxCount / total) * 100;
        
        if (consistency < 80) {
          console.warn(`\nInconsistent ${style}:`, counts);
        }
        
        expect(consistency).toBeGreaterThanOrEqual(70);
      }
    });
  });

  test('Date formats should be consistent', async () => {
    const dateFormats = new Map();
    const datePatterns = [
      { pattern: /\d{4}-\d{2}-\d{2}/g, format: 'YYYY-MM-DD' },
      { pattern: /\d{2}\/\d{2}\/\d{4}/g, format: 'MM/DD/YYYY' },
      { pattern: /\d{2}-\d{2}-\d{4}/g, format: 'DD-MM-YYYY' },
      { pattern: /\w+\s+\d{1,2},\s+\d{4}/g, format: 'Month DD, YYYY' },
      { pattern: /\d{1,2}\s+\w+\s+\d{4}/g, format: 'DD Month YYYY' }
    ];

    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      datePatterns.forEach(({ pattern, format }) => {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          if (!dateFormats.has(format)) {
            dateFormats.set(format, 0);
          }
          dateFormats.set(format, dateFormats.get(format) + matches.length);
        }
      });
    }

    // Check for consistency
    if (dateFormats.size > 1) {
      console.warn('\nMultiple date formats found:');
      dateFormats.forEach((count, format) => {
        console.warn(`  ${format}: ${count} occurrences`);
      });
    }

    expect(dateFormats.size).toBeLessThanOrEqual(2);
  });

  test('File naming conventions should be consistent', () => {
    const namingPatterns = {
      kebabCase: 0,
      camelCase: 0,
      PascalCase: 0,
      snake_case: 0,
      SCREAMING_SNAKE_CASE: 0
    };

    allMarkdownFiles.forEach(file => {
      const basename = path.basename(file, '.md');
      
      if (/^[a-z]+(-[a-z]+)*$/.test(basename)) namingPatterns.kebabCase++;
      else if (/^[a-z][a-zA-Z]*$/.test(basename)) namingPatterns.camelCase++;
      else if (/^[A-Z][a-zA-Z]*$/.test(basename)) namingPatterns.PascalCase++;
      else if (/^[a-z]+(_[a-z]+)*$/.test(basename)) namingPatterns.snake_case++;
      else if (/^[A-Z]+(_[A-Z]+)*$/.test(basename)) namingPatterns.SCREAMING_SNAKE_CASE++;
    });

    // Find dominant pattern
    const total = Object.values(namingPatterns).reduce((a, b) => a + b, 0);
    const dominant = Object.entries(namingPatterns)
      .sort(([, a], [, b]) => b - a)[0];

    if (total > 0) {
      const consistency = (dominant[1] / total) * 100;
      
      if (consistency < 80) {
        console.warn('\nFile naming patterns:', namingPatterns);
      }

      expect(consistency).toBeGreaterThanOrEqual(70);
    }
  });

  test('README files should have consistent structure', async () => {
    const readmeFiles = allMarkdownFiles.filter(f => 
      path.basename(f).toLowerCase() === 'readme.md'
    );

    const structures = [];
    const expectedSections = [
      'Installation',
      'Usage',
      'Configuration',
      'API',
      'License'
    ];

    for (const readme of readmeFiles) {
      const content = await fs.readFile(path.join(docsRoot, readme), 'utf8');
      const sections = [];
      
      // Extract section headers
      const headerPattern = /^##?\s+(.+)$/gm;
      const matches = [...content.matchAll(headerPattern)];
      
      matches.forEach(match => {
        sections.push(match[1].trim());
      });

      structures.push({
        file: readme,
        sections
      });
    }

    // Check for common sections
    const missingSections = [];
    structures.forEach(({ file, sections }) => {
      expectedSections.forEach(expected => {
        if (!sections.some(s => s.toLowerCase().includes(expected.toLowerCase()))) {
          missingSections.push({ file, missing: expected });
        }
      });
    });

    if (missingSections.length > 0) {
      console.warn('\nREADME files missing common sections:');
      missingSections.slice(0, 10).forEach(({ file, missing }) => {
        console.warn(`  ${file}: Missing "${missing}"`);
      });
    }

    // Allow some flexibility
    const avgMissing = missingSections.length / readmeFiles.length;
    expect(avgMissing).toBeLessThanOrEqual(2);
  });

  test('License information should be consistent', async () => {
    const licenses = new Map();
    const licensePatterns = [
      /MIT License/i,
      /Apache License/i,
      /GNU GPL/i,
      /BSD License/i,
      /ISC License/i
    ];

    // Check package.json license
    const packageLicense = packageJson.license;
    if (packageLicense) {
      licenses.set(packageLicense, ['package.json']);
    }

    // Check documentation
    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      licensePatterns.forEach(pattern => {
        if (pattern.test(content)) {
          const license = pattern.source.replace(/\\i/g, '').replace(/\\/g, '');
          if (!licenses.has(license)) {
            licenses.set(license, []);
          }
          licenses.get(license).push(mdFile);
        }
      });
    }

    // Check LICENSE file
    try {
      const licenseFile = await fs.readFile(path.join(docsRoot, 'LICENSE'), 'utf8');
      licensePatterns.forEach(pattern => {
        if (pattern.test(licenseFile)) {
          const license = pattern.source.replace(/\\i/g, '').replace(/\\/g, '');
          if (!licenses.has(license)) {
            licenses.set(license, []);
          }
          licenses.get(license).push('LICENSE');
        }
      });
    } catch (e) {
      // LICENSE file might not exist
    }

    if (licenses.size > 1) {
      console.warn('\nMultiple licenses found:');
      licenses.forEach((files, license) => {
        console.warn(`  ${license}: ${files.length} files`);
      });
    }

    expect(licenses.size).toBeLessThanOrEqual(1);
  });

  test('API endpoint format should be consistent', async () => {
    const endpointFormats = {
      withVersion: 0,
      withoutVersion: 0,
      withTrailingSlash: 0,
      withoutTrailingSlash: 0
    };

    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      // Find API endpoints
      const endpointPattern = /(?:GET|POST|PUT|PATCH|DELETE)\s+([\/\w-{}]+)/g;
      const matches = [...content.matchAll(endpointPattern)];
      
      matches.forEach(match => {
        const endpoint = match[1];
        
        if (endpoint.includes('/v1') || endpoint.includes('/v2')) {
          endpointFormats.withVersion++;
        } else {
          endpointFormats.withoutVersion++;
        }
        
        if (endpoint.endsWith('/') && endpoint.length > 1) {
          endpointFormats.withTrailingSlash++;
        } else {
          endpointFormats.withoutTrailingSlash++;
        }
      });
    }

    // Check consistency
    if (endpointFormats.withVersion > 0 && endpointFormats.withoutVersion > 0) {
      console.warn('\nInconsistent API versioning:');
      console.warn(`  With version: ${endpointFormats.withVersion}`);
      console.warn(`  Without version: ${endpointFormats.withoutVersion}`);
    }

    if (endpointFormats.withTrailingSlash > 0) {
      console.warn(`\nEndpoints with trailing slashes: ${endpointFormats.withTrailingSlash}`);
    }

    expect(endpointFormats.withTrailingSlash).toBe(0);
  });

  test('Command examples should use consistent syntax', async () => {
    const commandStyles = {
      withPrompt: 0,
      withoutPrompt: 0,
      dollarPrompt: 0,
      hashPrompt: 0
    };

    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      const codeBlocks = extractShellCodeBlocks(content);
      
      codeBlocks.forEach(code => {
        const lines = code.split('\n').filter(l => l.trim());
        
        lines.forEach(line => {
          if (line.startsWith('$ ')) {
            commandStyles.withPrompt++;
            commandStyles.dollarPrompt++;
          } else if (line.startsWith('# ')) {
            commandStyles.withPrompt++;
            commandStyles.hashPrompt++;
          } else if (line.match(/^[a-z]+/)) {
            commandStyles.withoutPrompt++;
          }
        });
      });
    }

    // Check consistency
    const total = commandStyles.withPrompt + commandStyles.withoutPrompt;
    if (total > 0) {
      const promptConsistency = Math.max(
        commandStyles.withPrompt,
        commandStyles.withoutPrompt
      ) / total * 100;

      if (promptConsistency < 80) {
        console.warn('\nInconsistent command prompt usage:', commandStyles);
      }

      expect(promptConsistency).toBeGreaterThanOrEqual(70);
    }
  });

  test('Error message format should be consistent', async () => {
    const errorFormats = [];
    
    for (const mdFile of allMarkdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      // Look for error examples
      const errorPatterns = [
        /Error:\s*[A-Z]/g,
        /ERROR:\s*[A-Z]/g,
        /\[ERROR\]/g,
        /❌/g,
        /⚠️/g
      ];

      errorPatterns.forEach(pattern => {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          errorFormats.push({
            file: mdFile,
            format: pattern.source,
            count: matches.length
          });
        }
      });
    }

    // Group by format
    const formatGroups = {};
    errorFormats.forEach(({ format, count }) => {
      if (!formatGroups[format]) {
        formatGroups[format] = 0;
      }
      formatGroups[format] += count;
    });

    if (Object.keys(formatGroups).length > 2) {
      console.warn('\nMultiple error formats found:', formatGroups);
    }

    expect(Object.keys(formatGroups).length).toBeLessThanOrEqual(2);
  });
});

// Helper functions
function extractJavaScriptCodeBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent = [];

  lines.forEach(line => {
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.substring(3).trim().toLowerCase();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        
        if (['javascript', 'js', 'node', 'typescript', 'ts'].includes(codeBlockLang)) {
          blocks.push(codeBlockContent.join('\n'));
        }
      }
    } else if (inCodeBlock) {
      codeBlockContent.push(line);
    }
  });
  
  return blocks;
}

function extractShellCodeBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent = [];

  lines.forEach(line => {
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.substring(3).trim().toLowerCase();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        
        if (['bash', 'sh', 'shell', 'console', ''].includes(codeBlockLang)) {
          blocks.push(codeBlockContent.join('\n'));
        }
      }
    } else if (inCodeBlock) {
      codeBlockContent.push(line);
    }
  });
  
  return blocks;
}