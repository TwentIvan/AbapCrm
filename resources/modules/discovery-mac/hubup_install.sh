#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Hub Up — Installer del companion (macOS).  UN comando, una volta sola.
#
# Il server cloud non può installare nulla sul Mac: questo è l'UNICO passo
# manuale. Dopo, tutto è automatico: il companion viene scaricato dal server,
# installato come LaunchAgent (auto-avvio al login + keep-alive) e si
# auto-aggiorna. Uso tipico (one-liner):
#
#   curl -fsSL https://TUA-APP.replit.app/api/hubup/companion/install.sh \
#     | HUBUP_EMAIL=tu@example.com HUBUP_PASSWORD='...' bash
#
# HUBUP_SERVER viene iniettato dal server quando serve questo script; puoi
# comunque forzarlo via env. Email/password si possono anche digitare al volo.
# ---------------------------------------------------------------------------
set -euo pipefail

HUBUP_SERVER="${HUBUP_SERVER:-@@HUBUP_SERVER@@}"
HUBUP_SERVER="${HUBUP_SERVER%/}"

# Credenziali: da env, altrimenti chiedile dal terminale (anche in curl|bash).
if [[ -z "${HUBUP_EMAIL:-}" ]]; then
  read -r -p "Email Hub Up: " HUBUP_EMAIL </dev/tty
fi
if [[ -z "${HUBUP_PASSWORD:-}" ]]; then
  read -r -s -p "Password Hub Up: " HUBUP_PASSWORD </dev/tty; echo
fi

HOME_DIR="$HOME/.hubup"
BIN="$HOME_DIR/bin"
PLIST="$HOME/Library/LaunchAgents/com.hubup.companion.plist"
mkdir -p "$BIN" "$HOME/Library/LaunchAgents"

echo "→ scarico companion e probe da $HUBUP_SERVER ..."
curl -fsSL "$HUBUP_SERVER/api/hubup/companion/agent.sh"  -o "$BIN/hubup_companion.sh"
curl -fsSL "$HUBUP_SERVER/api/hubup/companion/probe-mac" -o "$BIN/hubup_discover_mac.py"
chmod +x "$BIN/hubup_companion.sh"

echo "→ scrivo il LaunchAgent ..."
# NB: la password finisce in chiaro nel plist (permessi 600). Per un setup più
# robusto si passerà a un token dedicato / Keychain (vedi note nel repo).
umask 077
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>Label</key><string>com.hubup.companion</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$BIN/hubup_companion.sh</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HUBUP_SERVER</key><string>$HUBUP_SERVER</string>
        <key>HUBUP_EMAIL</key><string>$HUBUP_EMAIL</string>
        <key>HUBUP_PASSWORD</key><string>$HUBUP_PASSWORD</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>StandardOutPath</key><string>$HOME_DIR/companion.out</string>
    <key>StandardErrorPath</key><string>$HOME_DIR/companion.err</string>
</dict>
</plist>
PLIST
chmod 600 "$PLIST"

echo "→ (ri)avvio il servizio ..."
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ companion installato e avviato."
echo "  log:  $HOME_DIR/companion.out  /  $HOME_DIR/companion.err"
echo "  stop: launchctl unload $PLIST"
echo "Ora, nell'app, premi 'Scansiona la mia workstation'."
