#!/usr/bin/env bash
set -euo pipefail

# Script avanzato per connessione FortiClient con selezione profilo
# Basato sul metodo ChatGPT per automazione GUI avanzata

PROFILE_ARG="${1:-}"          # Profilo da CLI (opzionale)
ACTION="${2:-connect}"        # connect | disconnect
FCT_APP="/Applications/FortiClient.app"
FCCCONFIG="/Library/Application Support/Fortinet/FortiClient/bin/fccconfig"

# Funzioni di utilità
die() { echo "Errore: $*" >&2; exit 1; }

echo "FortiClient Advanced Connection Script"
echo "====================================="

# Verifiche
[ -d "$FCT_APP" ] || die "FortiClient non trovato in $FCT_APP"

# Trova fccconfig in percorsi alternativi
if [ ! -x "$FCCCONFIG" ]; then
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
fi

# Estrai profili disponibili
TMPDIR="$(mktemp -d)"
CFG_XML="$TMPDIR/fct_config.xml"

echo "Esportando configurazione FortiClient..."
if "$FCCCONFIG" --operation export --file "$CFG_XML" >/dev/null 2>&1; then
    echo "✅ Configurazione esportata"
else
    echo "❌ Impossibile esportare configurazione"
    echo "Apri FortiClient almeno una volta e riprova"
    rm -rf "$TMPDIR"
    exit 1
fi

# Estrai nomi profili dal XML
mapfile -t PROFILES < <(grep -Eo '<(vpn|sslvpn|ipsec)[^>]*name="[^"]+"' "$CFG_XML" \
                       | sed -E 's/.*name="([^"]+)".*/\1/' \
                       | awk 'length' \
                       | sort -u)

[ "${#PROFILES[@]}" -gt 0 ] || die "Nessun profilo trovato nella configurazione"

echo "Profili disponibili: ${#PROFILES[@]}"
for profile in "${PROFILES[@]}"; do
    echo "  • $profile"
done

# Selezione profilo
PROFILE_NAME="$PROFILE_ARG"
if [ -z "$PROFILE_NAME" ]; then
  echo ""
  echo "Seleziona profilo:"
  i=1
  for p in "${PROFILES[@]}"; do
    printf "  [%d] %s\n" "$i" "$p"
    i=$((i+1))
  done
  printf "Numero profilo: "
  read -r sel
  if ! [[ "$sel" =~ ^[0-9]+$ ]] || [ "$sel" -lt 1 ] || [ "$sel" -gt "${#PROFILES[@]}" ]; then
    die "Selezione non valida"
  fi
  PROFILE_NAME="${PROFILES[$((sel-1))]}"
fi

# Verifica profilo esiste
if ! printf '%s\n' "${PROFILES[@]}" | grep -Fxq "$PROFILE_NAME"; then
  die "Profilo \"$PROFILE_NAME\" non trovato"
fi

echo ""
echo "🎯 Connessione: $PROFILE_NAME"
echo "Azione: $ACTION"

# Avvia FortiClient
echo "Avviando FortiClient..."
open -ga "$FCT_APP"
sleep 2

# AppleScript avanzato per selezione profilo
echo "Eseguendo automazione GUI..."
osascript <<OSA
on run argv
  set profileName to "$PROFILE_NAME"
  set actionName to "$ACTION"

  tell application "FortiClient" to activate
  delay 0.5

  tell application "System Events"
    if not (exists process "FortiClient") then return "FortiClient process not found"
    tell process "FortiClient"
      set frontmost to true
      delay 0.5

      -- Trova finestra principale
      set theWin to missing value
      try
        set theWin to window 1
      end try
      if theWin is missing value then return "FortiClient main window not found"

      -- Seleziona profilo
      try
        if (count of pop up buttons of theWin) > 0 then
          click pop up button 1 of theWin
          delay 0.3
          tell menu 1 of pop up button 1 of theWin
            click (first menu item whose name is profileName)
          end tell
        else if (count of combo boxes of theWin) > 0 then
          tell combo box 1 of theWin
            set value to profileName
          end tell
        else
          -- Tabella profili
          if (count of tables of theWin) > 0 then
            set foundRow to false
            repeat with r in rows of table 1 of theWin
              try
                if (value of static text 1 of r) is profileName then
                  select r
                  set foundRow to true
                  exit repeat
                end if
              end try
            end repeat
            if not foundRow then error "Profile not found in table"
          end if
        end if
      end try
      delay 0.3

      -- Click Connect/Disconnect
      set connectLabels to {"Connect", "Connetti"}
      set disconnectLabels to {"Disconnect", "Disconnetti"}

      if actionName is "connect" then
        my clickFirstMatchingButton(theWin, connectLabels)
      else if actionName is "disconnect" then
        my clickFirstMatchingButton(theWin, disconnectLabels)
      end if
      
      return "Operation completed for " & profileName
    end tell
  end tell
end run

on clickFirstMatchingButton(theWin, labelList)
  tell application "System Events"
    repeat with lbl in labelList
      try
        click (first button whose title contains (lbl as text) of theWin)
        return
      end try
    end repeat
    -- Fallback
    try
      click button 1 of theWin
    end try
  end tell
end clickFirstMatchingButton
OSA

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "✅ Script completato!"
echo "Profilo: $PROFILE_NAME"
echo "Azione: $ACTION"