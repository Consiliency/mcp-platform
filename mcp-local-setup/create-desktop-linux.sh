#!/bin/bash
# Create Linux desktop entry for MCP Gateway

DESKTOP_FILE="$HOME/.local/share/applications/mcp-gateway.desktop"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Creating Linux desktop entry..."

# Create applications directory if it doesn't exist
mkdir -p "$HOME/.local/share/applications"

# Create .desktop file
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=MCP Gateway
Comment=Start MCP Gateway for AI assistants
Exec=/usr/bin/python3 "$SCRIPT_DIR/start-mcp.py"
Path=$SCRIPT_DIR
Icon=applications-system
Terminal=false
Categories=Development;Utility;
StartupNotify=true
EOF

# Make it executable
chmod +x "$DESKTOP_FILE"

# Update desktop database
if command -v update-desktop-database > /dev/null; then
    update-desktop-database "$HOME/.local/share/applications"
fi

echo "✅ Desktop entry created!"
echo "You can now find 'MCP Gateway' in your application menu."

# Also create a desktop shortcut if the Desktop folder exists
if [ -d "$HOME/Desktop" ]; then
    cp "$DESKTOP_FILE" "$HOME/Desktop/"
    chmod +x "$HOME/Desktop/mcp-gateway.desktop"
    
    # Some desktop environments need trusted execution
    if command -v gio > /dev/null; then
        gio set "$HOME/Desktop/mcp-gateway.desktop" metadata::trusted true 2>/dev/null
    fi
    
    echo "✅ Desktop shortcut also created!"
fi