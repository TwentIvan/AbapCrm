import { eq } from "drizzle-orm";

// Tabelle a cui un messaggio può essere collegato.
export const LINKABLE_TABLES = ["partners", "projects", "tasks"] as const;

export interface LinkScopeDeps {
  messageOrg(id: string): Promise<string | null>;
  recordOrg(table: string, id: string): Promise<string | null>;
}

const isLinkable = (table: string) => (LINKABLE_TABLES as readonly string[]).includes(table);

// Organizzazione in cui collegare un messaggio a un oggetto, per una richiesta che vede più organizzazioni
// (es. token «tutte le organizzazioni» con X-Organization-Scope: all): il messaggio deve stare in una delle
// organizzazioni della richiesta e l'oggetto nella stessa organizzazione del messaggio. Null se non ammesso.
export async function linkOrganization(
  deps: LinkScopeDeps,
  input: { organizationIds: string[]; messageId: string; table: string; recordId: string },
): Promise<string | null> {
  if (!isLinkable(input.table)) return null;
  const [messageOrg, recordOrg] = await Promise.all([
    deps.messageOrg(input.messageId),
    deps.recordOrg(input.table, input.recordId),
  ]);
  if (!messageOrg || !input.organizationIds.includes(messageOrg)) return null;
  return recordOrg === messageOrg ? messageOrg : null;
}

// Collegamenti in blocco, tutto o niente: l'organizzazione del messaggio se ogni voce è ben formata e ammessa
// da linkOrganization, altrimenti null.
export async function linkAllOrganization(
  deps: LinkScopeDeps,
  input: { organizationIds: string[]; messageId: string; links: unknown[] },
): Promise<string | null> {
  if (input.links.length === 0) return null;
  let org: string | null = null;
  for (const l of input.links) {
    if (!l || typeof l !== "object") return null;
    const { tableName, recordId } = l as { tableName?: unknown; recordId?: unknown };
    if (typeof tableName !== "string" || typeof recordId !== "string") return null;
    const o = await linkOrganization(deps, { organizationIds: input.organizationIds, messageId: input.messageId, table: tableName, recordId });
    if (!o || (org && o !== org)) return null;
    org = o;
  }
  return org;
}

// Modifica o rimozione di un collegamento: solo se il collegamento sta in una delle organizzazioni della richiesta.
export async function canEditLink(
  deps: { linkOrg(id: string): Promise<string | null> },
  input: { organizationIds: string[]; linkId: string },
): Promise<boolean> {
  const org = await deps.linkOrg(input.linkId);
  return !!org && input.organizationIds.includes(org);
}

// Organizzazione del messaggio se sta in una delle organizzazioni della richiesta, altrimenti null.
export async function messageOrganization(
  deps: Pick<LinkScopeDeps, "messageOrg">,
  input: { organizationIds: string[]; messageId: string },
): Promise<string | null> {
  const org = await deps.messageOrg(input.messageId);
  return org && input.organizationIds.includes(org) ? org : null;
}

// Organizzazioni da cui leggere i messaggi collegati a un oggetto. Per le tabelle collegabili l'oggetto deve stare
// in una delle organizzazioni della richiesta e conta solo la sua organizzazione (null se fuori perimetro o inesistente);
// per le altre tabelle (dove oggi non si collega più nulla) valgono le organizzazioni della richiesta.
export async function linkedRecordOrganizations(
  deps: Pick<LinkScopeDeps, "recordOrg">,
  input: { organizationIds: string[]; table: string; recordId: string },
): Promise<string[] | null> {
  if (!isLinkable(input.table)) return input.organizationIds;
  const org = await deps.recordOrg(input.table, input.recordId);
  return org && input.organizationIds.includes(org) ? [org] : null;
}

// Solo i collegamenti dentro una delle organizzazioni ammesse e, se il messaggio è incluso, con il messaggio
// nella stessa organizzazione del collegamento: un collegamento vecchio che attraversa le organizzazioni non si vede.
export function linksInScope<L extends { organizationId: string; message?: { organizationId?: string | null } | null }>(
  links: L[],
  organizationIds: string[],
): L[] {
  return links.filter(
    (l) => organizationIds.includes(l.organizationId) && (l.message === undefined || l.message?.organizationId === l.organizationId),
  );
}

// Db e schema si caricano al primo uso: la logica pura resta testabile senza database.
async function load() {
  const { db } = await import("./db");
  const { messages, messageLinks, partners, projects, tasks } = await import("@shared/schema");
  return { db, messages, messageLinks, tables: { partners, projects, tasks } as const };
}

// Un id non UUID non esiste: meglio null che un errore di Postgres sulla colonna uuid.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dbLinkScopeDeps: LinkScopeDeps & { linkOrg(id: string): Promise<string | null> } = {
  async messageOrg(id) {
    if (!UUID.test(id)) return null;
    const { db, messages } = await load();
    const [row] = await db.select({ o: messages.organizationId }).from(messages).where(eq(messages.id, id)).limit(1);
    return row?.o ?? null;
  },
  async recordOrg(table, id) {
    if (!UUID.test(id)) return null;
    const { db, tables } = await load();
    const t = tables[table as keyof typeof tables];
    if (!t) return null;
    const [row] = await db.select({ o: t.organizationId }).from(t).where(eq(t.id, id)).limit(1);
    return row?.o ?? null;
  },
  async linkOrg(id) {
    if (!UUID.test(id)) return null;
    const { db, messageLinks } = await load();
    const [row] = await db.select({ o: messageLinks.organizationId }).from(messageLinks).where(eq(messageLinks.id, id)).limit(1);
    return row?.o ?? null;
  },
};
