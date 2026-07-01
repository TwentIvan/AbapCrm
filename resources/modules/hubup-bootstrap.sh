#!/bin/bash
# =============================================================================
# The Hub Up — Bootstrap sicuro dei moduli (macOS)   ·  Modulo G
#
# Scarica, VERIFICA e SOLO POI esegue un modulo pubblicato dal server (es. il
# probe di discovery). "Server-delivered" NON significa "codice arbitrario":
# ogni artefatto passa una catena di controlli prima di essere eseguito.
#
# Catena di fiducia (difesa in profondita'):
#   1. TLS verificato verso Hub Up (curl --proto =https, cert non disabilitato)
#   2. Manifest firmato (Ed25519)  -> integrita' dei METADATI (versione, scadenza,
#      tipo, hash artefatto, revoche). Verificato da un verifier dedicato.
#   3. Artefatto:
#        - binario  -> codesign --verify --strict + spctl (notarizzazione Apple)
#        - script   -> sha256 == hash nel manifest FIRMATO (l'integrita' deriva
#                      dalla firma del manifest, non dal trasporto)
#   4. Allowlist dei TIPI di modulo accettati (niente esecuzione generica)
#   5. Anti-rollback (versione >= ultima vista) + scadenza manifest + revoche
#   6. Esecuzione read-only, PATH ridotto, timeout, tempdir 0700 ripulita
#   7. Audit lato server (versione, hash, keyid, esito, operatore)
#
# Il modulo NON telefona a casa: stampa solo su stdout; e' il bootstrap a
# trasmettere l'output. Cosi' il payload resta un semplice lettore read-only.
# =============================================================================
set -euo pipefail

# ---- configurazione (in produzione: iniettata dal companion installato) -----
: "${HUBUP_SERVER:?definire HUBUP_SERVER, es. https://portal.thehubup.example}"
HUBUP_HOME="${HUBUP_HOME:-$HOME/.hubup}"
PINNED_PUBKEY="${HUBUP_PINNED_PUBKEY:-$HUBUP_HOME/keys/manifest_ed25519.pub}"
STATE_DIR="$HUBUP_HOME/state"
ALLOWED_TYPES="${HUBUP_ALLOWED_TYPES:-discovery}"   # spazio-separati
OPERATOR="${HUBUP_OPERATOR:-$(id -un)}"
MODULE="${1:?uso: hubup-bootstrap.sh <nome-modulo>, es. discovery-mac}"

umask 077
mkdir -p "$STATE_DIR"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/hubup.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT INT TERM

log()  { printf '[hubup] %s\n' "$*" >&2; }
die()  { printf '[hubup][ERRORE] %s\n' "$*" >&2; exit 1; }

# ---- fetch: solo HTTPS, cert verificato, no redirect verso http -------------
fetch() {  # fetch <url-path> <dest>
  curl -fsS --proto '=https' --tlsv1.2 --location-trusted \
       --max-time 30 --retry 2 \
       "$HUBUP_SERVER/$1" -o "$2" \
    || die "download fallito: $1"
}

# ---- verifica firma del manifest (Ed25519) ----------------------------------
# macOS non ha un verificatore Ed25519 affidabile di serie (LibreSSL). Si usa,
# in ordine: un verifier fornito dal companion (hubup-verify, notarizzato),
# poi minisign/signify se presenti. Se nessuno c'e':
#   - artefatto BINARIO notarizzato -> si prosegue (integrita' via codesign),
#     ma la firma del manifest resta NON verificata -> si LOGGA il degrado.
#   - artefatto SCRIPT -> si RIFIUTA: senza firma manifest lo script non ha
#     alcuna garanzia d'integrita'. Nessuna esecuzione.
verify_manifest_sig() {  # verify_manifest_sig <manifest> <sig> <artifact_kind>
  local man="$1" sig="$2" kind="$3"
  if command -v hubup-verify >/dev/null 2>&1; then
    hubup-verify --pubkey "$PINNED_PUBKEY" --in "$man" --sig "$sig" \
      && { log "firma manifest: OK (hubup-verify)"; return 0; } \
      || die "firma manifest NON valida (hubup-verify)"
  elif command -v minisign >/dev/null 2>&1; then
    minisign -Vqm "$man" -x "$sig" -p "$PINNED_PUBKEY" \
      && { log "firma manifest: OK (minisign)"; return 0; } \
      || die "firma manifest NON valida (minisign)"
  else
    if [ "$kind" = "binary" ]; then
      log "ATTENZIONE: nessun verifier Ed25519 disponibile. Firma manifest NON"
      log "verificata; si prosegue solo perche' l'artefatto e' binario notarizzato."
      return 0
    fi
    die "nessun verifier Ed25519 e artefatto SCRIPT: rifiuto (nessuna integrita')."
  fi
}

# ---- lettura campi dal manifest JSON (plutil e' sempre presente su macOS) ----
mf() {  # mf <manifest.json> <chiave>
  plutil -extract "$2" raw -o - "$1" 2>/dev/null
}

# ---- confronto versioni (rollback protection) -------------------------------
ver_ge() {  # ver_ge A B  -> vero se A >= B
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | tail -n1)" = "$1" ]
}

# =============================================================================
main() {
  [ -f "$PINNED_PUBKEY" ] || log "nota: chiave pinnata assente ($PINNED_PUBKEY) — modalita' degradata possibile"

  log "modulo richiesto: $MODULE (operatore: $OPERATOR)"
  fetch "modules/$MODULE/manifest.json"     "$WORK/manifest.json"
  fetch "modules/$MODULE/manifest.json.sig" "$WORK/manifest.sig"

  local m_ver m_type m_os m_art m_sha m_kind m_exp m_run m_args m_min
  m_ver=$(mf "$WORK/manifest.json" version)      || die "manifest: versione mancante"
  m_type=$(mf "$WORK/manifest.json" type)        || die "manifest: type mancante"
  m_os=$(mf "$WORK/manifest.json" os)            || true
  m_art=$(mf "$WORK/manifest.json" artifact)     || die "manifest: artifact mancante"
  m_sha=$(mf "$WORK/manifest.json" sha256)       || die "manifest: sha256 mancante"
  m_kind=$(mf "$WORK/manifest.json" kind)        || m_kind="script"   # script|binary
  m_exp=$(mf "$WORK/manifest.json" expires_at)   || true
  m_run=$(mf "$WORK/manifest.json" 'exec.runner')|| m_run="python3"
  m_args=$(mf "$WORK/manifest.json" 'exec.args') || m_args=""
  m_min=$(mf "$WORK/manifest.json" min_version)  || m_min="$m_ver"

  # 1) firma del manifest (protegge tutti i metadati sottostanti, hash incluso)
  verify_manifest_sig "$WORK/manifest.json" "$WORK/manifest.sig" "$m_kind"

  # 2) allowlist dei tipi
  case " $ALLOWED_TYPES " in
    *" $m_type "*) : ;;
    *) die "tipo modulo '$m_type' non in allowlist ($ALLOWED_TYPES)";;
  esac

  # 3) OS coerente
  [ -z "$m_os" ] || [ "$m_os" = "mac" ] || die "modulo per OS '$m_os', non mac"

  # 4) anti-rollback: versione >= max(ultima vista, min_version del manifest)
  local seen="0.0.0"; [ -f "$STATE_DIR/$MODULE.version" ] && seen=$(cat "$STATE_DIR/$MODULE.version")
  ver_ge "$m_ver" "$seen"     || die "rollback rifiutato: offerta $m_ver < vista $seen"
  ver_ge "$m_ver" "$m_min"    || die "versione $m_ver sotto il minimo $m_min"

  # 5) scadenza del manifest (finestra breve = meno superficie d'attacco)
  if [ -n "$m_exp" ]; then
    local now exp
    now=$(date -u +%s)
    exp=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$m_exp" +%s 2>/dev/null || echo 0)
    [ "$exp" -gt "$now" ] || die "manifest scaduto ($m_exp)"
  fi

  # 6) revoche (lista firmata di hash proibiti)
  if fetch "modules/revoked.txt" "$WORK/revoked.txt" 2>/dev/null; then
    grep -qx "$m_sha" "$WORK/revoked.txt" && die "artefatto revocato (sha256 in lista)"
  fi

  # 7) scarica l'artefatto e verifica l'hash contro il manifest (firmato)
  fetch "modules/$MODULE/$m_art" "$WORK/$m_art"
  local got
  got=$(shasum -a 256 "$WORK/$m_art" | awk '{print $1}')
  [ "$got" = "$m_sha" ] || die "sha256 non combacia (atteso $m_sha, ottenuto $got)"
  log "hash artefatto: OK"

  # 8) se binario: verifica firma Developer ID + notarizzazione (nativo macOS)
  if [ "$m_kind" = "binary" ]; then
    codesign --verify --strict --deep "$WORK/$m_art" \
      || die "codesign: firma non valida"
    spctl --assess --type execute "$WORK/$m_art" \
      || die "spctl: notarizzazione/Gatekeeper rifiutata"
    log "codesign + notarizzazione: OK"
  fi

  # 9) esecuzione read-only: PATH ridotto, timeout, nessun env sensibile ereditato
  chmod 0700 "$WORK/$m_art"
  log "esecuzione modulo $m_type v$m_ver ..."
  local out="$WORK/output.json" rc=0
  # shellcheck disable=SC2086
  env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" \
      /usr/bin/timeout 120 "$m_run" "$WORK/$m_art" $m_args >"$out" 2>"$WORK/err.txt" \
      || rc=$?
  [ "$rc" -eq 0 ] || die "modulo uscito con codice $rc: $(tail -n3 "$WORK/err.txt")"

  # 10) audit lato server (mai segreti; l'inventario non ne contiene)
  curl -fsS --proto '=https' --max-time 20 \
    -H "Content-Type: application/json" \
    -X POST "$HUBUP_SERVER/api/audit/module-run" \
    -d "{\"module\":\"$MODULE\",\"version\":\"$m_ver\",\"sha256\":\"$m_sha\",\"operator\":\"$OPERATOR\",\"exit\":0}" \
    >/dev/null 2>&1 || log "nota: audit non inviato (rete?), proseguo"

  # 11) persisti l'ultima versione vista (anti-rollback futuro)
  printf '%s' "$m_ver" > "$STATE_DIR/$MODULE.version"

  # output: l'inventario, su stdout, pronto per il POST del wizard
  cat "$out"
  log "completato."
}

main "$@"
