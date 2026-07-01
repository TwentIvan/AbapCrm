#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Hub Up — scansione VPN/connessioni SUL MAC e upload dell'inventario reale.
#
# Perché serve: il server (Replit/cloud) NON può ispezionare il tuo Mac. Questo
# script esegue il probe hubup_discover_mac.py QUI, sulla tua macchina, e carica
# il risultato su /api/hubup/discovery/inventory. Da quel momento il dropdown
# "Software Installato" e la readiness mostrano ciò che hai davvero installato.
#
# Nessuna credenziale VPN viene letta o inviata: solo nomi/versioni/stati e
# identificativi di profilo (schema hubup.discovered_connection_methods/1).
#
# Uso:
#   HUBUP_SERVER=https://tuo-app.replit.app \
#   HUBUP_EMAIL=tu@example.com \
#   HUBUP_PASSWORD='...' \
#   ./hubup_upload.sh
#
# In alternativa alla email/password puoi passare un cookie di sessione già
# ottenuto dal browser (DevTools → Application → Cookies → connect.sid):
#   HUBUP_SERVER=... HUBUP_COOKIE='connect.sid=s%3A...' ./hubup_upload.sh
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE="${HUBUP_PROBE:-$HERE/hubup_discover_mac.py}"
SERVER="${HUBUP_SERVER:-}"

if [[ -z "$SERVER" ]]; then
  echo "ERRORE: imposta HUBUP_SERVER (es. https://tuo-app.replit.app)" >&2
  exit 2
fi
SERVER="${SERVER%/}"  # rimuovi slash finale

if [[ ! -f "$PROBE" ]]; then
  echo "ERRORE: probe non trovato: $PROBE" >&2
  exit 2
fi

COOKIE_JAR="$(mktemp -t hubup_cookies.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# --- 1) Autenticazione: cookie diretto oppure login email/password ---
if [[ -n "${HUBUP_COOKIE:-}" ]]; then
  # scrivi il cookie fornito nel jar in formato Netscape
  printf '%s\tTRUE\t/\tFALSE\t0\t%s\t%s\n' \
    "$(printf '%s' "$SERVER" | sed -E 's#^https?://##; s#/.*$##')" \
    "${HUBUP_COOKIE%%=*}" "${HUBUP_COOKIE#*=}" > "$COOKIE_JAR"
else
  : "${HUBUP_EMAIL:?imposta HUBUP_EMAIL o HUBUP_COOKIE}"
  : "${HUBUP_PASSWORD:?imposta HUBUP_PASSWORD o HUBUP_COOKIE}"
  echo "→ login come $HUBUP_EMAIL ..." >&2
  login_code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -c "$COOKIE_JAR" \
    -H 'Content-Type: application/json' \
    -X POST "$SERVER/api/login" \
    --data "$(printf '{"email":%s,"password":%s}' \
              "$(printf '%s' "$HUBUP_EMAIL" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" \
              "$(printf '%s' "$HUBUP_PASSWORD" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")")"
  if [[ "$login_code" != "200" ]]; then
    echo "ERRORE: login fallito (HTTP $login_code). Controlla email/password." >&2
    exit 1
  fi
fi

# --- 2) Scansione locale (probe read-only) ---
echo "→ scansione del Mac in corso ..." >&2
INVENTORY="$(python3 "$PROBE")"
n_methods="$(printf '%s' "$INVENTORY" | python3 -c 'import json,sys;print(len(json.load(sys.stdin).get("methods",[])))')"
echo "→ trovati $n_methods metodi installati/configurati." >&2

# --- 3) Upload dell'inventario ---
echo "→ upload su $SERVER/api/hubup/discovery/inventory ..." >&2
resp="$(curl -sS -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -X POST "$SERVER/api/hubup/discovery/inventory" \
  --data "$INVENTORY")"

echo "$resp"
echo "✓ fatto. Ricarica la pagina VPN nell'app: il dropdown ora rispecchia il tuo Mac." >&2
