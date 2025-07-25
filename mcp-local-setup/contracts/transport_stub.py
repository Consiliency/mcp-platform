# File: mcp-local-setup/contracts/transport_stub.py
# Purpose: Concrete stub implementation for testing

from typing import Any, Dict
from .transport_contract import TransportContract

class TransportStub(TransportContract):
    """Stub implementation that can be instantiated and tested"""
    
    def __init__(self):
        self.connections = {}
        self.status = 'uninitialized'
        self.message_count = 0
    
    def initialize(self) -> None:
        """Stub that simulates initialization"""
        self.status = 'initialized'
    
    def create_connection(self, config: Dict[str, Any]) -> str:
        """Stub that returns valid connection ID"""
        connection_id = f"conn_{len(self.connections) + 1}"
        self.connections[connection_id] = {
            'config': config,
            'status': 'connected',
            'created_at': 1234567890,
            'messages_sent': 0
        }
        return connection_id
    
    def send_message(self, connection_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """Stub that returns valid response"""
        if connection_id in self.connections:
            self.connections[connection_id]['messages_sent'] += 1
            self.message_count += 1
            
        # Return valid JSON-RPC response
        return {
            "jsonrpc": "2.0",
            "id": message.get("id", 1),
            "result": {
                "status": "ok",
                "message": "Not implemented - Transport Team will implement",
                "connection": connection_id
            }
        }
    
    def close_connection(self, connection_id: str) -> None:
        """Stub that updates connection status"""
        if connection_id in self.connections:
            self.connections[connection_id]['status'] = 'disconnected'
    
    def get_status(self, connection_id: str) -> Dict[str, Any]:
        """Stub that returns valid status"""
        if connection_id not in self.connections:
            return {
                "status": "unknown",
                "uptime": 0,
                "metrics": {}
            }
        
        conn = self.connections[connection_id]
        return {
            "status": conn['status'],
            "uptime": 300,  # 5 minutes
            "metrics": {
                "messages_sent": conn['messages_sent'],
                "bytes_sent": 0,
                "bytes_received": 0
            }
        }