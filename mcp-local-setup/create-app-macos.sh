#!/bin/bash
# Create macOS app bundle for MCP Gateway

APP_NAME="MCP Gateway"
APP_DIR="$HOME/Desktop/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Creating macOS app bundle..."

# Create directory structure
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# Create launcher script
cat > "$MACOS_DIR/launcher" << EOF
#!/bin/bash
cd "$SCRIPT_DIR"
/usr/bin/python3 start-mcp.py
EOF

chmod +x "$MACOS_DIR/launcher"

# Create Info.plist
cat > "$CONTENTS_DIR/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.mcp.gateway</string>
    <key>CFBundleName</key>
    <string>MCP Gateway</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.12</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# Create a simple icon (you can replace this with a proper .icns file)
echo "MCP" > "$RESOURCES_DIR/icon.txt"

echo "✅ macOS app bundle created at: $APP_DIR"
echo "You can now double-click the app to start MCP Gateway!"