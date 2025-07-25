#!/usr/bin/env python3
"""
Simple test runner for Phase 7 integration tests
"""

import sys
import os
import traceback

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Import tests
from tests.test_phase7_integration import (
    test_stdio_server_lifecycle_integration,
    test_transport_message_routing_integration,
    test_multi_transport_gateway_integration,
    test_process_manager_resource_monitoring,
    test_error_handling_integration
)

def run_test(test_func, test_name):
    """Run a single test and report results"""
    try:
        print(f"\n{'='*60}")
        print(f"Running: {test_name}")
        print('='*60)
        test_func()
        print(f"✓ PASSED: {test_name}")
        return True
    except AssertionError as e:
        print(f"✗ FAILED: {test_name}")
        print(f"  Assertion Error: {e}")
        traceback.print_exc()
        return False
    except Exception as e:
        print(f"✗ ERROR: {test_name}")
        print(f"  Exception: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    tests = [
        (test_process_manager_resource_monitoring, "Process Manager Resource Monitoring"),
        (test_stdio_server_lifecycle_integration, "STDIO Server Lifecycle Integration"),
        (test_transport_message_routing_integration, "Transport Message Routing Integration"),
        (test_multi_transport_gateway_integration, "Multi-Transport Gateway Integration"),
        (test_error_handling_integration, "Error Handling Integration")
    ]
    
    passed = 0
    failed = 0
    
    print("Starting Phase 7 Integration Tests")
    
    for test_func, test_name in tests:
        if run_test(test_func, test_name):
            passed += 1
        else:
            failed += 1
    
    print(f"\n{'='*60}")
    print(f"Test Results: {passed} passed, {failed} failed")
    print('='*60)
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())