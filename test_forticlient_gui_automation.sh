#!/bin/bash

# Test automazione GUI diretta per FortiClient - simula interazione umana
echo "FortiClient GUI Direct Automation Test"
echo "======================================"
echo "Testing direct GUI interaction to select and connect 'GiVa'"
echo ""

if [ ! -d "/Applications/FortiClient.app" ]; then
    echo "❌ FortiClient not found"
    exit 1
fi

echo "✅ FortiClient found"
echo ""

# Test 1: AppleScript GUI Automation - Menu Navigation
echo "1. Testing GUI Menu Navigation..."
echo "================================="

echo "Opening FortiClient and navigating to GiVa connection..."

cat > /tmp/fc_gui_navigation.scpt << 'EOF'
tell application "FortiClient"
    activate
    delay 3
end tell

tell application "System Events"
    tell application process "FortiClient"
        try
            -- Wait for FortiClient to fully load
            delay 3
            
            -- Try to find the main window
            if (count of windows) > 0 then
                tell window 1
                    -- Look for VPN connection list or dropdown
                    set allButtons to every button
                    set allPopUps to every pop up button
                    set allTables to every table
                    set allOutlines to every outline
                    
                    -- Try to find GiVa in various UI elements
                    repeat with btn in allButtons
                        try
                            if (name of btn as string) contains "GiVa" then
                                click btn
                                return "SUCCESS: Found and clicked GiVa button"
                            end if
                        end try
                    end repeat
                    
                    repeat with popup in allPopUps
                        try
                            click popup
                            delay 1
                            -- Look for GiVa in menu items
                            set menuItems to every menu item of menu 1 of popup
                            repeat with item in menuItems
                                if (name of item as string) contains "GiVa" then
                                    click item
                                    return "SUCCESS: Selected GiVa from dropdown"
                                end if
                            end repeat
                        end try
                    end repeat
                    
                    -- Try tables/lists
                    repeat with tbl in allTables
                        try
                            set tableRows to every row of tbl
                            repeat with row in tableRows
                                set rowCells to every cell of row
                                repeat with cell in rowCells
                                    if (value of cell as string) contains "GiVa" then
                                        click cell
                                        return "SUCCESS: Found and clicked GiVa in table"
                                    end if
                                end repeat
                            end repeat
                        end try
                    end repeat
                    
                    return "INFO: GiVa not found in standard UI elements"
                end tell
            else
                return "ERROR: No FortiClient windows found"
            end if
            
        on error errMsg
            return "ERROR: " & errMsg
        end try
    end tell
end tell
EOF

result=$(osascript /tmp/fc_gui_navigation.scpt 2>&1)
echo "GUI Navigation result: $result"

# Check for VPN activity
sleep 2
if scutil --nc list | grep -i "connect" >/dev/null; then
    echo "🎯 VPN activity detected after GUI automation!"
    scutil --nc list | grep -i "connect" | sed 's/^/   /'
fi

echo ""
echo "================================="

# Test 2: Keyboard Automation
echo "2. Testing Keyboard Automation..."
echo "================================="

echo "Using keyboard shortcuts to navigate FortiClient..."

cat > /tmp/fc_keyboard_automation.scpt << 'EOF'
tell application "FortiClient"
    activate
    delay 2
end tell

tell application "System Events"
    tell application process "FortiClient"
        try
            -- Try common keyboard shortcuts
            
            -- Tab through elements to find GiVa
            repeat 10 times
                key code 48 -- Tab key
                delay 0.5
                
                -- Check if current focused element contains GiVa
                try
                    set focusedElement to focused UI element
                    if (name of focusedElement as string) contains "GiVa" then
                        -- Press Enter or Space to select
                        key code 36 -- Enter
                        return "SUCCESS: Found GiVa via keyboard navigation"
                    end if
                end try
            end repeat
            
            -- Try typing GiVa directly
            keystroke "GiVa"
            delay 1
            key code 36 -- Enter
            
            return "INFO: Typed GiVa and pressed Enter"
            
        on error errMsg
            return "ERROR: " & errMsg
        end try
    end tell
end tell
EOF

result=$(osascript /tmp/fc_keyboard_automation.scpt 2>&1)
echo "Keyboard automation result: $result"

# Check for VPN activity
sleep 2
if scutil --nc list | grep -i "connect" >/dev/null; then
    echo "🎯 VPN activity detected after keyboard automation!"
    scutil --nc list | grep -i "connect" | sed 's/^/   /'
fi

echo ""
echo "================================="

# Test 3: Mouse Click Coordinates (if we can find them)
echo "3. Testing Mouse Click Automation..."
echo "==================================="

cat > /tmp/fc_mouse_automation.scpt << 'EOF'
tell application "FortiClient"
    activate
    delay 3
end tell

tell application "System Events"
    tell application process "FortiClient"
        try
            if (count of windows) > 0 then
                tell window 1
                    -- Get window bounds
                    set windowBounds to position
                    set windowSize to size
                    
                    -- Calculate potential click areas (rough estimates)
                    set centerX to (item 1 of windowBounds) + ((item 1 of windowSize) / 2)
                    set centerY to (item 2 of windowBounds) + ((item 2 of windowSize) / 2)
                    
                    -- Try clicking in center area (where connection list might be)
                    click at {centerX, centerY + 50}
                    delay 1
                    
                    -- Try double-click
                    click at {centerX, centerY + 50}
                    click at {centerX, centerY + 50}
                    delay 1
                    
                    -- Try right-click for context menu
                    tell window 1
                        set mousePos to {centerX, centerY + 30}
                        right click at mousePos
                        delay 1
                        
                        -- Look for context menu items
                        try
                            set contextMenuItems to every menu item of menu 1
                            repeat with item in contextMenuItems
                                if (name of item as string) contains "Connect" then
                                    click item
                                    return "SUCCESS: Used context menu to connect"
                                end if
                            end repeat
                        end try
                    end tell
                    
                    return "INFO: Attempted mouse automation"
                end tell
            else
                return "ERROR: No windows for mouse automation"
            end if
            
        on error errMsg
            return "ERROR: " & errMsg
        end try
    end tell
end tell
EOF

result=$(osascript /tmp/fc_mouse_automation.scpt 2>&1)
echo "Mouse automation result: $result"

echo ""
echo "================================="

# Test 4: Alternative CLI Syntaxes
echo "4. Testing Alternative CLI Syntaxes..."
echo "======================================"

FC_BINARY="/Applications/FortiClient.app/Contents/MacOS/FortiClient"

# Different parameter formats that might work
alt_syntaxes=(
    "--vpn=GiVa"
    "--profile=GiVa"
    "--name=GiVa"
    "--connection=GiVa"
    "--server=GiVa"
    "--config=GiVa"
    "-vpn GiVa"
    "-profile GiVa"
    "-name GiVa"
    "/connect:GiVa"
    "/vpn:GiVa"
    "/profile:GiVa"
)

for syntax in "${alt_syntaxes[@]}"; do
    echo ""
    echo "Testing: $FC_BINARY $syntax"
    echo "-----------------------------"
    
    # Start FortiClient with alternative syntax
    "$FC_BINARY" $syntax 2>&1 &
    fc_pid=$!
    
    # Wait and check for activity
    sleep 3
    
    if scutil --nc list | grep -i "connect" >/dev/null; then
        echo "🎯 VPN ACTIVITY DETECTED with syntax: $syntax"
        scutil --nc list | grep -i "connect" | sed 's/^/   /'
        
        # Kill process and break - we found working syntax!
        kill $fc_pid 2>/dev/null
        echo "✅ WORKING SYNTAX FOUND: $syntax"
        break
    else
        echo "   No VPN activity with this syntax"
    fi
    
    # Clean up
    kill $fc_pid 2>/dev/null
    sleep 1
done

echo ""
echo "================================="

# Test 5: Final Status Check
echo "5. Final Status Check..."
echo "========================"

echo "Current VPN connections:"
scutil --nc list | sed 's/^/   /'

echo ""
echo "FortiClient processes:"
ps aux | grep -i forticlient | grep -v grep | sed 's/^/   /'

echo ""
echo "================================="
echo "GUI Automation Test Complete!"
echo "================================="
echo ""
echo "🎯 SUMMARY:"
echo "• Tested direct GUI navigation and element clicking"
echo "• Tested keyboard automation (Tab navigation + typing)"
echo "• Tested mouse click automation at estimated positions"
echo "• Tested alternative CLI parameter syntaxes"
echo ""
echo "🔥 LOOK FOR:"
echo "• 'SUCCESS' messages indicating working automation"
echo "• 'VPN ACTIVITY DETECTED' showing connection attempts"
echo "• 'WORKING SYNTAX FOUND' for CLI alternatives"

# Cleanup
rm -f /tmp/fc_gui_navigation.scpt /tmp/fc_keyboard_automation.scpt /tmp/fc_mouse_automation.scpt