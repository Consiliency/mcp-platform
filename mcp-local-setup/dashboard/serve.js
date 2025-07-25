#!/usr/bin/env node

/**
 * Simple HTTP server for testing the dashboard locally
 * Usage: node serve.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.argv[2] || 8080;
const DASHBOARD_ROOT = __dirname;

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Create server
const server = http.createServer((req, res) => {
    // Parse URL
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;
    
    // Default to test.html for root
    if (pathname === '/') {
        pathname = '/test.html';
    }
    
    // Security: prevent directory traversal
    pathname = pathname.replace(/\.\./g, '');
    
    // Construct file path
    const filePath = path.join(DASHBOARD_ROOT, pathname);
    
    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // File not found
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        
        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        // Read and serve file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }
            
            // Set CORS headers for development
            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            
            res.end(data);
        });
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║       MCP Dashboard Development Server             ║
╚════════════════════════════════════════════════════╝

  Server running at: http://localhost:${PORT}
  
  Available pages:
  - Test Page:        http://localhost:${PORT}/test.html
  - Transport:        http://localhost:${PORT}/transport.html
  - Metrics:          http://localhost:${PORT}/metrics.html
  - Health:           http://localhost:${PORT}/health/
  - Services:         http://localhost:${PORT}/index.html
  
  Mock data is automatically enabled for testing.
  
  Press Ctrl+C to stop the server.
`);
});