const { lint } = require('markdownlint/sync');
const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { promisify } = require('util');

const globAsync = promisify(glob);

describe('Markdown Documentation Linting', () => {
  const docsRoot = path.join(__dirname, '../..');
  let markdownFiles;

  beforeAll(async () => {
    // Find all markdown files in the project
    markdownFiles = await globAsync('**/*.md', {
      cwd: docsRoot,
      ignore: [
        'node_modules/**',
        'coverage/**',
        'dist/**',
        'build/**',
        '.git/**',
        'mcp-local-setup/archive/**'
      ]
    });
  });

  test('Should find markdown files to lint', () => {
    expect(markdownFiles.length).toBeGreaterThan(0);
  });

  test('All markdown files should pass linting rules', async () => {
    const config = {
      default: true,
      // Customize rules as needed
      'MD003': { style: 'atx' }, // Header style
      'MD004': { style: 'dash' }, // Unordered list style  
      'MD007': { indent: 2 }, // Unordered list indentation
      'MD013': { line_length: 120, code_blocks: false }, // Line length
      'MD024': { siblings_only: true }, // Allow duplicate headers in different sections
      'MD025': false, // Allow multiple top-level headers
      'MD026': { punctuation: '.,;:!' }, // Trailing punctuation in headers
      'MD029': { style: 'ordered' }, // Ordered list item prefix
      'MD033': false, // Allow inline HTML
      'MD034': false, // Allow bare URLs
      'MD036': false, // Allow emphasis used instead of header
      'MD040': false, // Allow code blocks without language
      'MD041': false, // Allow first line not to be top level header
      'MD047': false // Allow files to not end with newline
    };

    const options = {
      files: markdownFiles.map(file => path.join(docsRoot, file)),
      config
    };

    const results = lint(options);

    // Check for linting errors
    const errors = [];
    Object.entries(results).forEach(([file, fileErrors]) => {
      if (fileErrors && fileErrors.length > 0) {
        errors.push({
          file: path.relative(docsRoot, file),
          errors: fileErrors
        });
      }
    });

    if (errors.length > 0) {
      console.error('\nMarkdown linting errors found:');
      errors.forEach(({ file, errors }) => {
        console.error(`\n${file}:`);
        errors.forEach(error => {
          console.error(`  Line ${error.lineNumber}: ${error.ruleDescription} (${error.ruleNames.join(', ')})`);
        });
      });
    }

    expect(errors.length).toBe(0);
  });

  test('README files should have proper structure', async () => {
    const readmeFiles = markdownFiles.filter(file => 
      file.toLowerCase().includes('readme')
    );

    for (const readmeFile of readmeFiles) {
      const content = await fs.readFile(path.join(docsRoot, readmeFile), 'utf8');
      const lines = content.split('\n');

      // Check for main heading
      const hasMainHeading = lines.some(line => line.startsWith('# '));
      expect(hasMainHeading).toBe(true);

      // Check for common sections
      const commonSections = ['## Installation', '## Usage', '## License'];
      const hasSections = commonSections.filter(section => 
        content.includes(section)
      );

      // At least one common section should be present
      expect(hasSections.length).toBeGreaterThan(0);
    }
  });

  test('Documentation files should have consistent header hierarchy', async () => {
    const docFiles = markdownFiles.filter(file => 
      file.startsWith('docs/') || file.includes('DOCUMENTATION')
    );

    for (const docFile of docFiles) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      const lines = content.split('\n');
      
      let currentLevel = 0;
      const headerLevels = [];

      lines.forEach((line, index) => {
        const headerMatch = line.match(/^(#{1,6})\s+/);
        if (headerMatch) {
          const level = headerMatch[1].length;
          headerLevels.push({ level, line: index + 1, text: line });
        }
      });

      // Check header hierarchy
      for (let i = 1; i < headerLevels.length; i++) {
        const prevLevel = headerLevels[i - 1].level;
        const currLevel = headerLevels[i].level;
        
        // Headers should not skip levels (e.g., from # to ###)
        if (currLevel > prevLevel) {
          expect(currLevel - prevLevel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test('Code blocks should have language identifiers', async () => {
    const techDocs = markdownFiles.filter(file => 
      file.startsWith('docs/') || file.includes('API') || file.includes('SDK')
    );

    for (const docFile of techDocs) {
      const content = await fs.readFile(path.join(docsRoot, docFile), 'utf8');
      const lines = content.split('\n');
      
      let inCodeBlock = false;
      const codeBlocks = [];

      lines.forEach((line, index) => {
        if (line.startsWith('```')) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            const lang = line.substring(3).trim();
            codeBlocks.push({
              line: index + 1,
              hasLanguage: lang.length > 0,
              language: lang
            });
          } else {
            inCodeBlock = false;
          }
        }
      });

      // Check that code blocks have language identifiers
      const blocksWithoutLang = codeBlocks.filter(block => !block.hasLanguage);
      
      if (blocksWithoutLang.length > 0) {
        console.warn(`\n${docFile} has code blocks without language identifiers at lines:`,
          blocksWithoutLang.map(b => b.line).join(', '));
      }

      // Allow some blocks without language, but most should have it
      const percentageWithLang = codeBlocks.length > 0 
        ? (codeBlocks.filter(b => b.hasLanguage).length / codeBlocks.length) * 100
        : 100;
      
      expect(percentageWithLang).toBeGreaterThanOrEqual(70);
    }
  });

  test('Links should use consistent formatting', async () => {
    for (const mdFile of markdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      // Check for bare URLs (should use markdown link syntax)
      const bareUrlPattern = /(?<!\()https?:\/\/[^\s\)]+(?!\))/g;
      const bareUrls = content.match(bareUrlPattern) || [];
      
      // Filter out URLs in code blocks
      const lines = content.split('\n');
      const actualBareUrls = bareUrls.filter(url => {
        const urlLine = lines.findIndex(line => line.includes(url));
        if (urlLine === -1) return false;
        
        // Check if URL is in a code block
        let inCodeBlock = false;
        for (let i = 0; i < urlLine; i++) {
          if (lines[i].startsWith('```')) {
            inCodeBlock = !inCodeBlock;
          }
        }
        return !inCodeBlock && !lines[urlLine].trim().startsWith('    ');
      });

      if (actualBareUrls.length > 0) {
        console.warn(`\n${mdFile} contains bare URLs that should use markdown link syntax:`,
          actualBareUrls.slice(0, 3).join(', '));
      }

      // Allow some bare URLs but prefer markdown syntax
      expect(actualBareUrls.length).toBeLessThanOrEqual(5);
    }
  });

  test('Documentation should not contain broken markdown syntax', async () => {
    for (const mdFile of markdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      // Check for unclosed markdown elements
      const unclosedPatterns = [
        { pattern: /\*[^*\n]+$/gm, name: 'unclosed italic' },
        { pattern: /\*\*[^*\n]+$/gm, name: 'unclosed bold' },
        { pattern: /\[[^\]]+$/gm, name: 'unclosed link text' },
        { pattern: /`[^`\n]+$/gm, name: 'unclosed inline code' }
      ];

      const issues = [];
      unclosedPatterns.forEach(({ pattern, name }) => {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          issues.push({ type: name, count: matches.length });
        }
      });

      if (issues.length > 0) {
        console.warn(`\n${mdFile} may contain broken markdown:`,
          issues.map(i => `${i.type} (${i.count})`).join(', '));
      }

      expect(issues.length).toBe(0);
    }
  });

  test('Tables should be properly formatted', async () => {
    const docsWithTables = [];
    
    for (const mdFile of markdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      const lines = content.split('\n');
      
      let inTable = false;
      let tableStart = -1;
      const tables = [];

      lines.forEach((line, index) => {
        if (line.includes('|') && line.trim().startsWith('|') && line.trim().endsWith('|')) {
          if (!inTable) {
            inTable = true;
            tableStart = index;
          }
        } else if (inTable) {
          inTable = false;
          tables.push({ start: tableStart, end: index - 1 });
        }
      });

      if (tables.length > 0) {
        docsWithTables.push(mdFile);
        
        // Validate each table
        tables.forEach(({ start, end }) => {
          const tableLines = lines.slice(start, end + 1);
          
          // Check for separator line (second line should be separator)
          if (tableLines.length >= 2) {
            const separatorLine = tableLines[1];
            expect(separatorLine).toMatch(/^\|[\s\-:|\s]+\|$/);
          }

          // Check column consistency
          const columnCounts = tableLines.map(line => 
            line.split('|').filter(cell => cell !== '').length
          );
          
          const uniqueCounts = [...new Set(columnCounts)];
          expect(uniqueCounts.length).toBe(1);
        });
      }
    }

    console.log(`\nFound ${docsWithTables.length} files with tables`);
  });

  test('Documentation should use consistent terminology', async () => {
    const terminology = {
      'MCP': ['mcp', 'Mcp'],
      'API': ['api', 'Api'],
      'SDK': ['sdk', 'Sdk'],
      'JWT': ['jwt', 'Jwt']
    };

    for (const mdFile of markdownFiles) {
      const content = await fs.readFile(path.join(docsRoot, mdFile), 'utf8');
      
      Object.entries(terminology).forEach(([correct, incorrect]) => {
        incorrect.forEach(term => {
          const regex = new RegExp(`\\b${term}\\b`, 'g');
          const matches = content.match(regex) || [];
          
          if (matches.length > 0) {
            console.warn(`\n${mdFile} uses inconsistent terminology: "${term}" should be "${correct}"`);
          }
        });
      });
    }
  });
});