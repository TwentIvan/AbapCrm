// Collegamento suggerito di un messaggio (scritto da `POST /api/messages/:id/apply-suggestion`, es. dallo Smistatore
// di Botcave): progetto, task o partner con confidenza e motivo, da confermare o scartare a mano nella pagina Messaggi.
// Logica pura condivisa da server e client.

export const SUGGESTION_TABLES = { project: "projects", task: "tasks", partner: "partners" } as const;
export type SuggestionType = keyof typeof SUGGESTION_TABLES;

export const SUGGESTION_FIELDS = { project: "projectId", task: "taskId", partner: "partnerId" } as const;

export interface SuggestedLinkSource {
  projectId?: string | null;
  taskId?: string | null;
  partnerId?: string | null;
  confidenceScore?: string | number | null;
  matchingReason?: string | null;
  isManuallyVerified?: boolean | null;
}

export interface SuggestedLink {
  type: SuggestionType;
  id: string;
  confidence: number | null;
  reason: string | null;
  confirmed: boolean;
}

// Il più specifico prima: un task dice più di un progetto, un progetto più di un partner.
const PRIORITY: SuggestionType[] = ["task", "project", "partner"];

/**
 * Il collegamento suggerito del messaggio, oppure null. C'è un suggerimento solo se il messaggio ha un oggetto
 * collegato e una classificazione (confidenza o motivo): un oggetto scelto a mano senza classificazione non è un
 * suggerimento. `confirmed` dice se l'utente l'ha già confermato.
 */
export function suggestedLink(m: SuggestedLinkSource | null | undefined): SuggestedLink | null {
  if (!m) return null;
  const hasConfidence = m.confidenceScore !== null && m.confidenceScore !== undefined && m.confidenceScore !== "";
  const hasReason = typeof m.matchingReason === "string" && m.matchingReason.trim() !== "";
  if (!hasConfidence && !hasReason) return null;
  const type = PRIORITY.find((t) => !!m[SUGGESTION_FIELDS[t]]);
  if (!type) return null;
  const confidence = hasConfidence ? Number(m.confidenceScore) : null;
  return {
    type,
    id: m[SUGGESTION_FIELDS[type]] as string,
    confidence: confidence !== null && Number.isFinite(confidence) ? confidence : null,
    reason: hasReason ? m.matchingReason!.trim() : null,
    confirmed: m.isManuallyVerified === true,
  };
}
