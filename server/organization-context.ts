// Organizzazione della richiesta (header X-Organization-Id), senza alcuna organizzazione di ripiego fissa.
// Il middleware in routes.ts porta l'header su un'organizzazione di cui l'utente è membro (Personal o la prima);
// se l'utente non ne ha nessuna l'header viene tolto e le route che richiedono l'organizzazione rispondono 400.

export const ORGANIZATION_REQUIRED_MESSAGE = "Organizzazione non specificata (X-Organization-Id)";

/** Errore delle route che richiedono un'organizzazione: `status` 400 come gli altri errori di richiesta. */
export class MissingOrganizationError extends Error {
  readonly status = 400;
  readonly code = "organization_required";
  constructor() {
    super(ORGANIZATION_REQUIRED_MESSAGE);
    this.name = "MissingOrganizationError";
  }
}

type RequestLike = { headers: Record<string, string | string[] | undefined> };

/** Organizzazione dall'header, `null` se assente o vuota. */
export function readOrganizationId(req: RequestLike): string | null {
  const raw = req.headers["x-organization-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

/** Organizzazione dall'header; senza header lancia `MissingOrganizationError`. */
export function requireOrganizationId(req: RequestLike): string {
  const organizationId = readOrganizationId(req);
  if (!organizationId) throw new MissingOrganizationError();
  return organizationId;
}

/** Organizzazione predefinita dell'utente: Personal, altrimenti la prima; `null` se non ne ha. */
export function pickDefaultOrganizationId(orgs: Array<{ id: string; name?: string | null }>): string | null {
  return (orgs.find((o) => o.name === "Personal") ?? orgs[0])?.id ?? null;
}

/**
 * Organizzazione da usare per una richiesta di sessione: l'header se l'utente ne è membro, altrimenti quella
 * predefinita; `null` (header da togliere) se l'utente non ha organizzazioni. `rejected` è l'header scartato.
 */
export function resolveSessionOrganization(
  header: string | null,
  memberIds: ReadonlySet<string>,
  fallback: string | null,
): { organizationId: string | null; rejected: string | null } {
  if (header && memberIds.has(header)) return { organizationId: header, rejected: null };
  return { organizationId: fallback, rejected: header };
}
