#!/bin/bash

# Script avanzato per estrarre tutte le configurazioni VPN dalla workstation macOS
echo "Extracting VPN connections from macOS workstation (Advanced)"
echo "============================================================"

# Configurazione server
SERVER_URL="https://abapcrm.ivanlotorto.repl.co"
API_ENDPOINT="/api/vpn/upload-local-connections"

# Variabili
connections_json="[]"
connection_count=0

# Funzione per aggiungere connessione al JSON
add_connection() {
    local id="$1"
    local name="$2"
    local type="$3"
    local source="$4"
    local description="$5"
    
    if [ "$connections_json" = "[]" ]; then
        connections_json="[{\"id\":\"$id\",\"name\":\"$name\",\"type\":\"$type\",\"source\":\"$source\",\"status\":\"configured\",\"description\":\"$description\"}]"
    else
        connections_json=$(echo "$connections_json" | sed "s/]$/,{\"id\":\"$id\",\"name\":\"$name\",\"type\":\"$type\",\"source\":\"$source\",\"status\":\"configured\",\"description\":\"$description\"}]/")
    fi
    
    connection_count=$((connection_count + 1))
    echo "  [✓] Found: $name ($type)"
}

echo ""
echo "=== 1. SCANNING SYSTEM VPN CONNECTIONS ==="
vpn_list=$(scutil --nc list 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "System VPN connections found:"
    echo "$vpn_list"
    echo ""
    
    # Analizza ogni linea per trovare connessioni
    while IFS= read -r line; do
        if [[ $line == *"VPN"* ]] && [[ $line == *"\""* ]]; then
            connection_name=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
            
            if [[ $line == *"com.fortinet.forticlient"* ]]; then
                add_connection "sys-fc-$connection_count" "$connection_name" "forticlient" "system" "FortiClient system connection"
            elif [[ $line == *"com.cisco.anyconnect"* ]]; then
                add_connection "sys-ac-$connection_count" "$connection_name" "cisco-anyconnect" "system" "Cisco AnyConnect system connection"
            elif [[ $line == *"com.microsoft.AzureVpnMac"* ]]; then
                add_connection "sys-az-$connection_count" "$connection_name" "azure-vpn" "system" "Azure VPN system connection"
            elif [[ $line == *"com.paloaltonetworks.globalprotect"* ]]; then
                add_connection "sys-gp-$connection_count" "$connection_name" "globalprotect" "system" "GlobalProtect system connection"
            else
                add_connection "sys-other-$connection_count" "$connection_name" "other" "system" "Other VPN system connection"
            fi
        fi
    done <<< "$vpn_list"
fi

echo ""
echo "=== 2. SCANNING FORTICLIENT CONFIGURATIONS ==="

# Controlla installazione FortiClient
if [ -d "/Applications/FortiClient.app" ] || [ -d "/Applications/FortiClientVPN.app" ]; then
    echo "FortiClient app found"
    
    # Percorsi di configurazione FortiClient
    FC_PATHS=(
        "$HOME/Library/Application Support/Fortinet/FortiClient"
        "$HOME/Library/Preferences/com.fortinet.forticlient.plist"
        "/Library/Application Support/Fortinet/FortiClient"
        "$HOME/.fortinet"
        "/Applications/FortiClient.app/Contents/MacOS/config"
        "/Applications/FortiClientVPN.app/Contents/MacOS/config"
    )
    
    for path in "${FC_PATHS[@]}"; do
        if [ -e "$path" ]; then
            echo "  Checking: $path"
            
            if [ -f "$path" ] && [[ $path == *".plist" ]]; then
                # Leggi plist con plutil
                plist_content=$(plutil -p "$path" 2>/dev/null)
                if [ $? -eq 0 ]; then
                    echo "  [✓] FortiClient plist found"
                    # Cerca nomi di connessioni nel plist
                    conn_names=$(echo "$plist_content" | grep -i "name\|host\|server" | head -3)
                    if [ ! -z "$conn_names" ]; then
                        add_connection "fc-plist-$connection_count" "FortiClient Config" "forticlient" "plist" "FortiClient configuration from plist"
                    fi
                fi
            elif [ -d "$path" ]; then
                # Cerca file di configurazione nella directory
                config_files=$(find "$path" -name "*.conf" -o -name "*.cfg" -o -name "*.xml" -o -name "*.plist" 2>/dev/null)
                if [ ! -z "$config_files" ]; then
                    echo "  [✓] FortiClient config directory found"
                    file_count=$(echo "$config_files" | wc -l)
                    add_connection "fc-dir-$connection_count" "FortiClient Profiles ($file_count)" "forticlient" "config-dir" "FortiClient configuration files"
                fi
            fi
        fi
    done
else
    echo "FortiClient not installed"
fi

echo ""
echo "=== 3. SCANNING GLOBALPROTECT CONFIGURATIONS ==="

# Controlla installazione GlobalProtect
if [ -d "/Applications/GlobalProtect.app" ]; then
    echo "GlobalProtect app found"
    
    # Percorsi di configurazione GlobalProtect
    GP_PATHS=(
        "$HOME/Library/Application Support/PaloAltoNetworks/GlobalProtect"
        "$HOME/Library/Preferences/com.paloaltonetworks.GlobalProtect.plist"
        "/Library/Application Support/PaloAltoNetworks"
        "/Applications/GlobalProtect.app/Contents/MacOS/config"
    )
    
    for path in "${GP_PATHS[@]}"; do
        if [ -e "$path" ]; then
            echo "  Checking: $path"
            
            if [ -f "$path" ] && [[ $path == *".plist" ]]; then
                # Leggi plist
                plist_content=$(plutil -p "$path" 2>/dev/null)
                if [ $? -eq 0 ]; then
                    echo "  [✓] GlobalProtect plist found"
                    add_connection "gp-plist-$connection_count" "GlobalProtect Config" "globalprotect" "plist" "GlobalProtect configuration from plist"
                fi
            elif [ -d "$path" ]; then
                # Cerca file di configurazione
                config_files=$(find "$path" -name "*.conf" -o -name "*.cfg" -o -name "*.xml" -o -name "*.dat" 2>/dev/null)
                if [ ! -z "$config_files" ]; then
                    echo "  [✓] GlobalProtect config directory found"
                    file_count=$(echo "$config_files" | wc -l)
                    add_connection "gp-dir-$connection_count" "GlobalProtect Profiles ($file_count)" "globalprotect" "config-dir" "GlobalProtect configuration files"
                fi
            fi
        fi
    done
else
    echo "GlobalProtect not installed"
fi

echo ""
echo "=== 4. SCANNING CISCO ANYCONNECT CONFIGURATIONS ==="

# Controlla installazione Cisco AnyConnect
if [ -d "/Applications/Cisco" ] || [ -d "/opt/cisco/anyconnect" ]; then
    echo "Cisco AnyConnect found"
    
    AC_PATHS=(
        "$HOME/Library/Application Support/Cisco/Cisco AnyConnect VPN Client"
        "/opt/cisco/anyconnect/profile"
        "/Applications/Cisco/Cisco AnyConnect Secure Mobility Client.app/Contents/MacOS"
    )
    
    for path in "${AC_PATHS[@]}"; do
        if [ -e "$path" ]; then
            echo "  Checking: $path"
            config_files=$(find "$path" -name "*.xml" -o -name "*.profile" 2>/dev/null)
            if [ ! -z "$config_files" ]; then
                echo "  [✓] AnyConnect config files found"
                file_count=$(echo "$config_files" | wc -l)
                add_connection "ac-dir-$connection_count" "AnyConnect Profiles ($file_count)" "cisco-anyconnect" "config-dir" "Cisco AnyConnect configuration files"
            fi
        fi
    done
else
    echo "Cisco AnyConnect not found in standard locations"
fi

echo ""
echo "=== 5. SCANNING OTHER VPN SOFTWARE ==="

# Altri client VPN comuni
OTHER_VPN_APPS=(
    "/Applications/Tunnelblick.app:tunnelblick"
    "/Applications/Viscosity.app:viscosity"
    "/Applications/NordVPN.app:nordvpn"
    "/Applications/ExpressVPN.app:expressvpn"
    "/Applications/Private Internet Access.app:pia"
)

for app_info in "${OTHER_VPN_APPS[@]}"; do
    IFS=':' read -r app_path app_type <<< "$app_info"
    if [ -d "$app_path" ]; then
        app_name=$(basename "$app_path" .app)
        echo "  [✓] Found: $app_name"
        add_connection "other-$connection_count" "$app_name" "$app_type" "installed" "$app_name VPN client"
    fi
done

# Risultato finale
echo ""
echo "============================================================"
echo "DISCOVERY RESULTS: Found $connection_count total connections"
echo "============================================================"

if [ $connection_count -gt 0 ]; then
    echo "Connections JSON:"
    echo "$connections_json" | python3 -m json.tool 2>/dev/null || echo "$connections_json"
    echo ""
    
    # Prepara i dati per l'upload
    hostname=$(hostname)
    username=$(whoami)
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Escape del JSON per il payload
    escaped_json=$(echo "$connections_json" | sed 's/"/\\"/g')
    
    payload="{\"source\":\"local_workstation_advanced\",\"hostname\":\"$hostname\",\"username\":\"$username\",\"timestamp\":\"$timestamp\",\"connection_count\":$connection_count,\"connections\":\"$escaped_json\"}"
    
    echo "Uploading to server: $SERVER_URL$API_ENDPOINT"
    
    # Invia al server
    response=$(curl -s -X POST -H "Content-Type: application/json" -d "$payload" "$SERVER_URL$API_ENDPOINT" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ ! -z "$response" ]; then
        echo "Successfully uploaded to server!"
        echo "Server response: $response"
    else
        echo "Failed to upload to server. Saving locally..."
        backup_file="$HOME/vpn_connections_advanced_$(date +%Y%m%d_%H%M%S).json"
        echo "$payload" > "$backup_file"
        echo "Saved to: $backup_file"
        echo ""
        echo "You can manually copy this JSON to the web interface:"
        echo "$connections_json"
    fi
else
    echo "No VPN connections found."
    echo ""
    echo "Manual entry option:"
    read -p "Enter VPN connection names separated by commas: " manual_input
    
    if [ ! -z "$manual_input" ]; then
        echo "Creating manual connections..."
        IFS=',' read -ra names <<< "$manual_input"
        connections_json="["
        first=true
        
        for name in "${names[@]}"; do
            name=$(echo "$name" | xargs)
            if [ ! -z "$name" ]; then
                if [ "$first" = true ]; then
                    connections_json="${connections_json}{\"id\":\"manual-$connection_count\",\"name\":\"$name\",\"type\":\"manual\",\"source\":\"user-input\",\"status\":\"configured\",\"description\":\"Manual entry\"}"
                    first=false
                else
                    connections_json="${connections_json},{\"id\":\"manual-$connection_count\",\"name\":\"$name\",\"type\":\"manual\",\"source\":\"user-input\",\"status\":\"configured\",\"description\":\"Manual entry\"}"
                fi
                connection_count=$((connection_count + 1))
            fi
        done
        connections_json="${connections_json}]"
        
        echo "Manual connections created: $connection_count"
        echo "$connections_json"
    fi
fi

echo ""
echo "Script completed!"