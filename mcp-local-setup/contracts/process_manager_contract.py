# File: mcp-local-setup/contracts/process_manager_contract.py
# Purpose: Define the boundary for process management
# Team responsible: Process Team

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

class ProcessManagerContract(ABC):
    """Abstract contract defining process manager interface"""
    
    @abstractmethod
    def spawn_process(self, config: Dict[str, Any]) -> str:
        """Spawn a new process
        
        Args:
            config: Process configuration including:
                - id: Process identifier
                - command: Command to execute
                - args: Command arguments
                - env: Environment variables
                - workingDir: Working directory
                - autoRestart: Auto-restart on failure
                
        Returns:
            Process ID as string
            
        Preconditions:
            - Command exists and is executable
            - Process limit not exceeded
            
        Postconditions:
            - Process is running
            - Process ID is tracked internally
        """
        pass
    
    @abstractmethod
    def stop_process(self, process_id: str, timeout: int = 5000) -> bool:
        """Stop a running process
        
        Args:
            process_id: Process identifier
            timeout: Milliseconds to wait before force kill
            
        Returns:
            True if stopped successfully
            
        Preconditions:
            - Process exists
            
        Postconditions:
            - Process is terminated
            - Resources are cleaned up
        """
        pass
    
    @abstractmethod
    def get_process_status(self, process_id: str) -> Dict[str, Any]:
        """Get process status
        
        Args:
            process_id: Process identifier
            
        Returns:
            Status dictionary with:
                - pid: System process ID
                - status: 'running', 'stopped', 'error'
                - uptime: Seconds since start
                - cpu: CPU usage percentage
                - memory: Memory usage in MB
                - restarts: Number of restarts
                
        Preconditions:
            - Process ID exists
        """
        pass
    
    @abstractmethod
    def get_process_logs(self, process_id: str, lines: int = 100) -> Dict[str, List[str]]:
        """Get process logs
        
        Args:
            process_id: Process identifier
            lines: Number of recent lines to return
            
        Returns:
            Dictionary with:
                - stdout: List of stdout lines
                - stderr: List of stderr lines
                
        Preconditions:
            - Process ID exists
            - Logs are being captured
        """
        pass
    
    @abstractmethod
    def list_processes(self) -> List[Dict[str, Any]]:
        """List all managed processes
        
        Returns:
            List of process info dictionaries
            
        Postconditions:
            - Returns current snapshot of all processes
        """
        pass