#!/usr/bin/env python3
"""
The Hub Up — Companion di discovery (macOS)  ·  Modulo F / Fase F1 (Mac-first)

Rileva i metodi di connessione presenti sulla workstation dell'operatore e ne
determina lo stato a TRE LIVELLI:
    installed  -> il software c'e'
    configured -> esiste un profilo utilizzabile (server/portale noto)
    connected  -> il tunnel/adapter e' attivo ADESSO

Emette un inventario JSON adatto al POST verso Hub Up (popola
`discovered_connection_methods`). NON estrae credenziali: solo nomi, versioni,
stati e identificativi di profilo (host del server, dove serve alla prontezza).

Uso:
    python3 hubup_discover_mac.py                # JSON su stdout
    python3 hubup_discover_mac.py --out inv.json # su file
    python3 hubup_discover_mac.py --catalog my_signatures.json  # catalogo custom
    python3 hubup_discover_mac.py --pretty
"""

import argparse
import glob
import json
import os
import plistlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

# --------------------------------------------------------------------------- #
# Helper di sistema (tutti tolleranti: comando assente -> risultato vuoto)
# --------------------------------------------------------------------------- #

def _run(cmd, timeout=8):
    """Esegue un comando e ritorna stdout (str) o '' in caso di errore/assenza."""
    if not cmd or shutil.which(cmd[0]) is None:
        return ""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return out.stdout or ""
    except Exception:
        return ""


def _expand(p):
    return os.path.expanduser(os.path.expandvars(p))


def _path_exists(p):
    return os.path.exists(_expand(p))


def _glob_any(pattern):
    return sorted(glob.glob(_expand(pattern)))


def _pgrep(name):
    """True se gira un processo il cui NOME matcha `name`.

    NB: si usa `pgrep <name>` (match sul nome processo), NON `pgrep -f` che
    matcha l'intera command line e produce falsi positivi (shell padre,
    editor che mostrano il catalogo, la stessa invocazione del companion).
    Si escludono inoltre il proprio PID e il parent.
    """
    out = _run(["pgrep", "-i", name])
    if not out.strip():
        return False
    mine = {str(os.getpid()), str(os.getppid())}
    pids = {p for p in out.split() if p.strip()}
    return bool(pids - mine)


# --------------------------------------------------------------------------- #
# Sonde macOS riutilizzabili
# --------------------------------------------------------------------------- #

_APP_CACHE = None

def _installed_apps():
    """Ritorna {path: version} per le app installate (system_profiler, una passata)."""
    global _APP_CACHE
    if _APP_CACHE is not None:
        return _APP_CACHE
    _APP_CACHE = {}
    raw = _run(["system_profiler", "SPApplicationsDataType", "-json"], timeout=40)
    if raw:
        try:
            data = json.loads(raw)
            for app in data.get("SPApplicationsDataType", []):
                path = app.get("path") or app.get("_name", "")
                _APP_CACHE[path] = app.get("version", "")
        except Exception:
            pass
    return _APP_CACHE


def _app_version(bundle_path):
    """Versione di una .app: prima da system_profiler, poi da Info.plist."""
    apps = _installed_apps()
    if bundle_path in apps and apps[bundle_path]:
        return apps[bundle_path]
    plist = os.path.join(_expand(bundle_path), "Contents", "Info.plist")
    if os.path.exists(plist):
        try:
            with open(plist, "rb") as fh:
                info = plistlib.load(fh)
            return info.get("CFBundleShortVersionString") or info.get("CFBundleVersion", "")
        except Exception:
            pass
    return ""


_SCUTIL_CACHE = None

def _native_vpn_services():
    """VPN native macOS: [{'name':..., 'connected':bool}] da `scutil --nc list`."""
    global _SCUTIL_CACHE
    if _SCUTIL_CACHE is not None:
        return _SCUTIL_CACHE
    _SCUTIL_CACHE = []
    raw = _run(["scutil", "--nc", "list"])
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("Available"):
            continue
        # esempio: "* (Connected)   <UUID> IKEv2   "Nome"  [IKEv2]"
        connected = "(Connected)" in line
        name = ""
        if '"' in line:
            name = line.split('"')[1]
        if name:
            _SCUTIL_CACHE.append({"name": name, "connected": connected})
    return _SCUTIL_CACHE


def _iface_up(pattern):
    """True se esiste un'interfaccia 'up' con utun/ppp/attributo che matcha pattern."""
    raw = _run(["ifconfig"])
    # euristica leggera: cerca blocchi utun*/ppp* con 'inet ' (tunnel attivo)
    blocks = raw.split("\n")
    active = "\n".join(blocks)
    return (pattern in active) or ("utun" in active and "inet " in active and pattern == "utun")


def _parallels_vms():
    """Elenca le VM Parallels via prlctl (se presente)."""
    raw = _run(["prlctl", "list", "--all"])
    vms = []
    for line in raw.splitlines()[1:]:  # salta header
        parts = line.split()
        if len(parts) >= 4:
            status = parts[1]
            name = " ".join(parts[3:])
            vms.append({"name": name, "status": status})
    return vms


# --------------------------------------------------------------------------- #
# Catalogo di firme di default (macOS)  —  overridabile con --catalog
# Schema coerente con connection_method_signatures del Modulo F.
# --------------------------------------------------------------------------- #

DEFAULT_CATALOG = [
    {
        "id": "sonicwall_netextender", "kind": "vpn", "role": "reachability",
        "app": "/Applications/NetExtender.app",
        # NB: il NetExtender moderno usa il Network Extension framework; il nome
        # processo puo' variare per versione. `installed` (app) e' affidabile;
        # `connected` qui e' best-effort (proc + utun) -> la conferma vera la fa
        # tunnel_up_check con reachability verso il SAProuter. Legacy usava pppd.
        "connected_proc": "NetExtender",
        "iface": "utun",
    },
    {
        "id": "sonicwall_mobile_connect", "kind": "vpn", "role": "reachability",
        "app": "/Applications/SonicWall Mobile Connect.app",
        "app_alt": "/Applications/Mobile Connect.app",
        # Mobile Connect usa la VPN nativa macOS: lo stato "connected" reale
        # emerge anche dalla firma `native_vpn` (scutil --nc list).
        "connected_proc": "SonicWall Mobile Connect",
    },
    {
        # SonicWall Cloud Secure Edge (CSE, ex-Banyan): ZTNA identity-based.
        # NON ha un server VPN configurato: accesso via codice di invito + SSO
        # (es. O365). Verificato su Mac reale:
        #   app      = /Applications/SonicWall Cloud Secure Edge.app
        #   config   = ~/Library/Application Support/sonicwallcse  (identita' registrata)
        #   connected= daemon WireGuard "sonicwall-cse-wgs" attivo (tunnel su utun, IP 100.64/10)
        # NB: NON usare iface:"utun" come segnale (troppo lasco su macOS moderno):
        # il daemon -wgs gira solo a tunnel attivo, quindi e' il segnale affidabile.
        "id": "sonicwall_cse", "kind": "vpn", "role": "reachability",
        "app": "/Applications/SonicWall Cloud Secure Edge.app",
        "app_alt": "/Applications/Cloud Secure Edge.app",
        "app_glob": "/Applications/*Secure Edge*.app",
        "profiles_glob": "~/Library/Application Support/sonicwallcse",
        "connected_proc": "sonicwall-cse-wgs",
    },
    {
        "id": "banyan", "kind": "vpn", "role": "reachability",
        "app": "/Applications/Banyan.app",
        "app_alt": "/Applications/Banyan Desktop.app",
        "connected_proc": "Banyan",
        "iface": "utun",
    },
    {
        "id": "forticlient", "kind": "vpn", "role": "customer_tunnel",
        "app": "/Applications/FortiClient.app",
        "connected_proc": "FortiClient",
        "iface": "utun",
    },
    {
        "id": "cisco_secure_client", "kind": "vpn",
        "app": "/Applications/Cisco/Cisco Secure Client.app",
        "app_alt": "/Applications/Cisco/Cisco AnyConnect Secure Mobility Client.app",
        "cli": "/opt/cisco/secureclient/bin/vpn",
        "profiles_glob": "/opt/cisco/secureclient/vpn/profile/*.xml",
        "connected_proc": "vpnagentd",
    },
    {
        "id": "globalprotect", "kind": "vpn",
        "app": "/Applications/GlobalProtect.app",
        "cli": "/usr/local/bin/globalprotect",
        "connected_proc": "PanGPS",
    },
    {
        "id": "openvpn_connect", "kind": "vpn",
        "app": "/Applications/OpenVPN Connect.app",
        "profiles_glob": "~/Library/Application Support/OpenVPN Connect/profiles/*.ovpn",
        "profiles_glob2": "~/*.ovpn",
        "connected_proc": "OpenVPN",
    },
    {
        "id": "zscaler", "kind": "vpn",
        "app": "/Applications/Zscaler/Zscaler.app",
        "connected_proc": "Zscaler",
    },
    {
        "id": "citrix_workspace", "kind": "vdi",
        "app": "/Applications/Citrix Workspace.app",
        "profiles_glob": "~/Library/Application Support/Citrix Receiver/**/*.store",
    },
    {
        "id": "parallels", "kind": "hypervisor",
        "app": "/Applications/Parallels Desktop.app",
        "cli": "prlctl",
    },
    {
        "id": "microsoft_rdp", "kind": "rdp",
        "app": "/Applications/Windows App.app",
        "app_alt": "/Applications/Microsoft Remote Desktop.app",
        "profiles_glob": "~/**/*.rdp",
    },
    {
        "id": "sap_gui_java", "kind": "sap_gui",
        "app_glob": "/Applications/SAP Clients/*/SAPGUI*.app",
        "app_glob2": "/Applications/SAP Clients/*",
    },
    {
        "id": "native_vpn", "kind": "vpn",
        "native_scutil": True,   # gestita via scutil --nc list
    },
]


# --------------------------------------------------------------------------- #
# Valutazione di una firma -> record a tre stati
# --------------------------------------------------------------------------- #

def evaluate(sig):
    rec = {
        "id": sig["id"],
        "kind": sig.get("kind", "unknown"),
        "role": sig.get("role"),   # reachability | customer_tunnel | None
        "os": "mac",
        "installed": False,
        "configured": False,
        "connected": False,
        "version": "",
        "profiles": [],          # identificativi profilo (host/nome), MAI credenziali
        "evidence": [],
        "last_probed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    # --- caso speciale: VPN native via scutil ---
    if sig.get("native_scutil"):
        services = _native_vpn_services()
        if services:
            rec["installed"] = True          # il framework VPN nativo c'e'
            rec["configured"] = True         # esistono servizi configurati
            rec["profiles"] = [s["name"] for s in services]
            rec["connected"] = any(s["connected"] for s in services)
            rec["evidence"].append(f"scutil: {len(services)} servizi VPN nativi")
        return rec

    # --- installed: app bundle o CLI presente ---
    app_paths = []
    for key in ("app", "app_alt"):
        if sig.get(key):
            app_paths.append(sig[key])
    for key in ("app_glob", "app_glob2"):
        if sig.get(key):
            app_paths.extend(_glob_any(sig[key]))

    for ap in app_paths:
        if _path_exists(ap):
            rec["installed"] = True
            rec["evidence"].append(f"app: {ap}")
            v = _app_version(ap)
            if v and not rec["version"]:
                rec["version"] = v
            break

    if not rec["installed"] and sig.get("cli"):
        cli = sig["cli"]
        if _path_exists(cli) or shutil.which(cli):
            rec["installed"] = True
            rec["evidence"].append(f"cli: {cli}")

    # --- configured: profili trovati ---
    for key in ("profiles_glob", "profiles_glob2"):
        if sig.get(key):
            for f in _glob_any(sig[key]):
                rec["configured"] = True
                rec["profiles"].append(os.path.basename(f))
                rec["evidence"].append(f"profile: {f}")

    # Parallels: le "VM" sono i profili
    if sig["id"] == "parallels" and rec["installed"]:
        vms = _parallels_vms()
        if vms:
            rec["configured"] = True
            rec["profiles"] = [v["name"] for v in vms]
            rec["connected"] = any(v["status"].lower() == "running" for v in vms)
            rec["evidence"].append(f"prlctl: {len(vms)} VM")

    # --- connected: processo agent up e/o interfaccia tunnel su ---
    if rec["installed"]:
        proc = sig.get("connected_proc")
        if proc and _pgrep(proc):
            # processo attivo non implica tunnel, ma e' un forte indizio:
            # la conferma "vera" (route verso l'host SAP) la fa tunnel_up_check lato workflow.
            rec["connected"] = True
            rec["evidence"].append(f"proc: {proc} attivo")
        if sig.get("iface") and _iface_up(sig["iface"]):
            rec["connected"] = True
            rec["evidence"].append(f"iface: {sig['iface']} up")

    return rec


def discover(catalog):
    return [evaluate(sig) for sig in catalog]


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(description="Hub Up discovery companion (macOS)")
    ap.add_argument("--catalog", help="JSON con firme custom (sovrascrive il default)")
    ap.add_argument("--out", help="scrivi l'inventario su file invece che stdout")
    ap.add_argument("--pretty", action="store_true", help="JSON indentato")
    args = ap.parse_args()

    catalog = DEFAULT_CATALOG
    if args.catalog:
        try:
            with open(args.catalog) as fh:
                catalog = json.load(fh)
        except Exception as e:
            print(f"errore lettura catalogo: {e}", file=sys.stderr)
            sys.exit(2)

    if sys.platform != "darwin":
        print("ATTENZIONE: non sei su macOS; le sonde mac ritorneranno vuote.",
              file=sys.stderr)

    inventory = {
        "schema": "hubup.discovered_connection_methods/1",
        "os": "mac",
        "hostname": _run(["hostname"]).strip() or os.uname().nodename,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "methods": [m for m in discover(catalog) if m["installed"] or m["configured"]],
    }

    payload = json.dumps(inventory, indent=2 if args.pretty else None, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print(f"inventario scritto in {args.out}  ({len(inventory['methods'])} metodi)")
    else:
        print(payload)


if __name__ == "__main__":
    main()
