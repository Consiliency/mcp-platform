# MCP Platform Launch Script for Windows
# PowerShell launcher for Windows and WSL2

param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'logs', 'status')]
    [string]$Command = 'start'
)

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MCP_HOME = if ($env:MCP_HOME) { $env:MCP_HOME } else { $ScriptDir }
$API_PORT = if ($env:API_PORT) { $env:API_PORT } else { 3000 }
$TRAEFIK_PORT = if ($env:TRAEFIK_PORT) { $env:TRAEFIK_PORT } else { 8080 }
$DASHBOARD_URL = "http://localhost:$API_PORT/catalog.html"
$TRAEFIK_URL = "http://localhost:$TRAEFIK_PORT"
$PID_FILE = Join-Path $MCP_HOME ".mcp-services.pid"

# Color functions
function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "→ $Message" -ForegroundColor Blue
}

# Print header
function Show-Header {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "          MCP Platform Launcher                 " -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
}

# Check dependencies
function Test-Dependencies {
    $missing = @()
    
    # Check Docker
    try {
        docker --version | Out-Null
    } catch {
        $missing += "Docker Desktop"
    }
    
    # Check Node.js
    try {
        node --version | Out-Null
    } catch {
        $missing += "Node.js"
    }
    
    # Check npm
    try {
        npm --version | Out-Null
    } catch {
        $missing += "npm"
    }
    
    if ($missing.Count -gt 0) {
        Write-Error "Missing required dependencies:"
        foreach ($dep in $missing) {
            Write-Host "  - $dep" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "Please install missing dependencies:"
        Write-Host "  - Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
        Write-Host "  - Node.js: https://nodejs.org/"
        exit 1
    }
}

# Check if services are already running
function Test-RunningServices {
    if (Test-Path $PID_FILE) {
        Write-Warning "MCP services may already be running"
        Write-Host "Run '.\launch.ps1 stop' to stop them first"
        exit 1
    }
}

# Start Docker services
function Start-DockerServices {
    Write-Info "Starting Docker services..."
    
    # Check if docker-compose.yml exists
    if (-not (Test-Path (Join-Path $MCP_HOME "docker-compose.yml"))) {
        Write-Error "docker-compose.yml not found"
        exit 1
    }
    
    # Start services
    Push-Location $MCP_HOME
    try {
        docker compose up -d 2>$null
        if ($LASTEXITCODE -ne 0) {
            docker-compose up -d
        }
        Write-Success "Docker services started"
    } catch {
        Write-Error "Failed to start Docker services: $_"
        exit 1
    } finally {
        Pop-Location
    }
}

# Install API dependencies
function Install-ApiDependencies {
    $nodeModulesPath = Join-Path $MCP_HOME "api\node_modules"
    if (-not (Test-Path $nodeModulesPath)) {
        Write-Info "Installing API dependencies..."
        Push-Location (Join-Path $MCP_HOME "api")
        try {
            npm install --silent
            Write-Success "API dependencies installed"
        } catch {
            Write-Error "Failed to install dependencies: $_"
            exit 1
        } finally {
            Pop-Location
        }
    }
}

# Start API server
function Start-ApiServer {
    Write-Info "Starting API server..."
    
    # Check if API directory exists
    $apiPath = Join-Path $MCP_HOME "api"
    if (-not (Test-Path $apiPath)) {
        Write-Error "API directory not found"
        exit 1
    }
    
    # Install dependencies if needed
    Install-ApiDependencies
    
    # Start the API server
    Push-Location $apiPath
    try {
        $apiProcess = Start-Process -FilePath "node" -ArgumentList "index.js" `
            -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $MCP_HOME "api-server.log") `
            -RedirectStandardError (Join-Path $MCP_HOME "api-server-error.log")
        
        # Save PID
        "API_PID=$($apiProcess.Id)" | Out-File -FilePath $PID_FILE -Encoding UTF8
        
        # Wait for API to be ready
        $retries = 0
        while ($retries -lt 30) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$API_PORT/health" -UseBasicParsing -TimeoutSec 1
                if ($response.StatusCode -eq 200) {
                    break
                }
            } catch {
                # API not ready yet
            }
            Start-Sleep -Seconds 1
            $retries++
        }
        
        if ($retries -ge 30) {
            Write-Error "API server failed to start"
            Stop-Process -Id $apiProcess.Id -Force
            exit 1
        }
        
        Write-Success "API server started (PID: $($apiProcess.Id))"
    } catch {
        Write-Error "Failed to start API server: $_"
        exit 1
    } finally {
        Pop-Location
    }
}

# Display service information
function Show-ServiceInfo {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "       MCP Platform Started Successfully!       " -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service URLs:" -ForegroundColor Cyan
    Write-Host "  Dashboard:    " -NoNewline; Write-Host $DASHBOARD_URL -ForegroundColor Blue
    Write-Host "  Traefik:      " -NoNewline; Write-Host $TRAEFIK_URL -ForegroundColor Blue
    Write-Host "  API Health:   " -NoNewline; Write-Host "http://localhost:$API_PORT/health" -ForegroundColor Blue
    Write-Host ""
    
    # Check for WSL
    if (Get-Command wsl -ErrorAction SilentlyContinue) {
        Write-Host "WSL Integration:" -ForegroundColor Yellow
        Write-Host "  You can also manage services from WSL"
    }
    
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  Stop services:    .\launch.ps1 stop"
    Write-Host "  View logs:        .\launch.ps1 logs"
    Write-Host "  Service status:   .\launch.ps1 status"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
}

# Stop all services
function Stop-Services {
    Write-Info "Stopping MCP services..."
    
    # Stop API server
    if (Test-Path $PID_FILE) {
        $pidContent = Get-Content $PID_FILE
        if ($pidContent -match "API_PID=(\d+)") {
            $apiPid = $matches[1]
            try {
                Stop-Process -Id $apiPid -Force -ErrorAction SilentlyContinue
                Write-Success "API server stopped"
            } catch {
                # Process might already be stopped
            }
        }
        Remove-Item $PID_FILE -Force
    }
    
    # Stop Docker services
    Push-Location $MCP_HOME
    try {
        docker compose down 2>$null
        if ($LASTEXITCODE -ne 0) {
            docker-compose down 2>$null
        }
        Write-Success "Docker services stopped"
    } catch {
        # Services might already be stopped
    } finally {
        Pop-Location
    }
}

# Show logs
function Show-Logs {
    Write-Host "=== API Server Logs ===" -ForegroundColor Cyan
    $apiLogPath = Join-Path $MCP_HOME "api-server.log"
    if (Test-Path $apiLogPath) {
        Get-Content $apiLogPath -Tail 50
    } else {
        Write-Host "No API logs found"
    }
    
    Write-Host ""
    Write-Host "=== API Server Error Logs ===" -ForegroundColor Cyan
    $apiErrorLogPath = Join-Path $MCP_HOME "api-server-error.log"
    if (Test-Path $apiErrorLogPath) {
        Get-Content $apiErrorLogPath -Tail 20
    }
    
    Write-Host ""
    Write-Host "=== Docker Service Logs ===" -ForegroundColor Cyan
    Push-Location $MCP_HOME
    try {
        docker compose logs --tail=50 2>$null
        if ($LASTEXITCODE -ne 0) {
            docker-compose logs --tail=50
        }
    } catch {
        Write-Host "Unable to retrieve Docker logs"
    } finally {
        Pop-Location
    }
}

# Show status
function Show-Status {
    Write-Host "=== Service Status ===" -ForegroundColor Cyan
    Write-Host ""
    
    # Check API
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$API_PORT/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Success "API server is running"
        }
    } catch {
        Write-Error "API server is not running"
    }
    
    # Check Docker services
    Write-Host ""
    Push-Location $MCP_HOME
    try {
        docker compose ps 2>$null
        if ($LASTEXITCODE -ne 0) {
            docker-compose ps
        }
    } catch {
        Write-Host "Unable to check Docker service status"
    } finally {
        Pop-Location
    }
}

# Handle Ctrl+C
$null = Register-ObjectEvent -InputObject ([System.Console]) -EventName CancelKeyPress -Action {
    Write-Host ""
    Write-Info "Shutting down services..."
    Stop-Services
    exit 0
}

# Main execution
switch ($Command) {
    'start' {
        Show-Header
        Test-Dependencies
        Test-RunningServices
        Start-DockerServices
        Start-ApiServer
        Show-ServiceInfo
        
        # Keep script running
        try {
            while ($true) {
                Start-Sleep -Seconds 1
            }
        } finally {
            Stop-Services
        }
    }
    
    'stop' {
        Stop-Services
    }
    
    'restart' {
        Stop-Services
        Start-Sleep -Seconds 2
        & $MyInvocation.MyCommand.Path start
    }
    
    'logs' {
        Show-Logs
    }
    
    'status' {
        Show-Status
    }
}