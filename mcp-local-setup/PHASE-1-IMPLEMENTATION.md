# Phase 1 Implementation Guide

## Quick Start for Developers

This guide provides concrete implementation details for Phase 1 of the MCP Platform completion plan.

## Task 1.1: Complete CLI Profile Update Logic

### Current Issue
The `mcp install` command can't add services to profiles. Located at `cli/mcp-cli.js:245`.

### Implementation
```javascript
// In cli/mcp-cli.js, update the install command action:

// Add function to update profile
async function addServiceToProfile(profileName, serviceId) {
    const profilePath = path.join(MCP_HOME, 'profiles', `${profileName}.yml`);
    const profileContent = await fs.readFile(profilePath, 'utf8');
    const profile = yaml.load(profileContent);
    
    if (!profile.services.includes(serviceId)) {
        profile.services.push(serviceId);
        const updatedYaml = yaml.dump(profile);
        await fs.writeFile(profilePath, updatedYaml);
        return true;
    }
    return false;
}

// Update the install action around line 245:
// Add to current profile
spinner.text = 'Adding to profile...';
const currentProfile = await getCurrentProfile(); // Implement this
const added = await addServiceToProfile(currentProfile, service);
if (added) {
    spinner.text = 'Service added to profile';
} else {
    spinner.text = 'Service already in profile';
}
```

## Task 1.2: Implement Client Config Generator

### Current Issue
The `mcp config --generate` command is stubbed at `cli/mcp-cli.js:311`.

### Implementation
```javascript
// Add config generator class
class ClientConfigGenerator {
    constructor(mcpHome) {
        this.mcpHome = mcpHome;
        this.configs = {
            'claude-code': {
                path: path.join(os.homedir(), '.config', 'claude', 'mcp-servers.json'),
                generator: this.generateClaudeConfig.bind(this)
            },
            'vscode': {
                path: 'Add to settings.json manually',
                generator: this.generateVSCodeConfig.bind(this)
            },
            'cursor': {
                path: path.join(os.homedir(), '.cursor', 'mcp-servers.json'),
                generator: this.generateCursorConfig.bind(this)
            }
        };
    }

    async generateClaudeConfig(services) {
        const config = { mcpServers: {} };
        for (const service of services) {
            config.mcpServers[service] = {
                url: `http://localhost:8080/mcp/${service}`
            };
        }
        return config;
    }

    async generateAll() {
        // Get enabled services from current profile
        const profile = await this.getCurrentProfileServices();
        
        for (const [client, config of Object.entries(this.configs)) {
            try {
                const clientConfig = await config.generator(profile.services);
                if (config.path.includes('settings.json')) {
                    console.log(`\n${client}: Add to settings.json:`);
                    console.log(JSON.stringify(clientConfig, null, 2));
                } else {
                    await fs.mkdir(path.dirname(config.path), { recursive: true });
                    await fs.writeFile(config.path, JSON.stringify(clientConfig, null, 2));
                    console.log(`✓ Generated ${client} config at ${config.path}`);
                }
            } catch (error) {
                console.warn(`Could not generate ${client} config: ${error.message}`);
            }
        }
    }
}
```

## Task 1.3: Create Missing Docker Templates

### Python Template (`templates/python.Dockerfile`)
```dockerfile
# Python-based MCP server template
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
ARG REQUIREMENTS_FILE=requirements.txt
COPY ${REQUIREMENTS_FILE} .
RUN pip install --no-cache-dir -r ${REQUIREMENTS_FILE}

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1001 mcpuser && chown -R mcpuser:mcpuser /app
USER mcpuser

# Default environment
ENV MCP_MODE=http
ENV PORT=3000

EXPOSE ${PORT}

# Default command for MCP server
CMD ["python", "-m", "mcp_server", "--port", "${PORT}"]
```

### Custom Template (`templates/custom.Dockerfile`)
```dockerfile
# Custom MCP server template - flexible multi-stage build
ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE} AS base

WORKDIR /app

# Build stage - customize based on your needs
FROM base AS builder
# Add your build steps here
# COPY package*.json ./
# RUN npm ci
# COPY . .
# RUN npm run build

# Runtime stage
FROM base AS runtime

# Create non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S -u 1001 -G mcpuser mcpuser

# Copy built application (customize path)
# COPY --from=builder --chown=mcpuser:mcpuser /app/dist /app

# Switch to non-root user
USER mcpuser

# Environment
ENV MCP_MODE=http
ENV PORT=3000

EXPOSE ${PORT}

# Set your custom entrypoint
# ENTRYPOINT ["node", "server.js"]
CMD ["echo", "Please customize this Dockerfile for your MCP server"]
```

## Task 1.4: Fix Installation Scripts

### Update `install.sh` Download Section
```bash
# Replace the placeholder section with:

# Download installation files
echo -e "${YELLOW}Downloading MCP Platform files...${NC}"

# GitHub repository URL
REPO_URL="https://github.com/your-org/mcp-platform"
REPO_ARCHIVE="${REPO_URL}/archive/refs/heads/main.tar.gz"

# Download and extract
echo "Downloading from ${REPO_URL}..."
if command_exists curl; then
    curl -L "${REPO_ARCHIVE}" | tar -xz -C "${INSTALL_PATH}" --strip-components=1
elif command_exists wget; then
    wget -O - "${REPO_ARCHIVE}" | tar -xz -C "${INSTALL_PATH}" --strip-components=1
else
    print_error "Neither curl nor wget found. Please install one of them."
    exit 1
fi

# Verify download
if [ ! -f "${INSTALL_PATH}/docker-compose.yml" ]; then
    print_error "Download failed or incomplete"
    exit 1
fi

print_success "Downloaded MCP Platform files"
```

### Update `install.ps1` Download Section
```powershell
# Replace the placeholder section with:

# Download installation files
Write-Host "Downloading MCP Platform files..." -ForegroundColor Yellow

$repoUrl = "https://github.com/your-org/mcp-platform"
$downloadUrl = "$repoUrl/archive/refs/heads/main.zip"
$tempFile = "$env:TEMP\mcp-platform.zip"

try {
    # Download archive
    Write-Host "Downloading from $repoUrl..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing
    
    # Extract archive
    Write-Host "Extracting files..."
    Expand-Archive -Path $tempFile -DestinationPath $env:TEMP -Force
    
    # Move files to installation directory
    $extractedDir = Get-ChildItem -Path $env:TEMP -Filter "mcp-platform-*" -Directory | Select-Object -First 1
    Get-ChildItem -Path $extractedDir.FullName -Recurse | Move-Item -Destination $InstallPath -Force
    
    # Cleanup
    Remove-Item $tempFile -Force
    Remove-Item $extractedDir.FullName -Recurse -Force
    
    Write-Host "  ✓ Downloaded MCP Platform files" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to download files: $_" -ForegroundColor Red
    exit 1
}
```

## Task 1.5: Interactive Service Installation

### Implementation for `cli/mcp-cli.js`
```javascript
// Add interactive installation flow
async function interactiveServiceInstall() {
    // Load catalog
    const catalog = await loadCatalog();
    
    // Group services by category
    const categories = {};
    catalog.servers.forEach(server => {
        if (!categories[server.category]) {
            categories[server.category] = [];
        }
        categories[server.category].push(server);
    });
    
    // Select category
    const { category } = await inquirer.prompt([{
        type: 'list',
        name: 'category',
        message: 'Select service category:',
        choices: Object.keys(categories).map(cat => ({
            name: catalog.categories[cat].name,
            value: cat
        }))
    }]);
    
    // Select service
    const { service } = await inquirer.prompt([{
        type: 'list',
        name: 'service',
        message: 'Select service to install:',
        choices: categories[category].map(s => ({
            name: `${s.name} - ${s.description}`,
            value: s.id
        }))
    }]);
    
    // Get service details
    const selectedService = catalog.servers.find(s => s.id === service);
    
    // Collect required environment variables
    if (selectedService.config.env_required?.length > 0) {
        console.log('\nThis service requires environment variables:');
        const envAnswers = await inquirer.prompt(
            selectedService.config.env_required.map(env => ({
                type: 'input',
                name: env,
                message: `Enter ${env}:`,
                validate: input => input.length > 0 || 'This field is required'
            }))
        );
        
        // Save to .env file
        await updateEnvFile(envAnswers);
    }
    
    // Select profile
    const profiles = await listProfiles();
    const { profile } = await inquirer.prompt([{
        type: 'list',
        name: 'profile',
        message: 'Add to which profile?',
        choices: profiles
    }]);
    
    // Install service
    await installService(service, profile);
}
```

## Testing Phase 1

### Test Script (`test-phase1.sh`)
```bash
#!/bin/bash
# Phase 1 Integration Test

echo "Testing Phase 1 Implementation..."

# Test 1: Profile Update
echo -n "Test 1 - Profile Update: "
mcp profile create test-profile
mcp install filesystem
if mcp profile show test-profile | grep -q "filesystem"; then
    echo "PASSED"
else
    echo "FAILED"
fi

# Test 2: Client Config Generation
echo -n "Test 2 - Config Generation: "
mcp config --generate
if [ -f ~/.config/claude/mcp-servers.json ]; then
    echo "PASSED"
else
    echo "FAILED"
fi

# Test 3: Docker Templates
echo -n "Test 3 - Python Template: "
if docker build -f templates/python.Dockerfile -t test-python .; then
    echo "PASSED"
else
    echo "FAILED"
fi

# Test 4: Interactive Install
echo -n "Test 4 - Interactive Install: "
echo -e "1\n1\n" | mcp install
if [ $? -eq 0 ]; then
    echo "PASSED"
else
    echo "FAILED"
fi

# Cleanup
mcp profile delete test-profile
docker rmi test-python

echo "Phase 1 Testing Complete"
```

## Next Steps After Phase 1

Once these implementations are complete:
1. Run the test script to verify functionality
2. Update documentation with new features
3. Tag release as `v1.0-beta`
4. Begin Phase 2 implementation

---

This guide should be updated as implementation progresses and issues are discovered.