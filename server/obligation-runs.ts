// Registro delle esecuzioni di un obbligo dichiarativo (`POST/GET /api/obligations/:id/runs`): ogni volta che
// l'obbligo viene adempiuto per un periodo (es. la LIPE del terzo trimestre), chi lo esegue (una squadra di Botcave o
// una persona) registra com'è andata, il protocollo dell'invio e i collegamenti al risultato. Nessuna AI interna.
// Con `externalRunId` la registrazione è idempotente: la stessa esecuzione si aggiorna (es. da running a done).

import { isDay } from "./organization-obligations";

export const OBLIGATION_RUN_STATUSES = ["running", "done", "blocked", "failed"] as const;
export type ObligationRunStatus = (typeof OBLIGATION_RUN_STATUSES)[number];
export const isFinal = (s: string) => s !== "running";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD = /^[A-Za-z0-9_.:/-]{1,40}$/;
const AGENT = /^[A-Za-z0-9_.:/-]{1,100}$/;
const RUN_ID = /^[A-Za-z0-9_.:/#-]{1,200}$/;
const MAX_OUTCOME = 300;
const MAX_DETAIL = 20_000;
const MAX_PROTOCOL = 100;
const MAX_LINKS = 20;
const MAX_LABEL = 100;
const MAX_URL = 500;

export type RunLink = { url: string; label?: string };
export type ObligationRunInput = {
  /** Periodo adempiuto, es. "2026-10", "2026-Q3", "2026". */
  period: string;
  status: ObligationRunStatus;
  outcome?: string;
  detail?: string;
  agent?: string;
  externalRunId?: string;
  /** Scadenza del periodo (YYYY-MM-DD); se manca vale la prossima scadenza dell'obbligo. */
  dueDate?: string;
  /** Protocollo o ricevuta dell'invio all'ente. */
  protocol?: string;
  links: RunLink[];
  startedAt?: Date;
  finishedAt?: Date;
};
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const absent = (v: unknown) => v === undefined || v === null || v === "";

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLinks(links: unknown): ParseResult<RunLink[]> {
  if (absent(links)) return { ok: true, value: [] };
  if (!Array.isArray(links)) return { ok: false, error: "links deve essere un array di { url, label? }" };
  if (links.length > MAX_LINKS) return { ok: false, error: `links: al massimo ${MAX_LINKS}` };
  const value: RunLink[] = [];
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    const url = typeof l === "string" ? l : isObject(l) ? l.url : undefined;
    if (typeof url !== "string" || url.length > MAX_URL || !isHttpsUrl(url.trim())) {
      return { ok: false, error: `links[${i}]: url https obbligatorio (max ${MAX_URL} caratteri)` };
    }
    const link: RunLink = { url: url.trim() };
    const label = isObject(l) ? l.label : undefined;
    if (!absent(label)) {
      if (typeof label !== "string" || label.length > MAX_LABEL) {
        return { ok: false, error: `links[${i}]: label non valida (max ${MAX_LABEL} caratteri)` };
      }
      if (label.trim()) link.label = label.trim();
    }
    value.push(link);
  }
  return { ok: true, value };
}

/**
 * Corpo `{ period, status, outcome?, detail?, agent?, externalRunId?, dueDate?, protocol?, links?, startedAt?,
 * finishedAt? }` validato. `outcome` è obbligatorio per gli stati finali (done, blocked, failed).
 */
export function parseObligationRun(body: unknown): ParseResult<ObligationRunInput> {
  if (!isObject(body)) return { ok: false, error: "corpo non valido: { period, status, outcome?, detail?, ... }" };
  const { period, status, outcome, detail, agent, externalRunId, dueDate, protocol, links, startedAt, finishedAt } = body;

  if (typeof period !== "string" || !PERIOD.test(period.trim())) {
    return { ok: false, error: "period obbligatorio (1..40 caratteri: lettere, cifre, . _ : / -; es. 2026-Q3)" };
  }
  if (typeof status !== "string" || !OBLIGATION_RUN_STATUSES.includes(status as ObligationRunStatus)) {
    return { ok: false, error: `status deve essere uno fra ${OBLIGATION_RUN_STATUSES.join(", ")}` };
  }
  const value: ObligationRunInput = { period: period.trim(), status: status as ObligationRunStatus, links: [] };

  if (!absent(outcome)) {
    if (typeof outcome !== "string" || outcome.trim() === "" || outcome.length > MAX_OUTCOME) {
      return { ok: false, error: `outcome non valido (testo, max ${MAX_OUTCOME} caratteri)` };
    }
    value.outcome = outcome.trim();
  } else if (isFinal(value.status)) {
    return { ok: false, error: `outcome obbligatorio con status ${value.status}` };
  }

  if (!absent(detail)) {
    if (typeof detail !== "string" || detail.length > MAX_DETAIL) {
      return { ok: false, error: `detail non valido (testo, max ${MAX_DETAIL} caratteri)` };
    }
    if (detail.trim()) value.detail = detail.trim();
  }

  if (!absent(agent)) {
    if (typeof agent !== "string" || !AGENT.test(agent.trim())) {
      return { ok: false, error: "agent non valido (1..100 caratteri: lettere, cifre, . _ : / -)" };
    }
    value.agent = agent.trim();
  }

  if (!absent(externalRunId)) {
    const id = typeof externalRunId === "number" && Number.isInteger(externalRunId) ? String(externalRunId) : externalRunId;
    if (typeof id !== "string" || !RUN_ID.test(id.trim())) {
      return { ok: false, error: "externalRunId non valido (1..200 caratteri: lettere, cifre, . _ : / # -)" };
    }
    value.externalRunId = id.trim();
  }

  if (!absent(dueDate)) {
    if (!isDay(dueDate)) return { ok: false, error: "dueDate non valido (data YYYY-MM-DD)" };
    value.dueDate = dueDate;
  }

  if (!absent(protocol)) {
    if (typeof protocol !== "string" || protocol.trim() === "" || protocol.length > MAX_PROTOCOL) {
      return { ok: false, error: `protocol non valido (testo, max ${MAX_PROTOCOL} caratteri)` };
    }
    value.protocol = protocol.trim();
  }

  const parsedLinks = parseLinks(links);
  if (!parsedLinks.ok) return parsedLinks;
  value.links = parsedLinks.value;

  for (const [key, raw] of [["startedAt", startedAt], ["finishedAt", finishedAt]] as const) {
    if (absent(raw)) continue;
    const d = parseDate(raw);
    if (!d) return { ok: false, error: `${key} non valido (data ISO 8601)` };
    value[key] = d;
  }
  if (value.finishedAt && !isFinal(value.status)) {
    return { ok: false, error: "finishedAt solo con uno stato finale (done, blocked, failed)" };
  }
  if (value.startedAt && value.finishedAt && value.finishedAt < value.startedAt) {
    return { ok: false, error: "finishedAt precede startedAt" };
  }
  return { ok: true, value };
}

export type ObligationRunQuery = { period?: string; status?: ObligationRunStatus };

/** Query string `?period&status` dell'elenco validata. */
export function parseObligationRunQuery(query: unknown): ParseResult<ObligationRunQuery> {
  const q = (query && typeof query === "object" ? query : {}) as Record<string, unknown>;
  const value: ObligationRunQuery = {};
  for (const key of ["period", "status"]) {
    if (Array.isArray(q[key])) return { ok: false, error: `${key} ripetuto: indicane uno solo` };
  }
  if (!absent(q.period)) {
    if (typeof q.period !== "string" || !PERIOD.test(q.period.trim())) return { ok: false, error: "period non valido" };
    value.period = q.period.trim();
  }
  if (!absent(q.status)) {
    if (!OBLIGATION_RUN_STATUSES.includes(q.status as ObligationRunStatus)) {
      return { ok: false, error: `status deve essere uno fra ${OBLIGATION_RUN_STATUSES.join(", ")}` };
    }
    value.status = q.status as ObligationRunStatus;
  }
  return { ok: true, value };
}

/** Valori da scrivere per l'esecuzione: un esito finale senza `finishedAt` si chiude adesso. */
export function runValues(run: ObligationRunInput, now: Date) {
  return {
    period: run.period,
    status: run.status,
    outcome: run.outcome ?? null,
    detail: run.detail ?? null,
    agent: run.agent ?? null,
    protocol: run.protocol ?? null,
    links: run.links,
    ...(run.dueDate ? { dueDate: run.dueDate } : {}),
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    finishedAt: isFinal(run.status) ? run.finishedAt ?? now : null,
  };
}

type StoredRun = { id: string; status: string } & Record<string, unknown>;
type ObligationRef = { organizationId: string; active: boolean; nextDueDate: string | null };

export interface ObligationRunDeps {
  /** Organizzazione, stato e prossima scadenza dell'obbligo; `null` se non esiste. */
  obligation(id: string): Promise<ObligationRef | null>;
  findByExternalId(obligationId: string, externalRunId: string): Promise<StoredRun | null>;
  /** Inserisce l'esecuzione; `null` se nel frattempo ne è stata registrata un'altra con lo stesso externalRunId. */
  insert(row: Record<string, unknown>): Promise<StoredRun | null>;
  /** Aggiorna l'esecuzione solo se è ancora `running` o se il nuovo stato è finale; `null` altrimenti. */
  update(id: string, values: Record<string, unknown>): Promise<StoredRun | null>;
  /** Esecuzioni dell'obbligo che rispettano il filtro, dalla più recente. */
  list(obligationId: string, query: ObligationRunQuery): Promise<StoredRun[]>;
  now?: () => Date;
}

const NOT_FOUND = "obbligo non trovato";
const REOPEN = "l'esecuzione è già conclusa: non può tornare running";
const INACTIVE = "l'obbligo non è attivo: nessuna nuova esecuzione";

async function obligationInScope(deps: Pick<ObligationRunDeps, "obligation">, id: string, organizationIds: string[]) {
  const ref = UUID.test(id) ? await deps.obligation(id) : null;
  const inScope = (org: string) => organizationIds.some((o) => o?.toLowerCase() === org.toLowerCase());
  return ref && inScope(ref.organizationId) ? ref : null;
}

/**
 * Registra (o aggiorna, con lo stesso `externalRunId`) un'esecuzione dell'obbligo, se l'obbligo sta nel perimetro
 * della richiesta (altrimenti 404). L'esecuzione va nell'organizzazione dell'obbligo; un obbligo non attivo non
 * accetta nuove esecuzioni (409) ma quelle già registrate si possono ancora concludere.
 */
export async function recordObligationRun(
  deps: Omit<ObligationRunDeps, "list">,
  input: { obligationId: string; userId: string; organizationIds: string[]; run: ObligationRunInput },
): Promise<{ status: 200 | 201; body: StoredRun } | { status: 404 | 409; body: { error: string } }> {
  const ref = await obligationInScope(deps, input.obligationId, input.organizationIds);
  if (!ref) return { status: 404, body: { error: NOT_FOUND } };

  const now = (deps.now ?? (() => new Date()))();
  const values = runValues(input.run, now);
  const { externalRunId } = input.run;

  if (externalRunId) {
    const existing = await deps.findByExternalId(input.obligationId, externalRunId);
    if (existing) {
      if (isFinal(existing.status) && !isFinal(input.run.status)) return { status: 409, body: { error: REOPEN } };
      const updated = await deps.update(existing.id, { ...values, updatedAt: now });
      return updated ? { status: 200, body: updated } : { status: 409, body: { error: REOPEN } };
    }
  }

  if (!ref.active) return { status: 409, body: { error: INACTIVE } };

  const inserted = await deps.insert({
    ...values,
    obligationId: input.obligationId,
    organizationId: ref.organizationId,
    userId: input.userId,
    externalRunId: externalRunId ?? null,
    dueDate: input.run.dueDate ?? ref.nextDueDate ?? null,
    startedAt: input.run.startedAt ?? (isFinal(input.run.status) ? null : now),
    createdAt: now,
    updatedAt: now,
  });
  if (!inserted) return { status: 409, body: { error: "esecuzione registrata in contemporanea: riprova" } };
  return { status: 201, body: inserted };
}

/** Esecuzioni dell'obbligo, dalla più recente, se l'obbligo sta nel perimetro della richiesta (altrimenti 404). */
export async function listObligationRuns(
  deps: Pick<ObligationRunDeps, "obligation" | "list">,
  input: { obligationId: string; organizationIds: string[]; query: ObligationRunQuery },
): Promise<{ status: 200; body: StoredRun[] } | { status: 404; body: { error: string } }> {
  const ref = await obligationInScope(deps, input.obligationId, input.organizationIds);
  if (!ref) return { status: 404, body: { error: NOT_FOUND } };
  return { status: 200, body: await deps.list(input.obligationId, input.query) };
}
