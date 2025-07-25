/**
 * Process Manager Demo
 * Demonstrates process spawning, monitoring, and lifecycle management
 */

const ProcessManager = require('../src/process-manager');

async function main() {
    const manager = new ProcessManager();
    
    console.log('=== Process Manager Demo ===\n');
    
    // Listen to events
    manager.on('stdout', ({ processId, data }) => {
        console.log(`[${processId}] stdout:`, data.trim());
    });
    
    manager.on('stderr', ({ processId, data }) => {
        console.log(`[${processId}] stderr:`, data.trim());
    });
    
    manager.on('exit', ({ processId, code, signal }) => {
        console.log(`[${processId}] Process exited with code ${code}, signal ${signal}`);
    });
    
    manager.on('restart', ({ processId, restarts }) => {
        console.log(`[${processId}] Process restarted (attempt ${restarts})`);
    });
    
    try {
        // 1. Spawn a simple echo process
        console.log('1. Spawning echo process...');
        const echoId = manager.spawnProcess({
            id: 'echo-test',
            command: 'echo',
            args: ['Hello from Process Manager!']
        });
        console.log(`   Created process: ${echoId}`);
        
        // 2. Spawn a long-running process
        console.log('\n2. Spawning long-running Node.js process...');
        const nodeId = manager.spawnProcess({
            id: 'node-server',
            command: 'node',
            args: ['-e', `
                console.log('Server starting...');
                let count = 0;
                setInterval(() => {
                    console.log('Heartbeat', ++count);
                }, 2000);
                process.on('SIGTERM', () => {
                    console.log('Received SIGTERM, shutting down gracefully...');
                    process.exit(0);
                });
            `],
            env: { NODE_ENV: 'demo' }
        });
        console.log(`   Created process: ${nodeId}`);
        
        // 3. Spawn a process with auto-restart
        console.log('\n3. Spawning auto-restart process...');
        const autoRestartId = manager.spawnProcess({
            id: 'auto-restart-demo',
            command: 'node',
            args: ['-e', `
                console.log('Auto-restart process started');
                setTimeout(() => {
                    console.error('Simulating crash!');
                    process.exit(1);
                }, 3000);
            `],
            autoRestart: true
        });
        console.log(`   Created process: ${autoRestartId}`);
        
        // Wait a bit to see initial output
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 4. Check process status
        console.log('\n4. Checking process status...');
        const processes = manager.listProcesses();
        for (const proc of processes) {
            const status = manager.getProcessStatus(proc.id);
            console.log(`   ${proc.id}:`);
            console.log(`     - PID: ${status.pid}`);
            console.log(`     - Status: ${status.status}`);
            console.log(`     - Uptime: ${status.uptime}s`);
            console.log(`     - CPU: ${status.cpu}%`);
            console.log(`     - Memory: ${status.memory} MB`);
            console.log(`     - Restarts: ${status.restarts}`);
        }
        
        // 5. Get process logs
        console.log('\n5. Getting process logs...');
        const logs = manager.getProcessLogs(nodeId, 5);
        console.log(`   Recent stdout from ${nodeId}:`, logs.stdout);
        console.log(`   Recent stderr from ${nodeId}:`, logs.stderr);
        
        // Wait for some activity
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 6. Monitor resource usage
        console.log('\n6. Monitoring resource usage...');
        const monitorInterval = setInterval(() => {
            const nodeStatus = manager.getProcessStatus(nodeId);
            if (nodeStatus.status === 'running') {
                console.log(`   ${nodeId} - CPU: ${nodeStatus.cpu}%, Memory: ${nodeStatus.memory} MB`);
            }
        }, 2000);
        
        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 6000));
        clearInterval(monitorInterval);
        
        // 7. Stop a process gracefully
        console.log('\n7. Stopping node-server gracefully...');
        const stopped = await manager.stopProcess(nodeId, 3000);
        console.log(`   Process stopped: ${stopped}`);
        
        // 8. Final status check
        console.log('\n8. Final process list:');
        const finalProcesses = manager.listProcesses();
        for (const proc of finalProcesses) {
            console.log(`   - ${proc.id}: ${proc.status}`);
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Cleanup
        console.log('\n9. Cleaning up...');
        manager.cleanup();
        console.log('   All processes stopped.');
        
        // Exit after a short delay
        setTimeout(() => {
            console.log('\nDemo completed!');
            process.exit(0);
        }, 1000);
    }
}

// Run the demo
main().catch(console.error);