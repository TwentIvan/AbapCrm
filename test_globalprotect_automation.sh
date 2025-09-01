#!/bin/bash

# Script di test per automation GlobalProtect su macOS
echo "Testing GlobalProtect Automation Methods"
echo "========================================"

# Verifica se GlobalProtect è installato
if [ ! -d "/Applications/GlobalProtect.app" ]; then
    echo "❌ GlobalProtect not found"
    exit 1
fi

echo "✅ GlobalProtect found"
echo ""

# Test 1: CLI Commands
echo "1. Testing GlobalProtect CLI Commands..."
echo "----------------------------------------"

GP_BINARY="/Applications/GlobalProtect.app/Contents/MacOS/GlobalProtect"
GP_AGENT="/Applications/GlobalProtect.app/Contents/MacOS/gpAgent"

if [ -f "$GP_BINARY" ]; then
    echo "   ✅ GlobalProtect binary found: $GP_BINARY"
    
    # Test help/version commands
    echo "   Testing help options:"
    "$GP_BINARY" --help 2>&1 | head -5 && echo "     ✅ --help works" || echo "     ❌ --help failed"
    "$GP_BINARY" -h 2>&1 | head -5 && echo "     ✅ -h works" || echo "     ❌ -h failed"
    "$GP_BINARY" --version 2>&1 | head -5 && echo "     ✅ --version works" || echo "     ❌ --version failed"
    
    # Test connection commands (GlobalProtect specific)
    echo "   Testing connection commands:"
    "$GP_BINARY" --show-profiles 2>&1 | head -5 && echo "     ✅ --show-profiles works" || echo "     ❌ --show-profiles failed"
    "$GP_BINARY" --list-gateways 2>&1 | head -5 && echo "     ✅ --list-gateways works" || echo "     ❌ --list-gateways failed"
    "$GP_BINARY" --connect 2>&1 | head -5 && echo "     ✅ --connect exists" || echo "     ❌ --connect failed"
    "$GP_BINARY" --disconnect 2>&1 | head -5 && echo "     ✅ --disconnect exists" || echo "     ❌ --disconnect failed"
    "$GP_BINARY" --status 2>&1 | head -5 && echo "     ✅ --status works" || echo "     ❌ --status failed"
    
    # Test specific connection with fixed name "GiVa"
    echo "   Testing specific connection 'GiVa':"
    "$GP_BINARY" --connect "GiVa" 2>&1 | head -5 && echo "     ✅ --connect GiVa attempted" || echo "     ❌ --connect GiVa failed"
    "$GP_BINARY" -c "GiVa" 2>&1 | head -5 && echo "     ✅ -c GiVa attempted" || echo "     ❌ -c GiVa failed"
    "$GP_BINARY" connect-to "GiVa" 2>&1 | head -5 && echo "     ✅ connect-to GiVa attempted" || echo "     ❌ connect-to GiVa failed"
    
else
    echo "   ❌ GlobalProtect binary not found"
fi

if [ -f "$GP_AGENT" ]; then
    echo "   ✅ GlobalProtect agent found: $GP_AGENT"
    "$GP_AGENT" --help 2>&1 | head -5 && echo "     ✅ Agent --help works" || echo "     ❌ Agent --help failed"
else
    echo "   ❌ GlobalProtect agent not found"
fi

echo ""

# Test 2: AppleScript Support
echo "2. Testing GlobalProtect AppleScript Support..."
echo "------------------------------------------------"

# Test basic AppleScript connection
cat > /tmp/test_gp_applescript.scpt << 'EOF'
tell application "GlobalProtect"
    activate
    return name of every window
end tell
EOF

if osascript /tmp/test_gp_applescript.scpt 2>/dev/null; then
    echo "   ✅ GlobalProtect responds to basic AppleScript"
    
    # Test more specific commands
    cat > /tmp/test_gp_properties.scpt << 'EOF'
tell application "GlobalProtect"
    try
        return properties
    on error errMsg
        return "Error: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/test_gp_properties.scpt 2>/dev/null)
    echo "   AppleScript properties result: $result"
    
else
    echo "   ❌ GlobalProtect does not respond to AppleScript"
fi

echo ""

# Test 3: Menu Bar/GUI Automation
echo "3. Testing GlobalProtect GUI Automation..."
echo "-------------------------------------------"

# Check if GlobalProtect has menu bar presence
ps aux | grep -i globalprotect | grep -v grep && echo "   ✅ GlobalProtect process running" || echo "   ❌ GlobalProtect not running"

# Test menu bar automation
cat > /tmp/test_gp_gui.scpt << 'EOF'
tell application "System Events"
    tell application process "GlobalProtect"
        try
            return name of every menu bar item of menu bar 1
        on error errMsg
            return "Error: " & errMsg
        end try
    end tell
end tell
EOF

result=$(osascript /tmp/test_gp_gui.scpt 2>/dev/null)
echo "   Menu bar items: $result"

# Test system tray icon interaction
cat > /tmp/test_gp_tray.scpt << 'EOF'
tell application "System Events"
    try
        click menu bar item "GlobalProtect" of menu bar 1 of application process "GlobalProtect"
        delay 1
        return name of every menu item of menu 1 of menu bar item "GlobalProtect" of menu bar 1 of application process "GlobalProtect"
    on error errMsg
        return "Error: " & errMsg
    end try
end tell
EOF

result=$(osascript /tmp/test_gp_tray.scpt 2>/dev/null)
echo "   System tray menu items: $result"

echo ""

# Test 4: HTTP API / Local Services
echo "4. Testing GlobalProtect Local APIs..."
echo "---------------------------------------"

# Common ports for GlobalProtect APIs
test_ports=(8080 8443 9443 10443 8088 8888 4119 4120)

for port in "${test_ports[@]}"; do
    if curl -s --connect-timeout 2 "http://localhost:$port" >/dev/null 2>&1; then
        echo "   ✅ HTTP service responding on port $port"
        curl -s --connect-timeout 2 "http://localhost:$port/api" | head -100
        curl -s --connect-timeout 2 "http://localhost:$port/status" | head -100
    elif curl -s --connect-timeout 2 -k "https://localhost:$port" >/dev/null 2>&1; then
        echo "   ✅ HTTPS service responding on port $port"
        curl -s --connect-timeout 2 -k "https://localhost:$port/api" | head -100
        curl -s --connect-timeout 2 -k "https://localhost:$port/status" | head -100
    fi
done

echo ""

# Test 5: Configuration Files Analysis
echo "5. Analyzing GlobalProtect Configuration Storage..."
echo "----------------------------------------------------"

config_paths=(
    "$HOME/Library/Application Support/PaloAltoNetworks/GlobalProtect"
    "/Library/Application Support/PaloAltoNetworks"
    "$HOME/Library/Preferences/com.paloaltonetworks.GlobalProtect.plist"
    "/Library/Preferences/com.paloaltonetworks.GlobalProtect.plist"
)

for path in "${config_paths[@]}"; do
    if [ -e "$path" ]; then
        echo "   ✅ Config location found: $path"
        if [ -f "$path" ] && [[ "$path" == *.plist ]]; then
            # Try to read plist for VPN connection info
            plutil -p "$path" 2>/dev/null | grep -i "gateway\|portal\|server\|profile" | head -5
        elif [ -d "$path" ]; then
            # List config files
            echo "     Contents:"
            find "$path" -name "*.plist" -o -name "*.conf" -o -name "*.cfg" -o -name "*.xml" -o -name "*.dat" 2>/dev/null | head -10 | sed 's/^/       /'
        fi
    fi
done

echo ""

# Test 6: System Integration
echo "6. Testing System VPN Integration..."
echo "------------------------------------"

# List system VPN connections
system_vpns=$(scutil --nc list 2>/dev/null | grep globalprotect)
if [ ! -z "$system_vpns" ]; then
    echo "   ✅ GlobalProtect system VPN connections found:"
    echo "$system_vpns" | sed 's/^/     /'
    
    # Test if we can control system VPN
    vpn_name=$(echo "$system_vpns" | head -1 | sed -n 's/.*"\([^"]*\)".*/\1/p')
    if [ ! -z "$vpn_name" ]; then
        echo "   Testing system VPN control for: $vpn_name"
        scutil --nc show "$vpn_name" >/dev/null 2>&1 && echo "     ✅ Can read VPN config" || echo "     ❌ Cannot read VPN config"
        
        # DON'T actually connect, just test the command
        echo "     Command to connect would be: scutil --nc start \"$vpn_name\""
        echo "     Command to disconnect would be: scutil --nc stop \"$vpn_name\""
    fi
else
    echo "   ❌ No GlobalProtect system VPN connections found"
fi

echo ""

# Test 7: GlobalProtect Specific Tests
echo "7. Testing GlobalProtect Specific Features..."
echo "----------------------------------------------"

# Check for GlobalProtect daemon
if ps aux | grep -v grep | grep -q "GlobalProtect"; then
    echo "   ✅ GlobalProtect daemon running"
    
    # Try to communicate with daemon via Unix socket
    gp_sockets=$(find /tmp -name "*globalprotect*" -o -name "*gp*" 2>/dev/null)
    if [ ! -z "$gp_sockets" ]; then
        echo "   ✅ GlobalProtect sockets found:"
        echo "$gp_sockets" | sed 's/^/     /'
    fi
    
    # Check for specific GlobalProtect files
    if [ -f "/Library/LaunchDaemons/com.paloaltonetworks.gp.pangpd.plist" ]; then
        echo "   ✅ GlobalProtect system daemon found"
    fi
    
    if [ -f "$HOME/Library/LaunchAgents/com.paloaltonetworks.gp.pangpa.plist" ]; then
        echo "   ✅ GlobalProtect user agent found"
    fi
else
    echo "   ❌ GlobalProtect daemon not running"
fi

echo ""
echo "========================================"
echo "GlobalProtect Automation Test Complete"
echo "========================================"

# Cleanup
rm -f /tmp/test_gp_*.scpt