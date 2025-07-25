const ProcessManager = require('./process-manager.js');

// Create singleton instance
const manager = new ProcessManager();

// Handle commands from Python
process.stdin.on('data', (data) => {
    try {
        const command = JSON.parse(data.toString());
        let result;
        
        switch (command.method) {
            case 'spawn_process':
                result = manager.spawnProcess(command.config);
                break;
                
            case 'stop_process':
                result = manager.stopProcess(command.processId, command.timeout);
                break;
                
            case 'get_process_status':
                result = manager.getProcessStatus(command.processId);
                break;
                
            case 'get_process_logs':
                result = manager.getProcessLogs(command.processId, command.lines);
                break;
                
            case 'list_processes':
                result = manager.listProcesses();
                break;
                
            default:
                result = { error: 'Unknown method' };
        }
        
        // Handle async results
        Promise.resolve(result).then(res => {
            process.stdout.write(JSON.stringify({ success: true, result: res }) + '\n');
        }).catch(err => {
            process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
        });
        
    } catch (error) {
        process.stdout.write(JSON.stringify({ success: false, error: error.message }) + '\n');
    }
});

// Keep process alive
process.stdin.resume();