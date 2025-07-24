const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { promisify } = require('util');
const linkCheck = require('link-check');

const globAsync = promisify(glob);
const linkCheckAsync = promisify(linkCheck);

describe('Documentation Link Validation', () => {
  const docsRoot = path.join(__dirname, '../..');
  let markdownFiles;
  
  // Increase timeout for link checking
  jest.setTimeout(60000);

  beforeAll(async () => {
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

  test('All internal links should be valid', async () => {
    const brokenLinks = [];
    
    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      const fileDir = path.dirname(filePath);
      
      // Extract all markdown links
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      const matches = [...content.matchAll(linkPattern)];
      
      for (const match of matches) {
        const linkText = match[1];
        const linkUrl = match[2];
        
        // Skip external links for this test
        if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
          continue;
        }
        
        // Skip anchor links
        if (linkUrl.startsWith('#')) {
          continue;
        }
        
        // Handle relative links
        let targetPath;
        if (linkUrl.startsWith('/')) {
          targetPath = path.join(docsRoot, linkUrl);
        } else {
          targetPath = path.join(fileDir, linkUrl);
        }
        
        // Remove anchor from path if present
        const anchorIndex = targetPath.indexOf('#');
        if (anchorIndex > -1) {
          targetPath = targetPath.substring(0, anchorIndex);
        }
        
        try {
          await fs.access(targetPath);
        } catch (error) {
          brokenLinks.push({
            file: mdFile,
            linkText,
            linkUrl,
            targetPath: path.relative(docsRoot, targetPath)
          });
        }
      }
    }
    
    if (brokenLinks.length > 0) {
      console.error('\nBroken internal links found:');
      brokenLinks.forEach(({ file, linkText, linkUrl }) => {
        console.error(`  ${file}: [${linkText}](${linkUrl})`);
      });
    }
    
    expect(brokenLinks.length).toBe(0);
  });

  test('All anchor links should point to existing headers', async () => {
    const brokenAnchors = [];
    
    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract headers and create anchor map
      const headers = [];
      const headerPattern = /^#{1,6}\s+(.+)$/gm;
      const headerMatches = [...content.matchAll(headerPattern)];
      
      headerMatches.forEach(match => {
        const headerText = match[1];
        // Convert header to anchor format (lowercase, replace spaces with hyphens)
        const anchor = headerText
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
        headers.push(anchor);
      });
      
      // Extract anchor links
      const anchorPattern = /\[([^\]]+)\]\(#([^)]+)\)/g;
      const anchorMatches = [...content.matchAll(anchorPattern)];
      
      anchorMatches.forEach(match => {
        const linkText = match[1];
        const anchor = match[2];
        
        if (!headers.includes(anchor)) {
          brokenAnchors.push({
            file: mdFile,
            linkText,
            anchor,
            availableAnchors: headers
          });
        }
      });
    }
    
    if (brokenAnchors.length > 0) {
      console.error('\nBroken anchor links found:');
      brokenAnchors.forEach(({ file, linkText, anchor }) => {
        console.error(`  ${file}: [${linkText}](#${anchor})`);
      });
    }
    
    expect(brokenAnchors.length).toBe(0);
  });

  test.skip('External links should be reachable - skipped for CI/CD', async () => {
    const externalLinks = new Map();
    
    // Collect all external links
    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      const matches = [...content.matchAll(linkPattern)];
      
      matches.forEach(match => {
        const linkText = match[1];
        const linkUrl = match[2];
        
        if (!externalLinks.has(linkUrl)) {
          externalLinks.set(linkUrl, []);
        }
        externalLinks.get(linkUrl).push({ file: mdFile, linkText });
      });
    }
    
    // Check external links
    const brokenExternalLinks = [];
    const checkedUrls = new Set();
    
    for (const [url, occurrences] of externalLinks) {
      // Skip localhost URLs
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        continue;
      }
      
      // Skip if already checked
      if (checkedUrls.has(url)) {
        continue;
      }
      checkedUrls.add(url);
      
      try {
        const result = await linkCheckAsync(url, {
          timeout: '10s',
          retry: '2',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Documentation-Link-Checker/1.0)'
          }
        });
        
        if (result.status === 'dead') {
          brokenExternalLinks.push({
            url,
            statusCode: result.statusCode,
            occurrences
          });
        }
      } catch (error) {
        // Network errors
        brokenExternalLinks.push({
          url,
          error: error.message,
          occurrences
        });
      }
    }
    
    if (brokenExternalLinks.length > 0) {
      console.error('\nBroken external links found:');
      brokenExternalLinks.forEach(({ url, statusCode, error, occurrences }) => {
        console.error(`\n  URL: ${url}`);
        if (statusCode) console.error(`  Status: ${statusCode}`);
        if (error) console.error(`  Error: ${error}`);
        console.error('  Found in:');
        occurrences.forEach(({ file, linkText }) => {
          console.error(`    - ${file}: "${linkText}"`);
        });
      });
    }
    
    // Allow some broken links but not too many
    expect(brokenExternalLinks.length).toBeLessThanOrEqual(5);
  });

  test('Image links should point to existing files', async () => {
    const brokenImages = [];
    
    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      const fileDir = path.dirname(filePath);
      
      // Extract image links
      const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const matches = [...content.matchAll(imagePattern)];
      
      for (const match of matches) {
        const altText = match[1];
        const imagePath = match[2];
        
        // Skip external images
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
          continue;
        }
        
        // Handle relative paths
        let targetPath;
        if (imagePath.startsWith('/')) {
          targetPath = path.join(docsRoot, imagePath);
        } else {
          targetPath = path.join(fileDir, imagePath);
        }
        
        try {
          await fs.access(targetPath);
        } catch (error) {
          brokenImages.push({
            file: mdFile,
            altText,
            imagePath,
            targetPath: path.relative(docsRoot, targetPath)
          });
        }
      }
    }
    
    if (brokenImages.length > 0) {
      console.error('\nBroken image links found:');
      brokenImages.forEach(({ file, altText, imagePath }) => {
        console.error(`  ${file}: ![${altText}](${imagePath})`);
      });
    }
    
    expect(brokenImages.length).toBe(0);
  });

  test('Cross-references between documents should be valid', async () => {
    const crossRefs = [];
    
    // Collect cross-references
    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Look for references to other markdown files
      const refPattern = /(?:see|refer to|check|read)\s+\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/gi;
      const matches = [...content.matchAll(refPattern)];
      
      matches.forEach(match => {
        crossRefs.push({
          sourceFile: mdFile,
          linkText: match[1],
          targetFile: match[2]
        });
      });
    }
    
    // Validate cross-references
    const invalidRefs = [];
    for (const ref of crossRefs) {
      const sourceDir = path.dirname(path.join(docsRoot, ref.sourceFile));
      let targetPath;
      
      if (ref.targetFile.startsWith('/')) {
        targetPath = path.join(docsRoot, ref.targetFile);
      } else {
        targetPath = path.join(sourceDir, ref.targetFile);
      }
      
      // Remove anchor if present
      const anchorIndex = targetPath.indexOf('#');
      if (anchorIndex > -1) {
        targetPath = targetPath.substring(0, anchorIndex);
      }
      
      try {
        await fs.access(targetPath);
      } catch (error) {
        invalidRefs.push(ref);
      }
    }
    
    if (invalidRefs.length > 0) {
      console.error('\nInvalid cross-references found:');
      invalidRefs.forEach(({ sourceFile, linkText, targetFile }) => {
        console.error(`  ${sourceFile} -> ${targetFile} ("${linkText}")`);
      });
    }
    
    expect(invalidRefs.length).toBe(0);
  });

  test('Documentation should not have duplicate links', async () => {
    for (const mdFile of markdownFiles) {
      const filePath = path.join(docsRoot, mdFile);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract all links
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      const links = [];
      const matches = [...content.matchAll(linkPattern)];
      
      matches.forEach(match => {
        links.push({
          text: match[1],
          url: match[2],
          full: match[0]
        });
      });
      
      // Check for exact duplicates
      const linkMap = new Map();
      const duplicates = [];
      
      links.forEach(link => {
        const key = link.full;
        if (linkMap.has(key)) {
          linkMap.get(key).count++;
        } else {
          linkMap.set(key, { link, count: 1 });
        }
      });
      
      linkMap.forEach(({ link, count }) => {
        if (count > 1) {
          duplicates.push({ link, count });
        }
      });
      
      if (duplicates.length > 0) {
        console.warn(`\n${mdFile} has duplicate links:`);
        duplicates.forEach(({ link, count }) => {
          console.warn(`  "${link.text}" -> ${link.url} (${count} times)`);
        });
      }
      
      // Allow some duplicates but not too many
      expect(duplicates.length).toBeLessThanOrEqual(3);
    }
  });
});