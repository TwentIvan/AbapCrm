#!/bin/bash

# Test FINALE per connessione "GiVa" - ora che sappiamo che esiste!
echo "FortiClient GiVa Connection Test - REAL CONFIGURATION"
echo "====================================================="
echo "Testing connection to REAL GiVa configuration found in system"
echo ""

echo "✅ GiVa configuration confirmed at:"
echo "   /Library/Application Support/Fortinet/FortiClient/conf/vpn.plist"
echo "   Server: https://sslvpn.givagroup.it:443/sslvpn"
echo ""

if [ ! -d "/Applications/FortiClient.app" ]; then
    echo "❌ FortiClient not found"
    exit 1
fi

FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"

# Test 1: CLI Connection Attempts with REAL "GiVa"
echo "1. CLI Connection Tests with REAL 'GiVa'..."
echo "============================================="

echo "⚠️  TESTING REAL CONNECTION - May actually connect to VPN!"
echo "   Press Ctrl+C within 5 seconds to cancel..."
sleep 5

cli_tests=(
    "--connect GiVa"
    "--connect \"GiVa\""
    "-c GiVa" 
    "-c \"GiVa\""
    "connect GiVa"
    "connect \"GiVa\""
)

for cmd in "${cli_tests[@]}"; do
    echo ""
    echo "Testing: $FC_BINARY $cmd"
    echo "----------------------------------------"
    
    # Run command
    echo "Executing command..."
    eval "$FC_BINARY $cmd" &
    fc_pid=$!
    
    # Wait a moment for FortiClient to process
    sleep 3
    
    # Check if FortiClient is running
    if ps -p $fc_pid > /dev/null 2>&1; then
        echo "   ✅ FortiClient process started (PID: $fc_pid)"
    else
        echo "   ⚠️  FortiClient process finished"
    fi
    
    # Check for VPN activity
    echo "   Checking for VPN connection activity..."
    vpn_status=$(scutil --nc list 2>/dev/null | grep -i "connect")
    if [ ! -z "$vpn_status" ]; then
        echo "   🎯 VPN CONNECTION ACTIVITY DETECTED!"
        echo "$vpn_status" | sed 's/^/     /'
        
        # Check specifically for GiVa or FortiClient
        giva_status=$(scutil --nc list 2>/dev/null | grep -i "giva\|fortinet")
        if [ ! -z "$giva_status" ]; then
            echo "   🔥 GIVA/FORTICLIENT VPN STATUS:"
            echo "$giva_status" | sed 's/^/     /'
        fi
    else
        echo "   ❌ No VPN connection activity detected"
    fi
    
    # Check FortiClient GUI
    echo "   Checking FortiClient GUI state..."
    if pgrep -f "FortiClient" >/dev/null; then
        echo "   ✅ FortiClient GUI is running"
    else
        echo "   ❌ FortiClient GUI not detected"
    fi
    
    # Small delay between tests
    sleep 2
    
    # Kill the process if still running
    if ps -p $fc_pid > /dev/null 2>&1; then
        kill $fc_pid 2>/dev/null
    fi
    
    sleep 1
done

echo ""
echo "============================================="

# Test 2: AppleScript with REAL "GiVa"
echo "2. AppleScript Connection Test with REAL 'GiVa'..."
echo "==================================================="

echo "Attempting AppleScript connection to GiVa..."

cat > /tmp/giva_applescript_test.scpt << 'EOF'
tell application "FortiClient"
    activate
    delay 3
    
    try
        -- Try to connect to GiVa
        connect to "GiVa"
        delay 2
        return "SUCCESS: Connected to GiVa via AppleScript"
    on error errMsg
        try
            -- Alternative syntax
            start connection "GiVa"
            delay 2
            return "SUCCESS: Started GiVa connection via AppleScript"
        on error errMsg2
            return "ERROR: Both attempts failed - " & errMsg & " | " & errMsg2
        end try
    end try
end tell
EOF

echo "Running AppleScript..."
applescript_result=$(osascript /tmp/giva_applescript_test.scpt 2>&1)
echo "AppleScript result: $applescript_result"

# Check for VPN activity after AppleScript
sleep 2
echo "Checking VPN status after AppleScript..."
vpn_activity=$(scutil --nc list 2>/dev/null | grep -i "connect\|giva\|fortinet")
if [ ! -z "$vpn_activity" ]; then
    echo "🎯 VPN ACTIVITY AFTER APPLESCRIPT:"
    echo "$vpn_activity" | sed 's/^/   /'
fi

echo ""
echo "============================================="

# Test 3: System VPN Integration Check
echo "3. System VPN Integration Test..."
echo "================================="

echo "Checking if GiVa appears in system VPN connections..."
system_giva=$(scutil --nc list 2>/dev/null | grep -i "giva")
if [ ! -z "$system_giva" ]; then
    echo "🎯 FOUND GiVa in system VPN list!"
    echo "$system_giva"
    
    # Extract VPN name for system command
    vpn_name=$(echo "$system_giva" | sed -n 's/.*"\([^"]*\)".*/\1/p')
    if [ ! -z "$vpn_name" ]; then
        echo ""
        echo "Testing system VPN command with: $vpn_name"
        echo "⚠️  This will attempt REAL connection!"
        sleep 3
        
        echo "Executing: scutil --nc start \"$vpn_name\""
        if scutil --nc start "$vpn_name" 2>&1; then
            echo "✅ System VPN start command executed"
            
            # Check status
            sleep 3
            echo "Checking connection status..."
            scutil --nc status "$vpn_name" 2>&1 | head -5 | sed 's/^/   /'
            
            # Stop after test
            echo "Stopping connection for safety..."
            scutil --nc stop "$vpn_name" 2>&1
        fi
    fi
else
    echo "❌ GiVa not found in system VPN list"
    echo "   Available VPN connections:"
    scutil --nc list 2>/dev/null | grep "VPN" | sed 's/^/     /'
fi

echo ""
echo "============================================="

# Test 4: Final Status Check
echo "4. Final Connection Status..."
echo "============================="

echo "Current VPN connections:"
scutil --nc list 2>/dev/null | sed 's/^/   /'

echo ""
echo "Active VPN connections:"
scutil --nc list 2>/dev/null | grep -i "connected\|connecting" | sed 's/^/   /'

echo ""
echo "FortiClient processes:"
ps aux | grep -i forticlient | grep -v grep | sed 's/^/   /'

echo ""
echo "Network interfaces (VPN activity):"
ifconfig | grep -A1 "utun.*UP" | sed 's/^/   /'

echo ""
echo "============================================="
echo "GiVa Connection Test Complete!"
echo "============================================="
echo ""
echo "🎯 RESULTS SUMMARY:"
echo "• Tested CLI commands with REAL GiVa configuration"
echo "• Tested AppleScript automation with GiVa"
echo "• Checked system VPN integration"
echo "• Monitored actual VPN connection attempts"
echo ""
echo "🔥 KEY INDICATORS OF SUCCESS:"
echo "• 'VPN CONNECTION ACTIVITY DETECTED' messages"
echo "• 'SUCCESS' in AppleScript results"  
echo "• 'Connected/Connecting' status in VPN list"
echo "• FortiClient GUI remaining active"
echo ""
echo "⚠️  If connection was successful, check FortiClient GUI and disconnect if needed!"

# Cleanup
rm -f /tmp/giva_applescript_test.scpt