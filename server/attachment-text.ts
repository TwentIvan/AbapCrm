import path from "path";
import * as XLSX from "xlsx";

/** Estensioni da cui si sa estrarre il testo. */
export const EXTRACTABLE_EXTENSIONS = [".xlsx", ".xls", ".csv", ".txt"] as const;

/** Caratteri restituiti se la richiesta non dice altro, e massimo ammesso (la risposta resta sotto 1 MiB). */
export const DEFAULT_MAX_CHARS = 100_000;
export const MAX_MAX_CHARS = 300_000;

export function isExtractable(filename: string): boolean {
  return (EXTRACTABLE_EXTENSIONS as readonly string[]).includes(path.extname(filename).toLowerCase());
}

/**
 * Testo leggibile di un allegato: Excel (un blocco CSV per foglio non vuoto), CSV e TXT in UTF-8.
 * Null se il formato non è supportato o il file non contiene testo.
 */
export function extractAttachmentText(data: Buffer, filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.read(data, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false });
      if (csv.trim()) {
        lines.push(`=== Sheet: ${sheetName} ===`);
        lines.push(csv.trim());
      }
    }
    return lines.length > 0 ? lines.join("\n") : null;
  }

  if (ext === ".csv" || ext === ".txt") {
    return data.toString("utf-8");
  }

  return null;
}

/** `maxChars` della query: intero da 1 a MAX_MAX_CHARS; assente → DEFAULT_MAX_CHARS; altrimenti null (non valido). */
export function parseMaxChars(raw: unknown): number | null {
  if (raw === undefined || raw === "") return DEFAULT_MAX_CHARS;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_MAX_CHARS ? n : null;
}

export interface AttachmentTextDeps {
  /** Messaggio dell'utente (null se non suo o inesistente). */
  getMessage(id: string): Promise<{ id: string; organizationId: string | null; attachments: string[] | null } | null>;
  /** Contenuto del file salvato (null se manca). */
  readAttachment(messageId: string, filename: string): Promise<Buffer | null>;
}

export interface AttachmentTextInput {
  messageId: string;
  filename: string;
  /** Organizzazioni visibili alla richiesta: il messaggio deve stare in una di queste. */
  organizationIds: string[];
  maxChars: unknown;
}

export type AttachmentTextResult =
  | { status: 200; body: { messageId: string; filename: string; text: string; length: number; truncated: boolean } }
  | { status: 400 | 404 | 415 | 422; body: { error: string; supported?: readonly string[] } };

const NOT_FOUND = { status: 404, body: { error: "messaggio o allegato non trovato" } } as const;

/**
 * Testo estratto di un allegato di un messaggio. Il messaggio deve essere dell'utente e di
 * un'organizzazione della richiesta, e l'allegato tra i suoi; altrimenti 404 (senza dire quale manca).
 */
export async function resolveAttachmentText(
  deps: AttachmentTextDeps,
  input: AttachmentTextInput,
): Promise<AttachmentTextResult> {
  const maxChars = parseMaxChars(input.maxChars);
  if (maxChars === null) {
    return { status: 400, body: { error: `maxChars deve essere un intero da 1 a ${MAX_MAX_CHARS}` } };
  }

  const message = await deps.getMessage(input.messageId);
  if (!message || !message.organizationId || !input.organizationIds.includes(message.organizationId)) {
    return NOT_FOUND;
  }
  if (!message.attachments?.includes(input.filename)) return NOT_FOUND;

  if (!isExtractable(input.filename)) {
    return {
      status: 415,
      body: { error: "formato dell'allegato non supportato per l'estrazione del testo", supported: EXTRACTABLE_EXTENSIONS },
    };
  }

  const data = await deps.readAttachment(message.id, input.filename);
  if (!data) return NOT_FOUND;

  let text: string | null;
  try {
    text = extractAttachmentText(data, input.filename);
  } catch {
    return { status: 422, body: { error: "allegato illeggibile" } };
  }
  text = text ?? "";

  const truncated = text.length > maxChars;
  return {
    status: 200,
    body: {
      messageId: message.id,
      filename: input.filename,
      text: truncated ? text.slice(0, maxChars) : text,
      length: text.length,
      truncated,
    },
  };
}
