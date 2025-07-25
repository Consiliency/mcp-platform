# File: mcp-local-setup/contracts/api_gateway_stub.py
# Purpose: Concrete stub implementation for testing

from typing import Any, Dict, List, Optional
from .api_gateway_contract import APIGatewayContract

class APIGatewayStub(APIGatewayContract):
    """Stub implementation that can be instantiated and tested"""
    
    def __init__(self):
        self.servers = {}
        self.request_count = 0
        self.transport_stats = {
            'stdio': 0,
            'http': 0,
            'websocket': 0,
            'sse': 0
        }
    
    def start_server(self, server_id: str) -> Dict[str, Any]:
        """Stub that simulates server start"""
        # Determine transport type based on server_id pattern
        if 'stdio' in server_id or 'snap' in server_id:
            transport = 'stdio'
        elif 'websocket' in server_id or 'ws' in server_id:
            transport = 'websocket'
        elif 'sse' in server_id or 'stream' in server_id:
            transport = 'sse'
        else:
            transport = 'http'
        
        connection_id = f"conn_{server_id}_{len(self.servers) + 1}"
        self.servers[server_id] = {
            'status': 'running',
            'transport': transport,
            'connectionId': connection_id
        }
        
        return {
            "success": True,
            "connectionId": connection_id,
            "transport": transport,
            "message": f"Server {server_id} started successfully"
        }
    
    def stop_server(self, server_id: str) -> Dict[str, Any]:
        """Stub that simulates server stop"""
        if server_id in self.servers:
            self.servers[server_id]['status'] = 'stopped'
            return {
                "success": True,
                "message": f"Server {server_id} stopped"
            }
        return {
            "success": False,
            "message": f"Server {server_id} not found"
        }
    
    def send_request(self, server_id: str, request: Dict[str, Any]) -> Dict[str, Any]:
        """Stub that returns valid JSON-RPC response"""
        self.request_count += 1
        
        if server_id in self.servers:
            transport = self.servers[server_id]['transport']
            self.transport_stats[transport] += 1
        
        return {
            "jsonrpc": "2.0",
            "id": request.get("id", 1),
            "result": {
                "status": "ok",
                "server": server_id,
                "message": "Not implemented - API Team will implement"
            }
        }
    
    def get_server_info(self, server_id: str) -> Dict[str, Any]:
        """Stub that returns server info"""
        if server_id not in self.servers:
            return {
                "id": server_id,
                "name": server_id.replace('-', ' ').title(),
                "transport": "unknown",
                "status": "not_found",
                "connectionId": None,
                "metrics": {}
            }
        
        server = self.servers[server_id]
        return {
            "id": server_id,
            "name": server_id.replace('-', ' ').title(),
            "transport": server['transport'],
            "status": server['status'],
            "connectionId": server.get('connectionId'),
            "metrics": {
                "requests": 10,
                "errors": 0,
                "latency_ms": 45
            }
        }
    
    def list_servers(self, filter_running: Optional[bool] = None) -> List[Dict[str, Any]]:
        """Stub that returns server list"""
        result = []
        
        # Add some default servers
        default_servers = [
            {"id": "filesystem", "transport": "http", "status": "stopped"},
            {"id": "snap-happy", "transport": "stdio", "status": "stopped"},
            {"id": "websocket-test", "transport": "websocket", "status": "stopped"},
            {"id": "sse-stream", "transport": "sse", "status": "stopped"}
        ]
        
        # Merge with started servers
        for server in default_servers:
            if server['id'] in self.servers:
                server.update(self.servers[server['id']])
            
            if filter_running is None:
                result.append(server)
            elif filter_running and server['status'] == 'running':
                result.append(server)
            elif not filter_running and server['status'] == 'stopped':
                result.append(server)
        
        return result
    
    def get_metrics(self) -> Dict[str, Any]:
        """Stub that returns gateway metrics"""
        return {
            "requests_total": self.request_count,
            "requests_per_transport": dict(self.transport_stats),
            "active_connections": len([s for s in self.servers.values() if s['status'] == 'running']),
            "uptime": 3600  # 1 hour
        }