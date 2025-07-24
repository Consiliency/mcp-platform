const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

describe('Security Scan Script Tests', () => {
  const scriptPath = path.join(__dirname, '../../../docker/production/security-scan.sh');
  const mockReportDir = path.join(__dirname, '../../.tmp/security-reports');

  beforeAll(async () => {
    // Create mock report directory
    await fs.mkdir(mockReportDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up mock report directory
    try {
      await fs.rm(mockReportDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Script Structure Validation', () => {
    let scriptContent;

    beforeAll(async () => {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    });

    it('should have proper shebang', () => {
      expect(scriptContent).toMatch(/^#!\/bin\/bash/);
    });

    it('should set strict error handling', () => {
      expect(scriptContent).toContain('set -euo pipefail');
    });

    it('should define color codes for output', () => {
      expect(scriptContent).toContain("RED='\\033[0;31m'");
      expect(scriptContent).toContain("GREEN='\\033[0;32m'");
      expect(scriptContent).toContain("YELLOW='\\033[1;33m'");
      expect(scriptContent).toContain("BLUE='\\033[0;34m'");
      expect(scriptContent).toContain("NC='\\033[0m'");
    });

    it('should have configurable environment variables', () => {
      expect(scriptContent).toContain('SCAN_REPORT_DIR=');
      expect(scriptContent).toContain('TRIVY_SEVERITY=');
      expect(scriptContent).toContain('GRYPE_SEVERITY=');
      expect(scriptContent).toContain('FAIL_ON_CRITICAL=');
    });

    it('should create report directory', () => {
      expect(scriptContent).toContain('mkdir -p "$SCAN_REPORT_DIR"');
    });
  });

  describe('Function Validation', () => {
    let scriptContent;

    beforeAll(async () => {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    });

    it('should have print_status function', () => {
      expect(scriptContent).toContain('print_status()');
      expect(scriptContent).toMatch(/echo -e.*\$\{color\}.*\$\{message\}.*\$\{NC\}/);
    });

    it('should have check_tool function', () => {
      expect(scriptContent).toContain('check_tool()');
      expect(scriptContent).toContain('command -v "$tool"');
    });

    it('should have install_tools function', () => {
      expect(scriptContent).toContain('install_tools()');
      expect(scriptContent).toContain('Installing Trivy');
      expect(scriptContent).toContain('Installing Grype');
      expect(scriptContent).toContain('Installing Docker Bench Security');
    });

    it('should have scan_with_trivy function', () => {
      expect(scriptContent).toContain('scan_with_trivy()');
      expect(scriptContent).toContain('trivy image');
      expect(scriptContent).toContain('--severity "$TRIVY_SEVERITY"');
      expect(scriptContent).toContain('--format json');
    });

    it('should have scan_with_grype function', () => {
      expect(scriptContent).toContain('scan_with_grype()');
      expect(scriptContent).toContain('grype "$image"');
      expect(scriptContent).toContain('--output json');
      expect(scriptContent).toContain('--fail-on "$GRYPE_SEVERITY"');
    });

    it('should have analyze_dockerfile function', () => {
      expect(scriptContent).toContain('analyze_dockerfile()');
      expect(scriptContent).toContain('Check for running as root');
      expect(scriptContent).toContain('Check for COPY instead of ADD');
      expect(scriptContent).toContain('Check for specific version tags');
      expect(scriptContent).toContain('Check for secrets in Dockerfile');
    });

    it('should have check_image_config function', () => {
      expect(scriptContent).toContain('check_image_config()');
      expect(scriptContent).toContain('docker inspect');
      expect(scriptContent).toContain('Check if running as root');
      expect(scriptContent).toContain('Check for exposed ports');
      expect(scriptContent).toContain('Check capabilities');
    });

    it('should have generate_report function', () => {
      expect(scriptContent).toContain('generate_report()');
      expect(scriptContent).toContain('# Container Security Scan Report');
      expect(scriptContent).toContain('## Summary');
      expect(scriptContent).toContain('## Recommendations');
    });

    it('should have scan_image function', () => {
      expect(scriptContent).toContain('scan_image()');
      expect(scriptContent).toContain('docker pull "$image"');
      expect(scriptContent).toContain('analyze_dockerfile');
      expect(scriptContent).toContain('scan_with_trivy');
      expect(scriptContent).toContain('scan_with_grype');
      expect(scriptContent).toContain('check_image_config');
    });

    it('should have main function', () => {
      expect(scriptContent).toContain('main()');
      expect(scriptContent).toContain('Production Container Security Scanner');
      expect(scriptContent).toContain('install_tools');
      expect(scriptContent).toContain('generate_report');
    });
  });

  describe('Security Best Practices Checks', () => {
    let scriptContent;

    beforeAll(async () => {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    });

    it('should check for USER instruction in Dockerfile', () => {
      expect(scriptContent).toContain('grep -q "USER" "$dockerfile"');
      expect(scriptContent).toContain('Dockerfile does not specify a USER');
    });

    it('should check for ADD vs COPY usage', () => {
      expect(scriptContent).toContain('grep -q "^ADD" "$dockerfile"');
      expect(scriptContent).toContain('Using ADD instead of COPY');
    });

    it('should check for latest tag usage', () => {
      expect(scriptContent).toContain('grep -E "FROM .+:latest" "$dockerfile"');
      expect(scriptContent).toContain("Using 'latest' tag instead of specific version");
    });

    it('should check for apt-get best practices', () => {
      expect(scriptContent).toContain('apt-get update.*&&.*apt-get install');
      expect(scriptContent).toContain('apt-get update without install in same layer');
    });

    it('should check for secrets in Dockerfile', () => {
      expect(scriptContent).toContain('(password|secret|key|token)=');
      expect(scriptContent).toContain('Potential secrets found in Dockerfile');
    });

    it('should check critical vulnerability count', () => {
      expect(scriptContent).toContain('jq \'[.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL")] | length\'');
      expect(scriptContent).toContain('FAIL_ON_CRITICAL');
    });

    it('should check if container runs as root', () => {
      expect(scriptContent).toContain('jq -r \'.[0].Config.User\'');
      expect(scriptContent).toContain('Container runs as root user');
    });

    it('should check for environment variable secrets', () => {
      expect(scriptContent).toContain('grep -iE "(password|secret|key|token)="');
      expect(scriptContent).toContain('Potential secrets in environment variables');
    });
  });

  describe('Script Execution Flow', () => {
    let scriptContent;

    beforeAll(async () => {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    });

    it('should handle command line arguments', () => {
      expect(scriptContent).toContain('if [ $# -eq 0 ]; then');
      expect(scriptContent).toContain('Usage: $0 <image1> [image2]');
      expect(scriptContent).toContain('--dockerfile');
    });

    it('should scan all local images when no arguments', () => {
      expect(scriptContent).toContain('docker images --format "{{.Repository}}:{{.Tag}}"');
      expect(scriptContent).toContain('grep -v "<none>"');
      expect(scriptContent).toContain('while read -r image; do');
    });

    it('should handle dockerfile argument', () => {
      expect(scriptContent).toContain('if [ "$arg" = "--dockerfile" ]; then');
      expect(scriptContent).toContain('dockerfile=$1');
    });

    it('should fail on critical vulnerabilities when configured', () => {
      expect(scriptContent).toContain('if [ "$critical_count" -gt 0 ] && [ "$FAIL_ON_CRITICAL" = "true" ]; then');
      expect(scriptContent).toContain('return 1');
    });

    it('should generate timestamped report files', () => {
      expect(scriptContent).toContain('$(date +%Y%m%d-%H%M%S)');
      expect(scriptContent).toContain('trivy-${image//\\//_}-$(date +%Y%m%d-%H%M%S).json');
      expect(scriptContent).toContain('grype-${image//\\//_}-$(date +%Y%m%d-%H%M%S).json');
    });
  });

  describe('Tool Installation Checks', () => {
    let scriptContent;

    beforeAll(async () => {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    });

    it('should check and install Trivy', () => {
      expect(scriptContent).toContain('check_tool trivy');
      expect(scriptContent).toContain('https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh');
    });

    it('should check and install Grype', () => {
      expect(scriptContent).toContain('check_tool grype');
      expect(scriptContent).toContain('https://raw.githubusercontent.com/anchore/grype/main/install.sh');
    });

    it('should check and install Docker Bench Security', () => {
      expect(scriptContent).toContain('[ ! -f "/usr/local/bin/docker-bench-security.sh" ]');
      expect(scriptContent).toContain('https://github.com/docker/docker-bench-security.git');
    });
  });

  describe('Report Generation', () => {
    let scriptContent;

    beforeAll(async () => {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    });

    it('should create markdown report with proper structure', () => {
      expect(scriptContent).toContain('# Container Security Scan Report');
      expect(scriptContent).toContain('Generated: $(date)');
      expect(scriptContent).toContain('## Summary');
      expect(scriptContent).toContain('### Images Scanned');
      expect(scriptContent).toContain('## Recommendations');
    });

    it('should include vulnerability summary in report', () => {
      expect(scriptContent).toContain('jq \'[.Results[].Vulnerabilities[]] | group_by(.Severity)');
      expect(scriptContent).toContain('map({severity: .[0].Severity, count: length})');
    });

    it('should include security recommendations', () => {
      expect(scriptContent).toContain('Address all CRITICAL and HIGH severity vulnerabilities');
      expect(scriptContent).toContain('Use specific version tags instead of \'latest\'');
      expect(scriptContent).toContain('Run containers as non-root users');
      expect(scriptContent).toContain('Minimize image layers and remove unnecessary packages');
      expect(scriptContent).toContain('Regularly update base images and dependencies');
    });
  });

  // Test script syntax if bash is available
  const bashAvailable = (() => {
    try {
      execSync('bash --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  const describeIfBash = bashAvailable ? describe : describe.skip;

  describeIfBash('Script Syntax Validation (requires bash)', () => {
    it('should have valid bash syntax', () => {
      expect(() => {
        execSync(`bash -n ${scriptPath}`, { stdio: 'ignore' });
      }).not.toThrow();
    });

    it('should be executable', async () => {
      const stats = await fs.stat(scriptPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      
      expect(isExecutable).toBe(true);
    });
  });

  describe('Mock Security Scan Tests', () => {
    // Create a mock script that simulates the security scan behavior
    const createMockScript = () => {
      return `#!/bin/bash
set -euo pipefail

SCAN_REPORT_DIR="${mockReportDir}"
mkdir -p "$SCAN_REPORT_DIR"

# Mock functions
print_status() {
  echo "[$1] $2"
}

check_tool() {
  return 1  # Always report tool not installed for testing
}

scan_with_trivy() {
  local image=$1
  local report_file="${mockReportDir}/trivy-test-$(date +%s).json"
  echo '{"Results": [{"Vulnerabilities": []}]}' > "$report_file"
  echo "Trivy scan completed for $image"
  return 0
}

analyze_dockerfile() {
  local dockerfile=$1
  if [ -f "$dockerfile" ]; then
    echo "Analyzing $dockerfile"
    grep -q "USER" "$dockerfile" || echo "Warning: No USER instruction"
    grep -q "FROM.*:latest" "$dockerfile" && echo "Warning: Using latest tag"
  fi
  return 0
}

# Simple test execution
if [ "$1" = "--test" ]; then
  print_status "INFO" "Running mock security scan"
  scan_with_trivy "test-image:latest"
  [ -n "\${2:-}" ] && [ -f "\$2" ] && analyze_dockerfile "\$2"
  print_status "SUCCESS" "Mock scan completed"
fi
`;
    };

    it('should execute mock security scan functions', async () => {
      const mockScriptPath = path.join(mockReportDir, 'mock-security-scan.sh');
      await fs.writeFile(mockScriptPath, createMockScript(), { mode: 0o755 });

      if (bashAvailable) {
        const output = execSync(`bash ${mockScriptPath} --test`, { encoding: 'utf8' });
        
        expect(output).toContain('Running mock security scan');
        expect(output).toContain('Trivy scan completed');
        expect(output).toContain('Mock scan completed');
        
        // Check if report file was created
        const files = await fs.readdir(mockReportDir);
        const reportFiles = files.filter(f => f.startsWith('trivy-test-'));
        expect(reportFiles.length).toBeGreaterThan(0);
      }
    });

    it('should analyze mock Dockerfile', async () => {
      const mockScriptPath = path.join(mockReportDir, 'mock-security-scan.sh');
      const mockDockerfile = path.join(mockReportDir, 'Dockerfile');
      
      await fs.writeFile(mockScriptPath, createMockScript(), { mode: 0o755 });
      await fs.writeFile(mockDockerfile, 'FROM node:latest\nRUN npm install\n');

      if (bashAvailable) {
        const output = execSync(
          `bash ${mockScriptPath} --test ${mockDockerfile}`, 
          { encoding: 'utf8' }
        );
        
        expect(output).toContain('Analyzing');
        expect(output).toContain('Warning: No USER instruction');
        expect(output).toContain('Warning: Using latest tag');
      }
    });
  });
});