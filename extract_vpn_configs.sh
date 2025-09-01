#!/bin/bash

# Script ultra-avanzato per estrarre i nomi reali delle configurazioni VPN
echo "Extracting REAL VPN configuration names from macOS workstation"
echo "=============================================================="

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
    echo "  [✓] Real Config: $name ($type)"
}

echo ""
echo "=== 1. EXTRACTING REAL FORTICLIENT CONFIGURATIONS ==="

# FortiClient - Cerca configurazioni reali
if [ -d "/Applications/FortiClient.app" ] || [ -d "/Applications/FortiClientVPN.app" ]; then
    echo "FortiClient found - searching for real configuration names..."
    
    # Percorsi di configurazione FortiClient
    FC_CONFIG_DIRS=(
        "$HOME/Library/Application Support/Fortinet/FortiClient"
        "/Library/Application Support/Fortinet/FortiClient"
        "$HOME/.fortinet"
    )
    
    for config_dir in "${FC_CONFIG_DIRS[@]}"; do
        if [ -d "$config_dir" ]; then
            echo "  Searching in: $config_dir"
            
            # Cerca file di configurazione
            config_files=$(find "$config_dir" -name "*.conf" -o -name "*.cfg" -o -name "*.xml" -o -name "*.plist" 2>/dev/null)
            
            for config_file in $config_files; do
                if [ -f "$config_file" ]; then
                    echo "    Reading: $(basename "$config_file")"
                    
                    # Estrai nomi dalle configurazioni FortiClient
                    if [[ "$config_file" == *".plist" ]]; then
                        # Per file plist, usa plutil
                        vpn_names=$(plutil -p "$config_file" 2>/dev/null | grep -i "name\|host\|server" | sed 's/.*=> "\(.*\)".*/\1/' | head -5)
                    else
                        # Per altri file, cerca pattern comuni
                        vpn_names=$(grep -i "name\|host\|server\|vpn_name\|connection_name" "$config_file" 2>/dev/null | sed 's/.*[:=]\s*"\?\([^",]*\)"\?.*/\1/' | head -5)
                    fi
                    
                    # Aggiungi ogni nome trovato
                    while IFS= read -r vpn_name; do
                        if [ ! -z "$vpn_name" ] && [ ${#vpn_name} -gt 2 ]; then
                            # Pulisci il nome
                            clean_name=$(echo "$vpn_name" | sed 's/[^a-zA-Z0-9 ._-]//g' | xargs)
                            if [ ! -z "$clean_name" ] && [ ${#clean_name} -gt 2 ]; then
                                add_connection "fc-real-$connection_count" "$clean_name" "fortigate" "config-file" "FortiClient real configuration from $config_file"
                            fi
                        fi
                    done <<< "$vpn_names"
                fi
            done
        fi
    done
    
    # Se non trova configurazioni specifiche, usa quelle del sistema
    if [ $connection_count -eq 0 ]; then
        echo "  No specific configs found, using system VPN names..."
        vpn_list=$(scutil --nc list 2>/dev/null)
        while IFS= read -r line; do
            if [[ $line == *"com.fortinet.forticlient"* ]] && [[ $line == *"\""* ]]; then
                connection_name=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
                if [ ! -z "$connection_name" ]; then
                    add_connection "fc-sys-$connection_count" "$connection_name" "fortigate" "system" "FortiClient system VPN"
                fi
            fi
        done <<< "$vpn_list"
    fi
else
    echo "FortiClient not found"
fi

echo ""
echo "=== 2. EXTRACTING REAL GLOBALPROTECT CONFIGURATIONS ==="

if [ -d "/Applications/GlobalProtect.app" ]; then
    echo "GlobalProtect found - searching for real configuration names..."
    
    GP_CONFIG_DIRS=(
        "$HOME/Library/Application Support/PaloAltoNetworks/GlobalProtect"
        "/Library/Application Support/PaloAltoNetworks"
    )
    
    for config_dir in "${GP_CONFIG_DIRS[@]}"; do
        if [ -d "$config_dir" ]; then
            echo "  Searching in: $config_dir"
            
            # GlobalProtect usa spesso file .dat e .xml
            config_files=$(find "$config_dir" -name "*.dat" -o -name "*.xml" -o -name "*.conf" 2>/dev/null)
            
            for config_file in $config_files; do
                if [ -f "$config_file" ]; then
                    echo "    Reading: $(basename "$config_file")"
                    
                    # Estrai server names da GlobalProtect
                    gp_servers=$(grep -i "portal\|gateway\|server\|host" "$config_file" 2>/dev/null | sed 's/.*[:>=]\s*"\?\([^",<]*\)"\?.*/\1/' | head -5)
                    
                    while IFS= read -r server_name; do
                        if [ ! -z "$server_name" ] && [ ${#server_name} -gt 2 ]; then
                            clean_name=$(echo "$server_name" | sed 's/[^a-zA-Z0-9 ._-]//g' | xargs)
                            if [ ! -z "$clean_name" ] && [ ${#clean_name} -gt 2 ]; then
                                add_connection "gp-real-$connection_count" "$clean_name" "other" "config-file" "GlobalProtect real configuration from $config_file"
                            fi
                        fi
                    done <<< "$gp_servers"
                fi
            done
        fi
    done
    
    # Fallback al sistema
    if [[ $(echo "$connections_json" | grep -c "gp-real") -eq 0 ]]; then
        vpn_list=$(scutil --nc list 2>/dev/null)
        while IFS= read -r line; do
            if [[ $line == *"globalprotect"* ]] && [[ $line == *"\""* ]]; then
                connection_name=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
                if [ ! -z "$connection_name" ]; then
                    add_connection "gp-sys-$connection_count" "$connection_name" "other" "system" "GlobalProtect system VPN"
                fi
            fi
        done <<< "$vpn_list"
    fi
else
    echo "GlobalProtect not found"
fi

echo ""
echo "=== 3. EXTRACTING REAL CISCO ANYCONNECT CONFIGURATIONS ==="

# Cisco AnyConnect
AC_CONFIG_DIRS=(
    "$HOME/Library/Application Support/Cisco/Cisco AnyConnect VPN Client"
    "/opt/cisco/anyconnect/profile"
    "/Applications/Cisco"
)

echo "Cisco AnyConnect - searching for real profiles..."

for config_dir in "${AC_CONFIG_DIRS[@]}"; do
    if [ -d "$config_dir" ]; then
        echo "  Searching in: $config_dir"
        
        # AnyConnect usa file .xml per i profili
        profile_files=$(find "$config_dir" -name "*.xml" -o -name "*.profile" 2>/dev/null)
        
        for profile_file in $profile_files; do
            if [ -f "$profile_file" ]; then
                echo "    Reading: $(basename "$profile_file")"
                
                # Estrai server names da AnyConnect XML
                ac_servers=$(grep -i "hostentry\|servername\|displayname" "$profile_file" 2>/dev/null | sed 's/.*>\([^<]*\)<.*/\1/' | head -5)
                
                while IFS= read -r server_name; do
                    if [ ! -z "$server_name" ] && [ ${#server_name} -gt 2 ]; then
                        clean_name=$(echo "$server_name" | sed 's/[^a-zA-Z0-9 ._-]//g' | xargs)
                        if [ ! -z "$clean_name" ] && [ ${#clean_name} -gt 2 ]; then
                            add_connection "ac-real-$connection_count" "$clean_name" "cisco_anyconnect" "config-file" "Cisco AnyConnect real profile from $profile_file"
                        fi
                    fi
                done <<< "$ac_servers"
            fi
        done
    fi
done

# Fallback al sistema per Cisco
if [[ $(echo "$connections_json" | grep -c "ac-real") -eq 0 ]]; then
    vpn_list=$(scutil --nc list 2>/dev/null)
    while IFS= read -r line; do
        if [[ $line == *"cisco.anyconnect"* ]] && [[ $line == *"\""* ]]; then
            connection_name=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
            if [ ! -z "$connection_name" ]; then
                add_connection "ac-sys-$connection_count" "$connection_name" "cisco_anyconnect" "system" "Cisco AnyConnect system VPN"
            fi
        fi
    done <<< "$vpn_list"
fi

echo ""
echo "=== 4. EXTRACTING AZURE VPN CONFIGURATIONS ==="

vpn_list=$(scutil --nc list 2>/dev/null)
while IFS= read -r line; do
    if [[ $line == *"microsoft.AzureVpnMac"* ]] && [[ $line == *"\""* ]]; then
        connection_name=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
        if [ ! -z "$connection_name" ]; then
            add_connection "az-sys-$connection_count" "$connection_name" "other" "system" "Azure VPN system connection"
        fi
    fi
done <<< "$vpn_list"

# Risultato finale
echo ""
echo "============================================================"
echo "REAL CONFIGURATION EXTRACTION: Found $connection_count connections"
echo "============================================================"

if [ $connection_count -gt 0 ]; then
    echo "Real Configurations JSON:"
    echo "$connections_json" | python3 -m json.tool 2>/dev/null || echo "$connections_json"
    echo ""
    
    # Prepara i dati per l'upload
    hostname=$(hostname)
    username=$(whoami)
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Escape del JSON per il payload
    escaped_json=$(echo "$connections_json" | sed 's/"/\\"/g')
    
    payload="{\"source\":\"real_config_extraction\",\"hostname\":\"$hostname\",\"username\":\"$username\",\"timestamp\":\"$timestamp\",\"connection_count\":$connection_count,\"connections\":\"$escaped_json\"}"
    
    echo "Uploading to server: $SERVER_URL$API_ENDPOINT"
    
    # Invia al server
    response=$(curl -s -X POST -H "Content-Type: application/json" -d "$payload" "$SERVER_URL$API_ENDPOINT" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ ! -z "$response" ]; then
        echo "Successfully uploaded to server!"
        echo "Server response: $response"
    else
        echo "Failed to upload to server. Saving locally..."
        backup_file="$HOME/real_vpn_configs_$(date +%Y%m%d_%H%M%S).json"
        echo "$payload" > "$backup_file"
        echo "Saved to: $backup_file"
        echo ""
        echo "Real VPN Configuration Names Found:"
        echo "$connections_json"
    fi
else
    echo "No real VPN configurations found."
fi

echo ""
echo "Real configuration extraction completed!"