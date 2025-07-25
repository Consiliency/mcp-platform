# File: mcp-local-setup/contracts/process_manager_stub.py  
# Purpose: Concrete stub implementation for testing

from typing import Any, Dict, List
from .process_manager_contract import ProcessManagerContract

class ProcessManagerStub(ProcessManagerContract):
    """Stub implementation that can be instantiated and tested"""
    
    def __init__(self):
        self.processes = {}
        self.next_pid = 1000
    
    def spawn_process(self, config: Dict[str, Any]) -> str:
        """Stub that returns valid process ID"""
        process_id = config.get('id', f"proc_{len(self.processes) + 1}")
        self.processes[process_id] = {
            'pid': self.next_pid,
            'config': config,
            'status': 'running',
            'started_at': 1234567890,
            'cpu': 5.2,
            'memory': 128.5,
            'restarts': 0,
            'logs': {
                'stdout': ['Process started', 'Listening on port 3000'],
                'stderr': []
            }
        }
        self.next_pid += 1
        return process_id
    
    def stop_process(self, process_id: str, timeout: int = 5000) -> bool:
        """Stub that simulates process stop"""
        if process_id in self.processes:
            self.processes[process_id]['status'] = 'stopped'
            return True
        return False
    
    def get_process_status(self, process_id: str) -> Dict[str, Any]:
        """Stub that returns valid status"""
        if process_id not in self.processes:
            return {
                "pid": 0,
                "status": "unknown",
                "uptime": 0,
                "cpu": 0.0,
                "memory": 0.0,
                "restarts": 0
            }
        
        proc = self.processes[process_id]
        return {
            "pid": proc['pid'],
            "status": proc['status'],
            "uptime": 300,  # 5 minutes
            "cpu": proc['cpu'],
            "memory": proc['memory'],
            "restarts": proc['restarts']
        }
    
    def get_process_logs(self, process_id: str, lines: int = 100) -> Dict[str, List[str]]:
        """Stub that returns sample logs"""
        if process_id not in self.processes:
            return {"stdout": [], "stderr": []}
        
        proc = self.processes[process_id]
        return {
            "stdout": proc['logs']['stdout'][-lines:],
            "stderr": proc['logs']['stderr'][-lines:]
        }
    
    def list_processes(self) -> List[Dict[str, Any]]:
        """Stub that returns process list"""
        result = []
        for proc_id, proc_data in self.processes.items():
            result.append({
                "id": proc_id,
                "pid": proc_data['pid'],
                "status": proc_data['status'],
                "command": proc_data['config'].get('command', 'unknown')
            })
        return result