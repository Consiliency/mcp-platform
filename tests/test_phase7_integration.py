# File: tests/test_phase7_integration.py
# Test: Phase 7 Universal Transport Support Integration
# Components involved: Transport, ProcessManager, APIGateway
# Expected behavior: All transport types work through unified API

# CRITICAL: Import stub implementations, not Mock!
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mcp-local-setup'))

from contracts.transport_stub import TransportStub
from contracts.process_manager_stub import ProcessManagerStub
from contracts.api_gateway_stub import APIGatewayStub

def test_stdio_server_lifecycle_integration():
    """Test complete lifecycle of stdio server through API gateway"""
    # Arrange: Create real stub instances (NOT Mock()!)
    transport = TransportStub()
    process_manager = ProcessManagerStub()
    api_gateway = APIGatewayStub()
    
    # Initialize transport
    transport.initialize()
    
    # Act: Start stdio server through API gateway
    server_id = "snap-happy"
    start_result = api_gateway.start_server(server_id)
    
    # Assert: Verify correct types and structure
    assert isinstance(start_result, dict), f"Expected dict, got {type(start_result)}"
    assert start_result['success'] is True
    assert isinstance(start_result['connectionId'], str)
    assert start_result['transport'] == 'stdio'
    
    # Simulate process spawn for stdio transport
    process_config = {
        'id': server_id,
        'command': 'snap-happy',
        'args': [],
        'env': {'NODE_ENV': 'production'}
    }
    process_id = process_manager.spawn_process(process_config)
    assert isinstance(process_id, str)
    
    # Verify process is running
    process_status = process_manager.get_process_status(process_id)
    assert process_status['status'] == 'running'
    assert isinstance(process_status['pid'], int)
    assert process_status['pid'] > 0
    
    # Send request through gateway
    request = {
        "jsonrpc": "2.0",
        "method": "screenshot",
        "params": {"url": "https://example.com"},
        "id": 1
    }
    response = api_gateway.send_request(server_id, request)
    
    # Verify response structure
    assert isinstance(response, dict)
    assert response.get('jsonrpc') == '2.0'
    assert 'result' in response
    
    # Stop server
    stop_result = api_gateway.stop_server(server_id)
    assert stop_result['success'] is True
    
    # Verify process is stopped
    process_manager.stop_process(process_id)
    final_status = process_manager.get_process_status(process_id)
    assert final_status['status'] == 'stopped'


def test_transport_message_routing_integration():
    """Test message routing between transport and process manager"""
    # Arrange
    transport = TransportStub()
    process_manager = ProcessManagerStub()
    
    transport.initialize()
    
    # Start a process
    process_id = process_manager.spawn_process({
        'id': 'test-server',
        'command': 'node',
        'args': ['server.js']
    })
    
    # Create transport connection
    connection_id = transport.create_connection({
        'serverId': 'test-server',
        'command': 'node',
        'args': ['server.js']
    })
    
    # Act: Send message through transport
    message = {
        "jsonrpc": "2.0",
        "method": "test",
        "params": {"data": "hello"},
        "id": 123
    }
    response = transport.send_message(connection_id, message)
    
    # Assert: Verify message handling
    assert isinstance(response, dict)
    assert response['jsonrpc'] == '2.0'
    assert response['id'] == 123
    assert 'result' in response
    
    # Check connection status
    conn_status = transport.get_status(connection_id)
    assert conn_status['status'] == 'connected'
    assert isinstance(conn_status['uptime'], int)
    assert conn_status['uptime'] >= 0
    
    # Check process logs
    logs = process_manager.get_process_logs(process_id, lines=10)
    assert isinstance(logs, dict)
    assert 'stdout' in logs
    assert 'stderr' in logs
    assert isinstance(logs['stdout'], list)
    
    # Cleanup
    transport.close_connection(connection_id)
    final_status = transport.get_status(connection_id)
    assert final_status['status'] == 'disconnected'


def test_multi_transport_gateway_integration():
    """Test API gateway handling multiple transport types"""
    # Arrange
    api_gateway = APIGatewayStub()
    
    # Start servers with different transports
    servers = [
        ("filesystem", "http"),
        ("snap-happy", "stdio"),
        ("websocket-test", "websocket"),
        ("sse-stream", "sse")
    ]
    
    started_servers = []
    for server_id, expected_transport in servers:
        # Act: Start each server
        result = api_gateway.start_server(server_id)
        
        # Assert: Verify correct transport detection
        assert result['success'] is True
        assert result['transport'] == expected_transport
        started_servers.append(server_id)
    
    # List running servers
    running_servers = api_gateway.list_servers(filter_running=True)
    assert len(running_servers) == len(servers)
    
    # Send requests to each server
    for server_id, _ in servers:
        request = {
            "jsonrpc": "2.0",
            "method": "test",
            "id": server_id
        }
        response = api_gateway.send_request(server_id, request)
        assert response['jsonrpc'] == '2.0'
        assert response['id'] == server_id
    
    # Check metrics
    metrics = api_gateway.get_metrics()
    assert metrics['requests_total'] == len(servers)
    assert metrics['active_connections'] == len(servers)
    assert sum(metrics['requests_per_transport'].values()) == len(servers)
    
    # Stop all servers
    for server_id in started_servers:
        result = api_gateway.stop_server(server_id)
        assert result['success'] is True
    
    # Verify all stopped
    running_servers = api_gateway.list_servers(filter_running=True)
    assert len(running_servers) == 0


def test_process_manager_resource_monitoring():
    """Test process manager monitoring capabilities"""
    # Arrange
    process_manager = ProcessManagerStub()
    
    # Spawn multiple processes
    process_ids = []
    for i in range(3):
        config = {
            'id': f'worker-{i}',
            'command': 'node',
            'args': ['worker.js'],
            'autoRestart': True
        }
        pid = process_manager.spawn_process(config)
        process_ids.append(pid)
    
    # Act: Get process list
    all_processes = process_manager.list_processes()
    
    # Assert: Verify process list
    assert len(all_processes) == 3
    for proc in all_processes:
        assert isinstance(proc['id'], str)
        assert isinstance(proc['pid'], int)
        assert proc['status'] == 'running'
    
    # Check individual process status
    for pid in process_ids:
        status = process_manager.get_process_status(pid)
        assert isinstance(status['cpu'], float)
        assert isinstance(status['memory'], float)
        assert status['cpu'] >= 0
        assert status['memory'] >= 0
        assert status['restarts'] == 0
    
    # Stop one process
    process_manager.stop_process(process_ids[0])
    
    # Verify mixed statuses
    statuses = [process_manager.get_process_status(pid)['status'] 
                for pid in process_ids]
    assert statuses[0] == 'stopped'
    assert statuses[1] == 'running'
    assert statuses[2] == 'running'


def test_error_handling_integration():
    """Test error handling across components"""
    # Arrange
    transport = TransportStub()
    api_gateway = APIGatewayStub()
    
    # Test uninitialized transport
    # Should not crash, but handle gracefully
    conn_id = transport.create_connection({'serverId': 'test'})
    assert isinstance(conn_id, str)
    
    # Test non-existent server
    result = api_gateway.stop_server('non-existent')
    assert result['success'] is False
    assert 'not found' in result['message']
    
    # Test invalid connection
    status = transport.get_status('invalid-connection')
    assert status['status'] == 'unknown'
    assert status['uptime'] == 0
    
    # Test server info for non-existent
    info = api_gateway.get_server_info('fake-server')
    assert info['status'] == 'not_found'
    assert info['transport'] == 'unknown'