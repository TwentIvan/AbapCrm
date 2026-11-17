// Obblighi dichiarativi automatizzati dalla squadra Botcave. Tre pezzi, nessuna AI interna:
// - `GET /api/obligations/due`: gli obblighi da adempiere entro N giorni (scaduti compresi) che non hanno ancora
//   un'esecuzione conclusa con successo per la scadenza in corso, con la readiness: è l'agenda della squadra;
// - `GET /api/obligations/:id/automation`: il pacchetto di un obbligo per chi lo esegue (obbligo, scadenza in corso,
//   esecuzioni per quella scadenza, ultime esecuzioni, readiness con i blocchi);
// - dopo un'esecuzione `done` per la scadenza in corso, la prossima scadenza avanza secondo la frequenza (once: nessuna
//   altra scadenza; other: resta da aggiornare a mano), così il giro successivo parte da sé.

import type { ObligationFrequency } from "./organization-obligations";
import { isDay } from "./organization-obligations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_WITHIN_DAYS = 30;
export const MAX_WITHIN_DAYS = 366;
export const RECENT_RUNS = 10;

const MONTHS: Partial<Record<ObligationFrequency, number>> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

const daysInMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

/**
 * Scadenza successiva a `day` (YYYY-MM-DD) secondo la frequenza: monthly +1 mese, quarterly +3, semiannual +6,
 * yearly +12. Il giorno si tiene, ristretto alla lunghezza del mese; una scadenza a fine mese resta a fine mese
 * (30/11 → 28/02 → 31/05). `once` → null (non ce ne sono altre); `other` o data non valida → undefined (non si sa).
 */
export function nextDueDateAfter(day: string, frequency: string): string | null | undefined {
  if (frequency === "once") return null;
  const months = MONTHS[frequency as ObligationFrequency];
  if (!months || !isDay(day)) return undefined;
  const [y, m, d] = day.split("-").map(Number);
  const endOfMonth = d === daysInMonth(y, m - 1);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const max = daysInMonth(ty, tm);
  const td = endOfMonth ? max : Math.min(d, max);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

/** Giorno di oggi (UTC) nel formato YYYY-MM-DD. */
export const today = (now: Date) => now.toISOString().slice(0, 10);

/** Giorni da `from` a `to` (YYYY-MM-DD); negativo se `to` è già passato. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export const OBLIGATION_BLOCKERS = ["obligation_inactive", "no_due_date", "already_done", "run_in_progress"] as const;
export type ObligationBlocker = (typeof OBLIGATION_BLOCKERS)[number];

type Obligation = {
  id: string;
  organizationId: string;
  active: boolean;
  frequency: string;
  nextDueDate: string | null;
} & Record<string, unknown>;
type Run = { id: string; status: string; dueDate: string | null } & Record<string, unknown>;

export type Readiness = { ready: boolean; blockers: ObligationBlocker[] };

/**
 * Readiness dell'obbligo per la scadenza in corso. Blocchi: obbligo non attivo, nessuna prossima scadenza,
 * scadenza già adempiuta (un'esecuzione `done`), esecuzione ancora `running`. `blocked`/`failed` non bloccano:
 * si può riprovare.
 */
export function readiness(obligation: Obligation, runsForDue: Run[]): Readiness {
  const blockers: ObligationBlocker[] = [];
  if (!obligation.active) blockers.push("obligation_inactive");
  if (!obligation.nextDueDate) blockers.push("no_due_date");
  else {
    if (runsForDue.some((r) => r.status === "done")) blockers.push("already_done");
    if (runsForDue.some((r) => r.status === "running")) blockers.push("run_in_progress");
  }
  return { ready: blockers.length === 0, blockers };
}

function timing(dueDate: string | null, now: Date) {
  if (!dueDate) return { dueDate: null, daysToDue: null, overdue: false };
  const daysToDue = daysBetween(today(now), dueDate);
  return { dueDate, daysToDue, overdue: daysToDue < 0 };
}

const inScope = (organizationIds: string[], org: string) =>
  organizationIds.some((o) => o?.toLowerCase() === org.toLowerCase());

export interface AutomationDeps {
  findObligation(id: string): Promise<Obligation | null>;
  /** Esecuzioni dell'obbligo con quella scadenza, dalla più recente. */
  runsForDue(obligationId: string, dueDate: string): Promise<Run[]>;
  /** Ultime `limit` esecuzioni dell'obbligo, dalla più recente. */
  recentRuns(obligationId: string, limit: number): Promise<Run[]>;
  now?: () => Date;
}

/**
 * Pacchetto di un obbligo per chi lo automatizza (una squadra di Botcave): obbligo, scadenza in corso con i giorni che
 * mancano, esecuzioni per quella scadenza, ultime esecuzioni e readiness. 404 fuori dal perimetro della richiesta.
 * L'esito si registra con `POST /api/obligations/:id/runs` (dueDate = scadenza in corso).
 */
export async function obligationAutomation(
  deps: AutomationDeps,
  input: { id: string; organizationIds: string[] },
): Promise<{ status: 200; body: Record<string, unknown> } | { status: 404; body: { error: string } }> {
  const obligation = UUID.test(input.id) ? await deps.findObligation(input.id) : null;
  if (!obligation || !inScope(input.organizationIds, obligation.organizationId)) {
    return { status: 404, body: { error: "obbligo non trovato" } };
  }
  const now = (deps.now ?? (() => new Date()))();
  const due = obligation.nextDueDate;
  const [runsForDue, recentRuns] = await Promise.all([
    due ? deps.runsForDue(obligation.id, due) : Promise.resolve([] as Run[]),
    deps.recentRuns(obligation.id, RECENT_RUNS),
  ]);
  return {
    status: 200,
    body: {
      obligation,
      ...timing(due, now),
      followingDueDate: due ? nextDueDateAfter(due, obligation.frequency) ?? null : null,
      runsForDue,
      recentRuns,
      readiness: readiness(obligation, runsForDue),
    },
  };
}

export type DueQuery = { organizationId?: string; withinDays: number; includeDone: boolean };

/** Query `?withinDays&organizationId&includeDone` dell'agenda validata. */
export function parseDueQuery(query: unknown): { ok: true; value: DueQuery } | { ok: false; error: string } {
  const q = (query && typeof query === "object" ? query : {}) as Record<string, unknown>;
  for (const key of ["withinDays", "organizationId", "includeDone"]) {
    if (Array.isArray(q[key])) return { ok: false, error: `${key} ripetuto: indicane uno solo` };
  }
  const value: DueQuery = { withinDays: DEFAULT_WITHIN_DAYS, includeDone: false };
  if (q.withinDays !== undefined && q.withinDays !== "") {
    const n = Number(q.withinDays);
    if (typeof q.withinDays !== "string" || !/^\d+$/.test(q.withinDays) || n > MAX_WITHIN_DAYS) {
      return { ok: false, error: `withinDays deve essere un intero fra 0 e ${MAX_WITHIN_DAYS}` };
    }
    value.withinDays = n;
  }
  if (q.organizationId !== undefined && q.organizationId !== "") {
    if (typeof q.organizationId !== "string" || !UUID.test(q.organizationId)) {
      return { ok: false, error: "organizationId non valido (uuid)" };
    }
    value.organizationId = q.organizationId.toLowerCase();
  }
  if (q.includeDone !== undefined && q.includeDone !== "") {
    if (q.includeDone !== "true" && q.includeDone !== "false") return { ok: false, error: "includeDone deve essere true o false" };
    value.includeDone = q.includeDone === "true";
  }
  return { ok: true, value };
}

export interface DueDeps {
  /** Obblighi attivi delle organizzazioni con prossima scadenza fino a `dueTo` compreso (scaduti compresi). */
  activeDueBy(organizationIds: string[], dueTo: string): Promise<Obligation[]>;
  /** Esecuzioni degli obblighi indicati, ciascuna con la sua `dueDate`, dalla più recente. */
  runsFor(obligationIds: string[]): Promise<(Run & { obligationId: string })[]>;
  now?: () => Date;
}

/**
 * Agenda della squadra: gli obblighi attivi nel perimetro con la prossima scadenza entro `withinDays` (scaduti
 * compresi), per scadenza; ciascuno con giorni mancanti, ultima esecuzione per quella scadenza e readiness. Senza
 * `includeDone` quelli già adempiuti per la scadenza in corso non compaiono.
 */
export async function dueObligations(
  deps: DueDeps,
  input: { organizationIds: string[]; query: DueQuery },
): Promise<{ status: 200; body: Record<string, unknown>[] } | { status: 404; body: { error: string } }> {
  const scope = input.organizationIds.filter((id) => !!id && UUID.test(id));
  let organizationIds = scope;
  if (input.query.organizationId) {
    if (!inScope(scope, input.query.organizationId)) return { status: 404, body: { error: "organizzazione non trovata" } };
    organizationIds = [input.query.organizationId];
  }
  if (organizationIds.length === 0) return { status: 200, body: [] };

  const now = (deps.now ?? (() => new Date()))();
  const dueTo = new Date(Date.parse(`${today(now)}T00:00:00Z`) + input.query.withinDays * DAY_MS).toISOString().slice(0, 10);
  const obligations = (await deps.activeDueBy(organizationIds, dueTo)).filter((o) => o.nextDueDate && o.nextDueDate <= dueTo);
  if (obligations.length === 0) return { status: 200, body: [] };

  const runs = await deps.runsFor(obligations.map((o) => o.id));
  const items = obligations.map((obligation) => {
    const runsForDue = runs.filter((r) => r.obligationId === obligation.id && r.dueDate === obligation.nextDueDate);
    return {
      obligation,
      ...timing(obligation.nextDueDate, now),
      lastRun: runsForDue[0] ?? null,
      readiness: readiness(obligation, runsForDue),
    };
  });
  const body = input.query.includeDone ? items : items.filter((i) => !i.readiness.blockers.includes("already_done"));
  body.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return { status: 200, body };
}

export interface AdvanceDeps {
  /**
   * Porta la prossima scadenza da `from` a `to` solo se è ancora `from` (aggiornamenti concorrenti: uno solo vince);
   * true se l'ha cambiata.
   */
  advance(obligationId: string, from: string, to: string | null): Promise<boolean>;
}

/**
 * Dopo un'esecuzione registrata: se è `done` per la scadenza in corso dell'obbligo, la prossima scadenza avanza
 * secondo la frequenza. Ritorna la nuova scadenza (null per `once`) o undefined se non è cambiato nulla.
 */
export async function advanceAfterRun(
  deps: AdvanceDeps,
  input: { obligationId: string; frequency: string; nextDueDate: string | null; run: { status: string; dueDate?: string | null } },
): Promise<string | null | undefined> {
  const { run, nextDueDate } = input;
  if (run.status !== "done" || !nextDueDate || run.dueDate !== nextDueDate) return undefined;
  const to = nextDueDateAfter(nextDueDate, input.frequency);
  if (to === undefined) return undefined;
  return (await deps.advance(input.obligationId, nextDueDate, to)) ? to : undefined;
}
