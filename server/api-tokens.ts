import { createHash, randomBytes } from "node:crypto";

/** Prefisso dei token personali di The Hub Up. */
export const TOKEN_PREFIX = "thu_";
/** Durata predefinita di un token, in giorni. */
export const TOKEN_TTL_DAYS = 365;
/** Richieste al minuto consentite per ogni token. */
export const TOKEN_RATE_PER_MIN = 120;

/** Messaggi d'errore fissi delle risposte 401, 403 e 429 legate ai token. */
export const TOKEN_MESSAGES = {
  invalid: "token non valido o scaduto",
  denied: "operazione non disponibile con un token API",
  rate: "Troppe richieste: riprova tra poco",
} as const;

const TOKEN_PATTERN = /^thu_[A-Za-z0-9_-]{43}$/;

/** Hash SHA-256 esadecimale: è l'unica forma in cui il token si conserva. */
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea un token nuovo: `thu_` + 32 byte casuali in base64url. `prefix` sono i primi 8 caratteri dopo `thu_`. */
export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashApiToken(token),
    prefix: token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8),
  };
}

/** Estrae il token da `Authorization: Bearer thu_…`; null se l'header ha un altro formato. */
export function readBearerApiToken(authorization: string | undefined): string | null {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** Percorsi vietati con un token, con qualunque metodo: uguali al prefisso o sotto di esso (prefisso + "/"). */
const DENIED_PREFIXES = [
  // token, accesso e utenti
  "/api/account/api-tokens",
  "/api/login",
  "/api/logout",
  "/api/register",
  "/api/auth",
  "/api/password-reset",
  "/api/verify-email",
  "/api/users",
  "/api/user-organizations",
  "/api/invitations",
  "/api/organization-domains",
  // credenziali
  "/api/sap-system-credentials",
  "/api/system-credentials",
  // VPN e connessioni
  "/api/vpn",
  "/api/vpn-connections",
  "/api/vpn-credentials",
  "/api/vpn-software",
  "/api/vpn-systems",
  "/api/discovered-vpn-software",
  "/api/discovered-vpn-configurations",
  "/api/connection",
  "/api/connection-workflows",
  // posta
  "/api/email",
  "/api/email-accounts",
  // AI e MCP
  "/api/ai",
  "/api/ai-task-executor",
  "/api/executions",
  "/api/mcp/configs",
  "/api/mcp/custom",
  // companion: arruolamento, installer e canali del companion (solo `resolveHubupActor`: jobs/next, jobs/:id/result)
  "/api/hubup/companion",
  "/api/hubup/jobs/next",
  "/api/hubup/discovery/inventory",
];

// In sola lettura restano ammessi; le scritture cambierebbero configurazioni globali (es. comandi stdio del catalogo MCP).
const WRITE_ONLY_DENIED_PREFIXES = ["/api/organizations", "/api/mcp/catalog"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HUBUP_JOB_RESULT_PATTERN = /^\/api\/hubup\/jobs\/[^/]+\/result(\/|$)/;
const SAP_CREDENTIALS_PATTERN = /^\/api\/sap-systems\/[^/]+\/credentials(\/|$)/;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/** Vero se la route non è disponibile con un token API. */
export function isDeniedForToken(method: string, rawPath: string): boolean {
  // Express instrada senza distinguere le maiuscole: il confronto deve fare lo stesso.
  const path = rawPath.toLowerCase();
  if (DENIED_PREFIXES.some((p) => matchesPrefix(path, p))) return true;
  if (SAP_CREDENTIALS_PATTERN.test(path)) return true;
  // Esito dei job del companion: l'attore è risolto da `resolveHubupActor`, che accetta qualunque utente autenticato.
  if (HUBUP_JOB_RESULT_PATTERN.test(path)) return true;
  if (
    WRITE_METHODS.has(method.toUpperCase()) &&
    WRITE_ONLY_DENIED_PREFIXES.some((p) => matchesPrefix(path, p))
  ) {
    return true;
  }
  return false;
}

/** Contatore a finestra fissa per chiave, in memoria: `consume` dà false oltre `limit` richieste per finestra. */
export function createRateCounter(limit: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    consume(key: string, now: number = Date.now()): boolean {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        return limit >= 1;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  };
}
