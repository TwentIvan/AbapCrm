// Lettura degli obblighi dichiarativi dell'organizzazione (`GET /api/obligations`, `GET /api/obligations/:id`):
// le scadenze ricorrenti verso enti esterni (es. LIPE, F24, Intrastat, 770) che l'organizzazione deve rispettare.
// Servono a chi le automatizza (es. una squadra di Botcave): solo lettura, nel perimetro della richiesta.

export const OBLIGATION_FREQUENCIES = ["monthly", "quarterly", "semiannual", "yearly", "once", "other"] as const;
export type ObligationFrequency = (typeof OBLIGATION_FREQUENCIES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ObligationFilter = {
  organizationIds: string[];
  active?: boolean;
  frequency?: ObligationFrequency;
  /** Prossima scadenza dal giorno indicato (YYYY-MM-DD, compreso). */
  dueFrom?: string;
  /** Prossima scadenza fino al giorno indicato (YYYY-MM-DD, compreso). */
  dueTo?: string;
};

export type ObligationQuery = Omit<ObligationFilter, "organizationIds"> & { organizationId?: string };
export type ParseQueryResult = { ok: true; value: ObligationQuery } | { ok: false; error: string };

const absent = (v: unknown) => v === undefined || v === null || v === "";

/** Un giorno di calendario valido nel formato YYYY-MM-DD (niente 2026-02-30). */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Query string `?organizationId&active&frequency&dueFrom&dueTo` validata. */
export function parseObligationQuery(query: unknown): ParseQueryResult {
  const q = (query && typeof query === "object" ? query : {}) as Record<string, unknown>;
  const value: ObligationQuery = {};

  for (const key of ["organizationId", "active", "frequency", "dueFrom", "dueTo"]) {
    if (Array.isArray(q[key])) return { ok: false, error: `${key} ripetuto: indicane uno solo` };
  }

  if (!absent(q.organizationId)) {
    if (typeof q.organizationId !== "string" || !UUID.test(q.organizationId)) {
      return { ok: false, error: "organizationId non valido (uuid)" };
    }
    value.organizationId = q.organizationId.toLowerCase();
  }

  if (!absent(q.active) && q.active !== "all") {
    if (q.active !== "true" && q.active !== "false") return { ok: false, error: "active deve essere true, false o all" };
    value.active = q.active === "true";
  }

  if (!absent(q.frequency)) {
    if (!OBLIGATION_FREQUENCIES.includes(q.frequency as ObligationFrequency)) {
      return { ok: false, error: `frequency deve essere una fra ${OBLIGATION_FREQUENCIES.join(", ")}` };
    }
    value.frequency = q.frequency as ObligationFrequency;
  }

  for (const key of ["dueFrom", "dueTo"] as const) {
    if (absent(q[key])) continue;
    if (!isDay(q[key])) return { ok: false, error: `${key} non valido (data YYYY-MM-DD)` };
    value[key] = q[key] as string;
  }
  if (value.dueFrom && value.dueTo && value.dueTo < value.dueFrom) {
    return { ok: false, error: "dueTo precede dueFrom" };
  }
  return { ok: true, value };
}

type StoredObligation = { id: string; organizationId: string } & Record<string, unknown>;

export interface ObligationDeps {
  /** Obblighi che rispettano il filtro, per prossima scadenza (senza scadenza in fondo) e nome. */
  list(filter: ObligationFilter): Promise<StoredObligation[]>;
  findById(id: string): Promise<StoredObligation | null>;
}

const NOT_FOUND_ORG = "organizzazione non trovata";
const NOT_FOUND = "obbligo non trovato";

/**
 * Obblighi dichiarativi delle organizzazioni nel perimetro della richiesta; con `organizationId` solo quelli di
 * quell'organizzazione, che deve stare nel perimetro (altrimenti 404, come se non esistesse).
 */
export async function listObligations(
  deps: Pick<ObligationDeps, "list">,
  input: { organizationIds: string[]; query: ObligationQuery },
): Promise<{ status: 200; body: StoredObligation[] } | { status: 404; body: { error: string } }> {
  const { organizationId, ...rest } = input.query;
  const scope = input.organizationIds.filter((id) => !!id && UUID.test(id));
  let organizationIds = scope;
  if (organizationId) {
    if (!scope.some((id) => id.toLowerCase() === organizationId)) return { status: 404, body: { error: NOT_FOUND_ORG } };
    organizationIds = [organizationId];
  }
  if (organizationIds.length === 0) return { status: 200, body: [] };
  return { status: 200, body: await deps.list({ ...rest, organizationIds }) };
}

/** Un obbligo dichiarativo, se sta nel perimetro della richiesta (altrimenti 404). */
export async function getObligation(
  deps: Pick<ObligationDeps, "findById">,
  input: { id: string; organizationIds: string[] },
): Promise<{ status: 200; body: StoredObligation } | { status: 404; body: { error: string } }> {
  const row = UUID.test(input.id) ? await deps.findById(input.id) : null;
  const inScope = (org: string) => input.organizationIds.some((id) => id?.toLowerCase() === org.toLowerCase());
  if (!row || !inScope(row.organizationId)) return { status: 404, body: { error: NOT_FOUND } };
  return { status: 200, body: row };
}
