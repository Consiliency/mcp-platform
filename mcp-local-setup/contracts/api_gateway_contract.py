# File: mcp-local-setup/contracts/api_gateway_contract.py
# Purpose: Define the boundary for unified API gateway
# Team responsible: API Team

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

class APIGatewayContract(ABC):
    """Abstract contract defining API gateway interface"""
    
    @abstractmethod
    def start_server(self, server_id: str) -> Dict[str, Any]:
        """Start an MCP server through unified API
        
        Args:
            server_id: Server identifier from registry
            
        Returns:
            Response with:
                - success: Boolean
                - connectionId: Connection identifier
                - transport: Transport type used
                - message: Status message
                
        Preconditions:
            - Server exists in registry
            - Server not already running
            
        Postconditions:
            - Server is started via appropriate transport
            - Connection is tracked
        """
        pass
    
    @abstractmethod
    def stop_server(self, server_id: str) -> Dict[str, Any]:
        """Stop a running server
        
        Args:
            server_id: Server identifier
            
        Returns:
            Response with:
                - success: Boolean
                - message: Status message
                
        Preconditions:
            - Server is running
            
        Postconditions:
            - Server is stopped
            - Resources are cleaned up
        """
        pass
    
    @abstractmethod
    def send_request(self, server_id: str, request: Dict[str, Any]) -> Dict[str, Any]:
        """Send request to server via appropriate transport
        
        Args:
            server_id: Server identifier
            request: JSON-RPC request
            
        Returns:
            JSON-RPC response from server
            
        Preconditions:
            - Server is running
            - Request is valid JSON-RPC
            
        Postconditions:
            - Request is routed to correct transport
            - Response is returned
        """
        pass
    
    @abstractmethod
    def get_server_info(self, server_id: str) -> Dict[str, Any]:
        """Get server information and status
        
        Args:
            server_id: Server identifier
            
        Returns:
            Server info with:
                - id: Server ID
                - name: Server name
                - transport: Transport type
                - status: Current status
                - connectionId: Active connection ID
                - metrics: Performance metrics
                
        Preconditions:
            - Server exists in registry
        """
        pass
    
    @abstractmethod
    def list_servers(self, filter_running: Optional[bool] = None) -> List[Dict[str, Any]]:
        """List all registered servers
        
        Args:
            filter_running: If True, only running servers; if False, only stopped
            
        Returns:
            List of server info dictionaries
        """
        pass
    
    @abstractmethod
    def get_metrics(self) -> Dict[str, Any]:
        """Get gateway metrics
        
        Returns:
            Metrics dictionary with:
                - requests_total: Total requests handled
                - requests_per_transport: Breakdown by transport
                - active_connections: Current connections
                - uptime: Gateway uptime in seconds
        """
        pass