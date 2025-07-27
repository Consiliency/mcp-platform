@echo off
REM Windows batch file to start MCP Gateway
cd /d "%~dp0"
python start-mcp.py %*
if errorlevel 1 pause