@echo off
REM MCP Platform Quick Launcher for Windows
REM Double-click to start MCP Platform

echo ================================================
echo          MCP Platform Quick Launcher
echo ================================================
echo.

REM Check if PowerShell is available
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: PowerShell is required to run MCP Platform
    echo Please install PowerShell or run launch.ps1 directly
    pause
    exit /b 1
)

REM Check if we should use the PowerShell script or Node.js script
if exist "%~dp0launch.ps1" (
    echo Starting MCP Platform using PowerShell...
    powershell -ExecutionPolicy Bypass -File "%~dp0launch.ps1" start
) else if exist "%~dp0launch.js" (
    echo Starting MCP Platform using Node.js...
    node "%~dp0launch.js" start
) else (
    echo Error: No launch script found!
    echo Expected launch.ps1 or launch.js in %~dp0
    pause
    exit /b 1
)

REM Keep window open if there was an error
if %errorlevel% neq 0 (
    echo.
    echo An error occurred. Press any key to exit...
    pause
)