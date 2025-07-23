#!/bin/bash

# Production Container Security Scanning Script
# Performs comprehensive security checks on Docker images

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCAN_REPORT_DIR="${SCAN_REPORT_DIR:-./security-reports}"
TRIVY_SEVERITY="${TRIVY_SEVERITY:-CRITICAL,HIGH,MEDIUM}"
GRYPE_SEVERITY="${GRYPE_SEVERITY:-critical,high,medium}"
FAIL_ON_CRITICAL="${FAIL_ON_CRITICAL:-true}"

# Ensure report directory exists
mkdir -p "$SCAN_REPORT_DIR"

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if a tool is installed
check_tool() {
    local tool=$1
    if ! command -v "$tool" &> /dev/null; then
        print_status "$RED" "Error: $tool is not installed"
        return 1
    fi
    return 0
}

# Function to install scanning tools
install_tools() {
    print_status "$BLUE" "Checking and installing security scanning tools..."
    
    # Install Trivy
    if ! check_tool trivy; then
        print_status "$YELLOW" "Installing Trivy..."
        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
    fi
    
    # Install Grype
    if ! check_tool grype; then
        print_status "$YELLOW" "Installing Grype..."
        curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin
    fi
    
    # Install Docker Bench Security
    if [ ! -f "/usr/local/bin/docker-bench-security.sh" ]; then
        print_status "$YELLOW" "Installing Docker Bench Security..."
        git clone https://github.com/docker/docker-bench-security.git /tmp/docker-bench-security
        cp /tmp/docker-bench-security/docker-bench-security.sh /usr/local/bin/
        chmod +x /usr/local/bin/docker-bench-security.sh
    fi
}

# Function to scan image with Trivy
scan_with_trivy() {
    local image=$1
    local report_file="${SCAN_REPORT_DIR}/trivy-${image//\//_}-$(date +%Y%m%d-%H%M%S).json"
    
    print_status "$BLUE" "Scanning $image with Trivy..."
    
    trivy image \
        --severity "$TRIVY_SEVERITY" \
        --format json \
        --output "$report_file" \
        "$image"
    
    # Also generate human-readable report
    trivy image \
        --severity "$TRIVY_SEVERITY" \
        "$image"
    
    # Check for critical vulnerabilities
    local critical_count=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL")] | length' "$report_file")
    
    if [ "$critical_count" -gt 0 ] && [ "$FAIL_ON_CRITICAL" = "true" ]; then
        print_status "$RED" "Found $critical_count CRITICAL vulnerabilities!"
        return 1
    fi
    
    print_status "$GREEN" "Trivy scan completed. Report saved to: $report_file"
    return 0
}

# Function to scan image with Grype
scan_with_grype() {
    local image=$1
    local report_file="${SCAN_REPORT_DIR}/grype-${image//\//_}-$(date +%Y%m%d-%H%M%S).json"
    
    print_status "$BLUE" "Scanning $image with Grype..."
    
    grype "$image" \
        --output json \
        --file "$report_file" \
        --fail-on "$GRYPE_SEVERITY"
    
    # Also show table output
    grype "$image" \
        --output table
    
    print_status "$GREEN" "Grype scan completed. Report saved to: $report_file"
}

# Function to analyze Dockerfile
analyze_dockerfile() {
    local dockerfile=$1
    
    print_status "$BLUE" "Analyzing Dockerfile: $dockerfile"
    
    # Check for security best practices
    local issues=0
    
    # Check for running as root
    if ! grep -q "USER" "$dockerfile"; then
        print_status "$YELLOW" "Warning: Dockerfile does not specify a USER (running as root)"
        ((issues++))
    fi
    
    # Check for COPY instead of ADD
    if grep -q "^ADD" "$dockerfile"; then
        print_status "$YELLOW" "Warning: Using ADD instead of COPY (unless extracting archives)"
        ((issues++))
    fi
    
    # Check for specific version tags
    if grep -E "FROM .+:latest" "$dockerfile"; then
        print_status "$YELLOW" "Warning: Using 'latest' tag instead of specific version"
        ((issues++))
    fi
    
    # Check for apt-get update without install
    if grep -q "apt-get update" "$dockerfile" && ! grep -q "apt-get update.*&&.*apt-get install" "$dockerfile"; then
        print_status "$YELLOW" "Warning: apt-get update without install in same layer"
        ((issues++))
    fi
    
    # Check for secrets in Dockerfile
    if grep -iE "(password|secret|key|token)=" "$dockerfile"; then
        print_status "$RED" "Critical: Potential secrets found in Dockerfile!"
        ((issues++))
    fi
    
    if [ "$issues" -eq 0 ]; then
        print_status "$GREEN" "Dockerfile analysis passed!"
    else
        print_status "$YELLOW" "Found $issues potential issues in Dockerfile"
    fi
    
    return 0
}

# Function to check image configuration
check_image_config() {
    local image=$1
    
    print_status "$BLUE" "Checking image configuration: $image"
    
    # Get image configuration
    local config=$(docker inspect "$image" 2>/dev/null)
    
    if [ -z "$config" ]; then
        print_status "$RED" "Error: Cannot inspect image $image"
        return 1
    fi
    
    # Check if running as root
    local user=$(echo "$config" | jq -r '.[0].Config.User')
    if [ -z "$user" ] || [ "$user" = "root" ] || [ "$user" = "0" ]; then
        print_status "$YELLOW" "Warning: Container runs as root user"
    fi
    
    # Check for exposed ports
    local exposed_ports=$(echo "$config" | jq -r '.[0].Config.ExposedPorts | keys[]' 2>/dev/null)
    if [ -n "$exposed_ports" ]; then
        print_status "$BLUE" "Exposed ports: $exposed_ports"
    fi
    
    # Check for environment variables with potential secrets
    local env_vars=$(echo "$config" | jq -r '.[0].Config.Env[]' 2>/dev/null)
    if echo "$env_vars" | grep -iE "(password|secret|key|token)="; then
        print_status "$RED" "Warning: Potential secrets in environment variables!"
    fi
    
    # Check capabilities
    local caps=$(echo "$config" | jq -r '.[0].HostConfig.CapAdd[]' 2>/dev/null)
    if [ -n "$caps" ]; then
        print_status "$YELLOW" "Warning: Additional capabilities granted: $caps"
    fi
    
    print_status "$GREEN" "Image configuration check completed"
}

# Function to generate security report
generate_report() {
    local report_file="${SCAN_REPORT_DIR}/security-summary-$(date +%Y%m%d-%H%M%S).md"
    
    print_status "$BLUE" "Generating security summary report..."
    
    cat > "$report_file" << EOF
# Container Security Scan Report

Generated: $(date)

## Summary

### Images Scanned
EOF
    
    # Add scan results
    for report in "$SCAN_REPORT_DIR"/trivy-*.json; do
        [ -e "$report" ] || continue
        local vulns=$(jq '[.Results[].Vulnerabilities[]] | group_by(.Severity) | map({severity: .[0].Severity, count: length})' "$report")
        echo "- $(basename "$report" .json): $vulns" >> "$report_file"
    done
    
    echo -e "\n## Recommendations\n" >> "$report_file"
    echo "1. Address all CRITICAL and HIGH severity vulnerabilities" >> "$report_file"
    echo "2. Use specific version tags instead of 'latest'" >> "$report_file"
    echo "3. Run containers as non-root users" >> "$report_file"
    echo "4. Minimize image layers and remove unnecessary packages" >> "$report_file"
    echo "5. Regularly update base images and dependencies" >> "$report_file"
    
    print_status "$GREEN" "Security report saved to: $report_file"
}

# Main scanning function
scan_image() {
    local image=$1
    local dockerfile=${2:-""}
    
    print_status "$BLUE" "Starting security scan for image: $image"
    
    # Pull the latest image
    print_status "$BLUE" "Pulling latest image..."
    docker pull "$image" || true
    
    # Analyze Dockerfile if provided
    if [ -n "$dockerfile" ] && [ -f "$dockerfile" ]; then
        analyze_dockerfile "$dockerfile"
    fi
    
    # Run vulnerability scans
    scan_with_trivy "$image" || true
    scan_with_grype "$image" || true
    
    # Check image configuration
    check_image_config "$image"
}

# Main execution
main() {
    print_status "$BLUE" "Production Container Security Scanner"
    print_status "$BLUE" "===================================="
    
    # Install tools if needed
    install_tools
    
    # Check if images provided as arguments
    if [ $# -eq 0 ]; then
        print_status "$YELLOW" "Usage: $0 <image1> [image2] ... [--dockerfile path]"
        print_status "$YELLOW" "Scanning all local images..."
        
        # Scan all local images
        docker images --format "{{.Repository}}:{{.Tag}}" | grep -v "<none>" | while read -r image; do
            scan_image "$image"
        done
    else
        # Scan specified images
        dockerfile=""
        for arg in "$@"; do
            if [ "$arg" = "--dockerfile" ]; then
                shift
                dockerfile=$1
            else
                scan_image "$arg" "$dockerfile"
            fi
            shift
        done
    fi
    
    # Generate summary report
    generate_report
    
    print_status "$GREEN" "Security scanning completed!"
}

# Run main function
main "$@"