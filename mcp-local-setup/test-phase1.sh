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