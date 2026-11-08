import { messages } from "../shared/schema";

/**
 * Lista leggera dei messaggi (`GET /api/messages?summary=true`): solo i campi per riconoscere un messaggio nuovo
 * (es. l'innesco di sorveglianza di Botcave). Il contenuto completo si legge con `GET /api/messages/:id`.
 * Senza il parametro la risposta resta quella di sempre (righe complete).
 */
export const MESSAGE_SUMMARY_FIELDS = [
  "id",
  "organizationId",
  "type",
  "sourceType",
  "status",
  "fromEmail",
  "fromName",
  "toEmail",
  "subject",
  "threadId",
  "receivedAt",
] as const;

export const messageSummaryColumns = Object.fromEntries(
  MESSAGE_SUMMARY_FIELDS.map((field) => [field, messages[field]]),
) as { [K in (typeof MESSAGE_SUMMARY_FIELDS)[number]]: (typeof messages)[K] };

export function isSummaryRequest(query: Record<string, unknown>): boolean {
  return query.summary === "true" || query.summary === "1";
}
