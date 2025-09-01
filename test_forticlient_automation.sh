#!/bin/bash

# Script di test per automation FortiClient su macOS
echo "Testing FortiClient Automation Methods"
echo "======================================"

# Verifica se FortiClient è installato
if [ ! -d "/Applications/FortiClient.app" ]; then
    echo "❌ FortiClient not found"
    exit 1
fi

echo "✅ FortiClient found"
echo ""

# Test 1: CLI Commands
echo "1. Testing FortiClient CLI Commands..."
echo "--------------------------------------"

FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"
FC_HELPER="/Applications/FortiClient.app/Contents/MacOS/FortiClientHelper"

if [ -f "$FC_BINARY" ]; then
    echo "   ✅ FortiClient binary found: $FC_BINARY"
    
    # Test help/version commands
    echo "   Testing help options:"
    "$FC_BINARY" --help 2>&1 | head -5 && echo "     ✅ --help works" || echo "     ❌ --help failed"
    "$FC_BINARY" -h 2>&1 | head -5 && echo "     ✅ -h works" || echo "     ❌ -h failed"
    "$FC_BINARY" --version 2>&1 | head -5 && echo "     ✅ --version works" || echo "     ❌ --version failed"
    
    # Test connection commands
    echo "   Testing connection commands:"
    "$FC_BINARY" --list-connections 2>&1 | head -5 && echo "     ✅ --list-connections works" || echo "     ❌ --list-connections failed"
    "$FC_BINARY" --show-profiles 2>&1 | head -5 && echo "     ✅ --show-profiles works" || echo "     ❌ --show-profiles failed"
    "$FC_BINARY" --connect 2>&1 | head -5 && echo "     ✅ --connect exists" || echo "     ❌ --connect failed"
    
    # Test specific connection with fixed name "GiVa"
    echo "   Testing specific connection 'GiVa':"
    "$FC_BINARY" --connect "GiVa" 2>&1 | head -5 && echo "     ✅ --connect GiVa attempted" || echo "     ❌ --connect GiVa failed"
    "$FC_BINARY" -c "GiVa" 2>&1 | head -5 && echo "     ✅ -c GiVa attempted" || echo "     ❌ -c GiVa failed"
    "$FC_BINARY" connect "GiVa" 2>&1 | head -5 && echo "     ✅ connect GiVa attempted" || echo "     ❌ connect GiVa failed"
    
else
    echo "   ❌ FortiClient binary not found"
fi

if [ -f "$FC_HELPER" ]; then
    echo "   ✅ FortiClient helper found: $FC_HELPER"
    "$FC_HELPER" --help 2>&1 | head -5 && echo "     ✅ Helper --help works" || echo "     ❌ Helper --help failed"
else
    echo "   ❌ FortiClient helper not found"
fi

echo ""

# Test 2: AppleScript Support
echo "2. Testing FortiClient AppleScript Support..."
echo "----------------------------------------------"

# Test basic AppleScript connection
cat > /tmp/test_fc_applescript.scpt << 'EOF'
tell application "FortiClient"
    activate
    return name of every window
end tell
EOF

if osascript /tmp/test_fc_applescript.scpt 2>/dev/null; then
    echo "   ✅ FortiClient responds to basic AppleScript"
    
    # Test more specific commands
    cat > /tmp/test_fc_connections.scpt << 'EOF'
tell application "FortiClient"
    try
        return properties
    on error errMsg
        return "Error: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/test_fc_connections.scpt 2>/dev/null)
    echo "   AppleScript properties result: $result"
    
    # Test specific connection with "GiVa"
    echo "   Testing AppleScript connection to 'GiVa':"
    cat > /tmp/test_fc_connect_giva.scpt << 'EOF'
tell application "FortiClient"
    try
        connect to "GiVa"
        return "Connection to GiVa attempted"
    on error errMsg
        return "Error connecting to GiVa: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/test_fc_connect_giva.scpt 2>/dev/null)
    echo "   AppleScript connect GiVa result: $result"
    
else
    echo "   ❌ FortiClient does not respond to AppleScript"
fi

echo ""

# Test 3: Menu Bar/GUI Automation
echo "3. Testing FortiClient GUI Automation..."
echo "-----------------------------------------"

# Check if FortiClient has menu bar presence
ps aux | grep -i forticlient | grep -v grep && echo "   ✅ FortiClient process running" || echo "   ❌ FortiClient not running"

# Test menu bar automation
cat > /tmp/test_fc_gui.scpt << 'EOF'
tell application "System Events"
    tell application process "FortiClient"
        try
            return name of every menu bar item of menu bar 1
        on error errMsg
            return "Error: " & errMsg
        end try
    end tell
end tell
EOF

result=$(osascript /tmp/test_fc_gui.scpt 2>/dev/null)
echo "   Menu bar items: $result"

echo ""

# Test 4: HTTP API / Local Services
echo "4. Testing FortiClient Local APIs..."
echo "-------------------------------------"

# Common ports for VPN client APIs
test_ports=(8080 8443 9443 10443 8088 8888)

for port in "${test_ports[@]}"; do
    if curl -s --connect-timeout 2 "http://localhost:$port" >/dev/null 2>&1; then
        echo "   ✅ HTTP service responding on port $port"
        curl -s --connect-timeout 2 "http://localhost:$port/api" | head -100
    elif curl -s --connect-timeout 2 -k "https://localhost:$port" >/dev/null 2>&1; then
        echo "   ✅ HTTPS service responding on port $port"
        curl -s --connect-timeout 2 -k "https://localhost:$port/api" | head -100
    fi
done

echo ""

# Test 5: Configuration Files Analysis
echo "5. Analyzing FortiClient Configuration Storage..."
echo "--------------------------------------------------"

config_paths=(
    "$HOME/Library/Application Support/Fortinet/FortiClient"
    "/Library/Application Support/Fortinet/FortiClient"
    "$HOME/Library/Preferences/com.fortinet.forticlient.plist"
)

for path in "${config_paths[@]}"; do
    if [ -e "$path" ]; then
        echo "   ✅ Config location found: $path"
        if [ -f "$path" ] && [[ "$path" == *.plist ]]; then
            # Try to read plist for VPN connection info
            plutil -p "$path" 2>/dev/null | grep -i "vpn\|connection\|profile" | head -3
        elif [ -d "$path" ]; then
            # List config files
            find "$path" -name "*.plist" -o -name "*.conf" -o -name "*.cfg" 2>/dev/null | head -5
        fi
    fi
done

echo ""

# Test 6: System Integration
echo "6. Testing System VPN Integration..."
echo "------------------------------------"

# List system VPN connections
system_vpns=$(scutil --nc list 2>/dev/null | grep fortinet)
if [ ! -z "$system_vpns" ]; then
    echo "   ✅ FortiClient system VPN connections found:"
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
    echo "   ❌ No FortiClient system VPN connections found"
fi

echo ""
echo "======================================"
echo "FortiClient Automation Test Complete"
echo "======================================"

# Cleanup
rm -f /tmp/test_fc_*.scpt