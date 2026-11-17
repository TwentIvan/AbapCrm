import { apiRequest } from "@/lib/queryClient";
import { openBotcavePanel, setBotcaveContext } from "@/lib/botcave";

// Obblighi dichiarativi automatizzati dalla squadra Botcave: si legge la readiness del pacchetto
// (GET /api/obligations/:id/automation) e, se l'obbligo è da adempiere, si apre il pannello Botcave con l'obbligo come
// contesto. L'adempimento vero lo fa la squadra; l'esito finisce nel registro (POST /api/obligations/:id/runs) e un
// esito done fa avanzare la prossima scadenza.

export const obligationBlockerLabels: Record<string, string> = {
  obligation_inactive: "l'obbligo non è attivo",
  no_due_date: "l'obbligo non ha una prossima scadenza",
  already_done: "la scadenza in corso è già stata adempiuta",
  run_in_progress: "c'è già un'esecuzione in corso per questa scadenza",
};

export const frequencyLabels: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
  semiannual: "Semestrale",
  yearly: "Annuale",
  once: "Una tantum",
  other: "Altro",
};

export const runStatusLabels: Record<string, string> = {
  running: "In corso",
  done: "Fatto",
  blocked: "Bloccato",
  failed: "Fallito",
};

export type DueObligation = {
  obligation: {
    id: string;
    code: string;
    name: string;
    authority: string | null;
    frequency: string;
    dueRule: string | null;
    nextDueDate: string | null;
  };
  dueDate: string | null;
  daysToDue: number | null;
  overdue: boolean;
  lastRun: { id: string; status: string; outcome: string | null; period: string; protocol: string | null } | null;
  readiness: { ready: boolean; blockers: string[] };
};

export type ObligationAutomationOutcome =
  | { kind: "opened" }
  | { kind: "blocked"; reasons: string[] }
  | { kind: "no-panel" }
  | { kind: "error"; message: string };

export async function startObligationWithBotcave(obligation: {
  id: string;
  code: string;
  name: string;
}): Promise<ObligationAutomationOutcome> {
  let readiness: { ready: boolean; blockers: string[] };
  let dueDate: string | null;
  try {
    const res = await apiRequest("GET", `/api/obligations/${obligation.id}/automation`);
    const body = await res.json();
    readiness = body.readiness;
    dueDate = body.dueDate;
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (!readiness.ready) {
    return { kind: "blocked", reasons: readiness.blockers.map((b) => obligationBlockerLabels[b] ?? b) };
  }
  const title = `${obligation.code} · ${obligation.name}${dueDate ? ` · scadenza ${dueDate}` : ""}`;
  setBotcaveContext({ page: "obligation", id: obligation.id, title });
  return openBotcavePanel("alfred") ? { kind: "opened" } : { kind: "no-panel" };
}
