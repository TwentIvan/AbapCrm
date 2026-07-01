// =============================================================================
// The Hub Up — ModuleRunner  (Modulo G, aggancio applicativo)
//
// Astrazione di consegna+esecuzione di un modulo (es. discovery). Due impianti
// interscambiabili DIETRO LA STESSA INTERFACCIA:
//   - GhostModuleRunner    -> OGGI: simulato, nessuna notarizzazione. Etichetta
//                             SEMPRE il risultato come "ghost-unverified".
//   - NotarizedModuleRunner -> DOMANI: invoca hubup-bootstrap.sh, che verifica
//                             codesign+notarizzazione prima di eseguire.
// Si sceglie con un flag (HUBUP_MODULE_MODE). Il resto di The Hub Up non cambia:
// chiama runner.run("discovery-mac") e riceve un ModuleResult tipizzato.
// =============================================================================

import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

// ---- tipi condivisi (allineati al companion del Modulo F) -------------------
export type MethodKind =
  | "vpn" | "vdi" | "hypervisor" | "rdp" | "sap_gui" | "direct" | "unknown";
export type MethodRole = "reachability" | "customer_tunnel" | null;

export interface DiscoveredMethod {
  id: string;
  kind: MethodKind;
  role: MethodRole;
  os: "mac" | "win";
  installed: boolean;
  configured: boolean;
  connected: boolean;
  version?: string;
  profiles: string[];
  evidence?: string[];
}

export interface DiscoveryInventory {
  schema: string;
  os: string;
  hostname: string;
  generated_at: string;
  methods: DiscoveredMethod[];
}

export type Verification = "notarized" | "ghost-unverified";

export interface ModuleResult<T = unknown> {
  module: string;
  verification: Verification;   // impossibile scambiare ghost per produzione
  version: string;
  data: T;
  warnings: string[];
}

export interface ModuleRunner {
  readonly mode: "ghost" | "prod";
  run<T = unknown>(moduleName: string, args?: string[]): Promise<ModuleResult<T>>;
}

// ---- fixture simulata (usata dal Ghost quando non gira il probe reale) -------
// Rappresenta un Mac "tipico" da consulente: SonicWall (reachability) ATTIVA,
// FortiClient (customer_tunnel Telepass) installata ma non connessa, SAP GUI e
// Parallels presenti.
export const SIMULATED_MAC_INVENTORY: DiscoveryInventory = {
  schema: "hubup.discovered_connection_methods/1",
  os: "mac",
  hostname: "mac-consulente.local",
  generated_at: new Date().toISOString(),
  methods: [
    {
      id: "sonicwall_netextender", kind: "vpn", role: "reachability", os: "mac",
      installed: true, configured: true, connected: true, version: "10.3.0",
      profiles: ["Lu-Ve corporate"], evidence: ["app: /Applications/NetExtender.app", "iface: utun up"],
    },
    {
      id: "forticlient", kind: "vpn", role: "customer_tunnel", os: "mac",
      installed: true, configured: true, connected: false, version: "7.4.1",
      profiles: ["Telepass"], evidence: ["app: /Applications/FortiClient.app"],
    },
    {
      id: "parallels", kind: "hypervisor", role: null, os: "mac",
      installed: true, configured: true, connected: false, version: "20.1.0",
      profiles: ["Win11-Telepass"], evidence: ["prlctl: 1 VM"],
    },
    {
      id: "sap_gui_java", kind: "sap_gui", role: null, os: "mac",
      installed: true, configured: false, connected: false,
      profiles: [], evidence: ["app: /Applications/SAP Clients/…"],
    },
  ],
};

// ---- GHOST: simulato, chiaramente non verificato ----------------------------
export class GhostModuleRunner implements ModuleRunner {
  readonly mode = "ghost" as const;

  async run<T = unknown>(moduleName: string, args: string[] = []): Promise<ModuleResult<T>> {
    const warnings = [
      "MODULO GHOST: risultato SIMULATO e NON VERIFICATO. Sostituire con " +
        "NotarizedModuleRunner in produzione (HUBUP_MODULE_MODE=prod).",
    ];

    let data: unknown;
    // opzionale: se richiesto e disponibile, esegui il probe locale reale
    // (dati veri, ma consegna comunque NON verificata -> resta ghost).
    if (process.env.HUBUP_GHOST_USE_LOCAL_PROBE === "1" && moduleName === "discovery-mac") {
      try {
        const probe = process.env.HUBUP_LOCAL_PROBE || "hubup_discover_mac.py";
        const { stdout } = await pexec("python3", [probe, ...args], { timeout: 120_000 });
        data = JSON.parse(stdout);
        warnings.push("probe locale reale eseguito (consegna comunque non verificata).");
      } catch (e) {
        warnings.push("probe locale non disponibile, uso fixture simulata: " + String(e));
        data = SIMULATED_MAC_INVENTORY;
      }
    } else {
      data = SIMULATED_MAC_INVENTORY;
    }

    return {
      module: moduleName,
      verification: "ghost-unverified",
      version: "0.0.0-ghost",
      data: data as T,
      warnings,
    };
  }
}

// ---- NOTARIZED: produzione, delega al bootstrap firmato ---------------------
export class NotarizedModuleRunner implements ModuleRunner {
  readonly mode = "prod" as const;
  constructor(
    private bootstrapPath = process.env.HUBUP_BOOTSTRAP || "./hubup-bootstrap.sh",
    private server = process.env.HUBUP_SERVER || "",
  ) {}

  async run<T = unknown>(moduleName: string, args: string[] = []): Promise<ModuleResult<T>> {
    if (!this.server) {
      throw new Error(
        "NotarizedModuleRunner non configurato: manca HUBUP_SERVER e i moduli " +
        "notarizzati (serve Apple Developer ID). Usa il Ghost finché non è pronto."
      );
    }
    // il bootstrap fa fetch + verifica (codesign/notarizzazione + firma manifest)
    // + esecuzione read-only, e stampa l'inventario JSON su stdout.
    const { stdout } = await pexec(this.bootstrapPath, [moduleName, ...args], {
      timeout: 180_000,
      env: { ...process.env, HUBUP_SERVER: this.server },
    });
    return {
      module: moduleName,
      verification: "notarized",
      version: "from-manifest",     // il bootstrap logga la versione verificata
      data: JSON.parse(stdout) as T,
      warnings: [],
    };
  }
}

// ---- factory: un flag per passare da ghost a prod ---------------------------
export function getModuleRunner(): ModuleRunner {
  const mode = (process.env.HUBUP_MODULE_MODE || "ghost").toLowerCase();
  return mode === "prod" ? new NotarizedModuleRunner() : new GhostModuleRunner();
}
