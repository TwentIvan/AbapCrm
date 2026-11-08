import { eq } from "drizzle-orm";

// Tabelle a cui un messaggio può essere collegato.
export const LINKABLE_TABLES = ["partners", "projects", "tasks"] as const;

export interface LinkScopeDeps {
  messageOrg(id: string): Promise<string | null>;
  recordOrg(table: string, id: string): Promise<string | null>;
}

// Vero solo se la tabella è ammessa e messaggio e oggetto sono dell'organizzazione.
// Un'organizzazione nulla (o mancante) non coincide mai con quella della richiesta.
export async function canLink(
  deps: LinkScopeDeps,
  input: { organizationId: string; messageId: string; table: string; recordId: string },
): Promise<boolean> {
  if (!input.organizationId) return false;
  if (!(LINKABLE_TABLES as readonly string[]).includes(input.table)) return false;
  const [messageOrg, recordOrg] = await Promise.all([
    deps.messageOrg(input.messageId),
    deps.recordOrg(input.table, input.recordId),
  ]);
  return messageOrg === input.organizationId && recordOrg === input.organizationId;
}

// Organizzazione in cui collegare un messaggio a un oggetto, per una richiesta che vede più organizzazioni
// (es. token «tutte le organizzazioni» con X-Organization-Scope: all): il messaggio deve stare in una delle
// organizzazioni della richiesta e l'oggetto nella stessa organizzazione del messaggio. Null se non ammesso.
export async function linkOrganization(
  deps: LinkScopeDeps,
  input: { organizationIds: string[]; messageId: string; table: string; recordId: string },
): Promise<string | null> {
  if (!(LINKABLE_TABLES as readonly string[]).includes(input.table)) return null;
  const [messageOrg, recordOrg] = await Promise.all([
    deps.messageOrg(input.messageId),
    deps.recordOrg(input.table, input.recordId),
  ]);
  if (!messageOrg || !input.organizationIds.includes(messageOrg)) return null;
  return recordOrg === messageOrg ? messageOrg : null;
}

// Collegamenti in blocco: vero solo se ogni voce è ben formata e ammessa da canLink.
export async function canLinkAll(
  deps: LinkScopeDeps,
  input: { organizationId: string; messageId: string; links: unknown[] },
): Promise<boolean> {
  if (input.links.length === 0) return false;
  for (const l of input.links) {
    if (!l || typeof l !== "object") return false;
    const { tableName, recordId } = l as { tableName?: unknown; recordId?: unknown };
    if (typeof tableName !== "string" || typeof recordId !== "string") return false;
    if (!(await canLink(deps, { organizationId: input.organizationId, messageId: input.messageId, table: tableName, recordId }))) {
      return false;
    }
  }
  return true;
}

export async function canEditLink(
  deps: { linkOrg(id: string): Promise<string | null> },
  input: { organizationId: string; linkId: string },
): Promise<boolean> {
  if (!input.organizationId) return false;
  return (await deps.linkOrg(input.linkId)) === input.organizationId;
}

// Db e schema si caricano al primo uso: la logica pura resta testabile senza database.
async function load() {
  const { db } = await import("./db");
  const { messages, messageLinks, partners, projects, tasks } = await import("@shared/schema");
  return { db, messages, messageLinks, tables: { partners, projects, tasks } as const };
}

export const dbLinkScopeDeps: LinkScopeDeps & { linkOrg(id: string): Promise<string | null> } = {
  async messageOrg(id) {
    const { db, messages } = await load();
    const [row] = await db.select({ o: messages.organizationId }).from(messages).where(eq(messages.id, id)).limit(1);
    return row?.o ?? null;
  },
  async recordOrg(table, id) {
    const { db, tables } = await load();
    const t = tables[table as keyof typeof tables];
    if (!t) return null;
    const [row] = await db.select({ o: t.organizationId }).from(t).where(eq(t.id, id)).limit(1);
    return row?.o ?? null;
  },
  async linkOrg(id) {
    const { db, messageLinks } = await load();
    const [row] = await db.select({ o: messageLinks.organizationId }).from(messageLinks).where(eq(messageLinks.id, id)).limit(1);
    return row?.o ?? null;
  },
};
