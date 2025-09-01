#!/bin/bash

# Script per scoprire TUTTE le configurazioni FortiClient inclusa "GiVa"
echo "FortiClient Deep Configuration Discovery"
echo "======================================="
echo "Finding ALL FortiClient configurations including 'GiVa'"
echo ""

if [ ! -d "/Applications/FortiClient.app" ]; then
    echo "❌ FortiClient not found"
    exit 1
fi

echo "✅ FortiClient found"
echo ""

# Test 1: FortiClient configuration files analysis
echo "1. Analyzing FortiClient Configuration Files..."
echo "================================================"

# FortiClient configuration paths
config_paths=(
    "$HOME/Library/Application Support/Fortinet/FortiClient"
    "/Library/Application Support/Fortinet/FortiClient" 
    "$HOME/Library/Application Support/Fortinet"
    "/Library/Application Support/Fortinet"
    "$HOME/Library/Preferences/com.fortinet.forticlient.vpn.plist"
    "$HOME/Library/Preferences/com.fortinet.forticlient.plist"
    "/Library/Preferences/com.fortinet.forticlient.plist"
)

for config_path in "${config_paths[@]}"; do
    if [ -e "$config_path" ]; then
        echo ""
        echo "✅ Found: $config_path"
        
        if [ -f "$config_path" ] && [[ "$config_path" == *.plist ]]; then
            echo "   Analyzing plist file for VPN configs..."
            
            # Read plist and look for GiVa or other VPN configs
            if command -v plutil >/dev/null 2>&1; then
                echo "   Raw plist content (looking for GiVa):"
                plutil -p "$config_path" 2>/dev/null | grep -i -A5 -B5 "giva\|vpn\|connection\|server\|gateway" | head -20 | sed 's/^/     /'
                
                # Look specifically for GiVa
                if plutil -p "$config_path" 2>/dev/null | grep -i "giva" >/dev/null; then
                    echo "   🎯 FOUND 'GiVa' in $config_path!"
                    plutil -p "$config_path" 2>/dev/null | grep -i -A10 -B10 "giva" | sed 's/^/     ► /'
                fi
            fi
            
        elif [ -d "$config_path" ]; then
            echo "   Directory contents:"
            find "$config_path" -type f -name "*.plist" -o -name "*.conf" -o -name "*.cfg" -o -name "*.xml" -o -name "*.json" 2>/dev/null | head -10 | sed 's/^/     /'
            
            # Look in files for GiVa
            echo "   Searching for 'GiVa' in configuration files..."
            find "$config_path" -type f \( -name "*.plist" -o -name "*.conf" -o -name "*.cfg" -o -name "*.xml" -o -name "*.json" -o -name "*.txt" \) -exec grep -l -i "giva" {} \; 2>/dev/null | while read file; do
                echo "     🎯 Found 'GiVa' in: $file"
                grep -i -A3 -B3 "giva" "$file" 2>/dev/null | sed 's/^/       ► /'
            done
        fi
    fi
done

echo ""
echo "================================================"

# Test 2: FortiClient CLI configuration listing
echo "2. FortiClient CLI Configuration Discovery..."
echo "============================================="

FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"

# Try various list commands
list_commands=(
    "--list"
    "--list-connections" 
    "--list-profiles"
    "--list-vpn"
    "--show-connections"
    "--show-profiles"
    "--show-vpn"
    "--get-connections"
    "--get-profiles"
    "--profiles"
    "--connections"
    "--config"
    "--configuration"
    "list"
    "show"
    "profiles"
    "connections"
)

for cmd in "${list_commands[@]}"; do
    echo ""
    echo "Testing: $FC_BINARY $cmd"
    echo "-----------------------------"
    
    output=$(eval "$FC_BINARY $cmd" 2>&1)
    
    if [ ${#output} -gt 20 ]; then
        echo "Output found:"
        echo "$output" | head -15 | sed 's/^/   /'
        
        # Look for GiVa specifically
        if echo "$output" | grep -i "giva" >/dev/null; then
            echo "   🎯 FOUND 'GiVa' in output!"
            echo "$output" | grep -i -A2 -B2 "giva" | sed 's/^/     ► /'
        fi
        
        # Look for VPN connection patterns
        if echo "$output" | grep -i "vpn\|connection\|profile\|server" >/dev/null; then
            echo "   Found VPN-related content:"
            echo "$output" | grep -i "vpn\|connection\|profile\|server" | head -5 | sed 's/^/     → /'
        fi
    else
        echo "   No significant output"
    fi
done

echo ""
echo "================================================"

# Test 3: System VPN integration check for GiVa
echo "3. System VPN Integration Check..."
echo "==================================="

echo "Checking if GiVa appears in system VPN list..."
scutil --nc list 2>/dev/null | while read line; do
    if echo "$line" | grep -i "giva" >/dev/null; then
        echo "🎯 FOUND GiVa in system VPN list!"
        echo "   $line"
        
        # Extract VPN name
        vpn_name=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
        if [ ! -z "$vpn_name" ]; then
            echo "   Extracted name: $vpn_name"
            echo "   Testing system connection..."
            scutil --nc show "$vpn_name" 2>/dev/null | head -10 | sed 's/^/     /'
        fi
    fi
done

echo ""
echo "Full system VPN list (looking for FortiClient connections):"
scutil --nc list 2>/dev/null | grep -i "fortinet\|forticlient" | sed 's/^/   /'

echo ""
echo "================================================"

# Test 4: FortiClient process and runtime analysis
echo "4. FortiClient Runtime Analysis..."
echo "=================================="

echo "Starting FortiClient to analyze runtime configuration..."

# Start FortiClient
osascript -e 'tell application "FortiClient" to activate' 2>/dev/null &
sleep 3

echo "FortiClient processes:"
ps aux | grep -i forticlient | grep -v grep | sed 's/^/   /'

echo ""
echo "FortiClient application bundle analysis:"
if [ -d "/Applications/FortiClient.app/Contents" ]; then
    echo "   Checking for configuration templates or examples..."
    find "/Applications/FortiClient.app/Contents" -name "*.plist" -o -name "*.conf" -o -name "*.xml" 2>/dev/null | head -10 | while read file; do
        echo "   Checking: $file"
        if grep -i "giva\|example\|template\|connection" "$file" 2>/dev/null | head -3; then
            echo "     🎯 Found relevant content in $file"
        fi
    done
fi

echo ""
echo "================================================"

# Test 5: Advanced AppleScript introspection
echo "5. FortiClient AppleScript Introspection..."
echo "==========================================="

echo "Querying FortiClient for available connections via AppleScript..."

cat > /tmp/fc_introspection.scpt << 'EOF'
tell application "FortiClient"
    activate
    delay 2
    
    try
        -- Try to get connection list
        set connectionList to {}
        
        -- Method 1: Get every connection
        try
            set connectionList to name of every connection
            return "Connections found: " & (connectionList as string)
        end try
        
        -- Method 2: Get properties
        try
            set appProps to properties
            return "Properties: " & (appProps as string)
        end try
        
        -- Method 3: Get every VPN
        try
            set vpnList to name of every vpn
            return "VPNs found: " & (vpnList as string)
        end try
        
        -- Method 4: Get windows content
        try
            set windowContent to name of every window
            return "Windows: " & (windowContent as string)
        end try
        
        return "No connection information retrievable"
        
    on error errMsg
        return "Error: " & errMsg
    end try
end tell
EOF

result=$(osascript /tmp/fc_introspection.scpt 2>&1)
echo "AppleScript introspection result:"
echo "$result" | sed 's/^/   /'

# Check if result contains GiVa
if echo "$result" | grep -i "giva" >/dev/null; then
    echo "   🎯 FOUND 'GiVa' in AppleScript response!"
fi

echo ""
echo "================================================"
echo "FortiClient Deep Discovery Complete!"
echo "================================================"
echo ""
echo "🎯 SUMMARY:"
echo "• Analyzed all FortiClient configuration paths"
echo "• Tested all possible CLI list commands" 
echo "• Checked system VPN integration"
echo "• Performed runtime analysis"
echo "• Used AppleScript introspection"
echo ""
echo "Look for 🎯 markers above to see where 'GiVa' was found!"

# Cleanup
rm -f /tmp/fc_introspection.scpt