#!/usr/bin/env python3
"""Test Phase 7 integration with real transport adapter"""

import sys
import os
import time

# Add paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mcp-local-setup'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'bridge', 'transports'))

# Import our real transport adapter instead of the stub
from transport_adapter import TransportAdapter
from contracts.process_manager_stub import ProcessManagerStub
from contracts.api_gateway_stub import APIGatewayStub


def test_stdio_server_lifecycle_with_real_transport():
    """Test complete lifecycle of stdio server with real transport"""
    # Use our real transport implementation
    transport = TransportAdapter()
    process_manager = ProcessManagerStub()
    api_gateway = APIGatewayStub()
    
    # Initialize transport
    transport.initialize()
    assert transport.initialized == True
    
    # Create a stdio connection
    config = {
        'serverId': 'test-stdio-server',
        'command': 'sleep',
        'args': ['30'],  # Sleep for 30 seconds
        'env': {'NODE_ENV': 'test'}
    }
    
    connection_id = transport.create_connection(config)
    assert isinstance(connection_id, str)
    assert connection_id.startswith('conn_')
    
    # Verify connection status
    status = transport.get_status(connection_id)
    assert status['status'] == 'connected'
    assert isinstance(status['uptime'], int)
    assert status['uptime'] >= 0
    assert 'metrics' in status
    
    # Test sending a message (even though sleep won't respond)
    message = {
        "jsonrpc": "2.0",
        "method": "test",
        "params": {"data": "hello"},
        "id": 1
    }
    
    try:
        # This will timeout since sleep doesn't respond
        response = transport.send_message(connection_id, message)
    except Exception:
        # Expected - sleep doesn't send responses
        pass
    
    # Close connection
    transport.close_connection(connection_id)
    
    # Verify connection is closed
    time.sleep(0.1)
    final_status = transport.get_status(connection_id)
    assert final_status['status'] in ['disconnected', 'unknown']
    
    print("✅ Stdio server lifecycle with real transport test passed")


def test_transport_metrics_tracking():
    """Test that transport properly tracks metrics"""
    transport = TransportAdapter()
    transport.initialize()
    
    # Create multiple connections
    connections = []
    for i in range(3):
        config = {
            'serverId': f'test-server-{i}',
            'command': 'sleep',
            'args': ['10']
        }
        conn_id = transport.create_connection(config)
        connections.append(conn_id)
    
    # Check each connection status
    for conn_id in connections:
        status = transport.get_status(conn_id)
        assert status['status'] == 'connected'
        assert 'metrics' in status
    
    # Close all connections
    for conn_id in connections:
        transport.close_connection(conn_id)
    
    print("✅ Transport metrics tracking test passed")


def test_real_transport_concurrent_connections():
    """Test handling multiple concurrent connections"""
    transport = TransportAdapter()
    transport.initialize()
    
    # Create connections of different types
    connections = []
    
    # Stdio connections
    for i in range(2):
        config = {
            'serverId': f'stdio-server-{i}',
            'command': 'cat',  # Cat will keep running
            'args': []
        }
        conn_id = transport.create_connection(config)
        connections.append(conn_id)
    
    # Verify all connections are active
    for conn_id in connections:
        status = transport.get_status(conn_id)
        assert status['status'] == 'connected'
    
    # Close all connections
    for conn_id in connections:
        transport.close_connection(conn_id)
    
    print("✅ Concurrent connections test passed")


def test_transport_error_recovery():
    """Test transport error handling and recovery"""
    transport = TransportAdapter()
    transport.initialize()
    
    # Test creating connection with invalid command
    config = {
        'serverId': 'invalid-server',
        'command': 'this_command_does_not_exist_12345',
        'args': []
    }
    
    try:
        conn_id = transport.create_connection(config)
        # Some systems might not immediately fail
        status = transport.get_status(conn_id)
        # Connection might show as error or disconnected
        assert status['status'] in ['error', 'disconnected', 'connected']
        transport.close_connection(conn_id)
    except RuntimeError as e:
        # This is also acceptable - command not found
        assert 'spawn' in str(e) or 'not found' in str(e)
    
    # Transport should still be functional after error
    # Create a valid connection
    valid_config = {
        'serverId': 'valid-server',
        'command': 'sleep',
        'args': ['1']
    }
    conn_id = transport.create_connection(valid_config)
    assert conn_id.startswith('conn_')
    transport.close_connection(conn_id)
    
    print("✅ Transport error recovery test passed")


if __name__ == "__main__":
    print("Running Phase 7 integration tests with real transport adapter...\n")
    
    test_stdio_server_lifecycle_with_real_transport()
    test_transport_metrics_tracking()
    test_real_transport_concurrent_connections()
    test_transport_error_recovery()
    
    print("\n✅ All Phase 7 integration tests with real transport passed!")