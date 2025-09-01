#!/usr/bin/env bash
set -euo pipefail

# Script avanzato per estrarre PROFILI REALI FortiClient usando fccconfig
echo "FortiClient Real Profile Extraction using fccconfig"
echo "====================================================="

# Configurazione
FCT_APP="/Applications/FortiClient.app"
FCCCONFIG="/Library/Application Support/Fortinet/FortiClient/bin/fccconfig"
SERVER_URL="https://abapcrm.ivanlotorto.repl.co"
API_ENDPOINT="/api/vpn/upload-real-profiles"

# Verifica FortiClient installato
if [ ! -d "$FCT_APP" ]; then
    echo "❌ FortiClient non trovato in $FCT_APP"
    exit 1
fi

echo "✅ FortiClient trovato"

# Verifica fccconfig disponibile  
if [ ! -x "$FCCCONFIG" ]; then
    echo "❌ fccconfig non trovato in: $FCCCONFIG"
    echo "Provando percorsi alternativi..."
    
    # Percorsi alternativi per fccconfig
    ALT_PATHS=(
        "/Applications/FortiClient.app/Contents/MacOS/fccconfig"
        "/Applications/FortiClient.app/Contents/Resources/fccconfig"
        "/Library/Application Support/Fortinet/bin/fccconfig"
        "/usr/local/bin/fccconfig"
    )
    
    for alt_path in "${ALT_PATHS[@]}"; do
        if [ -x "$alt_path" ]; then
            FCCCONFIG="$alt_path"
            echo "✅ fccconfig trovato in: $FCCCONFIG"
            break
        fi
    done
    
    if [ ! -x "$FCCCONFIG" ]; then
        echo "❌ fccconfig non disponibile su questo sistema"
        exit 1
    fi
fi

echo "✅ fccconfig disponibile"

# Crea directory temporanea
TMPDIR="$(mktemp -d)"
CFG_XML="$TMPDIR/fct_config.xml"

echo ""
echo "=== ESPORTAZIONE CONFIGURAZIONE FORTICLIENT ==="

# Esporta configurazione FortiClient
echo "Esportando configurazione con fccconfig..."
if "$FCCCONFIG" --operation export --file "$CFG_XML" >/dev/null 2>&1; then
    echo "✅ Configurazione esportata con successo"
else
    echo "❌ Errore nell'esportazione configurazione"
    echo "Verifica che FortiClient sia stato aperto almeno una volta"
    rm -rf "$TMPDIR"
    exit 1
fi

# Verifica che il file non sia vuoto
if [ ! -s "$CFG_XML" ]; then
    echo "❌ File di configurazione vuoto"
    rm -rf "$TMPDIR"
    exit 1
fi

echo "📄 File configurazione: $(du -h "$CFG_XML" | cut -f1)"

echo ""
echo "=== ESTRAZIONE PROFILI VPN ==="

# Estrazione profili SSL VPN
echo "Cercando profili SSL VPN..."
ssl_profiles=$(grep -Eo '<(vpn|sslvpn)[^>]*name="[^"]+"' "$CFG_XML" 2>/dev/null | sed -E 's/.*name="([^"]+)".*/\1/' | sort -u)

# Estrazione profili IPsec  
echo "Cercando profili IPsec..."
ipsec_profiles=$(grep -Eo '<ipsec[^>]*name="[^"]+"' "$CFG_XML" 2>/dev/null | sed -E 's/.*name="([^"]+)".*/\1/' | sort -u)

# Combina tutti i profili trovati
all_profiles=$(echo -e "$ssl_profiles\n$ipsec_profiles" | grep -v '^$' | sort -u)

echo ""
echo "=== PROFILI TROVATI ==="

connection_count=0
connections_json="[]"

# Funzione per aggiungere profilo al JSON
add_real_profile() {
    local id="$1"
    local name="$2"
    local type="$3"
    local description="$4"
    local automation="$5"
    
    if [ "$connections_json" = "[]" ]; then
        connections_json="[{\"id\":\"$id\",\"name\":\"$name\",\"type\":\"$type\",\"status\":\"configured\",\"description\":\"$description\",\"automationScript\":\"$automation\",\"source\":\"fccconfig\"}]"
    else
        connections_json=$(echo "$connections_json" | sed "s/]$/,{\"id\":\"$id\",\"name\":\"$name\",\"type\":\"$type\",\"status\":\"configured\",\"description\":\"$description\",\"automationScript\":\"$automation\",\"source\":\"fccconfig\"}]/")
    fi
    
    connection_count=$((connection_count + 1))
    echo "  [✓] Profilo reale: $name ($type)"
}

if [ -n "$all_profiles" ]; then
    echo "Profili FortiClient estratti dalla configurazione:"
    
    while IFS= read -r profile_name; do
        if [ -n "$profile_name" ]; then
            # Determina il tipo dal contesto XML
            if grep -q "<sslvpn[^>]*name=\"$profile_name\"" "$CFG_XML" 2>/dev/null; then
                add_real_profile "real-ssl-$connection_count" "$profile_name" "forticlient" "FortiClient SSL VPN: $profile_name (da fccconfig)" "applescript-advanced"
            elif grep -q "<ipsec[^>]*name=\"$profile_name\"" "$CFG_XML" 2>/dev/null; then
                add_real_profile "real-ipsec-$connection_count" "$profile_name" "forticlient" "FortiClient IPsec VPN: $profile_name (da fccconfig)" "applescript-advanced"
            else
                add_real_profile "real-vpn-$connection_count" "$profile_name" "forticlient" "FortiClient VPN: $profile_name (da fccconfig)" "applescript-advanced"
            fi
        fi
    done <<< "$all_profiles"
else
    echo "❌ Nessun profilo trovato nella configurazione esportata"
    echo "Possibili cause:"
    echo "  - FortiClient non è mai stato configurato"
    echo "  - I profili sono memorizzati in formato non standard"
    echo "  - Permessi insufficienti per leggere la configurazione"
fi

echo ""
echo "=== ESTRAZIONE DETTAGLI CONFIGURAZIONE ==="

if [ $connection_count -gt 0 ]; then
    echo "Analizzando dettagli configurazione..."
    
    # Estrai server/host per ogni profilo
    while IFS= read -r profile_name; do
        if [ -n "$profile_name" ]; then
            echo ""
            echo "📋 Profilo: $profile_name"
            
            # Cerca server/host per questo profilo
            profile_section=$(sed -n "/<[^>]*name=\"$profile_name\"/,/<\/[^>]*>/p" "$CFG_XML" 2>/dev/null)
            
            if [ -n "$profile_section" ]; then
                # Estrai server
                server=$(echo "$profile_section" | grep -Eo 'server="[^"]+"' | sed 's/server="//; s/"//' | head -1)
                if [ -n "$server" ]; then
                    echo "   Server: $server"
                fi
                
                # Estrai porta  
                port=$(echo "$profile_section" | grep -Eo 'port="[^"]+"' | sed 's/port="//; s/"//' | head -1)
                if [ -n "$port" ]; then
                    echo "   Porta: $port"
                fi
                
                # Estrai tipo di connessione
                conn_type=$(echo "$profile_section" | grep -Eo 'type="[^"]+"' | sed 's/type="//; s/"//' | head -1)
                if [ -n "$conn_type" ]; then
                    echo "   Tipo: $conn_type"
                fi
            fi
        fi
    done <<< "$all_profiles"
fi

echo ""
echo "========================================================"
echo "🎯 RISULTATO ESTRAZIONE PROFILI REALI:"
echo "Trovati $connection_count profili FortiClient autentici"
echo "========================================================"

if [ $connection_count -gt 0 ]; then
    echo ""
    echo "📋 JSON Profili Reali:"
    echo "$connections_json" | python3 -m json.tool 2>/dev/null || echo "$connections_json"
    
    echo ""
    echo "=== UPLOAD AL SERVER CRM ==="
    
    # Prepara payload per upload
    upload_payload=$(cat <<EOF
{
  "source": "fccconfig-real-extraction",
  "hostname": "$(hostname)",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "extraction_method": "fccconfig_xml_parsing",
  "connection_count": $connection_count,
  "connections": $connections_json
}
EOF
)
    
    echo "Caricando profili reali al server CRM..."
    
    # Upload con curl
    upload_result=$(curl -s -X POST "$SERVER_URL$API_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$upload_payload" 2>/dev/null)
    
    if echo "$upload_result" | grep -q '"success":true' 2>/dev/null; then
        echo "✅ Profili reali caricati con successo al CRM"
        echo "   Server response: $upload_result"
    else
        echo "❌ Errore nel caricamento profili al CRM"
        echo "   Response: $upload_result"
        echo ""
        echo "💾 Salvataggio locale come backup..."
        echo "$connections_json" > "$HOME/forticlient_real_profiles_$(date +%Y%m%d_%H%M%S).json"
        echo "   Profili salvati in: $HOME/forticlient_real_profiles_$(date +%Y%m%d_%H%M%S).json"
    fi
    
    echo ""
    echo "🎯 RIEPILOGO:"
    echo "• Estratti $connection_count profili reali da FortiClient"
    echo "• Metodo: fccconfig export + XML parsing"
    echo "• Profili caricati nel CRM per automazione"
    
else
    echo ""
    echo "⚠️  NESSUN PROFILO REALE TROVATO"
    echo "   Il sistema continuerà ad usare connessioni di sistema base"
fi

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "✅ Estrazione profili reali completata!"