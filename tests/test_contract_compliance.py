# File: tests/test_contract_compliance.py
# Verify implementations match contracts exactly

import inspect
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'mcp-local-setup'))

from contracts.transport_contract import TransportContract
from contracts.process_manager_contract import ProcessManagerContract  
from contracts.api_gateway_contract import APIGatewayContract

def verify_contract_compliance(contract_class, implementation_class):
    """Verify implementation matches contract exactly"""
    
    # Get all abstract methods from contract
    abstract_methods = []
    for name, method in inspect.getmembers(contract_class):
        if hasattr(method, '__isabstractmethod__') and method.__isabstractmethod__:
            abstract_methods.append(name)
    
    errors = []
    
    # Check all abstract methods are implemented
    for method_name in abstract_methods:
        if not hasattr(implementation_class, method_name):
            errors.append(f"Missing implementation for {method_name}")
            continue
            
        # Get methods
        contract_method = getattr(contract_class, method_name)
        impl_method = getattr(implementation_class, method_name)
        
        # Verify signatures match
        contract_sig = inspect.signature(contract_method)
        impl_sig = inspect.signature(impl_method)
        
        # Get parameters (excluding 'self')
        contract_params = list(contract_sig.parameters.items())[1:]
        impl_params = list(impl_sig.parameters.items())[1:]
        
        # Check parameter count
        if len(contract_params) != len(impl_params):
            errors.append(f"{method_name}: Parameter count mismatch - "
                         f"contract has {len(contract_params)}, "
                         f"implementation has {len(impl_params)}")
            continue
        
        # Check each parameter
        for (c_name, c_param), (i_name, i_param) in zip(contract_params, impl_params):
            if c_name != i_name:
                errors.append(f"{method_name}: Parameter name mismatch - "
                             f"'{c_name}' vs '{i_name}'")
            
            # Check annotations if present
            if c_param.annotation != inspect.Parameter.empty:
                if c_param.annotation != i_param.annotation:
                    errors.append(f"{method_name}: Parameter '{c_name}' type mismatch - "
                                 f"{c_param.annotation} vs {i_param.annotation}")
        
        # Check return type annotation
        if contract_sig.return_annotation != impl_sig.return_annotation:
            errors.append(f"{method_name}: Return type mismatch - "
                         f"{contract_sig.return_annotation} vs "
                         f"{impl_sig.return_annotation}")
    
    return errors


def test_transport_contract_compliance():
    """Test transport implementations match contract"""
    # When real implementation exists, import it here
    # from bridge.transports.stdio import StdioTransport
    # errors = verify_contract_compliance(TransportContract, StdioTransport)
    
    # For now, test with stub
    from contracts.transport_stub import TransportStub
    errors = verify_contract_compliance(TransportContract, TransportStub)
    
    if errors:
        print("Transport Contract Violations:")
        for error in errors:
            print(f"  - {error}")
        assert False, f"Found {len(errors)} contract violations"


def test_process_manager_contract_compliance():
    """Test process manager implementations match contract"""
    # When real implementation exists, import it here
    # from services.process_manager import ProcessManager
    # errors = verify_contract_compliance(ProcessManagerContract, ProcessManager)
    
    # For now, test with stub
    from contracts.process_manager_stub import ProcessManagerStub
    errors = verify_contract_compliance(ProcessManagerContract, ProcessManagerStub)
    
    if errors:
        print("Process Manager Contract Violations:")
        for error in errors:
            print(f"  - {error}")
        assert False, f"Found {len(errors)} contract violations"


def test_api_gateway_contract_compliance():
    """Test API gateway implementations match contract"""
    # When real implementation exists, import it here
    # from api.gateway import APIGateway
    # errors = verify_contract_compliance(APIGatewayContract, APIGateway)
    
    # For now, test with stub
    from contracts.api_gateway_stub import APIGatewayStub
    errors = verify_contract_compliance(APIGatewayContract, APIGatewayStub)
    
    if errors:
        print("API Gateway Contract Violations:")
        for error in errors:
            print(f"  - {error}")
        assert False, f"Found {len(errors)} contract violations"


def test_return_type_validation():
    """Test that implementations return correct types"""
    from contracts.transport_stub import TransportStub
    from contracts.process_manager_stub import ProcessManagerStub
    from contracts.api_gateway_stub import APIGatewayStub
    
    # Test Transport
    transport = TransportStub()
    transport.initialize()
    
    conn_id = transport.create_connection({'serverId': 'test'})
    assert isinstance(conn_id, str), "create_connection must return string"
    
    message = {"jsonrpc": "2.0", "method": "test", "id": 1}
    response = transport.send_message(conn_id, message)
    assert isinstance(response, dict), "send_message must return dict"
    
    status = transport.get_status(conn_id)
    assert isinstance(status, dict), "get_status must return dict"
    assert 'status' in status
    assert 'uptime' in status
    assert 'metrics' in status
    
    # Test Process Manager
    pm = ProcessManagerStub()
    
    proc_id = pm.spawn_process({'command': 'test'})
    assert isinstance(proc_id, str), "spawn_process must return string"
    
    stopped = pm.stop_process(proc_id)
    assert isinstance(stopped, bool), "stop_process must return bool"
    
    proc_status = pm.get_process_status(proc_id)
    assert isinstance(proc_status, dict), "get_process_status must return dict"
    
    logs = pm.get_process_logs(proc_id)
    assert isinstance(logs, dict), "get_process_logs must return dict"
    assert 'stdout' in logs
    assert 'stderr' in logs
    assert isinstance(logs['stdout'], list)
    assert isinstance(logs['stderr'], list)
    
    proc_list = pm.list_processes()
    assert isinstance(proc_list, list), "list_processes must return list"
    
    # Test API Gateway
    gateway = APIGatewayStub()
    
    start_result = gateway.start_server('test')
    assert isinstance(start_result, dict), "start_server must return dict"
    assert 'success' in start_result
    assert isinstance(start_result['success'], bool)
    
    server_list = gateway.list_servers()
    assert isinstance(server_list, list), "list_servers must return list"
    
    metrics = gateway.get_metrics()
    assert isinstance(metrics, dict), "get_metrics must return dict"


if __name__ == "__main__":
    # Run all compliance tests
    test_transport_contract_compliance()
    test_process_manager_contract_compliance()
    test_api_gateway_contract_compliance()
    test_return_type_validation()
    print("All contract compliance tests passed!")