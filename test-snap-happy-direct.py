#!/usr/bin/env python3

import subprocess
import json
import sys
import time

# Start snap-happy directly
cmd = [
    "powershell.exe", "-NoProfile", "-Command",
    "$env:PATH = 'C:\\Program Files\\nodejs;C:\\Program Files (x86)\\nodejs;C:\\Users\\jenne\\AppData\\Roaming\\npm' + ';' + $env:PATH; Set-Location $env:TEMP; npx -y @mariozechner/snap-happy"
]

print("Starting snap-happy...")
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

# Give it time to start
time.sleep(3)

# Send initialize request
init_request = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {
            "name": "test-client",
            "version": "1.0"
        }
    }
}

print("Sending initialize request...")
proc.stdin.write(json.dumps(init_request) + "\n")
proc.stdin.flush()

# Read response
response_line = proc.stdout.readline()
if response_line:
    print(f"Initialize response: {response_line}")

# Send TakeScreenshot request
screenshot_request = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "TakeScreenshot",
        "arguments": {}
    }
}

print("Sending TakeScreenshot request...")
proc.stdin.write(json.dumps(screenshot_request) + "\n")
proc.stdin.flush()

# Read response
response_line = proc.stdout.readline()
if response_line:
    print(f"Screenshot response: {response_line}")
    result = json.loads(response_line)
    if "result" in result:
        print(f"Result type: {type(result['result'])}")
        if isinstance(result['result'], dict):
            print(f"Result keys: {list(result['result'].keys())}")

# Check stderr
stderr_output = proc.stderr.read()
if stderr_output:
    print(f"Stderr: {stderr_output}")

# Cleanup
proc.terminate()