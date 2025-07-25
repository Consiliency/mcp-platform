"""API Gateway implementation for unified MCP server management."""

import time
from typing import Any, Dict, List, Optional
import json
import os
import sys

# Add parent directory to path to import contracts
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'mcp-local-setup'))

from contracts.api_gateway_contract import APIGatewayContract
from contracts.transport_contract import TransportContract
from contracts.process_manager_contract import ProcessManagerContract
from contracts.transport_stub import TransportStub
from contracts.process_manager_stub import ProcessManagerStub


class APIGateway(APIGatewayContract):
    """Unified API Gateway for managing MCP servers across all transport types."""
    
    def __init__(self, transport: Optional[TransportContract] = None, 
                 process_manager: Optional[ProcessManagerContract] = None):
        """Initialize API Gateway with transport and process manager.
        
        Args:
            transport: Transport adapter instance
            process_manager: Process manager instance
        """
        self.transport = transport or TransportStub()
        self.process_manager = process_manager or ProcessManagerStub()
        
        # Track active servers and connections
        self.servers = {}
        self.connections = {}
        
        # Metrics tracking
        self.metrics = {
            'requests_total': 0,
            'requests_per_transport': {
                'stdio': 0,
                'http': 0,
                'websocket': 0,
                'sse': 0
            },
            'startup_time': time.time()
        }
        
        # Load server configurations
        self._load_server_configs()
        
        # Initialize transport
        self.transport.initialize()
    
    def _load_server_configs(self):
        """Load server configurations from registry."""
        # Load from enhanced catalog
        catalog_path = os.path.join(
            os.path.dirname(__file__), 
            '..', '..', 'mcp-local-setup', 'registry', 'enhanced-catalog.json'
        )
        
        try:
            with open(catalog_path, 'r') as f:
                catalog = json.load(f)
                for server in catalog.get('servers', []):
                    self.servers[server['id']] = {
                        'config': server,
                        'status': 'stopped',
                        'transport': self._detect_transport(server),
                        'connectionId': None,
                        'processId': None
                    }
        except FileNotFoundError:
            # Fallback to basic server definitions
            self._add_default_servers()
    
    def _add_default_servers(self):
        """Add default server configurations."""
        default_servers = {
            'filesystem': {
                'config': {
                    'id': 'filesystem',
                    'name': 'Filesystem',
                    'config': {'port': 3001, 'environment': {'MCP_MODE': 'http'}}
                },
                'status': 'stopped',
                'transport': 'http',
                'connectionId': None,
                'processId': None
            },
            'snap-happy': {
                'config': {
                    'id': 'snap-happy',
                    'name': 'Snap Happy',
                    'source': {'type': 'npm', 'package': 'snap-happy'}
                },
                'status': 'stopped',
                'transport': 'stdio',
                'connectionId': None,
                'processId': None
            },
            'websocket-test': {
                'config': {
                    'id': 'websocket-test',
                    'name': 'WebSocket Test',
                    'config': {'port': 3003, 'environment': {'MCP_MODE': 'websocket'}}
                },
                'status': 'stopped',
                'transport': 'websocket',
                'connectionId': None,
                'processId': None
            },
            'sse-stream': {
                'config': {
                    'id': 'sse-stream',
                    'name': 'SSE Stream',
                    'config': {'port': 3004, 'environment': {'MCP_MODE': 'sse'}}
                },
                'status': 'stopped',
                'transport': 'sse',
                'connectionId': None,
                'processId': None
            }
        }
        self.servers.update(default_servers)
    
    def _detect_transport(self, server_config: Dict[str, Any]) -> str:
        """Detect transport type from server configuration.
        
        Args:
            server_config: Server configuration dictionary
            
        Returns:
            Transport type string
        """
        # Check environment variable first
        env = server_config.get('config', {}).get('environment', {})
        mcp_mode = env.get('MCP_MODE', '').lower()
        
        if mcp_mode in ['http', 'websocket', 'sse']:
            return mcp_mode
        
        # Check for stdio indicators
        source = server_config.get('source', {})
        if source.get('type') == 'npm':
            package = source.get('package', '')
            if 'stdio' in package or 'snap' in package:
                return 'stdio'
        
        # Check server ID patterns
        server_id = server_config.get('id', '').lower()
        if 'stdio' in server_id or 'snap' in server_id:
            return 'stdio'
        elif 'websocket' in server_id or 'ws' in server_id:
            return 'websocket'
        elif 'sse' in server_id or 'stream' in server_id:
            return 'sse'
        
        # Default to http
        return 'http'
    
    def start_server(self, server_id: str) -> Dict[str, Any]:
        """Start an MCP server through unified API."""
        if server_id not in self.servers:
            return {
                "success": False,
                "connectionId": None,
                "transport": "unknown",
                "message": f"Server {server_id} not found in registry"
            }
        
        server = self.servers[server_id]
        
        # Check if already running
        if server['status'] == 'running':
            return {
                "success": False,
                "connectionId": server['connectionId'],
                "transport": server['transport'],
                "message": f"Server {server_id} is already running"
            }
        
        try:
            # Create connection configuration
            conn_config = self._create_connection_config(server)
            
            # Create transport connection
            connection_id = self.transport.create_connection(conn_config)
            
            # For stdio transport, spawn process
            if server['transport'] == 'stdio':
                process_config = self._create_process_config(server)
                process_id = self.process_manager.spawn_process(process_config)
                server['processId'] = process_id
            
            # Update server state
            server['status'] = 'running'
            server['connectionId'] = connection_id
            self.connections[connection_id] = server_id
            
            return {
                "success": True,
                "connectionId": connection_id,
                "transport": server['transport'],
                "message": f"Server {server_id} started successfully"
            }
            
        except Exception as e:
            return {
                "success": False,
                "connectionId": None,
                "transport": server['transport'],
                "message": f"Failed to start server {server_id}: {str(e)}"
            }
    
    def _create_connection_config(self, server: Dict[str, Any]) -> Dict[str, Any]:
        """Create connection configuration for transport."""
        config = server['config']
        transport = server['transport']
        
        conn_config = {
            'serverId': config['id']
        }
        
        if transport == 'stdio':
            # Extract command from source
            source = config.get('source', {})
            if source.get('type') == 'npm':
                conn_config['command'] = source.get('package', config['id'])
            else:
                conn_config['command'] = config['id']
            conn_config['args'] = []
            conn_config['env'] = config.get('config', {}).get('environment', {})
            
        elif transport in ['http', 'websocket', 'sse']:
            port = config.get('config', {}).get('port', 3000)
            conn_config['url'] = f"http://localhost:{port}"
            if transport == 'websocket':
                conn_config['url'] = f"ws://localhost:{port}"
            
        return conn_config
    
    def _create_process_config(self, server: Dict[str, Any]) -> Dict[str, Any]:
        """Create process configuration for process manager."""
        config = server['config']
        source = config.get('source', {})
        
        process_config = {
            'id': config['id'],
            'command': source.get('package', config['id']),
            'args': [],
            'env': {
                'NODE_ENV': 'production',
                **config.get('config', {}).get('environment', {})
            }
        }
        
        return process_config
    
    def stop_server(self, server_id: str) -> Dict[str, Any]:
        """Stop a running server."""
        if server_id not in self.servers:
            return {
                "success": False,
                "message": f"Server {server_id} not found"
            }
        
        server = self.servers[server_id]
        
        if server['status'] != 'running':
            return {
                "success": False,
                "message": f"Server {server_id} is not running"
            }
        
        try:
            # Close transport connection
            if server['connectionId']:
                self.transport.close_connection(server['connectionId'])
                del self.connections[server['connectionId']]
            
            # Stop process for stdio transport
            if server['transport'] == 'stdio' and server['processId']:
                self.process_manager.stop_process(server['processId'])
            
            # Update server state
            server['status'] = 'stopped'
            server['connectionId'] = None
            server['processId'] = None
            
            return {
                "success": True,
                "message": f"Server {server_id} stopped"
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to stop server {server_id}: {str(e)}"
            }
    
    def send_request(self, server_id: str, request: Dict[str, Any]) -> Dict[str, Any]:
        """Send request to server via appropriate transport."""
        if server_id not in self.servers:
            return {
                "jsonrpc": "2.0",
                "id": request.get("id", 1),
                "error": {
                    "code": -32001,
                    "message": f"Server {server_id} not found"
                }
            }
        
        server = self.servers[server_id]
        
        if server['status'] != 'running':
            return {
                "jsonrpc": "2.0",
                "id": request.get("id", 1),
                "error": {
                    "code": -32002,
                    "message": f"Server {server_id} is not running"
                }
            }
        
        try:
            # Update metrics
            self.metrics['requests_total'] += 1
            self.metrics['requests_per_transport'][server['transport']] += 1
            
            # Send through transport
            response = self.transport.send_message(server['connectionId'], request)
            
            return response
            
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": request.get("id", 1),
                "error": {
                    "code": -32603,
                    "message": f"Internal error: {str(e)}"
                }
            }
    
    def get_server_info(self, server_id: str) -> Dict[str, Any]:
        """Get server information and status."""
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
        config = server['config']
        
        # Get connection metrics if running
        metrics = {}
        if server['status'] == 'running' and server['connectionId']:
            try:
                conn_status = self.transport.get_status(server['connectionId'])
                metrics = {
                    "uptime": conn_status.get('uptime', 0),
                    "requests": 10,  # Placeholder
                    "errors": 0,
                    "latency_ms": 45
                }
            except:
                pass
        
        return {
            "id": server_id,
            "name": config.get('name', server_id.replace('-', ' ').title()),
            "transport": server['transport'],
            "status": server['status'],
            "connectionId": server['connectionId'],
            "metrics": metrics
        }
    
    def list_servers(self, filter_running: Optional[bool] = None) -> List[Dict[str, Any]]:
        """List all registered servers."""
        result = []
        
        for server_id, server in self.servers.items():
            status = server['status']
            
            if filter_running is None:
                result.append({
                    "id": server_id,
                    "transport": server['transport'],
                    "status": status
                })
            elif filter_running and status == 'running':
                result.append({
                    "id": server_id,
                    "transport": server['transport'],
                    "status": status
                })
            elif not filter_running and status == 'stopped':
                result.append({
                    "id": server_id,
                    "transport": server['transport'],
                    "status": status
                })
        
        return result
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get gateway metrics."""
        active_connections = len([s for s in self.servers.values() 
                                if s['status'] == 'running'])
        
        uptime = int(time.time() - self.metrics['startup_time'])
        
        return {
            "requests_total": self.metrics['requests_total'],
            "requests_per_transport": dict(self.metrics['requests_per_transport']),
            "active_connections": active_connections,
            "uptime": uptime
        }