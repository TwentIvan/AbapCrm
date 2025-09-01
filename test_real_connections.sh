#!/bin/bash

# Test con i nomi VPN REALI trovati dal sistema
echo "Testing REAL VPN Connections"
echo "============================"
echo "Testing with actual VPN connection names from Ivan's Mac"
echo ""

# Lista delle connessioni reali trovate
real_connections=(
    "VPN 2"
    "VPN"
    "GlobalProtect"
    "eVPN-GruppoHera-IT"
    "Julius Meinl"
    "Lutech"
)

# Test 1: System VPN (scutil) - DOVREBBE FUNZIONARE
echo "1. Testing System VPN (scutil) with REAL names..."
echo "=================================================="

for vpn_name in "${real_connections[@]}"; do
    echo ""
    echo "Testing: $vpn_name"
    echo "-------------------"
    
    echo "   Show config: scutil --nc show \"$vpn_name\""
    if scutil --nc show "$vpn_name" >/dev/null 2>&1; then
        echo "   ✅ Config readable"
        
        echo "   ⚠️  Testing START command (will attempt real connection!):"
        echo "   Command: scutil --nc start \"$vpn_name\""
        echo "   NOTE: This will try to actually connect! Press Ctrl+C to stop if you don't want this."
        sleep 3
        
        # Test the start command
        if scutil --nc start "$vpn_name" 2>&1; then
            echo "   ✅ START command executed"
            sleep 2
            
            # Check status
            echo "   Checking status..."
            scutil --nc status "$vpn_name" 2>&1 | head -3
            
            # Stop it after test
            echo "   Stopping connection..."
            scutil --nc stop "$vpn_name" 2>&1
            echo "   ✅ STOP command executed"
        else
            echo "   ❌ START command failed"
        fi
    else
        echo "   ❌ Config not readable"
    fi
done

echo ""
echo "=========================================="

# Test 2: FortiClient CLI with real names
echo "2. Testing FortiClient CLI with REAL names..."
echo "=============================================="

if [ -f "/Applications/FortiClient.app/Contents/MacOS/FortiClient" ]; then
    FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"
    
    # Test only FortiClient connections
    fc_connections=("VPN 2" "VPN")
    
    for vpn_name in "${fc_connections[@]}"; do
        echo ""
        echo "Testing FortiClient: $vpn_name"
        echo "------------------------------"
        
        echo "   CLI: $FC_BINARY --connect \"$vpn_name\""
        "$FC_BINARY" --connect "$vpn_name" 2>&1 | head -5 | sed 's/^/   /'
        
        sleep 2
        
        # Test AppleScript
        echo "   AppleScript test:"
        cat > /tmp/fc_real_test.scpt << EOF
tell application "FortiClient"
    activate
    delay 2
    try
        connect to "$vpn_name"
        return "SUCCESS: Connection to $vpn_name attempted"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
        
        result=$(osascript /tmp/fc_real_test.scpt 2>&1)
        echo "   AppleScript result: $result"
        
        # Check if FortiClient is now showing connection attempt
        sleep 2
        echo "   Checking FortiClient status..."
        ps aux | grep FortiClient | grep -v grep | head -2 | sed 's/^/   /'
    done
else
    echo "   ❌ FortiClient not found"
fi

echo ""
echo "=========================================="

# Test 3: GlobalProtect with real name
echo "3. Testing GlobalProtect with REAL name..."
echo "=========================================="

if [ -f "/Applications/GlobalProtect.app/Contents/MacOS/GlobalProtect" ]; then
    GP_BINARY="/Applications/GlobalProtect.app/Contents/MacOS/GlobalProtect"
    
    vpn_name="GlobalProtect"
    echo ""
    echo "Testing GlobalProtect: $vpn_name"
    echo "--------------------------------"
    
    echo "   CLI: $GP_BINARY --connect \"$vpn_name\""
    "$GP_BINARY" --connect "$vpn_name" 2>&1 | head -5 | sed 's/^/   /'
    
    sleep 2
    
    # Test AppleScript
    echo "   AppleScript test:"
    cat > /tmp/gp_real_test.scpt << EOF
tell application "GlobalProtect"
    activate
    delay 2
    try
        connect to "$vpn_name"
        return "SUCCESS: Connection to $vpn_name attempted"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/gp_real_test.scpt 2>&1)
    echo "   AppleScript result: $result"
    
    # Check status
    sleep 2
    echo "   Checking GlobalProtect status..."
    ps aux | grep GlobalProtect | grep -v grep | head -2 | sed 's/^/   /'
else
    echo "   ❌ GlobalProtect not found"
fi

echo ""
echo "=========================================="
echo "Final Status Check"
echo "=========================================="

echo "Current VPN connections status:"
scutil --nc list 2>/dev/null | grep -E "(Connected|Connecting)" | sed 's/^/   /'

echo ""
echo "Network interfaces with VPN activity:"
ifconfig | grep -A1 "utun.*UP" | sed 's/^/   /'

echo ""
echo "=========================================="
echo "REAL VPN Testing Complete!"
echo "=========================================="
echo ""
echo "🎯 KEY FINDINGS:"
echo "• scutil commands should work with real names"
echo "• CLI tools should recognize real connection names"  
echo "• AppleScript should get better results with real names"
echo ""
echo "⚠️  WARNING: This test may have actually connected to VPNs!"
echo "   Check your VPN software GUIs and disconnect if needed."

# Cleanup
rm -f /tmp/fc_real_test.scpt /tmp/gp_real_test.scpt