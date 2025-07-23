#!/usr/bin/env python3
import sys
import json
import time
import argparse
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from concurrent.futures import ThreadPoolExecutor, TimeoutError
import asyncio
import aiohttp

class HealthMonitor:
    def __init__(self, config: Dict[str, Any] = None):
        config = config or {}
        self.services = config.get('services', [])
        self.check_interval = config.get('checkInterval', 30000) / 1000  # Convert to seconds
        self.timeout = config.get('timeout', 5000) / 1000  # Convert to seconds
        self.health_checks = {}
        self.service_status = {}
        self.start_time = time.time()
        self.initialized = set()
        
        # Initialize service status
        for service in self.services:
            self.service_status[service] = {
                'status': 'pending',
                'lastCheck': None,
                'message': 'Not checked yet'
            }
    
    async def check_health(self, service_name: Optional[str] = None) -> Dict:
        if not service_name:
            # Check overall system health
            tasks = [self.check_service_health(service) for service in self.services]
            all_statuses = await asyncio.gather(*tasks)
            
            unhealthy = sum(1 for s in all_statuses if s['status'] == 'unhealthy')
            degraded = sum(1 for s in all_statuses if s['status'] == 'degraded')
            
            overall_status = 'healthy'
            if unhealthy > 0:
                overall_status = 'unhealthy'
            elif degraded > 0:
                overall_status = 'degraded'
            
            return {
                'status': overall_status,
                'details': {
                    'services': {s['service']: s for s in all_statuses},
                    'timestamp': datetime.utcnow().isoformat(),
                    'uptime': time.time() - self.start_time
                },
                'timestamp': datetime.utcnow().isoformat()
            }
        
        # Check specific service
        return await self.check_service_health(service_name)
    
    async def check_service_health(self, service_name: str) -> Dict:
        check_fn = self.health_checks.get(service_name)
        
        if not check_fn:
            # No custom check registered, use default
            status = self.service_status.get(service_name, {})
            return {
                'service': service_name,
                'status': status.get('status', 'unknown'),
                'details': status,
                'timestamp': datetime.utcnow().isoformat()
            }
        
        try:
            # Run health check with timeout
            result = await asyncio.wait_for(
                check_fn(),
                timeout=self.timeout
            )
            
            status = 'healthy' if result.get('healthy') else 'unhealthy'
            self.service_status[service_name] = {
                'status': status,
                'lastCheck': datetime.utcnow().isoformat(),
                'message': result.get('message', 'OK')
            }
            
            return {
                'service': service_name,
                'status': status,
                'details': result,
                'timestamp': datetime.utcnow().isoformat()
            }
        except (TimeoutError, asyncio.TimeoutError):
            self.service_status[service_name] = {
                'status': 'unhealthy',
                'lastCheck': datetime.utcnow().isoformat(),
                'message': 'Health check timeout'
            }
            
            return {
                'service': service_name,
                'status': 'unhealthy',
                'details': {'error': 'Health check timeout'},
                'timestamp': datetime.utcnow().isoformat()
            }
        except Exception as e:
            self.service_status[service_name] = {
                'status': 'unhealthy',
                'lastCheck': datetime.utcnow().isoformat(),
                'message': str(e)
            }
            
            return {
                'service': service_name,
                'status': 'unhealthy',
                'details': {'error': str(e)},
                'timestamp': datetime.utcnow().isoformat()
            }
    
    async def liveness_probe(self) -> Dict:
        """Simple liveness check - is the process alive?"""
        return {
            'alive': True,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    async def readiness_probe(self) -> Dict:
        """Check if all required services are ready"""
        health = await self.check_health()
        ready = health['status'] != 'unhealthy'
        
        return {
            'ready': ready,
            'services': health['details']['services'],
            'timestamp': datetime.utcnow().isoformat()
        }
    
    async def startup_probe(self) -> Dict:
        """Check which services have been initialized"""
        initialized = list(self.initialized)
        pending = [s for s in self.services if s not in self.initialized]
        
        return {
            'started': len(pending) == 0,
            'initialized': initialized,
            'pending': pending
        }

def main():
    parser = argparse.ArgumentParser(description='Health check monitor')
    parser.add_argument('--check', choices=['liveness', 'readiness', 'startup'],
                       help='Type of health check to perform')
    args = parser.parse_args()
    
    if args.check:
        monitor = HealthMonitor({'services': []})
        
        async def run_check():
            if args.check == 'liveness':
                await monitor.liveness_probe()
                return 0
            elif args.check == 'readiness':
                probe = await monitor.readiness_probe()
                return 0 if probe['ready'] else 1
            elif args.check == 'startup':
                probe = await monitor.startup_probe()
                return 0 if probe['started'] else 1
        
        exit_code = asyncio.run(run_check())
        sys.exit(exit_code)

if __name__ == '__main__':
    main()