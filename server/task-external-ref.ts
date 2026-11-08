// Riferimento a un work item esterno (es. Azure DevOps) passato alla creazione di un task:
// `externalWorkItemId`, `externalSystem`, `externalWorkItemUrl`, tutti facoltativi.
// Usato da Botcave per collegare i task ai work item, così le mail successive ritrovano il task.

export type TaskExternalRef = {
  externalWorkItemId?: string;
  externalSystem?: string;
  externalWorkItemUrl?: string;
};

const SYSTEM_RE = /^[a-z0-9_]{1,50}$/;

const absent = (value: unknown) => value === undefined || value === null || value === "";

/** Campi esterni validati dal corpo; `{error}` se uno presente non è valido. */
export function taskExternalRef(body: unknown): { ref: TaskExternalRef } | { error: string } {
  const src = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const ref: TaskExternalRef = {};

  const id = src.externalWorkItemId;
  if (!absent(id)) {
    const text = typeof id === "number" && Number.isInteger(id) ? String(id) : typeof id === "string" ? id.trim() : null;
    if (!text || text.length > 100) return { error: "externalWorkItemId non valido" };
    ref.externalWorkItemId = text;
  }

  const system = src.externalSystem;
  if (!absent(system)) {
    if (typeof system !== "string" || !SYSTEM_RE.test(system.trim())) return { error: "externalSystem non valido" };
    ref.externalSystem = system.trim();
  }

  const url = src.externalWorkItemUrl;
  if (!absent(url)) {
    if (typeof url !== "string" || url.length > 500 || !isHttpsUrl(url.trim())) return { error: "externalWorkItemUrl non valido" };
    ref.externalWorkItemUrl = url.trim();
  }

  if ((ref.externalSystem || ref.externalWorkItemUrl) && !ref.externalWorkItemId) {
    return { error: "externalWorkItemId obbligatorio con externalSystem o externalWorkItemUrl" };
  }
  return { ref };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
