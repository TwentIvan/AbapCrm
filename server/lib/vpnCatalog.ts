// ── Catalogo VPN unificato sul probe Hub Up (Modulo F) ──────────────────────
// Unica sorgente di verità per il "software VPN": i metodi rilevati dal probe
// (discovered_connection_methods) mappati in nome/vendor leggibili. NON esiste
// più un catalogo statico hand-maintained: la lista è sempre ciò che il probe
// trova (con fallback al module runner ghost quando manca un inventario reale).

import { db } from "../db";
import { discoveredConnectionMethods } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

// methodId (firma probe) -> nome/vendor per l'UI.
export const VPN_METHOD_CATALOG: Record<string, { name: string; vendor: string }> = {
  sonicwall_cse: { name: "SonicWall Cloud Secure Edge", vendor: "SonicWall" },
  sonicwall_netextender: { name: "SonicWall NetExtender", vendor: "SonicWall" },
  sonicwall_mobile_connect: { name: "SonicWall Mobile Connect", vendor: "SonicWall" },
  banyan: { name: "Banyan", vendor: "SonicWall" },
  forticlient: { name: "FortiClient", vendor: "Fortinet" },
  cisco_secure_client: { name: "Cisco Secure Client", vendor: "Cisco" },
  globalprotect: { name: "GlobalProtect", vendor: "Palo Alto Networks" },
  openvpn_connect: { name: "OpenVPN Connect", vendor: "OpenVPN Inc." },
  zscaler: { name: "Zscaler", vendor: "Zscaler" },
  native_vpn: { name: "VPN Nativa del Sistema", vendor: "Sistema" },
};

// Risolve nome/vendor da un methodId, con fallback leggibile per id sconosciuti
// (es. client rilevati genericamente dal probe: "cloudflare_warp" -> "Cloudflare Warp").
export function resolveVpnMethod(methodId?: string | null): { name: string; vendor: string } {
  if (!methodId) return { name: "—", vendor: "" };
  if (VPN_METHOD_CATALOG[methodId]) return VPN_METHOD_CATALOG[methodId];
  const name = String(methodId)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { name, vendor: "" };
}

// Livello di automazione derivato dal vendor (coerente con la vecchia logica).
export function automationForVendor(vendor: string): { canReadConfigs: boolean; automationType: "full" | "credentials" | "manual" } {
  switch ((vendor || "").toLowerCase()) {
    case "cisco":
    case "fortinet":
    case "palo alto networks":
      return { canReadConfigs: true, automationType: "full" };
    case "microsoft":
      return { canReadConfigs: false, automationType: "credentials" };
    default:
      return { canReadConfigs: false, automationType: "manual" };
  }
}

export interface DiscoveredVpnSoftware {
  id: string;            // methodId del probe (es. "sonicwall_cse")
  name: string;
  vendor: string;
  version?: string;
  role?: string;
  installed: boolean;
  configured: boolean;
  connected: boolean;
  canReadConfigs: boolean;
  automationType: "full" | "credentials" | "manual";
  profiles: string[];   // profili/connessioni rilevati dal probe
}

// Lista del software VPN rilevato per un utente: metodi reali del probe se
// presenti, altrimenti fixture ghost (che rispecchia il probe, CSE incluso).
// Solo VPN installate/connesse, deduplicate per methodId.
export async function getDiscoveredVpnSoftware(userId: string): Promise<DiscoveredVpnSoftware[]> {
  let methods: any[] = [];
  const storedRows = await db.select().from(discoveredConnectionMethods)
    .where(eq(discoveredConnectionMethods.userId, userId))
    .orderBy(desc(discoveredConnectionMethods.lastProbedAt));

  if (storedRows.length > 0) {
    methods = storedRows.map((r: any) => ({
      id: r.methodId, kind: r.kind, role: r.role,
      installed: r.installed, configured: r.configured, connected: r.connected,
      version: r.version || undefined,
      profiles: Array.isArray(r.profiles) ? r.profiles : [],
    }));
  } else {
    const { getModuleRunner } = await import("./moduleRunner");
    const result = await getModuleRunner().run<any>("discovery-mac");
    methods = Array.isArray(result?.data?.methods) ? result.data.methods : [];
  }

  const seen = new Set<string>();
  return methods
    .filter((m: any) => m?.kind === "vpn" && m?.id && (m.installed || m.connected))
    .filter((m: any) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .map((m: any) => {
      const meta = resolveVpnMethod(m.id);
      const auto = automationForVendor(meta.vendor);
      return {
        id: m.id,
        name: meta.name,
        vendor: meta.vendor,
        version: m.version || undefined,
        role: m.role || undefined,
        installed: !!m.installed,
        configured: !!m.configured,
        connected: !!m.connected,
        profiles: Array.isArray(m.profiles) ? m.profiles : [],
        ...auto,
      };
    });
}
