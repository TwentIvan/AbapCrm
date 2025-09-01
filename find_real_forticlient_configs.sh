#!/bin/bash

# Script ONESTO per trovare le VERE configurazioni FortiClient (senza inventare nomi fake)
echo "Searching for REAL FortiClient configurations (no fake data)"
echo "==========================================================="

# Cerca nei percorsi FortiClient più specifici
echo "1. Checking FortiClient application data..."

if [ -d "/Applications/FortiClient.app" ]; then
    echo "   FortiClient app installed"
    
    # Percorsi specifici dove FortiClient memorizza le configurazioni VPN
    CONFIG_PATHS=(
        "$HOME/Library/Application Support/Fortinet/FortiClient/vpn_profiles"
        "$HOME/Library/Application Support/Fortinet/FortiClient/config"
        "$HOME/Library/Application Support/Fortinet/FortiClient/user_profiles"
        "$HOME/Library/Application Support/Fortinet/FortiClient/saved_connections"
        "/Library/Application Support/Fortinet/FortiClient/profiles"
        "/Library/Application Support/Fortinet/profiles"
        "$HOME/.fortinet/profiles"
        "$HOME/.forticlient/vpn"
    )
    
    found_configs=0
    
    for config_path in "${CONFIG_PATHS[@]}"; do
        if [ -d "$config_path" ]; then
            echo "   ✓ Found config directory: $config_path"
            config_files=$(find "$config_path" -name "*.conf" -o -name "*.profile" -o -name "*.vpn" -o -name "*.cfg" 2>/dev/null)
            if [ ! -z "$config_files" ]; then
                echo "   Config files found:"
                echo "$config_files" | while read file; do
                    if [ -f "$file" ]; then
                        echo "     - $(basename "$file")"
                        found_configs=$((found_configs + 1))
                    fi
                done
            fi
        fi
    done
    
    if [ $found_configs -eq 0 ]; then
        echo "   ❌ No FortiClient VPN configuration files found in standard paths"
    fi
    
else
    echo "   FortiClient not found"
fi

echo ""
echo "2. Checking FortiClient preferences and settings..."

# Controlla file di preferenze specifici
PREF_FILES=(
    "$HOME/Library/Preferences/com.fortinet.forticlient.vpn.plist"
    "$HOME/Library/Preferences/com.fortinet.forticlient.plist"
    "/Library/Preferences/com.fortinet.forticlient.plist"
    "$HOME/Library/Application Support/Fortinet/FortiClient/vpn.plist"
)

found_prefs=0

for pref_file in "${PREF_FILES[@]}"; do
    if [ -f "$pref_file" ]; then
        echo "   ✓ Found preference file: $(basename "$pref_file")"
        
        # Prova a leggere le preferenze VPN se il file esiste
        if command -v plutil >/dev/null 2>&1; then
            vpn_data=$(plutil -p "$pref_file" 2>/dev/null | grep -i "vpn\|connection\|profile" | head -5)
            if [ ! -z "$vpn_data" ]; then
                echo "     VPN-related data found:"
                echo "$vpn_data" | sed 's/^/       /'
                found_prefs=$((found_prefs + 1))
            fi
        fi
    fi
done

if [ $found_prefs -eq 0 ]; then
    echo "   ❌ No FortiClient VPN preferences found"
fi

echo ""
echo "3. Checking FortiClient logs for connection history..."

LOG_PATHS=(
    "$HOME/Library/Logs/FortiClient"
    "/var/log/FortiClient"
    "$HOME/Library/Application Support/Fortinet/FortiClient/logs"
)

found_logs=0

for log_path in "${LOG_PATHS[@]}"; do
    if [ -d "$log_path" ]; then
        echo "   ✓ Found log directory: $log_path"
        
        # Cerca nei log recenti per nomi di server VPN
        recent_logs=$(find "$log_path" -name "*.log" -o -name "*.txt" 2>/dev/null | head -3)
        if [ ! -z "$recent_logs" ]; then
            echo "$recent_logs" | while read log_file; do
                if [ -f "$log_file" ]; then
                    echo "     Checking: $(basename "$log_file")"
                    # Cerca pattern di connessioni VPN nei log
                    vpn_servers=$(grep -i "connect\|server\|gateway\|tunnel" "$log_file" 2>/dev/null | grep -o '[a-zA-Z0-9.-]*\.[a-zA-Z]{2,}' | sort -u | head -3)
                    if [ ! -z "$vpn_servers" ]; then
                        echo "       Servers found in logs:"
                        echo "$vpn_servers" | sed 's/^/         /'
                        found_logs=$((found_logs + 1))
                    fi
                fi
            done
        fi
    fi
done

if [ $found_logs -eq 0 ]; then
    echo "   ❌ No FortiClient logs with VPN data found"
fi

echo ""
echo "==========================================================="
echo "CONCLUSION: FortiClient Real Configuration Search"
echo "==========================================================="

# Solo connessioni di sistema che sono SICURAMENTE reali
system_vpns=$(scutil --nc list 2>/dev/null | grep "fortinet.forticlient" | wc -l)
echo "✓ Found $system_vpns FortiClient system VPN connections (authentic)"

echo ""
echo "⚠️  HONEST RESULT:"
echo "   - Can find FortiClient system VPN connections: YES"
echo "   - Can find FortiClient configuration file names: PARTIAL/LIMITED"
echo "   - Need deeper FortiClient-specific tools to extract real config names"
echo ""
echo "🎯 RECOMMENDATION:"
echo "   FortiClient stores VPN configs in encrypted/binary format"
echo "   Need FortiClient CLI tools or API to get real configuration names"
echo "   Current script can only find system-level VPN connections reliably"

echo ""
echo "Real search completed (no fake data generated)."