@echo off
setlocal

echo Starting Windows MCP Gateway...
echo ==============================

REM Set environment variables
set GATEWAY_PORT=8091
set GATEWAY_CONFIG_FILE=gateway-config-windows.json
set GATEWAY_API_KEY=mcp-gateway-windows-key

REM Check if node is available
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js not found in PATH, checking common locations...
    
    REM Try common Node.js locations
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
        echo Added C:\Program Files\nodejs to PATH
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
        echo Added %LOCALAPPDATA%\Programs\nodejs to PATH
    ) else (
        echo ERROR: Node.js not found! Please install from https://nodejs.org/
        pause
        exit /b 1
    )
)

REM Verify node works
node --version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js found but not working properly
    pause
    exit /b 1
)

REM Change to gateway directory
cd /d "%~dp0gateway"

REM Create Windows configuration if it doesn't exist
if not exist gateway-config-windows.json (
    echo Creating Windows gateway configuration...
    (
        echo {
        echo   "gateway": {
        echo     "apiKey": "mcp-gateway-windows-key",
        echo     "autoStartServers": ["snap-happy"]
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
        echo }
    ) > gateway-config-windows.json
)

REM Load environment variables from .env.mcp if exists
if exist ..\.env.mcp (
    echo Loading environment variables from .env.mcp...
    for /f "tokens=1,2 delims==" %%a in (..\.env.mcp) do (
        if not "%%a"=="" if not "%%b"=="" (
            set "%%a=%%b"
        )
    )
)

REM Start the gateway
echo.
echo Starting gateway on port %GATEWAY_PORT%...
echo Dashboard: http://localhost:%GATEWAY_PORT%/dashboard
echo Press Ctrl+C to stop the gateway
echo.

node server.js

echo.
echo Gateway stopped.
pause