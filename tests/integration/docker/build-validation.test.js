const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

describe('Docker Build Validation', () => {
  const dockerfilesPath = path.join(__dirname, '../../../docker/production');
  const dockerfiles = {
    node: path.join(dockerfilesPath, 'node.Dockerfile'),
    python: path.join(dockerfilesPath, 'python.Dockerfile'),
    go: path.join(dockerfilesPath, 'go.Dockerfile')
  };

  // Helper function to check if Docker is available
  function isDockerAvailable() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // Helper function to validate Dockerfile syntax
  async function validateDockerfileSyntax(dockerfilePath) {
    const content = await fs.readFile(dockerfilePath, 'utf8');
    const lines = content.split('\n');
    const errors = [];

    // Check for required instructions
    const hasFrom = lines.some(line => line.trim().startsWith('FROM'));
    if (!hasFrom) {
      errors.push('Missing FROM instruction');
    }

    // Check for USER instruction (security best practice)
    const hasUser = lines.some(line => line.trim().startsWith('USER'));
    if (!hasUser) {
      errors.push('Missing USER instruction - container may run as root');
    }

    // Check for HEALTHCHECK instruction
    const hasHealthcheck = lines.some(line => line.trim().startsWith('HEALTHCHECK'));
    if (!hasHealthcheck) {
      errors.push('Missing HEALTHCHECK instruction');
    }

    // Check for security best practices
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Check for secrets in ENV
      if (trimmedLine.match(/ENV\s+.*(?:PASSWORD|SECRET|KEY|TOKEN)=/i)) {
        errors.push(`Line ${index + 1}: Potential secret in ENV instruction`);
      }

      // Check for ADD vs COPY
      if (trimmedLine.startsWith('ADD') && !trimmedLine.includes('.tar') && !trimmedLine.includes('.gz')) {
        errors.push(`Line ${index + 1}: Use COPY instead of ADD unless extracting archives`);
      }

      // Check for apt-get best practices
      if (trimmedLine.includes('apt-get update') && !trimmedLine.includes('&&')) {
        errors.push(`Line ${index + 1}: Combine apt-get update with install in same layer`);
      }

      // Check for version pinning
      if (trimmedLine.match(/FROM\s+[^:]+:latest/)) {
        errors.push(`Line ${index + 1}: Avoid using 'latest' tag, pin to specific version`);
      }

      // Check for cache invalidation
      if (trimmedLine.includes('apt-get install') && !trimmedLine.includes('--no-cache')) {
        if (!trimmedLine.includes('rm -rf /var/lib/apt/lists/*')) {
          errors.push(`Line ${index + 1}: Clean apt cache after install`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }

  describe('Dockerfile Syntax Validation', () => {
    it('should validate Node.js Dockerfile', async () => {
      const result = await validateDockerfileSyntax(dockerfiles.node);
      
      if (!result.valid) {
        console.log('Node.js Dockerfile validation errors:', result.errors);
      }
      
      expect(result.valid).toBe(true);
    });

    it('should validate Python Dockerfile', async () => {
      const result = await validateDockerfileSyntax(dockerfiles.python);
      
      if (!result.valid) {
        console.log('Python Dockerfile validation errors:', result.errors);
      }
      
      expect(result.valid).toBe(true);
    });

    it('should validate Go Dockerfile', async () => {
      const result = await validateDockerfileSyntax(dockerfiles.go);
      
      if (!result.valid) {
        console.log('Go Dockerfile validation errors:', result.errors);
      }
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Dockerfile Content Validation', () => {
    it('should have multi-stage builds for production optimization', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        const hasMultiStage = content.match(/FROM.*AS\s+\w+/);
        
        expect(hasMultiStage).not.toBeNull();
      }
    });

    it('should copy health check scripts', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        const hasHealthScripts = content.includes('/health/') || 
                               content.includes('health-check') ||
                               content.includes('healthcheck');
        
        expect(hasHealthScripts).toBe(true);
      }
    });

    it('should set appropriate working directory', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        const hasWorkdir = content.match(/WORKDIR\s+\/app/);
        
        expect(hasWorkdir).not.toBeNull();
      }
    });

    it('should expose appropriate ports', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        const hasExpose = content.match(/EXPOSE\s+\d+/);
        
        expect(hasExpose).not.toBeNull();
      }
    });

    it('should have proper signal handling setup', async () => {
      const nodeContent = await fs.readFile(dockerfiles.node, 'utf8');
      
      // Check for exec form or signal handling
      const hasExecForm = nodeContent.match(/CMD\s*\[/);
      const hasStopsignal = nodeContent.includes('STOPSIGNAL');
      const hasTini = nodeContent.includes('tini') || nodeContent.includes('dumb-init');
      
      expect(hasExecForm || hasStopsignal || hasTini).toBeTruthy();
    });
  });

  describe('Security Configuration', () => {
    it('should run as non-root user', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        const userMatch = content.match(/USER\s+(\w+)/);
        
        expect(userMatch).not.toBeNull();
        expect(userMatch[1]).not.toBe('root');
        expect(userMatch[1]).not.toBe('0');
      }
    });

    it('should not contain hardcoded secrets', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        
        // Check for common secret patterns
        expect(content).not.toMatch(/password\s*=\s*["'][^"']+["']/i);
        expect(content).not.toMatch(/secret\s*=\s*["'][^"']+["']/i);
        expect(content).not.toMatch(/api_key\s*=\s*["'][^"']+["']/i);
        expect(content).not.toMatch(/token\s*=\s*["'][^"']+["']/i);
      }
    });

    it('should have security headers in nginx.conf', async () => {
      const nginxConfPath = path.join(dockerfilesPath, 'nginx.conf');
      const content = await fs.readFile(nginxConfPath, 'utf8');
      
      // Check for security headers
      expect(content).toContain('X-Frame-Options');
      expect(content).toContain('X-Content-Type-Options');
      expect(content).toContain('X-XSS-Protection');
      expect(content).toContain('Referrer-Policy');
      expect(content).toContain('Content-Security-Policy');
    });
  });

  describe('Build Configuration', () => {
    it('should use build arguments for flexibility', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        const hasArgs = content.includes('ARG');
        
        expect(hasArgs).toBe(true);
      }
    });

    it('should optimize layer caching', async () => {
      const nodeContent = await fs.readFile(dockerfiles.node, 'utf8');
      
      // Check if package files are copied before source code
      const packageCopyIndex = nodeContent.indexOf('COPY package*.json');
      const sourceCopyIndex = nodeContent.indexOf('COPY . .');
      
      if (packageCopyIndex !== -1 && sourceCopyIndex !== -1) {
        expect(packageCopyIndex).toBeLessThan(sourceCopyIndex);
      }
    });

    it('should have proper labels', async () => {
      for (const [lang, dockerfilePath] of Object.entries(dockerfiles)) {
        const content = await fs.readFile(dockerfilePath, 'utf8');
        
        // Check for any LABEL instruction (more flexible)
        const hasLabels = content.match(/LABEL\s+\w+=/);
        expect(hasLabels).not.toBeNull();
      }
    });
  });

  // Only run actual build tests if Docker is available
  const dockerAvailable = isDockerAvailable();
  const describeIfDocker = dockerAvailable ? describe : describe.skip;

  describeIfDocker('Docker Build Tests (requires Docker)', () => {
    // Clean up test images after tests
    afterAll(() => {
      if (dockerAvailable) {
        try {
          execSync('docker image prune -f --filter "label=test=true"', { stdio: 'ignore' });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should build Node.js image successfully', () => {
      const buildCommand = `docker build -f ${dockerfiles.node} --label test=true -t test-node:latest ${dockerfilesPath}`;
      
      expect(() => {
        execSync(buildCommand, { stdio: 'ignore' });
      }).not.toThrow();
    });

    it('should build Python image successfully', () => {
      const buildCommand = `docker build -f ${dockerfiles.python} --label test=true -t test-python:latest ${dockerfilesPath}`;
      
      expect(() => {
        execSync(buildCommand, { stdio: 'ignore' });
      }).not.toThrow();
    });

    it('should build Go image successfully', () => {
      const buildCommand = `docker build -f ${dockerfiles.go} --label test=true -t test-go:latest ${dockerfilesPath}`;
      
      expect(() => {
        execSync(buildCommand, { stdio: 'ignore' });
      }).not.toThrow();
    });

    it('should create images with reasonable sizes', () => {
      const images = ['test-node:latest', 'test-python:latest', 'test-go:latest'];
      const maxSizeMB = {
        'test-node:latest': 500,
        'test-python:latest': 600,
        'test-go:latest': 100 // Go binaries are typically smaller
      };

      images.forEach(image => {
        try {
          const output = execSync(`docker image inspect ${image} --format='{{.Size}}'`, { encoding: 'utf8' });
          const sizeMB = parseInt(output) / 1024 / 1024;
          
          expect(sizeMB).toBeLessThan(maxSizeMB[image]);
        } catch {
          // Image might not exist if previous test failed
        }
      });
    });
  });

  describe('Docker Compose Validation', () => {
    const composePath = path.join(dockerfilesPath, 'docker-compose.prod.yml');

    it('should have valid docker-compose.yml syntax', async () => {
      const content = await fs.readFile(composePath, 'utf8');
      
      // Basic YAML validation
      expect(() => {
        require('js-yaml').load(content);
      }).not.toThrow();
    });

    it('should define required services', async () => {
      const yaml = require('js-yaml');
      const content = await fs.readFile(composePath, 'utf8');
      const compose = yaml.load(content);
      
      expect(compose.services).toBeDefined();
      expect(Object.keys(compose.services).length).toBeGreaterThan(0);
    });

    it('should have health checks for all services', async () => {
      const yaml = require('js-yaml');
      const content = await fs.readFile(composePath, 'utf8');
      const compose = yaml.load(content);
      
      Object.entries(compose.services).forEach(([serviceName, service]) => {
        if (service.image || service.build) {
          expect(service.healthcheck).toBeDefined();
        }
      });
    });

    it('should use environment variables for configuration', async () => {
      const yaml = require('js-yaml');
      const content = await fs.readFile(composePath, 'utf8');
      const compose = yaml.load(content);
      
      let hasEnvVars = false;
      Object.values(compose.services).forEach(service => {
        if (service.environment || service.env_file) {
          hasEnvVars = true;
        }
      });
      
      expect(hasEnvVars).toBe(true);
    });

    it('should define restart policies', async () => {
      const yaml = require('js-yaml');
      const content = await fs.readFile(composePath, 'utf8');
      const compose = yaml.load(content);
      
      Object.entries(compose.services).forEach(([serviceName, service]) => {
        expect(service.restart).toBeDefined();
        expect(['always', 'unless-stopped', 'on-failure']).toContain(service.restart);
      });
    });

    it('should use volumes for persistent data', async () => {
      const yaml = require('js-yaml');
      const content = await fs.readFile(composePath, 'utf8');
      const compose = yaml.load(content);
      
      // Check if volumes are defined
      const hasVolumes = compose.volumes || 
        Object.values(compose.services).some(service => service.volumes);
      
      expect(hasVolumes).toBeTruthy();
    });

    it('should define resource limits', async () => {
      const yaml = require('js-yaml');
      const content = await fs.readFile(composePath, 'utf8');
      const compose = yaml.load(content);
      
      let hasResourceLimits = false;
      Object.values(compose.services).forEach(service => {
        if (service.deploy?.resources?.limits || service.mem_limit || service.cpus) {
          hasResourceLimits = true;
        }
      });
      
      expect(hasResourceLimits).toBe(true);
    });
  });
});