#!/bin/bash
# MCP Platform Quick Launcher for macOS
# Double-click to start MCP Platform

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$DIR"

# Show header
echo "================================================"
echo "          MCP Platform Quick Launcher           "
echo "================================================"
echo ""

# Check if launch.sh exists
if [ -f "./launch.sh" ]; then
    echo "Starting MCP Platform..."
    ./launch.sh start
elif [ -f "./launch.js" ]; then
    echo "Starting MCP Platform using Node.js..."
    node launch.js start
else
    echo "Error: No launch script found!"
    echo "Expected launch.sh or launch.js in $DIR"
    exit 1
fi

# Keep terminal open on error
if [ $? -ne 0 ]; then
    echo ""
    echo "An error occurred. Press Enter to exit..."
    read
fi