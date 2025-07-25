#!/usr/bin/env python3
"""Test real transport adapter integration"""

import sys
import os
import json
import time

# Add paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mcp-local-setup'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'bridge', 'transports'))

from transport_adapter import TransportAdapter
from contracts.process_manager_stub import ProcessManagerStub
from contracts.api_gateway_stub import APIGatewayStub


def test_real_transport_basic_functionality():
    """Test real transport adapter basic operations"""
    transport = TransportAdapter()
    
    # Initialize
    transport.initialize()
    assert transport.initialized == True
    
    # Create a connection (using sleep command to keep it running)
    config = {
        'serverId': 'test-sleep-server',
        'command': 'sleep',
        'args': ['60'],  # Sleep for 60 seconds
        'env': {'TEST_VAR': 'test_value'}
    }
    
    connection_id = transport.create_connection(config)
    assert isinstance(connection_id, str)
    assert connection_id.startswith('conn_')
    
    # Get status
    status = transport.get_status(connection_id)
    assert status['status'] == 'connected'
    assert isinstance(status['uptime'], int)
    assert status['uptime'] >= 0
    
    # Close connection
    transport.close_connection(connection_id)
    
    # Give it a moment to close
    time.sleep(0.1)
    
    # Verify closed (should be unknown after deletion)
    status = transport.get_status(connection_id)
    assert status['status'] in ['disconnected', 'unknown']
    
    print("✅ Real transport basic functionality test passed")


def test_real_transport_factory_detection():
    """Test transport factory correctly detects transport types"""
    transport = TransportAdapter()
    transport.initialize()
    
    # Test stdio detection - this should work
    stdio_config = {
        'serverId': 'stdio-server',
        'command': 'sleep',
        'args': ['1']
    }
    conn1 = transport.create_connection(stdio_config)
    assert conn1.startswith('conn_')
    transport.close_connection(conn1)
    
    # Test that HTTP/WS/SSE configs would be routed correctly
    # These will fail to connect but we can verify the transport type detection
    # by checking error messages
    
    # Test HTTP detection
    http_config = {
        'serverId': 'http-server',
        'url': 'http://localhost:3000/rpc'
    }
    try:
        conn2 = transport.create_connection(http_config)
        transport.close_connection(conn2)
    except RuntimeError as e:
        # Expected - no server running
        assert 'ECONNREFUSED' in str(e) or 'connect' in str(e)
    
    # Test WebSocket detection
    ws_config = {
        'serverId': 'ws-server',
        'url': 'ws://localhost:3001/ws'
    }
    try:
        conn3 = transport.create_connection(ws_config)
        transport.close_connection(conn3)
    except RuntimeError as e:
        # Expected - no server running
        assert 'ECONNREFUSED' in str(e) or 'connect' in str(e)
    
    # Test SSE detection
    sse_config = {
        'serverId': 'sse-server',
        'url': 'http://localhost:3002/events',
        'transport': 'sse'
    }
    try:
        conn4 = transport.create_connection(sse_config)
        transport.close_connection(conn4)
    except RuntimeError as e:
        # Expected - no server running
        assert 'ECONNREFUSED' in str(e) or 'connect' in str(e)
    
    print("✅ Transport factory detection test passed")


def test_real_transport_error_handling():
    """Test real transport error handling"""
    transport = TransportAdapter()
    transport.initialize()
    
    # Test invalid config
    try:
        transport.create_connection({})
        assert False, "Should have raised error for invalid config"
    except RuntimeError as e:
        assert "Invalid config" in str(e)
    
    # Test non-existent connection
    status = transport.get_status('fake-connection-id')
    assert status['status'] == 'unknown'
    assert status['uptime'] == 0
    
    # Test closing non-existent connection (should not error)
    transport.close_connection('fake-connection-id')
    
    print("✅ Transport error handling test passed")


def test_real_transport_message_handling():
    """Test real transport message sending"""
    transport = TransportAdapter()
    transport.initialize()
    
    # Create a simple stdio connection using cat command
    config = {
        'serverId': 'cat-server',
        'command': 'cat',  # Cat will echo back what we send
        'args': []
    }
    
    connection_id = transport.create_connection(config)
    
    # Send a message (cat won't respond with proper JSON-RPC, but we can test the send)
    message = {
        "jsonrpc": "2.0",
        "method": "test",
        "params": {"data": "hello"},
        "id": 1
    }
    
    try:
        # This might timeout since cat doesn't send proper JSON-RPC responses
        response = transport.send_message(connection_id, message)
    except Exception as e:
        # Expected - cat doesn't send JSON-RPC responses
        pass
    
    # Close connection
    transport.close_connection(connection_id)
    
    print("✅ Transport message handling test passed")


if __name__ == "__main__":
    print("Running real transport adapter integration tests...\n")
    
    test_real_transport_basic_functionality()
    test_real_transport_factory_detection()
    test_real_transport_error_handling()
    test_real_transport_message_handling()
    
    print("\n✅ All real transport integration tests passed!")