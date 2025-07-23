"""
MCP Python SDK
High-level Python API for MCP services
"""

import json
import asyncio
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
import aiohttp


class MCPClient:
    """Main client for interacting with MCP services"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize MCP client
        
        Args:
            config: Configuration dictionary with keys:
                - api_key: API key for authentication
                - base_url: Base URL for MCP API
                - timeout: Request timeout in seconds
                - tenant_id: Tenant identifier
        """
        self.config = {
            'base_url': 'https://api.mcp.io',
            'timeout': 30,
            **(config or {})
        }
        self.auth_token = None
        self.auth_expiry = None
        self.services = {}
        self.session = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    async def connect(self, credentials: Union[str, Dict[str, str]]) -> Dict[str, Any]:
        """
        Authenticate with MCP
        
        Args:
            credentials: API key string or dict with username/password
            
        Returns:
            Authentication result with token and expiry
        """
        if isinstance(credentials, str):
            auth_data = {'api_key': credentials}
        else:
            auth_data = credentials
        
        # In real implementation, this would call the API
        # For now, simulate authentication
        self.auth_token = f"py-token-{auth_data.get('api_key', 'user')}"
        self.auth_expiry = datetime.utcnow().timestamp() + 3600
        
        return {
            'token': self.auth_token,
            'expires_at': datetime.fromtimestamp(self.auth_expiry)
        }
    
    async def connect_service(self, service_id: str) -> 'ServiceProxy':
        """
        Connect to a specific service
        
        Args:
            service_id: ID of the service to connect to
            
        Returns:
            ServiceProxy instance for the service
        """
        # Check if service is installed
        service = await self.get_service(service_id)
        
        if not service.get('installed'):
            result = await self.install_service(service_id)
            if not result['success']:
                raise Exception(result['message'])
        
        # Create service proxy
        proxy = ServiceProxy(self, service_id)
        self.services[service_id] = proxy
        
        return proxy
    
    async def list_services(self, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        List available services
        
        Args:
            filters: Optional filters (category, tags, status)
            
        Returns:
            List of available services
        """
        # In real implementation, this would call the API
        # For now, return mock data
        return [
            {
                'id': 'postgres-mcp',
                'name': 'PostgreSQL MCP',
                'description': 'PostgreSQL database service',
                'version': '14.0',
                'category': 'database',
                'tags': ['sql', 'database', 'postgres'],
                'status': 'available',
                'installed': False
            }
        ]
    
    async def get_service(self, service_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a service
        
        Args:
            service_id: ID of the service
            
        Returns:
            Service details
        """
        # In real implementation, this would call the API
        return {
            'id': service_id,
            'name': f'{service_id} Service',
            'description': f'Description for {service_id}',
            'version': '1.0.0',
            'category': 'custom',
            'tags': [],
            'status': 'available',
            'installed': service_id in self.services
        }
    
    async def install_service(self, service_id: str, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Install a service
        
        Args:
            service_id: ID of the service to install
            config: Optional configuration for the service
            
        Returns:
            Installation result
        """
        # In real implementation, this would call the API
        return {
            'success': True,
            'message': f'Service {service_id} installed successfully'
        }
    
    async def uninstall_service(self, service_id: str) -> Dict[str, Any]:
        """
        Uninstall a service
        
        Args:
            service_id: ID of the service to uninstall
            
        Returns:
            Uninstallation result
        """
        if service_id in self.services:
            del self.services[service_id]
        
        return {
            'success': True,
            'message': f'Service {service_id} uninstalled successfully'
        }
    
    async def get_health(self, service_id: str = None) -> Dict[str, Any]:
        """
        Get health status
        
        Args:
            service_id: Optional service ID for specific service health
            
        Returns:
            Health status information
        """
        if service_id:
            return {
                'status': 'healthy',
                'details': {
                    'service_id': service_id,
                    'connected': service_id in self.services,
                    'last_checked': datetime.utcnow().isoformat()
                }
            }
        else:
            return {
                'status': 'healthy',
                'details': {
                    'authentication': 'valid' if self.auth_token else 'none',
                    'installed_services': len(self.services),
                    'timestamp': datetime.utcnow().isoformat()
                }
            }


class ServiceProxy:
    """Proxy for interacting with a specific service"""
    
    def __init__(self, client: MCPClient, service_id: str):
        """
        Initialize service proxy
        
        Args:
            client: MCP client instance
            service_id: ID of the service
        """
        self.client = client
        self.service_id = service_id
    
    async def call(self, method: str, params: Any = None) -> Any:
        """
        Call a service method
        
        Args:
            method: Method name
            params: Method parameters
            
        Returns:
            Method result
        """
        # In real implementation, this would call the service
        return {
            'success': True,
            'service_id': self.service_id,
            'method': method,
            'params': params,
            'result': f'Response from {self.service_id}.{method}',
            'timestamp': datetime.utcnow().isoformat()
        }
    
    async def get_health(self) -> Dict[str, Any]:
        """Get service health status"""
        return await self.client.get_health(self.service_id)
    
    def method(self, method_name: str):
        """
        Create a method proxy for cleaner API
        
        Args:
            method_name: Name of the method
            
        Returns:
            Async function that calls the method
        """
        async def method_proxy(params=None):
            return await self.call(method_name, params)
        
        return method_proxy
    
    def __getattr__(self, name: str):
        """Allow direct method calls on the proxy"""
        return self.method(name)


# Convenience function for creating client
async def create_client(config: Dict[str, Any] = None) -> MCPClient:
    """
    Create and initialize an MCP client
    
    Args:
        config: Client configuration
        
    Returns:
        Initialized MCPClient instance
    """
    client = MCPClient(config)
    return client