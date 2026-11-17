import { and, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import { messageLinks, messages } from "../shared/schema";

/**
 * Lista leggera dei messaggi (`GET /api/messages?summary=true`): solo i campi per riconoscere un messaggio nuovo
 * (es. l'innesco di sorveglianza di Botcave). Il contenuto completo si legge con `GET /api/messages/:id`.
 * Senza il parametro la risposta resta quella di sempre (righe complete).
 * I campi della classificazione (progetto, task, partner, confidenza) dicono allo Smistatore di Botcave se il
 * messaggio è già stato smistato.
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
  "projectId",
  "taskId",
  "partnerId",
  "confidenceScore",
] as const;

export const messageSummaryColumns = Object.fromEntries(
  MESSAGE_SUMMARY_FIELDS.map((field) => [field, messages[field]]),
) as { [K in (typeof MESSAGE_SUMMARY_FIELDS)[number]]: (typeof messages)[K] };

export function isSummaryRequest(query: Record<string, unknown>): boolean {
  return query.summary === "true" || query.summary === "1";
}

/** Filtri dello smistamento sulla lista dei messaggi. */
export type MessageListFilters = {
  /** Solo i messaggi da smistare: senza progetto, task o partner e senza collegamenti. */
  toTriage: boolean;
  /** Solo i messaggi ricevuti dopo questo istante (escluso). */
  since?: Date;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Legge `toTriage` (true|1) e `since` (data ISO 8601) dalla query. Assenti → nessun filtro (comportamento di prima).
 * Un valore non valido dà un errore, così chi chiama non riceve per sbaglio l'elenco intero.
 */
export function parseMessageListFilters(
  query: Record<string, unknown>,
): { ok: true; filters: MessageListFilters } | { ok: false; error: string } {
  const { toTriage, since } = query;
  let triage = false;
  if (toTriage !== undefined) {
    if (toTriage === "true" || toTriage === "1") triage = true;
    else if (toTriage === "false" || toTriage === "0") triage = false;
    else return { ok: false, error: "toTriage non valido: true|false" };
  }
  const filters: MessageListFilters = { toTriage: triage };
  if (since !== undefined) {
    if (typeof since !== "string" || !ISO_DATE.test(since)) {
      return { ok: false, error: "since non valido: data ISO 8601 (es. 2026-11-17T10:00:00Z)" };
    }
    const date = new Date(since);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: "since non valido: data ISO 8601 (es. 2026-11-17T10:00:00Z)" };
    }
    filters.since = date;
  }
  return { ok: true, filters };
}

/** Condizioni SQL dei filtri, da mettere in AND con il perimetro di utente e organizzazioni. */
export function messageListConditions(filters: MessageListFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.toTriage) {
    conditions.push(
      and(
        isNull(messages.projectId),
        isNull(messages.taskId),
        isNull(messages.partnerId),
        sql`not exists (select 1 from ${messageLinks} where ${eq(messageLinks.messageId, messages.id)})`,
      )!,
    );
  }
  if (filters.since) conditions.push(gt(messages.receivedAt, filters.since));
  return conditions;
}
