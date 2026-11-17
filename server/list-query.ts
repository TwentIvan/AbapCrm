/**
 * Paginazione e filtri sugli elenchi (`GET /api/projects`, `/api/tasks`, `/api/partners`, `/api/contacts`,
 * `/api/proposals`).
 *
 * Parametri di query, tutti facoltativi:
 * - filtri di uguaglianza sui campi ammessi dall'elenco (`status=open`, più valori con la virgola `status=open,done`,
 *   `null` per il valore vuoto);
 * - `q`: ricerca testuale senza distinzione di maiuscole nei campi di ricerca dell'elenco;
 * - `updatedSince`: solo le righe aggiornate da quella data (ISO 8601) in poi;
 * - `sort`: campo di ordinamento ammesso, `-campo` per l'ordine decrescente (i valori vuoti vanno in fondo);
 * - `limit` (1–500) e `offset` (≥ 0);
 * - `paginated=true`: la risposta diventa `{ items, total, limit, offset, hasMore }` (limite predefinito 50).
 *
 * Senza `paginated=true` la risposta resta un array (compatibile con i client di prima) e il numero di righe
 * filtrate prima della pagina è nell'intestazione `X-Total-Count`. Senza parametri la risposta è quella di sempre.
 * Un parametro non valido dà 400 `invalid_list_query`; i parametri che l'elenco non gestisce vengono ignorati.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export interface ListSpec {
  /** Campi filtrabili per uguaglianza. */
  filters: readonly string[];
  /** Campi in cui cerca `q`. */
  search: readonly string[];
  /** Campi ordinabili con `sort`. */
  sort: readonly string[];
  /** Campo data usato da `updatedSince`; senza, il parametro non è ammesso. */
  updatedField?: string;
}

export interface ListQuery {
  /** Almeno un parametro di filtro, ricerca, ordinamento o pagina presente. */
  active: boolean;
  paginated: boolean;
  filters: Record<string, (string | null)[]>;
  q: string | null;
  updatedSince: Date | null;
  sort: { field: string; desc: boolean } | null;
  limit: number | null;
  offset: number;
}

export type ParseResult = { ok: true; query: ListQuery } | { ok: false; details: string[] };

export interface ListPage<T> {
  items: T[];
  total: number;
  limit: number | null;
  offset: number;
  hasMore: boolean;
}

function single(value: unknown, name: string, details: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    details.push(`${name}: indicare un solo valore`);
    return undefined;
  }
  return value;
}

function parseInteger(value: string, name: string, min: number, max: number, details: string[]): number | null {
  if (!/^\d+$/.test(value)) {
    details.push(`${name}: deve essere un intero tra ${min} e ${max}`);
    return null;
  }
  const n = Number(value);
  if (n < min || n > max) {
    details.push(`${name}: deve essere un intero tra ${min} e ${max}`);
    return null;
  }
  return n;
}

export function parseListQuery(query: Record<string, unknown>, spec: ListSpec): ParseResult {
  const details: string[] = [];
  let active = false;

  const paginatedRaw = single(query.paginated, "paginated", details);
  let paginated = false;
  if (paginatedRaw !== undefined) {
    if (["true", "1"].includes(paginatedRaw)) paginated = true;
    else if (!["false", "0"].includes(paginatedRaw)) details.push("paginated: true o false");
  }

  const filters: Record<string, (string | null)[]> = {};
  for (const field of spec.filters) {
    const raw = single(query[field], field, details);
    if (raw === undefined) continue;
    const values = raw.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
    if (values.length === 0) {
      details.push(`${field}: valore vuoto`);
      continue;
    }
    filters[field] = values.map((v) => (v === "null" ? null : v));
    active = true;
  }

  const qRaw = single(query.q, "q", details);
  const q = qRaw !== undefined && qRaw.trim() !== "" ? qRaw.trim().toLowerCase() : null;
  if (q !== null) active = true;

  let updatedSince: Date | null = null;
  const sinceRaw = single(query.updatedSince, "updatedSince", details);
  if (sinceRaw !== undefined) {
    const d = new Date(sinceRaw);
    if (!spec.updatedField) details.push("updatedSince: non disponibile su questo elenco");
    else if (Number.isNaN(d.getTime())) details.push("updatedSince: data ISO 8601 non valida");
    else {
      updatedSince = d;
      active = true;
    }
  }

  let sort: ListQuery["sort"] = null;
  const sortRaw = single(query.sort, "sort", details);
  if (sortRaw !== undefined) {
    const desc = sortRaw.startsWith("-");
    const field = desc ? sortRaw.slice(1) : sortRaw;
    if (!(spec.sort as readonly string[]).includes(field)) {
      details.push(`sort: campi ammessi ${spec.sort.join(", ") || "nessuno"}`);
    } else {
      sort = { field, desc };
      active = true;
    }
  }

  let limit: number | null = null;
  const limitRaw = single(query.limit, "limit", details);
  if (limitRaw !== undefined) {
    limit = parseInteger(limitRaw, "limit", 1, MAX_PAGE_SIZE, details);
    active = true;
  }
  let offset = 0;
  const offsetRaw = single(query.offset, "offset", details);
  if (offsetRaw !== undefined) {
    offset = parseInteger(offsetRaw, "offset", 0, Number.MAX_SAFE_INTEGER, details) ?? 0;
    active = true;
  }
  if (paginated) {
    active = true;
    if (limit === null) limit = DEFAULT_PAGE_SIZE;
  }

  if (details.length > 0) return { ok: false, details };
  return { ok: true, query: { active, paginated, filters, q, updatedSince, sort, limit, offset } };
}

function asComparable(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function applyListQuery<T>(rows: T[], query: ListQuery, spec: ListSpec): ListPage<T> {
  let result = rows.filter((row) => {
    const r = row as Record<string, unknown>;
    for (const [field, allowed] of Object.entries(query.filters)) {
      const value = asText(r[field]);
      if (!allowed.includes(value)) return false;
    }
    if (query.q !== null) {
      const hit = spec.search.some((field) => asText(r[field])?.toLowerCase().includes(query.q!));
      if (!hit) return false;
    }
    if (query.updatedSince && spec.updatedField) {
      const v = r[spec.updatedField];
      const d = v instanceof Date ? v : v ? new Date(String(v)) : null;
      if (!d || Number.isNaN(d.getTime()) || d < query.updatedSince) return false;
    }
    return true;
  });

  if (query.sort) {
    const { field, desc } = query.sort;
    result = [...result].sort((a, b) => {
      const va = asComparable((a as Record<string, unknown>)[field]);
      const vb = asComparable((b as Record<string, unknown>)[field]);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "it", { sensitivity: "base", numeric: true });
      return desc ? -cmp : cmp;
    });
  }

  const total = result.length;
  const end = query.limit === null ? undefined : query.offset + query.limit;
  const items = result.slice(query.offset, end);
  return { items, total, limit: query.limit, offset: query.offset, hasMore: query.offset + items.length < total };
}

interface ListResponse {
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

/** Applica la query all'elenco e invia la risposta: array (con `X-Total-Count`) o busta se `paginated=true`. */
export function sendList<T>(res: ListResponse, rows: T[], query: ListQuery, spec: ListSpec): void {
  const page = applyListQuery(rows, query, spec);
  res.setHeader("X-Total-Count", String(page.total));
  if (query.paginated) res.json(page);
  else res.json(page.items);
}

export function invalidListQuery(details: string[]) {
  return { error: "invalid_list_query", details };
}

/** Filtri, ricerca e ordinamenti ammessi per ogni elenco. Mai `userId` (campo interno del proprietario). */
export const LIST_SPECS = {
  projects: {
    filters: ["status", "clientId", "organizationId", "parentProjectId", "sapSystemId", "dealId"],
    search: ["name", "description"],
    sort: ["name", "status", "startDate", "endDate", "createdAt", "updatedAt"],
    updatedField: "updatedAt",
  },
  tasks: {
    filters: ["status", "priority", "taskType", "projectId", "parentTaskId", "milestoneId", "assignedTo", "organizationId", "sapSystemId", "externalSystem", "externalWorkItemId"],
    search: ["title", "description", "externalWorkItemId", "projectName"],
    sort: ["title", "status", "priority", "startDate", "dueDate", "createdAt", "updatedAt"],
    updatedField: "updatedAt",
  },
  partners: {
    filters: ["type", "organizationId", "city", "province", "country"],
    search: ["name", "company", "email", "vatNumber", "fiscalCode", "domain", "city"],
    sort: ["name", "company", "city", "createdAt", "updatedAt"],
    updatedField: "updatedAt",
  },
  contacts: {
    filters: ["partnerId", "organizationId", "company"],
    search: ["name", "email", "company", "position", "phone"],
    sort: ["name", "company", "createdAt", "updatedAt"],
    updatedField: "updatedAt",
  },
  proposals: {
    filters: ["status", "messageId", "modelKey"],
    search: ["decisionSummary"],
    sort: ["status", "createdAt", "updatedAt"],
    updatedField: "updatedAt",
  },
} satisfies Record<string, ListSpec>;
