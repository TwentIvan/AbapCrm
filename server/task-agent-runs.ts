// Registro dell'esito delle esecuzioni di agenti esterni sul task (`POST /api/tasks/:id/agent-runs`), ad es. una
// squadra di Botcave che ha lavorato al task: chi è l'agente, come è andata, il dettaglio e i collegamenti al
// risultato (PR, branch, trasporti). Nessuna AI interna: chi esegue manda l'esito già pronto.
// Con `externalRunId` la registrazione è idempotente: la stessa esecuzione si aggiorna (es. da running a done).

export const RUN_STATUSES = ["running", "done", "blocked", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const isFinal = (s: string) => s !== "running";

const AGENT = /^[A-Za-z0-9_.:/-]{1,100}$/;
const RUN_ID = /^[A-Za-z0-9_.:/#-]{1,200}$/;
const MAX_OUTCOME = 300;
const MAX_DETAIL = 20_000;
const MAX_LINKS = 20;
const MAX_LABEL = 100;
const MAX_URL = 500;

export type RunLink = { url: string; label?: string };
export type AgentRunInput = {
  agent: string;
  externalRunId?: string;
  status: RunStatus;
  outcome?: string;
  detail?: string;
  links: RunLink[];
  startedAt?: Date;
  finishedAt?: Date;
};
export type ParseRunResult = { ok: true; value: AgentRunInput } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Corpo `{ agent, status, outcome?, detail?, externalRunId?, links?, startedAt?, finishedAt? }` validato.
 * `outcome` è obbligatorio per gli stati finali (done, blocked, failed).
 */
export function parseAgentRun(body: unknown): ParseRunResult {
  if (!isObject(body)) return { ok: false, error: "corpo non valido: { agent, status, outcome?, detail?, ... }" };
  const { agent, externalRunId, status, outcome, detail, links, startedAt, finishedAt } = body;

  if (typeof agent !== "string" || !AGENT.test(agent.trim())) {
    return { ok: false, error: "agent obbligatorio (1..100 caratteri: lettere, cifre, . _ : / -)" };
  }
  if (typeof status !== "string" || !RUN_STATUSES.includes(status as RunStatus)) {
    return { ok: false, error: `status deve essere uno fra ${RUN_STATUSES.join(", ")}` };
  }
  const value: AgentRunInput = { agent: agent.trim(), status: status as RunStatus, links: [] };

  if (!absent(externalRunId)) {
    const id = typeof externalRunId === "number" && Number.isInteger(externalRunId) ? String(externalRunId) : externalRunId;
    if (typeof id !== "string" || !RUN_ID.test(id.trim())) {
      return { ok: false, error: "externalRunId non valido (1..200 caratteri: lettere, cifre, . _ : / # -)" };
    }
    value.externalRunId = id.trim();
  }

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

  if (!absent(links)) {
    if (!Array.isArray(links)) return { ok: false, error: "links deve essere un array di { url, label? }" };
    if (links.length > MAX_LINKS) return { ok: false, error: `links: al massimo ${MAX_LINKS}` };
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
      value.links.push(link);
    }
  }

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

/** Valori da scrivere per l'esecuzione: un esito finale senza `finishedAt` si chiude adesso. */
export function runValues(run: AgentRunInput, now: Date) {
  return {
    agent: run.agent,
    status: run.status,
    outcome: run.outcome ?? null,
    detail: run.detail ?? null,
    links: run.links,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    finishedAt: isFinal(run.status) ? run.finishedAt ?? now : null,
  };
}

type StoredRun = { id: string; status: string } & Record<string, unknown>;

export interface AgentRunDeps {
  /** Organizzazione del task, `null` se non esiste. */
  taskOrg(taskId: string): Promise<string | null>;
  findByExternalId(taskId: string, externalRunId: string): Promise<StoredRun | null>;
  /** Inserisce l'esecuzione; `null` se nel frattempo ne è stata registrata un'altra con lo stesso externalRunId. */
  insert(row: Record<string, unknown>): Promise<StoredRun | null>;
  /** Aggiorna l'esecuzione solo se è ancora `running` o se il nuovo stato è finale; `null` altrimenti. */
  update(id: string, values: Record<string, unknown>): Promise<StoredRun | null>;
  now?: () => Date;
}

export type RecordRunResult =
  | { status: 200 | 201; body: StoredRun }
  | { status: 404 | 409; body: { error: string } };

const REOPEN = "l'esecuzione è già conclusa: non può tornare running";

/**
 * Registra (o aggiorna, con lo stesso `externalRunId`) l'esecuzione di un agente esterno sul task, se il task sta
 * nel perimetro della richiesta. L'esecuzione va nell'organizzazione del task.
 */
export async function recordAgentRun(
  deps: AgentRunDeps,
  input: { taskId: string; userId: string; organizationIds: string[]; run: AgentRunInput },
): Promise<RecordRunResult> {
  const org = UUID.test(input.taskId) ? await deps.taskOrg(input.taskId) : null;
  if (!org || !input.organizationIds.includes(org)) return { status: 404, body: { error: "task non trovato" } };

  const now = (deps.now ?? (() => new Date()))();
  const values = runValues(input.run, now);
  const { externalRunId } = input.run;

  if (externalRunId) {
    const existing = await deps.findByExternalId(input.taskId, externalRunId);
    if (existing) {
      if (isFinal(existing.status) && !isFinal(input.run.status)) return { status: 409, body: { error: REOPEN } };
      const updated = await deps.update(existing.id, { ...values, updatedAt: now });
      return updated ? { status: 200, body: updated } : { status: 409, body: { error: REOPEN } };
    }
  }

  const inserted = await deps.insert({
    ...values,
    taskId: input.taskId,
    organizationId: org,
    userId: input.userId,
    externalRunId: externalRunId ?? null,
    startedAt: input.run.startedAt ?? (isFinal(input.run.status) ? null : now),
    createdAt: now,
    updatedAt: now,
  });
  if (!inserted) return { status: 409, body: { error: "esecuzione registrata in contemporanea: riprova" } };
  return { status: 201, body: inserted };
}

/** Elenco delle esecuzioni del task, dalla più recente, se il task sta nel perimetro della richiesta. */
export async function listAgentRuns(
  deps: Pick<AgentRunDeps, "taskOrg"> & { list(taskId: string): Promise<StoredRun[]> },
  input: { taskId: string; organizationIds: string[] },
): Promise<{ status: 200; body: StoredRun[] } | { status: 404; body: { error: string } }> {
  const org = UUID.test(input.taskId) ? await deps.taskOrg(input.taskId) : null;
  if (!org || !input.organizationIds.includes(org)) return { status: 404, body: { error: "task non trovato" } };
  return { status: 200, body: await deps.list(input.taskId) };
}
