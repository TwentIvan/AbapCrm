// Validazione dei dati in ingresso per i commenti su task, progetti e messaggi.
// Il testo è obbligatorio (dopo il trim) e limitato; in creazione serve almeno
// un oggetto a cui agganciare il commento; in modifica si possono cambiare solo
// il testo e la visibilità (mai l'autore o l'oggetto collegato).

export const COMMENT_MAX_LENGTH = 10000;

const TARGET_FIELDS = ["projectId", "taskId", "messageId"] as const;
type TargetField = (typeof TARGET_FIELDS)[number];

export type CommentCreateData = {
  content: string;
  isInternal: boolean;
} & Partial<Record<TargetField, string>>;

export type CommentUpdateData = { content?: string; isInternal?: boolean };

type Result<T> = { data: T } | { error: string };

function parseContent(value: unknown): Result<string> {
  if (typeof value !== "string") return { error: "content obbligatorio" };
  const content = value.trim();
  if (!content) return { error: "content obbligatorio" };
  if (content.length > COMMENT_MAX_LENGTH) return { error: "content troppo lungo" };
  return { data: content };
}

function isRecord(body: unknown): body is Record<string, unknown> {
  return !!body && typeof body === "object" && !Array.isArray(body);
}

export function commentCreateInput(body: unknown): Result<CommentCreateData> {
  if (!isRecord(body)) return { error: "dati del commento non validi" };
  const content = parseContent(body.content);
  if ("error" in content) return content;
  if (body.isInternal !== undefined && typeof body.isInternal !== "boolean") {
    return { error: "isInternal non valido" };
  }
  const data: CommentCreateData = { content: content.data, isInternal: body.isInternal ?? true };
  for (const field of TARGET_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return { error: `${field} non valido` };
    data[field] = value;
  }
  if (!TARGET_FIELDS.some((f) => data[f])) {
    return { error: "serve projectId, taskId o messageId" };
  }
  return { data };
}

export function commentUpdateInput(body: unknown): Result<CommentUpdateData> {
  if (!isRecord(body)) return { error: "dati del commento non validi" };
  const data: CommentUpdateData = {};
  if (body.content !== undefined) {
    const content = parseContent(body.content);
    if ("error" in content) return content;
    data.content = content.data;
  }
  if (body.isInternal !== undefined) {
    if (typeof body.isInternal !== "boolean") return { error: "isInternal non valido" };
    data.isInternal = body.isInternal;
  }
  if (data.content === undefined && data.isInternal === undefined) {
    return { error: "niente da modificare" };
  }
  return { data };
}
