// =============================================================================
// The Hub Up — Connection composer (Modulo F/G)
//
// Data una combo delle VPN GIA' presenti a sistema + l'inventario di discovery,
// calcola il PIANO DI PRONTEZZA per un sistema target: quali step servono, in
// che ordine, e lo stato risultante (ready / needs_connection(N) / blocked).
//
// Riusa i tipi di step tipizzati del Modulo E/F. Dimostra la combo
// "reachability (SonicWall) -> SAProuter -> arc1" e l'ottimizzazione:
// se la reachability e' gia' su, cambiare sistema SAProuter-raggiungibile
// NON richiede riconnessione (switch quasi gratis).
// =============================================================================

import type { DiscoveryInventory, DiscoveredMethod } from "./moduleRunner";

// ---- config esistente a sistema (sottoinsieme di vpn_connections) -----------
export interface VpnConnectionRecord {
  id: string;                 // es. "vpn_sonicwall_luve"
  methodId: string;           // combacia con DiscoveredMethod.id
  label: string;              // "Lu-Ve corporate (SonicWall)"
  role: "reachability" | "customer_tunnel";
  autoConnect: boolean;       // credenziali salvabili / SSO -> auto
  savableCreds: boolean;
}

// ---- sistema target -----------------------------------------------------------
export interface TargetSystem {
  id: string;                        // "SVI"
  reachVia: "saprouter" | "vpn_direct" | "portal_shortcut";
  saprouter?: string;                // "/H/3.120.127.253"
  appServer?: string;                // "10.80.27.180"
  instance?: string;                 // "00"
  requiresReachability?: string;     // methodId di una VPN reachability (SonicWall)
  launch: "arc1" | "vsp" | "gui_bridge" | "sap_gui";
}

// ---- step tipizzati (Modulo E/F) --------------------------------------------
export type StepType =
  | "discover_workstation" | "vpn_connect" | "tunnel_up_check"
  | "extract_cookie_from_shortcut" | "launch_process"
  | "eclipse_project_check" | "mcp_health_check" | "manual_confirm";

export interface PlanStep {
  type: StepType;
  actor: "auto" | "human";
  label: string;
  params?: Record<string, unknown>;
  status: "todo" | "satisfied";     // "satisfied" = gia' vero dall'inventario
}

export type Readiness = "ready" | "needs_connection" | "blocked";

export interface ReadinessPlan {
  target: string;
  readiness: Readiness;
  pendingSteps: number;
  steps: PlanStep[];
  notes: string[];
}

function findMethod(inv: DiscoveryInventory, id?: string): DiscoveredMethod | undefined {
  if (!id) return undefined;
  return inv.methods.find((m) => m.id === id);
}

// ---- il cuore: componi il piano ---------------------------------------------
export function composeReadiness(
  target: TargetSystem,
  inventory: DiscoveryInventory,
  existingVpns: VpnConnectionRecord[],
): ReadinessPlan {
  const steps: PlanStep[] = [];
  const notes: string[] = [];

  // step 0: la discovery e' gia' avvenuta (l'inventario e' il suo output)
  steps.push({
    type: "discover_workstation", actor: "auto",
    label: "Inventario workstation", status: "satisfied",
  });

  // step 1: reachability VPN (es. SonicWall), se il target la richiede
  if (target.requiresReachability) {
    const method = findMethod(inventory, target.requiresReachability);
    const vpn = existingVpns.find((v) => v.methodId === target.requiresReachability);

    if (!method || !method.installed) {
      notes.push(
        `La VPN reachability '${target.requiresReachability}' non risulta installata: ` +
        `il sistema ${target.id} non e' raggiungibile finche' non la installi/configuri.`
      );
      steps.push({
        type: "manual_confirm", actor: "human",
        label: `Installa/configura ${target.requiresReachability}`, status: "todo",
      });
      return finalize(target, steps, "blocked", notes);
    }

    if (method.connected) {
      // gia' connessa -> nessuna riconnessione. Ottimizzazione chiave.
      steps.push({
        type: "vpn_connect", actor: "auto",
        label: `${vpn?.label ?? method.id} gia' connessa (reachability)`,
        status: "satisfied",
      });
      notes.push(
        "Reachability gia' attiva: passare ad altri sistemi raggiungibili dallo " +
        "stesso SAProuter NON richiede riconnessione (switch quasi gratuito)."
      );
    } else {
      const auto = (vpn?.autoConnect && vpn?.savableCreds) ?? false;
      steps.push({
        type: "vpn_connect", actor: auto ? "auto" : "human",
        label: `Connetti ${vpn?.label ?? method.id}` + (auto ? " (auto)" : " (login+eventuale MFA)"),
        params: { methodId: method.id, role: "reachability" },
        status: "todo",
      });
    }
  }

  // step 2: raggiungibilita' reale verso il SAProuter + dispatcher
  if (target.reachVia === "saprouter") {
    const dispatcher = target.instance ? `S/32${target.instance}` : "S/3200";
    steps.push({
      type: "tunnel_up_check", actor: "auto",
      label: `Reachability ${target.saprouter} -> ${target.appServer} ${dispatcher}`,
      params: { saprouter: target.saprouter, appServer: target.appServer, dispatcher },
      status: "todo",
    });
  }

  // step 3: prerequisiti di lancio secondo il tipo
  if (target.launch === "arc1") {
    steps.push({
      type: "eclipse_project_check", actor: "auto",
      label: `Eclipse aperto e progetto ABAP ${target.id} connesso`,
      status: "todo",
    });
    steps.push({
      type: "mcp_health_check", actor: "auto",
      label: "Endpoint arc1 localhost:54322 (tools/list)",
      params: { url: "http://127.0.0.1:54322/mcp" },
      status: "todo",
    });
  } else if (target.launch === "vsp" || target.launch === "gui_bridge") {
    steps.push({
      type: "mcp_health_check", actor: "auto",
      label: "Bridge MCP raggiungibile", status: "todo",
    });
  }

  // stato complessivo
  const pending = steps.filter((s) => s.status === "todo").length;
  const readiness: Readiness = pending === 0 ? "ready" : "needs_connection";
  return finalize(target, steps, readiness, notes);
}

function finalize(
  target: TargetSystem, steps: PlanStep[], readiness: Readiness, notes: string[],
): ReadinessPlan {
  return {
    target: target.id,
    readiness,
    pendingSteps: steps.filter((s) => s.status === "todo").length,
    steps,
    notes,
  };
}
