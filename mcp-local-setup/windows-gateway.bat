@echo off
REM Windows Gateway Launcher for MCP
REM This script runs a second gateway instance on Windows for native MCP execution

echo Starting MCP Gateway for Windows...
echo ================================

REM Set the port for Windows gateway (different from WSL gateway)
set GATEWAY_PORT=8091
set GATEWAY_MODE=windows
set GATEWAY_API_KEY=mcp-gateway-windows-key

REM Set Node.js in PATH if needed
set PATH=C:\Program Files\nodejs;%PATH%

REM Change to the gateway directory
cd /d "%~dp0gateway"

REM Check if Node.js is available
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found: 
node --version

REM Check if the gateway is already running on this port
netstat -an | findstr :8091 | findstr LISTENING >nul
if %ERRORLEVEL% EQU 0 (
    echo Warning: Port 8091 is already in use
    echo Another gateway instance might be running
    echo.
    echo Press Ctrl+C to cancel or any other key to continue...
    pause >nul
)

REM Create Windows-specific configuration
echo Creating Windows gateway configuration...
if not exist "gateway-config-windows.json" (
    echo {
    echo   "gateway": {
    echo     "apiKey": "mcp-gateway-windows-key",
    echo     "autoStartServers": ["snap-happy"],
    echo     "mode": "windows"
    echo   },
    echo   "servers": {
    echo     "snap-happy": {
    echo       "transport": "stdio",
    echo       "package": "@mariozechner/snap-happy",
    echo       "command": "npx",
    echo       "args": ["-y", "@mariozechner/snap-happy"],
    echo       "environment": {},
    echo       "capabilities": ["screenshot", "gui"]
    echo     }
    echo   }
    echo } > gateway-config-windows.json
)

REM Start the gateway
echo.
echo Starting gateway on port %GATEWAY_PORT%...
echo Press Ctrl+C to stop the gateway
echo.

REM Use the Windows-specific config
set GATEWAY_CONFIG_FILE=gateway-config-windows.json

REM Start the server
node server.js

REM If we get here, the server stopped
echo.
echo Gateway stopped.
pause