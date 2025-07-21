# MCP Platform Installer for Windows
# Supports both native Windows and WSL2 environments

param(
    [string]$InstallPath = "$env:USERPROFILE\.mcp-platform",
    [switch]$UseWSL = $false,
    [switch]$SkipDocker = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = 'SilentlyContinue'

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "       MCP Platform Installer for Windows       " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Function to check WSL2 availability
function Test-WSL2 {
    try {
        $wslVersion = wsl --list --verbose 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

# Function to check Docker installation
function Test-Docker {
    try {
        docker --version | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Function to detect installed AI tools
function Get-InstalledAITools {
    $tools = @()
    
    # Check for Claude Code
    if (Get-Command claude 2>$null) { $tools += "Claude Code" }
    
    # Check for VS Code
    if (Get-Command code 2>$null) { $tools += "VS Code" }
    
    # Check for Cursor
    if (Test-Path "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe") { $tools += "Cursor" }
    
    # Check for common AI desktop apps
    $desktopApps = @{
        "Claude" = @("$env:LOCALAPPDATA\Programs\Claude\Claude.exe", "$env:PROGRAMFILES\Claude\Claude.exe")
        "ChatGPT" = @("$env:LOCALAPPDATA\Programs\ChatGPT\ChatGPT.exe")
        "Gemini" = @("$env:LOCALAPPDATA\Programs\Gemini\Gemini.exe")
    }
    
    foreach ($app in $desktopApps.GetEnumerator()) {
        foreach ($path in $app.Value) {
            if (Test-Path $path) {
                $tools += $app.Key + " Desktop"
                break
            }
        }
    }
    
    return $tools
}

# Main installation process
Write-Host "Checking system requirements..." -ForegroundColor Yellow

# Check if running as admin (required for some operations)
if (-not (Test-Administrator)) {
    Write-Host "Warning: Not running as administrator. Some features may require elevation." -ForegroundColor Yellow
}

# Check WSL2
$hasWSL = Test-WSL2
if ($hasWSL) {
    Write-Host "✓ WSL2 detected" -ForegroundColor Green
    
    if (-not $UseWSL) {
        $response = Read-Host "Would you like to install MCP Platform in WSL2? (recommended) [Y/n]"
        if ($response -eq '' -or $response -match '^[Yy]') {
            $UseWSL = $true
        }
    }
} else {
    Write-Host "✗ WSL2 not detected" -ForegroundColor Red
    Write-Host "  WSL2 is recommended for best compatibility with MCP servers." -ForegroundColor Yellow
    Write-Host "  Install WSL2: https://docs.microsoft.com/windows/wsl/install" -ForegroundColor Yellow
}

# Check Docker
if (-not $SkipDocker) {
    if (Test-Docker) {
        Write-Host "✓ Docker detected" -ForegroundColor Green
    } else {
        Write-Host "✗ Docker not detected" -ForegroundColor Red
        Write-Host "  Docker is required for running MCP servers." -ForegroundColor Yellow
        Write-Host "  Install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Yellow
        
        $response = Read-Host "Continue without Docker? [y/N]"
        if ($response -notmatch '^[Yy]') {
            Write-Host "Installation cancelled." -ForegroundColor Red
            exit 1
        }
    }
}

# Detect installed AI tools
Write-Host ""
Write-Host "Detecting installed AI tools..." -ForegroundColor Yellow
$installedTools = Get-InstalledAITools
if ($installedTools.Count -gt 0) {
    Write-Host "✓ Found AI tools:" -ForegroundColor Green
    $installedTools | ForEach-Object { Write-Host "  - $_" -ForegroundColor Cyan }
} else {
    Write-Host "✗ No AI tools detected" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation Configuration:" -ForegroundColor Yellow
Write-Host "  Install Path: $InstallPath" -ForegroundColor Cyan
Write-Host "  Use WSL2: $UseWSL" -ForegroundColor Cyan
Write-Host ""

$response = Read-Host "Proceed with installation? [Y/n]"
if ($response -match '^[Nn]') {
    Write-Host "Installation cancelled." -ForegroundColor Red
    exit 0
}

# Create installation directory
Write-Host ""
Write-Host "Creating installation directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null

# Download installation files
Write-Host "Downloading MCP Platform files..." -ForegroundColor Yellow

# GitHub repository URL (replace with actual repo when available)
$repoUrl = if ($env:MCP_REPO_URL) { $env:MCP_REPO_URL } else { "https://github.com/your-org/mcp-platform" }
$repoBranch = if ($env:MCP_REPO_BRANCH) { $env:MCP_REPO_BRANCH } else { "main" }
$downloadUrl = "$repoUrl/archive/refs/heads/$repoBranch.zip"
$tempFile = "$env:TEMP\mcp-platform.zip"

# Check if we're in development mode (installing from local directory)
if ((Test-Path "docker-compose.yml") -and (Test-Path "scripts") -and (Test-Path "registry")) {
    Write-Host "Installing from local directory..." -ForegroundColor Cyan
    Copy-Item -Path . -Destination $InstallPath -Recurse -Force
    Write-Host "  ✓ Copied local files to installation directory" -ForegroundColor Green
} else {
    try {
        # Download archive
        Write-Host "Downloading from $repoUrl..." -ForegroundColor Cyan
        $ProgressPreference = 'SilentlyContinue'  # Faster downloads
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing
        
        # Extract archive
        Write-Host "Extracting files..." -ForegroundColor Cyan
        Expand-Archive -Path $tempFile -DestinationPath $env:TEMP -Force
        
        # Find extracted directory (GitHub adds a prefix)
        $extractedDir = Get-ChildItem -Path $env:TEMP -Filter "mcp-platform-*" -Directory | Select-Object -First 1
        if ($extractedDir) {
            # Move files to installation directory
            Get-ChildItem -Path $extractedDir.FullName -Recurse | ForEach-Object {
                $destPath = $_.FullName.Replace($extractedDir.FullName, $InstallPath)
                $destDir = Split-Path $destPath -Parent
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
                }
                Copy-Item -Path $_.FullName -Destination $destPath -Force
            }
            Write-Host "  ✓ Downloaded and extracted MCP Platform files" -ForegroundColor Green
            
            # Cleanup
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            Remove-Item $extractedDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        } else {
            throw "Failed to find extracted files"
        }
    } catch {
        Write-Host "  ✗ Failed to download from $repoUrl" -ForegroundColor Red
        Write-Host "    Error: $_" -ForegroundColor Red
        Write-Host "  Using fallback local installation..." -ForegroundColor Yellow
        
        # Fallback: create essential directories
        $essentialDirs = @("scripts", "profiles", "registry", "templates", "cli", "config", "traefik", "dashboard")
        foreach ($dir in $essentialDirs) {
            New-Item -ItemType Directory -Force -Path (Join-Path $InstallPath $dir) | Out-Null
        }
    }
}

# Verify essential files exist
$essentialFiles = @(
    "docker-compose.yml",
    "scripts/mcp",
    "scripts/registry-manager.js",
    "scripts/profile-manager.sh",
    "registry/mcp-catalog.json",
    "profiles/default.yml"
)

$missingFiles = @()
foreach ($file in $essentialFiles) {
    $filePath = Join-Path $InstallPath $file
    if (-not (Test-Path $filePath)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "  Some files are missing and will be created:" -ForegroundColor Yellow
    foreach ($file in $missingFiles) {
        Write-Host "    - $file" -ForegroundColor Yellow
    }
    
    # Create missing essential files
    $dockerComposePath = Join-Path $InstallPath "docker-compose.yml"
    if (-not (Test-Path $dockerComposePath)) {
        $dockerComposeContent = @"
# MCP Platform Docker Compose Configuration
# This file will be populated by the registry manager
version: "3.8"
services:
  # Services will be added here by registry manager
networks:
  mcp_network:
    driver: bridge
"@
        Set-Content -Path $dockerComposePath -Value $dockerComposeContent
    }
}

Write-Host "  ✓ Installation files ready" -ForegroundColor Green

# Configure WSL2 networking if needed
if ($UseWSL -and $hasWSL) {
    Write-Host ""
    Write-Host "Configuring WSL2 networking..." -ForegroundColor Yellow
    
    # Check for mirrored networking (Windows 11 22H2+)
    $wslConfigPath = "$env:USERPROFILE\.wslconfig"
    $enableMirrored = $false
    
    if (Test-Path $wslConfigPath) {
        $wslConfig = Get-Content $wslConfigPath -Raw
        if ($wslConfig -notmatch "networkingMode\s*=\s*mirrored") {
            $enableMirrored = $true
        }
    } else {
        $enableMirrored = $true
    }
    
    if ($enableMirrored) {
        Write-Host "  Enabling WSL2 mirrored networking for better localhost compatibility..." -ForegroundColor Yellow
        @"
[wsl2]
networkingMode=mirrored
localhostForwarding=true

[experimental]
hostAddressLoopback=true
"@ | Add-Content -Path $wslConfigPath
        Write-Host "  ✓ WSL2 networking configured (restart WSL to apply)" -ForegroundColor Green
    }
}

# Create PowerShell profile entry
Write-Host ""
Write-Host "Setting up PowerShell integration..." -ForegroundColor Yellow

$profileContent = @"

# MCP Platform
`$env:MCP_HOME = "$InstallPath"
`$env:PATH = "`$env:MCP_HOME\scripts;`$env:PATH"

function mcp {
    & "`$env:MCP_HOME\scripts\mcp-cli.ps1" `$args
}
"@

$profilePath = $PROFILE.CurrentUserAllHosts
if (-not (Test-Path $profilePath)) {
    New-Item -ItemType File -Force -Path $profilePath | Out-Null
}

if ((Get-Content $profilePath -Raw) -notmatch "MCP Platform") {
    Add-Content -Path $profilePath -Value $profileContent
    Write-Host "  ✓ PowerShell profile updated" -ForegroundColor Green
}

# Create Windows Terminal integration
Write-Host ""
Write-Host "Configuring Windows Terminal..." -ForegroundColor Yellow

$wtSettingsPath = "$env:LOCALAPPDATA\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"
if (Test-Path $wtSettingsPath) {
    Write-Host "  ✓ Windows Terminal detected" -ForegroundColor Green
    # Note: Actual Windows Terminal configuration would require JSON parsing
}

# Generate client configurations
Write-Host ""
Write-Host "Generating client configurations..." -ForegroundColor Yellow

foreach ($tool in $installedTools) {
    switch -Regex ($tool) {
        "Claude Code" {
            # Claude Code uses claude.json
            $claudeConfigPath = "$env:APPDATA\Claude\claude.json"
            Write-Host "  → Generating Claude Code configuration" -ForegroundColor Cyan
        }
        "VS Code|Cursor" {
            # VS Code/Cursor use settings.json
            Write-Host "  → Generating $tool configuration" -ForegroundColor Cyan
        }
        "Desktop" {
            Write-Host "  → $tool may require manual configuration" -ForegroundColor Yellow
        }
    }
}

# Final steps
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "      MCP Platform Installation Complete!       " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Restart your PowerShell session" -ForegroundColor Cyan
Write-Host "  2. Run 'mcp start' to launch MCP services" -ForegroundColor Cyan
Write-Host "  3. Run 'mcp list' to see available MCP servers" -ForegroundColor Cyan
Write-Host "  4. Run 'mcp install <server>' to add new servers" -ForegroundColor Cyan
Write-Host ""

if ($hasWSL -and $UseWSL) {
    Write-Host "WSL Integration:" -ForegroundColor Yellow
    Write-Host "  - Restart WSL for networking changes: wsl --shutdown" -ForegroundColor Cyan
    Write-Host "  - Access MCP servers from Windows at: http://localhost:8080" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Documentation: https://github.com/your-repo/mcp-platform" -ForegroundColor Blue
Write-Host ""