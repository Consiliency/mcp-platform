#!/usr/bin/env python3
"""
MCP Gateway Universal Startup Script
Handles platform detection, service startup, and dashboard launch
"""

import os
import sys
import time
import subprocess
import platform
import webbrowser
import json
from pathlib import Path

# ANSI color codes
class Colors:
    GREEN = '\033[0;32m'
    BLUE = '\033[0;34m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'  # No Color
    BOLD = '\033[1m'

def print_colored(message, color=Colors.NC, end='\n'):
    """Print colored message"""
    print(f"{color}{message}{Colors.NC}", end=end)

def print_banner():
    """Display startup banner"""
    print_colored("╔════════════════════════════════════════════════════╗", Colors.BLUE)
    print_colored("║              MCP Gateway Launcher                  ║", Colors.BLUE)
    print_colored("╚════════════════════════════════════════════════════╝", Colors.BLUE)
    print()

def detect_platform():
    """Detect the current platform"""
    system = platform.system().lower()
    
    if system == 'linux':
        # Check if running in WSL
        try:
            with open('/proc/version', 'r') as f:
                if 'microsoft' in f.read().lower():
                    return 'wsl'
        except:
            pass
        return 'linux'
    elif system == 'darwin':
        return 'macos'
    elif system == 'windows':
        return 'windows'
    else:
        return 'unknown'

def is_docker():
    """Check if running inside Docker"""
    return os.path.exists('/.dockerenv') or os.path.exists('/run/.containerenv')

def check_docker_available():
    """Check if Docker is installed and running"""
    try:
        subprocess.run(['docker', '--version'], 
                      stdout=subprocess.DEVNULL, 
                      stderr=subprocess.DEVNULL, 
                      check=True)
        # Also check if Docker daemon is running
        subprocess.run(['docker', 'ps'], 
                      stdout=subprocess.DEVNULL, 
                      stderr=subprocess.DEVNULL, 
                      check=True)
        return True
    except:
        return False

def check_port(port):
    """Check if a port is available"""
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    return result == 0

def wait_for_service(url, timeout=30):
    """Wait for a service to be available"""
    import urllib.request
    import urllib.error
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            urllib.request.urlopen(url)
            return True
        except urllib.error.URLError:
            time.sleep(1)
    return False

def start_docker_services():
    """Start services using Docker Compose"""
    print_colored("✓ Docker detected, starting services...", Colors.GREEN)
    
    try:
        # Check if services are already running
        result = subprocess.run(['docker', 'compose', 'ps', '--services', '--filter', 'status=running'],
                              capture_output=True, text=True)
        running_services = result.stdout.strip().split('\n') if result.stdout.strip() else []
        
        if 'gateway' in running_services:
            print_colored("✓ Gateway is already running", Colors.GREEN)
            return True
        
        # Start services
        subprocess.run(['docker', 'compose', 'up', '-d'], check=True)
        
        print_colored("⏳ Waiting for services to start...", Colors.BLUE)
        
        # Wait for gateway to be ready
        if wait_for_service('http://127.0.0.1:8090/health', timeout=30):
            print_colored("✅ Gateway is running!", Colors.GREEN)
            return True
        else:
            print_colored("⚠️  Gateway may still be starting up...", Colors.YELLOW)
            return True
            
    except subprocess.CalledProcessError as e:
        print_colored(f"❌ Failed to start Docker services: {e}", Colors.RED)
        return False

def start_native_services():
    """Start services natively (without Docker)"""
    print_colored("📦 Starting services natively...", Colors.YELLOW)
    
    gateway_dir = Path('gateway')
    if not gateway_dir.exists():
        print_colored("❌ Gateway directory not found!", Colors.RED)
        return False
    
    try:
        # Install dependencies
        print_colored("📦 Installing dependencies...", Colors.BLUE)
        subprocess.run(['npm', 'install'], cwd=gateway_dir, check=True)
        
        # Start gateway
        print_colored("🚀 Starting gateway...", Colors.BLUE)
        process = subprocess.Popen(['node', 'server.js'], 
                                 cwd=gateway_dir,
                                 stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL)
        
        # Save PID
        pid_file = gateway_dir / '.gateway.pid'
        pid_file.write_text(str(process.pid))
        
        # Wait for service
        print_colored("⏳ Waiting for gateway to start...", Colors.BLUE)
        if wait_for_service('http://127.0.0.1:8090/health', timeout=20):
            print_colored("✅ Gateway is running!", Colors.GREEN)
            return True
        else:
            print_colored("⚠️  Gateway started but may not be ready yet", Colors.YELLOW)
            return True
            
    except Exception as e:
        print_colored(f"❌ Failed to start native services: {e}", Colors.RED)
        return False

def open_dashboard(platform_name):
    """Open the dashboard in the default browser"""
    # Gateway serves the dashboard directly
    dashboard_url = "http://127.0.0.1:8090/dashboard/"
    
    print_colored(f"🌐 Opening dashboard at {dashboard_url}...", Colors.BLUE)
    
    try:
        if platform_name == 'wsl':
            # Try multiple methods for WSL
            try:
                subprocess.run(['cmd.exe', '/c', 'start', dashboard_url], check=True)
            except:
                try:
                    subprocess.run(['powershell.exe', '-c', f'Start-Process "{dashboard_url}"'], check=True)
                except:
                    print_colored(f"Please open {dashboard_url} in your browser", Colors.YELLOW)
        else:
            # Use webbrowser for other platforms
            webbrowser.open(dashboard_url)
    except Exception as e:
        print_colored(f"Could not open browser automatically: {e}", Colors.YELLOW)
        print_colored(f"Please open {dashboard_url} in your browser", Colors.YELLOW)

def create_simple_dashboard():
    """Create a simple dashboard HTML file"""
    dashboard_dir = Path('dashboard')
    dashboard_dir.mkdir(exist_ok=True)
    
    # We'll enhance this in the next step
    pass

def show_connection_info():
    """Display connection information"""
    print()
    print_colored("╔════════════════════════════════════════════════════╗", Colors.GREEN)
    print_colored("║          MCP Gateway Successfully Started!         ║", Colors.GREEN)
    print_colored("╚════════════════════════════════════════════════════╝", Colors.GREEN)
    print()
    print_colored("🔗 Gateway URL:", Colors.BLUE, end="")
    print(" http://127.0.0.1:8090")
    print_colored("🎯 Dashboard:", Colors.BLUE, end="")
    print("   http://127.0.0.1:8090/dashboard/")
    print_colored("🔑 API Key:", Colors.BLUE, end="")
    print("     mcp-gateway-default-key")
    print()
    print_colored("Configure your AI assistant with:", Colors.YELLOW)
    print("  URL: http://127.0.0.1:8090/mcp")
    print("  API Key: mcp-gateway-default-key")
    print()

def determine_startup_mode(platform_name):
    """Determine the best startup mode based on platform and server requirements"""
    # No Docker available? Use native
    if not check_docker_available():
        return 'native'
    
    # Running inside Docker? Use native
    if is_docker():
        return 'native'
    
    # WSL with GUI servers? Check configuration
    if platform_name == 'wsl':
        try:
            config_path = Path('gateway') / 'gateway-config.json'
            if config_path.exists():
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    auto_start = config.get('gateway', {}).get('autoStartServers', [])
                    # Check if any auto-start servers have GUI capabilities
                    for server_id in auto_start:
                        server_config = config.get('servers', {}).get(server_id, {})
                        capabilities = server_config.get('capabilities', [])
                        if 'screenshot' in capabilities or 'gui' in capabilities:
                            return 'hybrid'
        except:
            pass
    
    # Default to Docker
    return 'docker'

def start_hybrid_services():
    """Start services in hybrid mode (gateway native, GUI servers on Windows)"""
    try:
        print_colored("Starting hybrid mode: Gateway native + Docker services", Colors.BLUE)
        
        # Stop any existing Docker services
        subprocess.run(['docker', 'compose', 'down'], 
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Install gateway dependencies if needed
        gateway_dir = Path('gateway')
        if not (gateway_dir / 'node_modules').exists():
            print_colored("📦 Installing gateway dependencies...", Colors.YELLOW)
            subprocess.run(['npm', 'install'], cwd=gateway_dir, check=True)
        
        # Start gateway natively for Windows interop
        env = os.environ.copy()
        env['GATEWAY_MODE'] = 'hybrid'
        env['NODE_ENV'] = 'production'
        env['CONFIG_PATH'] = './gateway-config.json'
        
        gateway_process = subprocess.Popen(
            ['node', 'server.js'],
            cwd=gateway_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Save PID
        pid_file = gateway_dir / '.gateway.pid'
        pid_file.write_text(str(gateway_process.pid))
        
        # Wait for gateway to start
        print_colored("⏳ Waiting for gateway to start...", Colors.BLUE)
        if wait_for_service('http://127.0.0.1:8090/health', timeout=20):
            print_colored("✓ Gateway started successfully in hybrid mode", Colors.GREEN)
            return True
        else:
            print_colored("❌ Gateway failed to start", Colors.RED)
            gateway_process.terminate()
            return False
            
    except Exception as e:
        print_colored(f"❌ Failed to start hybrid services: {e}", Colors.RED)
        return False

def stop_services():
    """Stop running services"""
    print_colored("Stopping services...", Colors.YELLOW)
    
    # Try Docker first
    if check_docker_available():
        try:
            subprocess.run(['docker', 'compose', 'down'], check=True)
            print_colored("✓ Docker services stopped", Colors.GREEN)
        except:
            pass
    
    # Check for native gateway PID
    pid_file = Path('gateway/.gateway.pid')
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 15)  # SIGTERM
            pid_file.unlink()
            print_colored("✓ Native gateway stopped", Colors.GREEN)
        except:
            pass

def main():
    """Main execution function"""
    print_banner()
    
    # Change to script directory
    os.chdir(Path(__file__).parent)
    
    # Detect platform
    platform_name = detect_platform()
    print_colored(f"✓ Detected platform: {platform_name}", Colors.GREEN)
    
    # Check if already running
    if check_port(8090):
        print_colored("✓ Gateway is already running!", Colors.GREEN)
        show_connection_info()
        open_dashboard(platform_name)
        return
    
    # Determine the best mode for this platform
    mode = determine_startup_mode(platform_name)
    
    # Start services based on mode
    success = False
    if mode == 'hybrid':
        print_colored("⚠️  GUI servers detected - using hybrid mode for WSL", Colors.YELLOW)
        success = start_hybrid_services()
    elif mode == 'docker':
        print_colored("✓ Docker detected, starting services...", Colors.GREEN)
        success = start_docker_services()
    else:
        print_colored("⚠️  Starting in native mode...", Colors.YELLOW)
        success = start_native_services()
    
    if success:
        show_connection_info()
        time.sleep(2)
        open_dashboard(platform_name)
        
        # Keep running if native mode
        if Path('gateway/.gateway.pid').exists():
            print_colored("Press Ctrl+C to stop the gateway", Colors.YELLOW)
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print()
                stop_services()
    else:
        print_colored("❌ Failed to start MCP Gateway", Colors.RED)
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print_colored("Interrupted by user", Colors.YELLOW)
        stop_services()
    except Exception as e:
        print_colored(f"❌ Unexpected error: {e}", Colors.RED)
        sys.exit(1)