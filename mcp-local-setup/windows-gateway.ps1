# Windows Gateway Launcher for MCP
# This script runs a second gateway instance on Windows for native MCP execution

Write-Host "Starting MCP Gateway for Windows..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Configuration
$env:GATEWAY_PORT = "8091"
$env:GATEWAY_MODE = "windows"
$env:GATEWAY_API_KEY = "mcp-gateway-windows-key"

# Check if Node.js is already in PATH
$nodeInPath = $false
try {
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        $nodeInPath = $true
        Write-Host "Node.js found in PATH: $nodeVersion" -ForegroundColor Green
    }
} catch {
    # Node not in current PATH
}

# If not in PATH, try common locations
if (-not $nodeInPath) {
    $nodePaths = @(
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs",
        "$env:ProgramFiles\nodejs"
    )
    
    foreach ($path in $nodePaths) {
        if (Test-Path "$path\node.exe") {
            Write-Host "Found Node.js at: $path" -ForegroundColor Yellow
            $env:PATH = "$path;" + $env:PATH
            
            # Test again
            try {
                $nodeVersion = & node --version 2>$null
                if ($LASTEXITCODE -eq 0) {
                    $nodeInPath = $true
                    Write-Host "Node.js loaded: $nodeVersion" -ForegroundColor Green
                    break
                }
            } catch {}
        }
    }
}

# Final check
if (-not $nodeInPath) {
    Write-Host "Error: Node.js is not installed or not found in common locations" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "Or add it to your PATH manually" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Change to the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptPath\gateway"

# Check if port is already in use
$portInUse = Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "Warning: Port 8091 is already in use" -ForegroundColor Yellow
    Write-Host "Another gateway instance might be running" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Ctrl+C to cancel or Enter to continue..." -ForegroundColor Gray
    Read-Host
}

# Create Windows-specific configuration
$configFile = "gateway-config-windows.json"
if (-not (Test-Path $configFile)) {
    Write-Host "Creating Windows gateway configuration..." -ForegroundColor Yellow
    
    $config = @{
        gateway = @{
            apiKey = "mcp-gateway-windows-key"
            autoStartServers = @("snap-happy")
            mode = "windows"
        }
        servers = @{
            "snap-happy" = @{
                transport = "stdio"
                package = "@mariozechner/snap-happy"
                command = "npx"
                args = @("-y", "@mariozechner/snap-happy")
                environment = @{}
                capabilities = @("screenshot", "gui")
            }
        }
    }
    
    $config | ConvertTo-Json -Depth 10 | Out-File $configFile -Encoding UTF8
    Write-Host "Configuration created: $configFile" -ForegroundColor Green
}

# Load environment variables from .env.mcp if it exists
$envFile = "../.env.mcp"
if (Test-Path $envFile) {
    Write-Host "Loading environment variables from .env.mcp..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $varName = $matches[1].Trim()
            $varValue = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($varName, $varValue, [EnvironmentVariableTarget]::Process)
            Write-Host "  Set $varName" -ForegroundColor Gray
        }
    }
}

# Set the config file for the gateway
$env:GATEWAY_CONFIG_FILE = $configFile

# Start the gateway
Write-Host ""
Write-Host "Starting gateway on port $($env:GATEWAY_PORT)..." -ForegroundColor Green
Write-Host "Dashboard: http://localhost:$($env:GATEWAY_PORT)/dashboard" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the gateway" -ForegroundColor Gray
Write-Host ""

# Start the server
try {
    & node server.js
} catch {
    Write-Host ""
    Write-Host "Gateway stopped with error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Gateway stopped." -ForegroundColor Yellow
Read-Host "Press Enter to exit"