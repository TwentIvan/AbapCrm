#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Hub Up — Companion (macOS).  Scan "server-triggered".
#
# Il server (cloud) NON può raggiungere il tuo Mac. Questo companion inverte il
# flusso: gira sul Mac, apre lui la connessione al server (outbound, regge
# NAT/firewall), fa long-poll dei job in coda e, quando l'app accoda uno scan,
# esegue il probe QUI e riporta l'inventario. Nessuna credenziale VPN letta.
#
# Flusso:
#   login  ->  loop { GET /api/hubup/jobs/next (attesa) -> probe -> POST result }
#
# Uso (in foreground, per test):
#   HUBUP_SERVER=https://tuo-app.replit.app \
#   HUBUP_EMAIL=tu@example.com HUBUP_PASSWORD='...' \
#   ./hubup_companion.sh
#
# In produzione si installa come LaunchAgent (vedi com.hubup.companion.plist).
# Alternativa a email/password: HUBUP_COOKIE='connect.sid=...'.
# ---------------------------------------------------------------------------
set -o pipefail   # niente -u: su bash 3.2 (macOS) l'array vuoto va in errore

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="${HUBUP_SERVER:-}"
POLL_BACKOFF="${HUBUP_POLL_BACKOFF:-5}"   # attesa dopo un errore, in secondi

[[ -n "$SERVER" ]] || { echo "ERRORE: imposta HUBUP_SERVER" >&2; exit 2; }
SERVER="${SERVER%/}"

# Rileva il SO e scegli il probe adatto. Oggi esiste solo il probe macOS; su
# altri SO il companion resta comunque in ascolto e riporta un errore chiaro
# sul job, così la soluzione di produzione (multi-OS) potrà aggiungere i probe
# Windows/Linux senza cambiare né server né UI.
detect_probe() {
  if [[ -n "${HUBUP_PROBE:-}" ]]; then echo "$HUBUP_PROBE"; return; fi
  case "$(uname -s)" in
    Darwin) echo "$HERE/hubup_discover_mac.py" ;;
    *)      echo "" ;;   # TODO: hubup_discover_win / hubup_discover_linux
  esac
}
PROBE="$(detect_probe)"

COOKIE_JAR="$(mktemp -t hubup_companion.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# Argomenti di autenticazione per curl: token (Bearer) o cookie di sessione.
CURL_AUTH=()

# Log su stdout (finisce in companion.out del LaunchAgent): un solo file da
# guardare per la diagnosi.
log() { printf '[companion] %s\n' "$*"; }

json_str() { python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'; }

login() {
  # Modalità preferita: token di arruolamento (installer generato dalla UI).
  if [[ -n "${HUBUP_TOKEN:-}" ]]; then
    CURL_AUTH=(-H "Authorization: Bearer $HUBUP_TOKEN")
    log "autenticazione via token"
    return 0
  fi
  if [[ -n "${HUBUP_COOKIE:-}" ]]; then
    printf '%s\tTRUE\t/\tFALSE\t0\t%s\t%s\n' \
      "$(printf '%s' "$SERVER" | sed -E 's#^https?://##; s#/.*$##')" \
      "${HUBUP_COOKIE%%=*}" "${HUBUP_COOKIE#*=}" > "$COOKIE_JAR"
    CURL_AUTH=(-b "$COOKIE_JAR")
    return 0
  fi
  # Nessuna credenziale: NON uscire (launchd riavvierebbe in loop). Segnala e
  # lascia che il chiamante faccia backoff.
  if [[ -z "${HUBUP_EMAIL:-}" || -z "${HUBUP_PASSWORD:-}" ]]; then
    log "nessuna credenziale (HUBUP_TOKEN/HUBUP_COOKIE/HUBUP_EMAIL): in attesa di configurazione."
    return 1
  fi
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
    -H 'Content-Type: application/json' -X POST "$SERVER/api/login" \
    --data "$(printf '{"email":%s,"password":%s}' \
      "$(printf '%s' "$HUBUP_EMAIL" | json_str)" \
      "$(printf '%s' "$HUBUP_PASSWORD" | json_str)")")" || return 1
  [[ "$code" == "200" ]] || { log "login fallito (HTTP $code)"; return 1; }
  CURL_AUTH=(-b "$COOKIE_JAR")
  log "login OK come $HUBUP_EMAIL"
}

# Esegue il probe e riporta l'esito del job.  $1 = job id
handle_job() {
  local job_id="$1" inv rc=0
  # SO non supportato dal probe: riporta un errore parlante e prosegui.
  if [[ -z "$PROBE" || ! -f "$PROBE" ]]; then
    local msg; msg="$(printf 'nessun probe per questo SO (%s); solo macOS supportato al momento' "$(uname -s)")"
    curl -sS "${CURL_AUTH[@]}" -H 'Content-Type: application/json' \
      -X POST "$SERVER/api/hubup/jobs/$job_id/result" \
      --data "$(printf '{"error":%s}' "$(printf '%s' "$msg" | json_str)")" >/dev/null || true
    log "job $job_id: $msg"
    return
  fi
  log "job $job_id: scansione in corso ..."
  inv="$(python3 "$PROBE" 2>/dev/null)" || rc=$?
  if [[ $rc -ne 0 || -z "$inv" ]]; then
    curl -sS "${CURL_AUTH[@]}" -H 'Content-Type: application/json' \
      -X POST "$SERVER/api/hubup/jobs/$job_id/result" \
      --data "$(printf '{"error":%s}' "$(printf 'probe fallito (rc=%s)' "$rc" | json_str)")" >/dev/null || true
    log "job $job_id: probe fallito (rc=$rc)"
    return
  fi
  # inventory come oggetto annidato: { "inventory": <payload probe> }
  local body
  body="$(python3 -c 'import json,sys; print(json.dumps({"inventory": json.loads(sys.stdin.read())}))' <<<"$inv")"
  local resp
  resp="$(curl -sS "${CURL_AUTH[@]}" -H 'Content-Type: application/json' \
    -X POST "$SERVER/api/hubup/jobs/$job_id/result" --data "$body")" || { log "job $job_id: upload esito fallito"; return; }
  log "job $job_id: completato -> $resp"
}

# Auto-aggiornamento del probe dal server (best-effort). Mantiene la firma
# di rilevamento allineata senza reinstallare il companion.
self_update_probe() {
  [[ "$(uname -s)" == "Darwin" ]] || return 0
  [[ -n "$PROBE" ]] || return 0
  local tmp; tmp="$(mktemp -t hubup_probe.XXXXXX)"
  if curl -fsSL --max-time 20 "$SERVER/api/hubup/companion/probe-mac" -o "$tmp" 2>/dev/null \
       && python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' "$tmp" 2>/dev/null; then
    mkdir -p "$(dirname "$PROBE")"
    mv "$tmp" "$PROBE"
    log "probe aggiornato dal server."
  else
    rm -f "$tmp"
    log "probe non aggiornato (uso la copia locale)."
  fi
}

main() {
  login || { log "login iniziale fallito, riprovo tra ${POLL_BACKOFF}s"; sleep "$POLL_BACKOFF"; }
  self_update_probe
  log "in ascolto di job su $SERVER ..."
  while true; do
    local http body tmp t0 elapsed
    tmp="$(mktemp -t hubup_next.XXXXXX)"
    t0=$SECONDS
    http="$(curl -sS "${CURL_AUTH[@]}" -o "$tmp" -w '%{http_code}' \
      --max-time 35 "$SERVER/api/hubup/jobs/next?hostname=$(hostname | sed 's/[^A-Za-z0-9._-]/_/g')")" || http="000"
    body="$(cat "$tmp")"; rm -f "$tmp"
    elapsed=$(( SECONDS - t0 ))

    case "$http" in
      200)
        local job_id
        job_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' <<<"$body" 2>/dev/null)"
        [[ -n "$job_id" ]] && handle_job "$job_id"
        ;;
      # nessun job: col long-poll il server tiene ~25s. Se torna subito (server
      # non long-poll), evita l'hot-loop con una piccola pausa.
      204) [[ "$elapsed" -lt 2 ]] && sleep 2 ;;
      401) log "non autorizzato (token/sessione), riprovo tra ${POLL_BACKOFF}s"; sleep "$POLL_BACKOFF"; login || true ;;
      000) log "rete non raggiungibile, ritento tra ${POLL_BACKOFF}s"; sleep "$POLL_BACKOFF" ;;
      *)   log "risposta inattesa (HTTP $http), attendo ${POLL_BACKOFF}s"; sleep "$POLL_BACKOFF" ;;
    esac
  done
}

main "$@"
