"""
Unit tests for ProcessManagerImpl
"""

import unittest
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
from process_manager_impl import ProcessManagerImpl


class TestProcessManagerImpl(unittest.TestCase):
    """Test ProcessManagerImpl"""
    
    def setUp(self):
        """Set up test instance"""
        self.manager = ProcessManagerImpl()
    
    def test_spawn_process_valid_config(self):
        """Test spawning process with valid config"""
        config = {
            'id': 'test-proc',
            'command': 'node',
            'args': ['test.js'],
            'env': {'NODE_ENV': 'test'}
        }
        
        process_id = self.manager.spawn_process(config)
        
        self.assertEqual(process_id, 'test-proc')
        
        # Verify process is running
        status = self.manager.get_process_status(process_id)
        self.assertEqual(status['status'], 'running')
        self.assertGreater(status['pid'], 0)
    
    def test_spawn_process_missing_command(self):
        """Test spawning process without command raises error"""
        config = {
            'id': 'test-proc',
            'args': ['test.js']
        }
        
        with self.assertRaises(ValueError) as cm:
            self.manager.spawn_process(config)
        
        self.assertIn('Command is required', str(cm.exception))
    
    def test_stop_process_existing(self):
        """Test stopping an existing process"""
        # Spawn a process
        process_id = self.manager.spawn_process({
            'command': 'node',
            'args': ['test.js']
        })
        
        # Stop it
        result = self.manager.stop_process(process_id)
        self.assertTrue(result)
        
        # Verify it's stopped
        status = self.manager.get_process_status(process_id)
        self.assertEqual(status['status'], 'stopped')
    
    def test_stop_process_non_existent(self):
        """Test stopping non-existent process returns False"""
        result = self.manager.stop_process('non-existent')
        self.assertFalse(result)
    
    def test_get_process_status_running(self):
        """Test getting status of running process"""
        process_id = self.manager.spawn_process({
            'command': 'python',
            'args': ['script.py']
        })
        
        status = self.manager.get_process_status(process_id)
        
        self.assertIsInstance(status, dict)
        self.assertIn('pid', status)
        self.assertIn('status', status)
        self.assertIn('uptime', status)
        self.assertIn('cpu', status)
        self.assertIn('memory', status)
        self.assertIn('restarts', status)
        
        self.assertEqual(status['status'], 'running')
        self.assertIsInstance(status['pid'], int)
        self.assertIsInstance(status['cpu'], float)
        self.assertIsInstance(status['memory'], float)
    
    def test_get_process_status_unknown(self):
        """Test getting status of unknown process"""
        status = self.manager.get_process_status('unknown-proc')
        
        self.assertEqual(status['pid'], 0)
        self.assertEqual(status['status'], 'unknown')
        self.assertEqual(status['uptime'], 0)
        self.assertEqual(status['cpu'], 0)
        self.assertEqual(status['memory'], 0)
        self.assertEqual(status['restarts'], 0)
    
    def test_get_process_logs(self):
        """Test getting process logs"""
        process_id = self.manager.spawn_process({
            'command': 'echo',
            'args': ['Hello World']
        })
        
        logs = self.manager.get_process_logs(process_id)
        
        self.assertIsInstance(logs, dict)
        self.assertIn('stdout', logs)
        self.assertIn('stderr', logs)
        self.assertIsInstance(logs['stdout'], list)
        self.assertIsInstance(logs['stderr'], list)
    
    def test_get_process_logs_with_limit(self):
        """Test getting limited process logs"""
        process_id = self.manager.spawn_process({
            'command': 'node',
            'args': ['logger.js']
        })
        
        logs = self.manager.get_process_logs(process_id, lines=10)
        
        self.assertIsInstance(logs['stdout'], list)
        self.assertLessEqual(len(logs['stdout']), 10)
    
    def test_get_process_logs_non_existent(self):
        """Test getting logs for non-existent process"""
        logs = self.manager.get_process_logs('non-existent')
        
        self.assertEqual(logs, {'stdout': [], 'stderr': []})
    
    def test_list_processes(self):
        """Test listing all processes"""
        # Spawn multiple processes
        process_ids = []
        for i in range(3):
            pid = self.manager.spawn_process({
                'id': f'worker-{i}',
                'command': 'node',
                'args': ['worker.js']
            })
            process_ids.append(pid)
        
        # List processes
        processes = self.manager.list_processes()
        
        self.assertIsInstance(processes, list)
        self.assertEqual(len(processes), 3)
        
        for proc in processes:
            self.assertIn('id', proc)
            self.assertIn('pid', proc)
            self.assertIn('status', proc)
            self.assertIn('command', proc)
    
    def test_auto_restart_config(self):
        """Test process with auto-restart configuration"""
        process_id = self.manager.spawn_process({
            'command': 'node',
            'args': ['crasher.js'],
            'autoRestart': True
        })
        
        # Get initial status
        status = self.manager.get_process_status(process_id)
        self.assertEqual(status['restarts'], 0)
        
        # Process would be restarted automatically on crash
        # This is handled by the Node.js implementation
    
    def test_environment_variables(self):
        """Test spawning process with custom environment"""
        config = {
            'command': 'node',
            'args': ['env-test.js'],
            'env': {
                'CUSTOM_VAR': 'test_value',
                'NODE_ENV': 'production'
            }
        }
        
        process_id = self.manager.spawn_process(config)
        
        # Process should be running with custom env
        status = self.manager.get_process_status(process_id)
        self.assertEqual(status['status'], 'running')
    
    def test_working_directory(self):
        """Test spawning process with custom working directory"""
        config = {
            'command': 'pwd',
            'workingDir': '/tmp'
        }
        
        process_id = self.manager.spawn_process(config)
        
        # Process should run in specified directory
        status = self.manager.get_process_status(process_id)
        self.assertEqual(status['status'], 'running')


if __name__ == '__main__':
    unittest.main()