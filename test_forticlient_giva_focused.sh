#!/bin/bash

# Test SPECIFICO per FortiClient e connessione "GiVa"
echo "FortiClient GiVa Connection Test"
echo "==============================="
echo "Focused testing for FortiClient connection 'GiVa'"
echo ""

if [ ! -d "/Applications/FortiClient.app" ]; then
    echo "❌ FortiClient not found"
    exit 1
fi

FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"
echo "✅ FortiClient found: $FC_BINARY"
echo ""

# Test 1: All possible CLI syntaxes for "GiVa"
echo "1. Testing ALL FortiClient CLI syntaxes for 'GiVa'..."
echo "======================================================="

cli_commands=(
    "--connect GiVa"
    "--connect \"GiVa\""
    "-c GiVa"
    "-c \"GiVa\""
    "connect GiVa"
    "connect \"GiVa\""
    "--start GiVa"
    "--start \"GiVa\""
    "--launch GiVa"
    "--launch \"GiVa\""
    "--open GiVa"
    "--open \"GiVa\""
    "--vpn GiVa"
    "--vpn \"GiVa\""
    "GiVa"
    "\"GiVa\""
)

for cmd in "${cli_commands[@]}"; do
    echo ""
    echo "Testing: $FC_BINARY $cmd"
    echo "----------------------------------------"
    
    # Run command and capture output
    output=$(eval "$FC_BINARY $cmd" 2>&1)
    exit_code=$?
    
    echo "Exit code: $exit_code"
    echo "Output:"
    echo "$output" | head -5 | sed 's/^/   /'
    
    # Check if FortiClient GUI opened/responded
    sleep 1
    if pgrep -f "FortiClient" >/dev/null; then
        echo "   ✅ FortiClient process active"
        
        # Check for any connection activity
        if scutil --nc list | grep -i "connecting\|connected" >/dev/null; then
            echo "   🎯 VPN activity detected!"
            scutil --nc list | grep -i "connecting\|connected" | sed 's/^/     /'
        fi
    else
        echo "   ❌ FortiClient process not detected"
    fi
    
    # Small delay between tests
    sleep 2
done

echo ""
echo "======================================================="

# Test 2: Advanced FortiClient CLI discovery
echo "2. FortiClient CLI Help and Options Discovery..."
echo "================================================="

help_commands=(
    "--help"
    "-h"
    "help"
    "--usage"
    "--options"
    "--list"
    "--show"
    "--status"
    "--version"
    "-v"
    "--info"
)

for cmd in "${help_commands[@]}"; do
    echo ""
    echo "Testing: $FC_BINARY $cmd"
    echo "-----------------------------"
    
    output=$(eval "$FC_BINARY $cmd" 2>&1)
    exit_code=$?
    
    echo "Exit code: $exit_code"
    if [ ${#output} -gt 0 ]; then
        echo "Output (first 10 lines):"
        echo "$output" | head -10 | sed 's/^/   /'
        
        # Look for connection-related keywords
        if echo "$output" | grep -i "connect\|vpn\|profile\|server" >/dev/null; then
            echo "   🎯 Found connection-related keywords!"
            echo "$output" | grep -i "connect\|vpn\|profile\|server" | head -3 | sed 's/^/     → /'
        fi
    fi
done

echo ""
echo "======================================================="

# Test 3: FortiClient AppleScript variations
echo "3. FortiClient AppleScript Variations for 'GiVa'..."
echo "====================================================="

applescript_commands=(
    'connect to "GiVa"'
    'connect "GiVa"'
    'start connection "GiVa"'
    'open connection "GiVa"'
    'launch connection "GiVa"'
    'activate connection "GiVa"'
    'select connection "GiVa"'
)

for as_cmd in "${applescript_commands[@]}"; do
    echo ""
    echo "Testing AppleScript: $as_cmd"
    echo "--------------------------------------"
    
    cat > /tmp/fc_as_test.scpt << EOF
tell application "FortiClient"
    activate
    delay 1
    try
        $as_cmd
        return "SUCCESS: Command executed"
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell
EOF
    
    result=$(osascript /tmp/fc_as_test.scpt 2>&1)
    echo "Result: $result"
    
    # Check for any VPN activity after AppleScript
    sleep 1
    if scutil --nc list | grep -i "connecting\|connected" >/dev/null; then
        echo "   🎯 VPN connection activity detected!"
        scutil --nc list | grep -i "connecting\|connected" | sed 's/^/     /'
    fi
    
    sleep 1
done

echo ""
echo "======================================================="

# Test 4: FortiClient GUI Automation - Menu clicking
echo "4. FortiClient GUI Automation for 'GiVa'..."
echo "============================================="

echo "Opening FortiClient and attempting GUI automation..."

# Activate FortiClient first
osascript -e 'tell application "FortiClient" to activate' 2>/dev/null
sleep 3

# Try to find and click GiVa in the GUI
cat > /tmp/fc_gui_giva_advanced.scpt << 'EOF'
tell application "System Events"
    tell application process "FortiClient"
        try
            activate
            delay 2
            
            # Get all windows
            set windowList to every window
            repeat with w in windowList
                try
                    tell w
                        # Look for any UI element containing "GiVa"
                        set allElements to entire contents
                        repeat with elem in allElements
                            try
                                if (value of elem as string) contains "GiVa" then
                                    click elem
                                    return "SUCCESS: Found and clicked GiVa element"
                                end if
                            end try
                            
                            try
                                if (name of elem as string) contains "GiVa" then
                                    click elem
                                    return "SUCCESS: Found and clicked GiVa by name"
                                end if
                            end try
                            
                            try
                                if (title of elem as string) contains "GiVa" then
                                    click elem
                                    return "SUCCESS: Found and clicked GiVa by title"
                                end if
                            end try
                        end repeat
                    end tell
                end try
            end repeat
            
            # Try menu bar
            try
                set menuItems to name of every menu item of menu bar 1
                repeat with menuItem in menuItems
                    if menuItem contains "GiVa" then
                        click menu item menuItem of menu bar 1
                        return "SUCCESS: Found GiVa in menu bar"
                    end if
                end repeat
            end try
            
            return "INFO: GiVa not found in FortiClient GUI"
            
        on error errMsg
            return "ERROR: " & errMsg
        end try
    end tell
end tell
EOF

result=$(osascript /tmp/fc_gui_giva_advanced.scpt 2>&1)
echo "GUI Automation result: $result"

echo ""
echo "======================================================="

# Test 5: Check what actually happened
echo "5. Final Status Check..."
echo "========================"

echo "Current VPN connections:"
scutil --nc list 2>/dev/null | sed 's/^/   /'

echo ""
echo "FortiClient processes:"
ps aux | grep -i forticlient | grep -v grep | sed 's/^/   /'

echo ""
echo "Any recent VPN activity:"
ifconfig | grep -A2 "utun.*UP" | sed 's/^/   /'

echo ""
echo "======================================================="
echo "FortiClient GiVa Test Complete!"
echo "======================================================="
echo ""
echo "🎯 SUMMARY:"
echo "• Tested all possible CLI syntaxes for GiVa"
echo "• Explored FortiClient help/options"
echo "• Tried multiple AppleScript variations"
echo "• Attempted GUI automation"
echo ""
echo "Look for SUCCESS messages or VPN activity above!"
echo "If GiVa connection started, check FortiClient GUI."

# Cleanup
rm -f /tmp/fc_as_test.scpt /tmp/fc_gui_giva_advanced.scpt