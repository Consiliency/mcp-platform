"""Unit tests for API Gateway implementation."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'mcp-local-setup'))

from api_gateway import APIGateway
from contracts.transport_stub import TransportStub
from contracts.process_manager_stub import ProcessManagerStub


def test_api_gateway_initialization():
    """Test API Gateway initialization."""
    gateway = APIGateway()
    
    assert gateway.transport is not None
    assert gateway.process_manager is not None
    assert gateway.servers is not None
    assert gateway.connections == {}
    assert gateway.metrics['requests_total'] == 0
    assert gateway.metrics['requests_per_transport']['stdio'] == 0
    assert gateway.metrics['requests_per_transport']['http'] == 0
    assert gateway.metrics['requests_per_transport']['websocket'] == 0
    assert gateway.metrics['requests_per_transport']['sse'] == 0


def test_transport_detection():
    """Test transport type detection logic."""
    gateway = APIGateway()
    
    # Test stdio detection
    stdio_configs = [
        {'id': 'snap-happy', 'source': {'type': 'npm', 'package': 'snap-happy'}},
        {'id': 'stdio-server', 'source': {'type': 'npm', 'package': 'some-stdio'}},
        {'id': 'test', 'source': {'type': 'npm', 'package': 'stdio-test'}}
    ]
    
    for config in stdio_configs:
        assert gateway._detect_transport(config) == 'stdio'
    
    # Test HTTP detection (default)
    http_config = {'id': 'filesystem', 'config': {'port': 3001}}
    assert gateway._detect_transport(http_config) == 'http'
    
    # Test WebSocket detection
    ws_configs = [
        {'id': 'websocket-test', 'config': {'port': 3003}},
        {'id': 'ws-server', 'config': {'port': 3004}},
        {'id': 'test', 'config': {'environment': {'MCP_MODE': 'websocket'}}}
    ]
    
    for config in ws_configs:
        assert gateway._detect_transport(config) == 'websocket'
    
    # Test SSE detection
    sse_configs = [
        {'id': 'sse-stream', 'config': {'port': 3005}},
        {'id': 'stream-server', 'config': {'port': 3006}},
        {'id': 'test', 'config': {'environment': {'MCP_MODE': 'sse'}}}
    ]
    
    for config in sse_configs:
        assert gateway._detect_transport(config) == 'sse'


def test_start_server_success():
    """Test successful server start."""
    transport = TransportStub()
    process_manager = ProcessManagerStub()
    gateway = APIGateway(transport, process_manager)
    
    # Add a test server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server', 'name': 'Test Server'},
        'status': 'stopped',
        'transport': 'http',
        'connectionId': None,
        'processId': None
    }
    
    result = gateway.start_server('test-server')
    
    assert result['success'] is True
    assert result['transport'] == 'http'
    assert 'connectionId' in result
    assert gateway.servers['test-server']['status'] == 'running'
    assert gateway.servers['test-server']['connectionId'] is not None


def test_start_server_not_found():
    """Test starting non-existent server."""
    gateway = APIGateway()
    
    result = gateway.start_server('non-existent')
    
    assert result['success'] is False
    assert 'not found' in result['message']
    assert result['connectionId'] is None
    assert result['transport'] == 'unknown'


def test_start_server_already_running():
    """Test starting already running server."""
    gateway = APIGateway()
    
    # Add and start a server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server'},
        'status': 'running',
        'transport': 'http',
        'connectionId': 'conn_123',
        'processId': None
    }
    
    result = gateway.start_server('test-server')
    
    assert result['success'] is False
    assert 'already running' in result['message']
    assert result['connectionId'] == 'conn_123'


def test_stop_server_success():
    """Test successful server stop."""
    gateway = APIGateway()
    
    # Add a running server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server'},
        'status': 'running',
        'transport': 'http',
        'connectionId': 'conn_123',
        'processId': None
    }
    gateway.connections['conn_123'] = 'test-server'
    
    result = gateway.stop_server('test-server')
    
    assert result['success'] is True
    assert gateway.servers['test-server']['status'] == 'stopped'
    assert gateway.servers['test-server']['connectionId'] is None
    assert 'conn_123' not in gateway.connections


def test_stop_server_not_running():
    """Test stopping non-running server."""
    gateway = APIGateway()
    
    # Add a stopped server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server'},
        'status': 'stopped',
        'transport': 'http',
        'connectionId': None,
        'processId': None
    }
    
    result = gateway.stop_server('test-server')
    
    assert result['success'] is False
    assert 'not running' in result['message']


def test_send_request_success():
    """Test successful request sending."""
    transport = TransportStub()
    gateway = APIGateway(transport)
    
    # Add a running server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server'},
        'status': 'running',
        'transport': 'http',
        'connectionId': 'conn_123',
        'processId': None
    }
    
    request = {
        "jsonrpc": "2.0",
        "method": "test",
        "params": {"data": "hello"},
        "id": 1
    }
    
    response = gateway.send_request('test-server', request)
    
    assert response['jsonrpc'] == '2.0'
    assert response['id'] == 1
    assert 'result' in response
    assert gateway.metrics['requests_total'] == 1
    assert gateway.metrics['requests_per_transport']['http'] == 1


def test_send_request_server_not_running():
    """Test sending request to non-running server."""
    gateway = APIGateway()
    
    # Add a stopped server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server'},
        'status': 'stopped',
        'transport': 'http',
        'connectionId': None,
        'processId': None
    }
    
    request = {"jsonrpc": "2.0", "method": "test", "id": 1}
    response = gateway.send_request('test-server', request)
    
    assert 'error' in response
    assert response['error']['code'] == -32002
    assert 'not running' in response['error']['message']


def test_get_server_info():
    """Test getting server information."""
    gateway = APIGateway()
    
    # Add a server
    gateway.servers['test-server'] = {
        'config': {'id': 'test-server', 'name': 'Test Server'},
        'status': 'running',
        'transport': 'http',
        'connectionId': 'conn_123',
        'processId': None
    }
    
    info = gateway.get_server_info('test-server')
    
    assert info['id'] == 'test-server'
    assert info['name'] == 'Test Server'
    assert info['transport'] == 'http'
    assert info['status'] == 'running'
    assert info['connectionId'] == 'conn_123'
    assert 'metrics' in info


def test_get_server_info_not_found():
    """Test getting info for non-existent server."""
    gateway = APIGateway()
    
    info = gateway.get_server_info('non-existent')
    
    assert info['id'] == 'non-existent'
    assert info['status'] == 'not_found'
    assert info['transport'] == 'unknown'
    assert info['connectionId'] is None


def test_list_servers():
    """Test listing servers with filters."""
    gateway = APIGateway()
    
    # Add some servers
    gateway.servers.update({
        'server1': {
            'config': {'id': 'server1'},
            'status': 'running',
            'transport': 'http',
            'connectionId': 'conn_1',
            'processId': None
        },
        'server2': {
            'config': {'id': 'server2'},
            'status': 'stopped',
            'transport': 'stdio',
            'connectionId': None,
            'processId': None
        },
        'server3': {
            'config': {'id': 'server3'},
            'status': 'running',
            'transport': 'websocket',
            'connectionId': 'conn_3',
            'processId': None
        }
    })
    
    # Test listing all servers
    all_servers = gateway.list_servers()
    assert len(all_servers) >= 3
    
    # Test listing only running servers
    running_servers = gateway.list_servers(filter_running=True)
    running_ids = [s['id'] for s in running_servers]
    assert 'server1' in running_ids
    assert 'server3' in running_ids
    assert 'server2' not in running_ids
    
    # Test listing only stopped servers
    stopped_servers = gateway.list_servers(filter_running=False)
    stopped_ids = [s['id'] for s in stopped_servers]
    assert 'server2' in stopped_ids
    assert 'server1' not in stopped_ids
    assert 'server3' not in stopped_ids


def test_get_metrics():
    """Test metrics retrieval."""
    gateway = APIGateway()
    
    # Add some activity
    gateway.metrics['requests_total'] = 100
    gateway.metrics['requests_per_transport']['http'] = 50
    gateway.metrics['requests_per_transport']['stdio'] = 30
    gateway.metrics['requests_per_transport']['websocket'] = 20
    
    # Add running servers
    gateway.servers['server1'] = {'status': 'running', 'transport': 'http'}
    gateway.servers['server2'] = {'status': 'running', 'transport': 'stdio'}
    gateway.servers['server3'] = {'status': 'stopped', 'transport': 'websocket'}
    
    metrics = gateway.get_metrics()
    
    assert metrics['requests_total'] == 100
    assert metrics['requests_per_transport']['http'] == 50
    assert metrics['requests_per_transport']['stdio'] == 30
    assert metrics['requests_per_transport']['websocket'] == 20
    assert metrics['active_connections'] == 2  # Only running servers
    assert metrics['uptime'] >= 0


def test_connection_config_creation():
    """Test connection configuration creation for different transports."""
    gateway = APIGateway()
    
    # Test stdio connection config
    stdio_server = {
        'config': {
            'id': 'snap-happy',
            'source': {'type': 'npm', 'package': 'snap-happy-package'},
            'config': {'environment': {'NODE_ENV': 'test'}}
        },
        'transport': 'stdio'
    }
    
    stdio_config = gateway._create_connection_config(stdio_server)
    assert stdio_config['serverId'] == 'snap-happy'
    assert stdio_config['command'] == 'snap-happy-package'
    assert stdio_config['args'] == []
    assert stdio_config['env']['NODE_ENV'] == 'test'
    
    # Test HTTP connection config
    http_server = {
        'config': {
            'id': 'filesystem',
            'config': {'port': 3001}
        },
        'transport': 'http'
    }
    
    http_config = gateway._create_connection_config(http_server)
    assert http_config['serverId'] == 'filesystem'
    assert http_config['url'] == 'http://localhost:3001'
    
    # Test WebSocket connection config
    ws_server = {
        'config': {
            'id': 'websocket-test',
            'config': {'port': 3003}
        },
        'transport': 'websocket'
    }
    
    ws_config = gateway._create_connection_config(ws_server)
    assert ws_config['serverId'] == 'websocket-test'
    assert ws_config['url'] == 'ws://localhost:3003'


def test_process_config_creation():
    """Test process configuration creation."""
    gateway = APIGateway()
    
    server = {
        'config': {
            'id': 'test-server',
            'source': {'type': 'npm', 'package': 'test-package'},
            'config': {'environment': {'CUSTOM_VAR': 'value'}}
        }
    }
    
    process_config = gateway._create_process_config(server)
    
    assert process_config['id'] == 'test-server'
    assert process_config['command'] == 'test-package'
    assert process_config['args'] == []
    assert process_config['env']['NODE_ENV'] == 'production'
    assert process_config['env']['CUSTOM_VAR'] == 'value'