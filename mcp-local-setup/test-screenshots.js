#!/usr/bin/env node
/**
 * Test script for comparing Puppeteer and Snap-Happy MCP servers
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const GATEWAY_URL = 'http://127.0.0.1:8090';
const API_KEY = 'mcp-gateway-default-key';
const TARGET_URL = 'http://localhost:8090/dashboard/catalog.html';

async function callMcpTool(server, toolName, params = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-MCP-Server': server
    };
    
    const payload = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
            name: toolName,
            arguments: params
        },
        id: 1
    };
    
    try {
        const response = await axios.post(`${GATEWAY_URL}/mcp`, payload, { 
            headers, 
            timeout: 30000 
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            return { error: { message: `HTTP ${error.response.status}: ${error.response.data}` }};
        }
        return { error: { message: error.message }};
    }
}

async function saveScreenshot(base64Data, filename) {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(filename, buffer);
        console.log(`✅ Screenshot saved to: ${filename}`);
        console.log(`   Size: ${buffer.length.toLocaleString()} bytes`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to save screenshot: ${error.message}`);
        return false;
    }
}

async function checkGateway() {
    try {
        const response = await axios.get(`${GATEWAY_URL}/health`, {
            headers: { 'X-API-Key': API_KEY },
            timeout: 5000
        });
        console.log('✅ Gateway is running');
        return true;
    } catch (error) {
        console.error('❌ Gateway not accessible:', error.message);
        return false;
    }
}

async function listServers() {
    try {
        const response = await axios.get(`${GATEWAY_URL}/servers`, {
            headers: { 'X-API-Key': API_KEY },
            timeout: 5000
        });
        
        console.log('\n📋 Available MCP Servers:');
        const servers = response.data;
        for (const [serverId, info] of Object.entries(servers)) {
            const status = info.status === 'running' ? '🟢 Running' : '🔴 Stopped';
            console.log(`   - ${serverId}: ${status}`);
        }
        return servers;
    } catch (error) {
        console.error('❌ Failed to list servers:', error.message);
        return {};
    }
}

async function testPuppeteer() {
    console.log('\n🎭 Testing Puppeteer MCP Server');
    console.log('=' + '='.repeat(49));
    
    // First navigate to the catalog page
    console.log(`\n1️⃣ Navigating to ${TARGET_URL}...`);
    const startTime = Date.now();
    
    let result = await callMcpTool('puppeteer', 'puppeteer:navigate', {
        url: TARGET_URL
    });
    
    const navElapsed = (Date.now() - startTime) / 1000;
    console.log(`   Navigation took: ${navElapsed.toFixed(2)}s`);
    
    if (result.error) {
        console.error(`   ❌ Error: ${result.error.message}`);
        return false;
    }
    
    console.log('   ✅ Navigation successful');
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot
    console.log('\n2️⃣ Taking screenshot with Puppeteer...');
    const screenshotStart = Date.now();
    
    result = await callMcpTool('puppeteer', 'puppeteer:screenshot', {});
    
    const screenshotElapsed = (Date.now() - screenshotStart) / 1000;
    console.log(`   Screenshot took: ${screenshotElapsed.toFixed(2)}s`);
    
    if (result.result) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `puppeteer_catalog_${timestamp}.png`;
        return await saveScreenshot(result.result, filename);
    } else {
        console.error(`   ❌ Error: ${result.error?.message || 'Unknown error'}`);
        return false;
    }
}

async function testSnapHappy() {
    console.log('\n📸 Testing Snap-Happy MCP Server');
    console.log('=' + '='.repeat(49));
    
    console.log('\n1️⃣ Taking full screen screenshot...');
    const startTime = Date.now();
    
    const result = await callMcpTool('snap-happy-native', 'snap-happy:TakeScreenshot', {});
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`   Screenshot took: ${elapsed.toFixed(2)}s`);
    
    if (result.result && typeof result.result === 'string') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `snaphappy_fullscreen_${timestamp}.png`;
        const success = await saveScreenshot(result.result, filename);
        
        if (success) {
            console.log('\n   ℹ️  Note: Snap-Happy captures the entire screen.');
            console.log('   To capture the catalog page specifically, ensure it\'s visible on screen.');
        }
        
        return success;
    } else {
        console.error(`   ❌ Error: ${result.error?.message || 'Unknown error'}`);
        return false;
    }
}

async function main() {
    console.log('🚀 MCP Screenshot Tool Comparison Test');
    console.log('Testing Puppeteer vs Snap-Happy for capturing catalog page');
    console.log('\n⚠️  Prerequisites:');
    console.log('   - MCP Gateway running at http://localhost:8090');
    console.log('   - Catalog page accessible at http://localhost:8090/dashboard/catalog.html');
    console.log('   - Both Puppeteer and Snap-Happy MCP servers configured');
    
    // Check gateway
    if (!await checkGateway()) {
        console.log('\n⚠️  Please ensure the MCP gateway is running:');
        console.log('   cd mcp-local-setup && ./launch.sh');
        process.exit(1);
    }
    
    // List servers
    const servers = await listServers();
    
    // Test both servers
    const puppeteerSuccess = await testPuppeteer();
    const snapHappySuccess = await testSnapHappy();
    
    // Summary
    console.log('\n📊 Test Summary');
    console.log('=' + '='.repeat(49));
    console.log(`Puppeteer: ${puppeteerSuccess ? '✅ Success' : '❌ Failed'}`);
    console.log(`Snap-Happy: ${snapHappySuccess ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n🔍 Key Differences:');
    console.log('   - Puppeteer: Can navigate to URLs and capture specific pages');
    console.log('   - Snap-Happy: Captures screen/window content (requires page to be visible)');
    console.log('   - Puppeteer: Better for automated web testing');
    console.log('   - Snap-Happy: Better for capturing desktop applications or visible content');
}

// Run the test
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});