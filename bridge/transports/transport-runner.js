#!/usr/bin/env node
// File: bridge/transports/transport-runner.js
// Purpose: Node.js runner for transport implementations

const readline = require('readline');
const { TransportContract } = require('./transport-factory');

// Create transport instance
const transport = new TransportContract();

// Create readline interface for communication with Python
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// Handle incoming requests from Python
rl.on('line', async (line) => {
    try {
        const request = JSON.parse(line);
        const { method, args } = request;
        
        let result;
        
        switch (method) {
            case 'initialize':
                transport.initialize();
                result = null;
                break;
                
            case 'create_connection':
                result = await transport.create_connection(args.config);
                break;
                
            case 'send_message':
                result = await transport.send_message(args.connection_id, args.message);
                break;
                
            case 'close_connection':
                transport.close_connection(args.connection_id);
                result = null;
                break;
                
            case 'get_status':
                result = transport.get_status(args.connection_id);
                break;
                
            default:
                throw new Error(`Unknown method: ${method}`);
        }
        
        // Send response
        const response = { result };
        console.log(JSON.stringify(response));
        
    } catch (error) {
        // Send error response
        const response = { error: error.message };
        console.log(JSON.stringify(response));
    }
});

// Handle process termination
process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});