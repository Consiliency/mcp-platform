#!/bin/bash
# Simple wrapper to run the Python startup script
cd "$(dirname "$0")"
python3 start-mcp.py "$@"