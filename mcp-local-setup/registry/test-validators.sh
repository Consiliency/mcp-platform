#!/bin/bash

# Test script for MCP Registry Validators

echo "================================================"
echo "MCP Registry Validator Test Suite"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "enhanced-catalog.json" ]; then
    echo -e "${RED}Error: enhanced-catalog.json not found!${NC}"
    echo "Please run this script from the registry directory."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "validators/node_modules" ]; then
    echo -e "${YELLOW}Installing validator dependencies...${NC}"
    cd validators
    npm install
    cd ..
    echo ""
fi

echo "Running validation tests..."
echo ""

# Test 1: Schema Validation
echo "1. Schema Validation Test"
echo "-------------------------"
if node validators/schema-validator.js enhanced-catalog.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Schema validation passed${NC}"
else
    echo -e "${RED}✗ Schema validation failed${NC}"
    node validators/schema-validator.js enhanced-catalog.json
fi
echo ""

# Test 2: Dependency Validation
echo "2. Dependency Validation Test"
echo "-----------------------------"
if node validators/dependency-validator.js enhanced-catalog.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dependency validation passed${NC}"
else
    echo -e "${RED}✗ Dependency validation failed${NC}"
    node validators/dependency-validator.js enhanced-catalog.json
fi
echo ""

# Test 3: Version Validation
echo "3. Version Validation Test"
echo "--------------------------"
if node validators/version-validator.js enhanced-catalog.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Version validation passed${NC}"
else
    echo -e "${RED}✗ Version validation failed${NC}"
    node validators/version-validator.js enhanced-catalog.json
fi
echo ""

# Test 4: Combined Validation
echo "4. Combined Validation Test"
echo "---------------------------"
if node validators/index.js enhanced-catalog.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ All validations passed${NC}"
else
    echo -e "${RED}✗ Combined validation failed${NC}"
fi
echo ""

# Test 5: Migration Test (if original catalog exists)
if [ -f "mcp-catalog.json" ]; then
    echo "5. Migration Test"
    echo "-----------------"
    
    # Create temp file for migration test
    TEMP_FILE=$(mktemp)
    
    if node migrations/001-add-dependencies.js mcp-catalog.json "$TEMP_FILE" --validate > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Migration test passed${NC}"
    else
        echo -e "${RED}✗ Migration test failed${NC}"
    fi
    
    # Cleanup
    rm -f "$TEMP_FILE"
    echo ""
fi

# Test 6: Invalid catalog test (negative test)
echo "6. Invalid Catalog Test (Expected to Fail)"
echo "------------------------------------------"

# Create an invalid catalog for testing
cat > test-invalid-catalog.json << 'EOF'
{
  "version": "2.0",
  "servers": [
    {
      "id": "invalid-service",
      "name": "Invalid Service"
    }
  ]
}
EOF

if node validators/schema-validator.js test-invalid-catalog.json > /dev/null 2>&1; then
    echo -e "${RED}✗ Invalid catalog was accepted (should have failed)${NC}"
else
    echo -e "${GREEN}✓ Invalid catalog correctly rejected${NC}"
fi

# Cleanup
rm -f test-invalid-catalog.json
echo ""

# Summary
echo "================================================"
echo "Test Summary"
echo "================================================"
echo ""
echo "Run full validation report with:"
echo "  cd validators && npm run validate:all"
echo ""
echo "Or individual validators:"
echo "  node validators/schema-validator.js enhanced-catalog.json"
echo "  node validators/dependency-validator.js enhanced-catalog.json"
echo "  node validators/version-validator.js enhanced-catalog.json"
echo ""