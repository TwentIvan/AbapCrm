// Classificazione di un messaggio (`POST /api/messages/:id/apply-suggestion`): scrive sul messaggio progetto, task o
// partner con confidenza e motivo. Nessuna AI: la decisione arriva da chi chiama (es. lo Smistatore di Botcave).

export const SUGGESTION_TABLES = { project: "projects", task: "tasks", partner: "partners" } as const;

export type MessageSuggestion = {
  type: keyof typeof SUGGESTION_TABLES;
  id: string;
  confidence: number;
  reason: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON = 1000;

/** La proposta valida, oppure null: tipo ammesso, id UUID, confidenza tra 0 e 1, motivo non vuoto ≤ 1000 caratteri. */
export function parseSuggestion(value: unknown): MessageSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const { type, id, confidence, reason } = value as Record<string, unknown>;
  if (typeof type !== "string" || !Object.hasOwn(SUGGESTION_TABLES, type)) return null;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > MAX_REASON) return null;
  return { type: type as MessageSuggestion["type"], id, confidence, reason: reason.trim() };
}

/** Campi del messaggio da aggiornare (come faceva la vecchia analisi interna). */
export function suggestionUpdate(s: MessageSuggestion): {
  confidenceScore: string;
  matchingReason: string;
  projectId?: string;
  taskId?: string;
  partnerId?: string;
} {
  const base = { confidenceScore: s.confidence.toFixed(2), matchingReason: s.reason };
  if (s.type === "project") return { ...base, projectId: s.id };
  if (s.type === "task") return { ...base, taskId: s.id };
  return { ...base, partnerId: s.id };
}
