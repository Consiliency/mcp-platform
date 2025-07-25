# File: mcp-local-setup/contracts/transport_contract.py
# Purpose: Define the boundary for transport adapters
# Team responsible: Transport Team

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple, Union

class TransportContract(ABC):
    """Abstract contract defining transport adapter interface"""
    
    @abstractmethod
    def initialize(self) -> None:
        """Initialize the transport adapter
        
        Preconditions:
            - Transport configuration is valid
            
        Postconditions:
            - Transport is ready to create connections
            - Status is set to 'initialized'
        """
        pass
    
    @abstractmethod
    def create_connection(self, config: Dict[str, Any]) -> str:
        """Create a new connection for a server
        
        Args:
            config: Connection configuration including:
                - serverId: Unique server identifier
                - command: Command to execute (stdio)
                - url: Server URL (http/websocket)
                - args: Command arguments (stdio)
                - env: Environment variables
                
        Returns:
            Connection ID as string
            
        Preconditions:
            - Transport is initialized
            - Config contains required fields for transport type
            
        Postconditions:
            - Connection is established and active
            - Connection ID is stored internally
        """
        pass
    
    @abstractmethod
    def send_message(self, connection_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """Send a message through the transport
        
        Args:
            connection_id: Connection identifier
            message: JSON-RPC 2.0 message
            
        Returns:
            Response message as dictionary
            
        Preconditions:
            - Connection exists and is active
            - Message is valid JSON-RPC 2.0
            
        Postconditions:
            - Message is sent to server
            - Response is received and returned
        """
        pass
    
    @abstractmethod
    def close_connection(self, connection_id: str) -> None:
        """Close a connection
        
        Args:
            connection_id: Connection identifier
            
        Preconditions:
            - Connection exists
            
        Postconditions:
            - Connection is closed
            - Resources are cleaned up
        """
        pass
    
    @abstractmethod
    def get_status(self, connection_id: str) -> Dict[str, Any]:
        """Get connection status
        
        Args:
            connection_id: Connection identifier
            
        Returns:
            Status dictionary with:
                - status: 'connected', 'disconnected', 'error'
                - uptime: Seconds since connection started
                - metrics: Connection metrics
                
        Preconditions:
            - Connection ID exists
        """
        pass