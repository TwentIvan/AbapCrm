#!/bin/bash
# ---------------------------------------------------------------------------
# Hub Up — Installer companion (doppio click).  NON serve digitare nulla.
#
# Questo file viene generato dalla UI di Hub Up già personalizzato: contiene
# l'indirizzo del server e un TOKEN di arruolamento (non la tua password).
# Aprilo con doppio click. La prima volta, se macOS blocca "sviluppatore non
# identificato": tasto destro sul file > Apri > Apri.
#
# Cosa fa: scarica il companion e il probe dal server, li installa come servizio
# (LaunchAgent: parte da solo al login e resta attivo), e lo avvia. Da quel
# momento il pulsante "Scansiona la mia workstation" nell'app funziona sempre.
# ---------------------------------------------------------------------------
set -euo pipefail

HUBUP_SERVER="@@HUBUP_SERVER@@"
HUBUP_TOKEN="@@HUBUP_TOKEN@@"
HUBUP_SERVER="${HUBUP_SERVER%/}"

HOME_DIR="$HOME/.hubup"
BIN="$HOME_DIR/bin"
PLIST="$HOME/Library/LaunchAgents/com.hubup.companion.plist"
mkdir -p "$BIN" "$HOME/Library/LaunchAgents"

echo "→ scarico companion e probe da $HUBUP_SERVER ..."
curl -fsSL "$HUBUP_SERVER/api/hubup/companion/agent.sh"  -o "$BIN/hubup_companion.sh"
curl -fsSL "$HUBUP_SERVER/api/hubup/companion/probe-mac" -o "$BIN/hubup_discover_mac.py"
chmod +x "$BIN/hubup_companion.sh"

echo "→ configuro il servizio (autenticazione via token, nessuna password) ..."
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
        <key>HUBUP_TOKEN</key><string>$HUBUP_TOKEN</string>
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

echo "→ avvio il companion ..."
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "✓ Fatto! Il companion è installato e attivo."
echo "  Torna nell'app: la scansione in corso si completerà da sola."
echo "  (log: $HOME_DIR/companion.out)"
echo ""
echo "Puoi chiudere questa finestra."
