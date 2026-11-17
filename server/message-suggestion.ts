// Classificazione di un messaggio (`POST /api/messages/:id/apply-suggestion`): scrive sul messaggio progetto, task o
// partner con confidenza e motivo. Nessuna AI: la decisione arriva da chi chiama (es. lo Smistatore di Botcave).
// Il collegamento suggerito si conferma o si scarta a mano (`POST /api/messages/:id/suggestion/confirm|reject`).

import { SUGGESTION_FIELDS, SUGGESTION_TABLES, suggestedLink, type SuggestedLink, type SuggestedLinkSource } from "../shared/message-suggestion";

export { SUGGESTION_TABLES };

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

/**
 * Campi del messaggio da aggiornare (come faceva la vecchia analisi interna). Un suggerimento nuovo va confermato
 * di nuovo: la conferma precedente non vale più.
 */
export function suggestionUpdate(s: MessageSuggestion): {
  confidenceScore: string;
  matchingReason: string;
  isManuallyVerified: false;
  projectId?: string;
  taskId?: string;
  partnerId?: string;
} {
  const base = { confidenceScore: s.confidence.toFixed(2), matchingReason: s.reason, isManuallyVerified: false as const };
  return { ...base, [SUGGESTION_FIELDS[s.type]]: s.id };
}

export type SuggestionRef = { type: MessageSuggestion["type"]; id: string };

/** Il suggerimento che il client ha visto e vuole confermare o scartare ({ type, id }), oppure null. */
export function parseSuggestionRef(value: unknown): SuggestionRef | null {
  if (!value || typeof value !== "object") return null;
  const { type, id } = value as Record<string, unknown>;
  if (typeof type !== "string" || !Object.hasOwn(SUGGESTION_TABLES, type)) return null;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  return { type: type as SuggestionRef["type"], id };
}

export type SuggestionCheck =
  | { ok: true; suggestion: SuggestedLink; table: (typeof SUGGESTION_TABLES)[SuggestionRef["type"]] }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Si può agire sul suggerimento? 400 se il riferimento non è valido, 404 se il messaggio non c'è, 409 se il
 * suggerimento del messaggio non è più quello visto dal client (cambiato da una nuova classificazione o già scartato).
 */
export function checkSuggestion(message: SuggestedLinkSource | null | undefined, ref: SuggestionRef | null): SuggestionCheck {
  if (!ref) return { ok: false, status: 400, error: "riferimento non valido: type (project|task|partner), id" };
  if (!message) return { ok: false, status: 404, error: "messaggio non trovato" };
  const suggestion = suggestedLink(message);
  if (!suggestion || suggestion.type !== ref.type || suggestion.id !== ref.id) {
    return { ok: false, status: 409, error: "il collegamento suggerito è cambiato o non c'è più: ricarica il messaggio" };
  }
  return { ok: true, suggestion, table: SUGGESTION_TABLES[ref.type] };
}

/** Campi da scrivere sul messaggio quando il suggerimento viene scartato: via oggetto, confidenza e motivo. */
export function rejectUpdate(type: SuggestionRef["type"]): Record<string, null | false> {
  return { [SUGGESTION_FIELDS[type]]: null, confidenceScore: null, matchingReason: null, isManuallyVerified: false };
}

/** Il collegamento del messaggio già esistente verso l'oggetto, se c'è (la conferma non lo duplica). */
export function findLinkTo<L extends { linkedTableName: string; linkedRecordId: string }>(links: L[], table: string, id: string): L | null {
  return links.find((l) => l.linkedTableName === table && l.linkedRecordId === id) ?? null;
}
