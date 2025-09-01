#!/bin/bash

# Test specifico per connessione "GiVa" - tutte le opzioni
echo "Testing Specific Connection: GiVa"
echo "================================="
echo "Testing all possible ways to connect to a VPN named 'GiVa'"
echo ""

# Test 1: System VPN with scutil
echo "1. Testing System VPN (scutil) with 'GiVa'..."
echo "-----------------------------------------------"

echo "   Trying: scutil --nc start \"GiVa\""
scutil --nc start "GiVa" 2>&1 && echo "   ✅ System VPN start attempted" || echo "   ❌ System VPN start failed"

echo "   Trying: scutil --nc show \"GiVa\""
scutil --nc show "GiVa" 2>&1 && echo "   ✅ System VPN show worked" || echo "   ❌ System VPN show failed"

echo ""

# Test 2: FortiClient specific
echo "2. Testing FortiClient with 'GiVa'..."
echo "-------------------------------------"

if [ -f "/Applications/FortiClient.app/Contents/MacOS/FortiClient" ]; then
    FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"
    
    echo "   CLI attempts:"
    echo "     $FC_BINARY --connect \"GiVa\""
    "$FC_BINARY" --connect "GiVa" 2>&1 | head -3 | sed 's/^/       /'
    
    echo "     $FC_BINARY -c \"GiVa\""
    "$FC_BINARY" -c "GiVa" 2>&1 | head -3 | sed 's/^/       /'
    
    echo "     $FC_BINARY connect \"GiVa\""
    "$FC_BINARY" connect "GiVa" 2>&1 | head -3 | sed 's/^/       /'
    
    # AppleScript test
    echo "   AppleScript attempts:"
    cat > /tmp/fc_giva_test.scpt << 'EOF'
tell application "FortiClient"
    activate
    delay 2
    try
        connect to "GiVa"
        return "SUCCESS: Connection to GiVa attempted"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/fc_giva_test.scpt 2>&1)
    echo "     AppleScript result: $result"
else
    echo "   ❌ FortiClient not found"
fi

echo ""

# Test 3: GlobalProtect specific
echo "3. Testing GlobalProtect with 'GiVa'..."
echo "---------------------------------------"

if [ -f "/Applications/GlobalProtect.app/Contents/MacOS/GlobalProtect" ]; then
    GP_BINARY="/Applications/GlobalProtect.app/Contents/MacOS/GlobalProtect"
    
    echo "   CLI attempts:"
    echo "     $GP_BINARY --connect \"GiVa\""
    "$GP_BINARY" --connect "GiVa" 2>&1 | head -3 | sed 's/^/       /'
    
    echo "     $GP_BINARY -c \"GiVa\""
    "$GP_BINARY" -c "GiVa" 2>&1 | head -3 | sed 's/^/       /'
    
    echo "     $GP_BINARY connect-to \"GiVa\""
    "$GP_BINARY" connect-to "GiVa" 2>&1 | head -3 | sed 's/^/       /'
    
    # AppleScript test
    echo "   AppleScript attempts:"
    cat > /tmp/gp_giva_test.scpt << 'EOF'
tell application "GlobalProtect"
    activate
    delay 2
    try
        connect to "GiVa"
        return "SUCCESS: Connection to GiVa attempted"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/gp_giva_test.scpt 2>&1)
    echo "     AppleScript result: $result"
else
    echo "   ❌ GlobalProtect not found"
fi

echo ""

# Test 4: GUI Automation with AppleScript
echo "4. Testing GUI Automation for 'GiVa'..."
echo "----------------------------------------"

# FortiClient GUI automation
if [ -d "/Applications/FortiClient.app" ]; then
    echo "   FortiClient GUI automation:"
    cat > /tmp/fc_gui_giva.scpt << 'EOF'
tell application "System Events"
    tell application process "FortiClient"
        try
            activate
            delay 2
            
            # Try to find and click on GiVa connection
            set windowNames to name of every window
            repeat with windowName in windowNames
                if windowName contains "FortiClient" then
                    tell window windowName
                        # Look for GiVa text or button
                        set allUI to entire contents
                        repeat with uiElement in allUI
                            try
                                if (value of uiElement) contains "GiVa" then
                                    click uiElement
                                    return "SUCCESS: Found and clicked GiVa"
                                end if
                            end try
                        end repeat
                    end tell
                end if
            end repeat
            
            return "INFO: GiVa not found in GUI"
        on error errMsg
            return "ERROR: " & errMsg
        end try
    end tell
end tell
EOF
    
    result=$(osascript /tmp/fc_gui_giva.scpt 2>&1)
    echo "     FortiClient GUI result: $result"
fi

echo ""

# Test 5: Check what happened
echo "5. Checking Connection Status..."
echo "--------------------------------"

echo "   Current VPN connections:"
scutil --nc list 2>/dev/null | grep -i "connected\|connecting" | sed 's/^/     /'

echo "   Network interfaces:"
ifconfig | grep -A2 "utun\|ppp\|tun" | sed 's/^/     /'

echo ""
echo "================================="
echo "Test completed for connection 'GiVa'"
echo "================================="
echo ""
echo "🎯 SUMMARY:"
echo "If you see 'SUCCESS' messages above, the connection attempt worked!"
echo "If you see error messages, those show what went wrong."
echo "Check your VPN software GUI to see if 'GiVa' connection was attempted."

# Cleanup
rm -f /tmp/*_giva_test.scpt /tmp/fc_giva_test.scpt /tmp/gp_giva_test.scpt /tmp/fc_gui_giva.scpt