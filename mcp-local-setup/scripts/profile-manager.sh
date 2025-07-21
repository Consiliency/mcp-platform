#!/bin/bash
# MCP Profile Manager
# Manages MCP service profiles and configurations

set -e

MCP_HOME="${MCP_HOME:-$HOME/.mcp-platform}"
PROFILES_DIR="$MCP_HOME/profiles"
CURRENT_PROFILE_FILE="$MCP_HOME/.current-profile"
REGISTRY_MANAGER="$MCP_HOME/scripts/registry-manager.js"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${BLUE}→ $1${NC}"; }

# Get current profile
get_current_profile() {
    if [ -f "$CURRENT_PROFILE_FILE" ]; then
        cat "$CURRENT_PROFILE_FILE"
    else
        echo "default"
    fi
}

# Set current profile
set_current_profile() {
    echo "$1" > "$CURRENT_PROFILE_FILE"
}

# List available profiles
list_profiles() {
    echo -e "${BLUE}Available MCP Profiles:${NC}"
    echo ""
    
    local current=$(get_current_profile)
    
    for profile_file in "$PROFILES_DIR"/*.yml; do
        if [ -f "$profile_file" ]; then
            local profile_name=$(basename "$profile_file" .yml)
            local description=$(grep "^description:" "$profile_file" | cut -d: -f2- | xargs)
            
            if [ "$profile_name" = "$current" ]; then
                echo -e "${GREEN}* $profile_name (active)${NC}"
            else
                echo "  $profile_name"
            fi
            echo "  $description"
            echo ""
        fi
    done
}

# Show profile details
show_profile() {
    local profile=$1
    local profile_file="$PROFILES_DIR/${profile}.yml"
    
    if [ ! -f "$profile_file" ]; then
        print_error "Profile '$profile' not found"
        return 1
    fi
    
    echo -e "${BLUE}Profile: $profile${NC}"
    echo ""
    
    # Parse YAML manually (basic parsing)
    local in_services=false
    local in_settings=false
    local in_env=false
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^services: ]]; then
            echo "Services:"
            in_services=true
            in_settings=false
            in_env=false
        elif [[ "$line" =~ ^settings: ]]; then
            echo ""
            echo "Settings:"
            in_services=false
            in_settings=true
            in_env=false
        elif [[ "$line" =~ ^environment: ]]; then
            echo ""
            echo "Environment:"
            in_services=false
            in_settings=false
            in_env=true
        elif [[ "$line" =~ ^[a-z] ]]; then
            in_services=false
            in_settings=false
            in_env=false
        elif $in_services && [[ "$line" =~ ^[[:space:]]*- ]]; then
            echo "  $line"
        elif ($in_settings || $in_env) && [[ "$line" =~ ^[[:space:]] ]]; then
            echo "  $line"
        fi
    done < "$profile_file"
}

# Switch to profile
switch_profile() {
    local profile=$1
    local profile_file="$PROFILES_DIR/${profile}.yml"
    
    if [ ! -f "$profile_file" ]; then
        print_error "Profile '$profile' not found"
        return 1
    fi
    
    echo "Switching to profile: $profile"
    
    # Stop current services
    local current=$(get_current_profile)
    if [ "$current" != "$profile" ]; then
        print_info "Stopping services from profile: $current"
        cd "$MCP_HOME" && docker-compose down 2>/dev/null || true
    fi
    
    # Set new profile
    set_current_profile "$profile"
    
    # Generate new docker-compose.yml
    print_info "Generating configuration for profile: $profile"
    if [ -x "$REGISTRY_MANAGER" ]; then
        node "$REGISTRY_MANAGER" generate "$profile"
    else
        print_warning "Registry manager not found, skipping docker-compose generation"
    fi
    
    print_success "Switched to profile: $profile"
    echo ""
    echo "To start services, run: mcp start"
}

# Create new profile
create_profile() {
    local name=$1
    
    if [ -z "$name" ]; then
        print_error "Profile name required"
        return 1
    fi
    
    local profile_file="$PROFILES_DIR/${name}.yml"
    
    if [ -f "$profile_file" ]; then
        print_error "Profile '$name' already exists"
        return 1
    fi
    
    # Interactive profile creation
    echo "Creating new profile: $name"
    echo ""
    
    read -p "Description: " description
    
    # Select services
    echo ""
    echo "Available services (space-separated list):"
    if [ -x "$REGISTRY_MANAGER" ]; then
        node "$REGISTRY_MANAGER" list | grep -E "^  [a-z]" | awk '{print $1}' | tr '\n' ' '
        echo ""
    fi
    read -p "Services to include: " services
    
    # Create profile file
    cat > "$profile_file" << EOF
# $name Profile
name: $name
description: $description
services:
EOF
    
    # Add services
    for service in $services; do
        echo "  - $service" >> "$profile_file"
    done
    
    # Add default settings
    cat >> "$profile_file" << EOF
settings:
  auto_start: false
  restart_policy: unless-stopped
environment:
  # Add environment variables here
EOF
    
    print_success "Created profile: $name"
    echo ""
    echo "Edit $profile_file to customize further"
}

# Delete profile
delete_profile() {
    local profile=$1
    
    if [ "$profile" = "default" ]; then
        print_error "Cannot delete default profile"
        return 1
    fi
    
    local profile_file="$PROFILES_DIR/${profile}.yml"
    
    if [ ! -f "$profile_file" ]; then
        print_error "Profile '$profile' not found"
        return 1
    fi
    
    local current=$(get_current_profile)
    if [ "$current" = "$profile" ]; then
        print_error "Cannot delete active profile. Switch to another profile first."
        return 1
    fi
    
    read -p "Delete profile '$profile'? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm "$profile_file"
        print_success "Deleted profile: $profile"
    fi
}

# Main command handler
case ${1:-} in
    list|ls)
        list_profiles
        ;;
    show|info)
        show_profile "${2:-$(get_current_profile)}"
        ;;
    switch|use)
        if [ -z "$2" ]; then
            print_error "Usage: profile-manager switch <profile>"
            exit 1
        fi
        switch_profile "$2"
        ;;
    current)
        echo "Current profile: $(get_current_profile)"
        ;;
    create|new)
        if [ -z "$2" ]; then
            print_error "Usage: profile-manager create <name>"
            exit 1
        fi
        create_profile "$2"
        ;;
    delete|rm)
        if [ -z "$2" ]; then
            print_error "Usage: profile-manager delete <profile>"
            exit 1
        fi
        delete_profile "$2"
        ;;
    *)
        echo "MCP Profile Manager"
        echo ""
        echo "Usage: profile-manager <command> [args]"
        echo ""
        echo "Commands:"
        echo "  list, ls              List all profiles"
        echo "  show, info [profile]  Show profile details (default: current)"
        echo "  switch, use <profile> Switch to a different profile"
        echo "  current               Show current profile"
        echo "  create, new <name>    Create a new profile"
        echo "  delete, rm <profile>  Delete a profile"
        echo ""
        echo "Current profile: $(get_current_profile)"
        exit 1
        ;;
esac