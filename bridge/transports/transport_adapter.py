#!/usr/bin/env python3
# File: bridge/transports/transport_adapter.py
# Purpose: Python adapter for JavaScript transport implementations

import os
import sys
import json
import subprocess
from typing import Any, Dict

# Add mcp-local-setup to path for contract import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'mcp-local-setup'))
from contracts.transport_contract import TransportContract

class TransportAdapter(TransportContract):
    """Python adapter that delegates to JavaScript transport implementations"""
    
    def __init__(self):
        # Path to the Node.js transport runner
        self.runner_path = os.path.join(os.path.dirname(__file__), 'transport-runner.js')
        self.node_process = None
        self.initialized = False
        
    def _ensure_runner(self):
        """Ensure the Node.js runner process is started"""
        if self.node_process is None:
            self.node_process = subprocess.Popen(
                ['node', self.runner_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
    
    def _call_js(self, method: str, args: Dict[str, Any]) -> Any:
        """Call a method in the JavaScript transport"""
        self._ensure_runner()
        
        request = {
            'method': method,
            'args': args
        }
        
        # Send request
        self.node_process.stdin.write(json.dumps(request) + '\n')
        self.node_process.stdin.flush()
        
        # Read response, skipping any console.log output
        while True:
            response_line = self.node_process.stdout.readline()
            if not response_line:
                raise RuntimeError("Node.js process terminated unexpectedly")
            
            # Skip console.log output and empty lines
            response_line = response_line.strip()
            if not response_line or not response_line.startswith('{'):
                continue
                
            try:
                response = json.loads(response_line)
                break
            except json.JSONDecodeError:
                # Not valid JSON, probably console output
                continue
        
        if response.get('error'):
            raise RuntimeError(response['error'])
            
        return response.get('result')
    
    def initialize(self) -> None:
        """Initialize the transport adapter"""
        self._call_js('initialize', {})
        self.initialized = True
    
    def create_connection(self, config: Dict[str, Any]) -> str:
        """Create a new connection for a server"""
        if not self.initialized:
            raise RuntimeError("Transport not initialized")
        return self._call_js('create_connection', {'config': config})
    
    def send_message(self, connection_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """Send a message through the transport"""
        return self._call_js('send_message', {
            'connection_id': connection_id,
            'message': message
        })
    
    def close_connection(self, connection_id: str) -> None:
        """Close a connection"""
        self._call_js('close_connection', {'connection_id': connection_id})
    
    def get_status(self, connection_id: str) -> Dict[str, Any]:
        """Get connection status"""
        return self._call_js('get_status', {'connection_id': connection_id})
    
    def __del__(self):
        """Clean up Node.js process on deletion"""
        if self.node_process:
            self.node_process.terminate()
            self.node_process.wait()