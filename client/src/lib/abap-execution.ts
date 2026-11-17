import { apiRequest } from "@/lib/queryClient";
import { openBotcavePanel, setBotcaveContext } from "@/lib/botcave";

// Esecuzione di un task ABAP con la squadra Botcave sul nodo locale: si legge la readiness del pacchetto
// (GET /api/tasks/:id/abap-execution) e, se il task è eseguibile, si apre il pannello Botcave col task come
// contesto. L'esecuzione vera la fa l'agente sul nodo; l'esito finisce nel registro delle esecuzioni del task.

export const abapBlockerLabels: Record<string, string> = {
  task_completed: "il task è già completato",
  no_sap_system: "nessun sistema SAP per il task (né sul task né come default del partner del progetto)",
  sap_system_inactive: "il sistema SAP è inattivo o in manutenzione",
  sap_system_production: "il sistema SAP è produttivo: lo sviluppo si fa su un sistema di sviluppo",
};

export type AbapExecutionOutcome =
  | { kind: "opened" }
  | { kind: "blocked"; reasons: string[] }
  | { kind: "no-panel" }
  | { kind: "error"; message: string };

export async function startAbapExecutionWithBotcave(task: { id: string; title: string }): Promise<AbapExecutionOutcome> {
  let readiness: { ready: boolean; blockers: string[] };
  try {
    const res = await apiRequest("GET", `/api/tasks/${task.id}/abap-execution`);
    readiness = (await res.json()).readiness;
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (!readiness.ready) {
    return { kind: "blocked", reasons: readiness.blockers.map((b) => abapBlockerLabels[b] ?? b) };
  }
  setBotcaveContext({ page: "task", id: task.id, title: task.title });
  return openBotcavePanel("alfred") ? { kind: "opened" } : { kind: "no-panel" };
}
