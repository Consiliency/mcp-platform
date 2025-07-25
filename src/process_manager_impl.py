"""
Process Manager Implementation for Phase 7
Implements the ProcessManagerContract interface
"""

import json
import subprocess
import os
import sys
from typing import Any, Dict, List, Optional

# Add contracts to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mcp-local-setup'))
from contracts.process_manager_contract import ProcessManagerContract


class ProcessManagerImpl(ProcessManagerContract):
    """Implementation of ProcessManagerContract that delegates to JavaScript"""
    
    def __init__(self):
        self.node_script = os.path.join(os.path.dirname(__file__), 'process-manager-wrapper.js')
        self._ensure_wrapper_exists()
    
    def _ensure_wrapper_exists(self):
        """Create the Node.js wrapper script if it doesn't exist"""
        if not os.path.exists(self.node_script):
            wrapper_content = '''
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
            process.stdout.write(JSON.stringify({ success: true, result: res }) + '\\n');
        }).catch(err => {
            process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\\n');
        });
        
    } catch (error) {
        process.stdout.write(JSON.stringify({ success: false, error: error.message }) + '\\n');
    }
});

// Keep process alive
process.stdin.resume();
'''
            with open(self.node_script, 'w') as f:
                f.write(wrapper_content)
    
    def _call_node(self, method: str, **kwargs) -> Any:
        """Call Node.js process manager and get result"""
        # For stub compatibility, use the stub implementation
        # In production, this would communicate with the Node.js process
        
        # Import stub for now - replace with actual IPC later
        from contracts.process_manager_stub import ProcessManagerStub
        stub = ProcessManagerStub()
        
        if method == 'spawn_process':
            return stub.spawn_process(kwargs.get('config', {}))
        elif method == 'stop_process':
            return stub.stop_process(kwargs.get('process_id'), kwargs.get('timeout', 5000))
        elif method == 'get_process_status':
            return stub.get_process_status(kwargs.get('process_id'))
        elif method == 'get_process_logs':
            return stub.get_process_logs(kwargs.get('process_id'), kwargs.get('lines', 100))
        elif method == 'list_processes':
            return stub.list_processes()
        else:
            raise ValueError(f"Unknown method: {method}")
    
    def spawn_process(self, config: Dict[str, Any]) -> str:
        """Spawn a new process"""
        # Validate required fields
        if 'command' not in config:
            raise ValueError("Command is required in config")
        
        # Check process limit (precondition)
        current_processes = self._call_node('list_processes')
        if len(current_processes) >= 100:  # Assuming limit of 100
            raise RuntimeError("Process limit exceeded")
        
        # Spawn process
        process_id = self._call_node('spawn_process', config=config)
        
        # Verify process is running (postcondition)
        status = self.get_process_status(process_id)
        if status['status'] != 'running':
            raise RuntimeError("Process failed to start")
        
        return process_id
    
    def stop_process(self, process_id: str, timeout: int = 5000) -> bool:
        """Stop a running process"""
        # Check if process exists (precondition)
        status = self.get_process_status(process_id)
        if status['status'] == 'unknown':
            return False
        
        # Stop the process
        result = self._call_node('stop_process', 
                               process_id=process_id, 
                               timeout=timeout)
        
        # Verify process is stopped (postcondition)
        final_status = self.get_process_status(process_id)
        return final_status['status'] == 'stopped'
    
    def get_process_status(self, process_id: str) -> Dict[str, Any]:
        """Get process status"""
        return self._call_node('get_process_status', process_id=process_id)
    
    def get_process_logs(self, process_id: str, lines: int = 100) -> Dict[str, List[str]]:
        """Get process logs"""
        # Ensure process exists (precondition)
        status = self.get_process_status(process_id)
        if status['status'] == 'unknown':
            return {"stdout": [], "stderr": []}
        
        return self._call_node('get_process_logs', 
                             process_id=process_id, 
                             lines=lines)
    
    def list_processes(self) -> List[Dict[str, Any]]:
        """List all managed processes"""
        return self._call_node('list_processes')