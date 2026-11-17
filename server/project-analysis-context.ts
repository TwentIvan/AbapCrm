/**
 * «Analizza progetto» con l'agente Botcave (`GET /api/messages/:id/project-analysis`).
 *
 * L'analisi di un messaggio per proporre progetto, partner, contatti e task la fa l'agente Botcave, non l'AI interna:
 * qui si assembla quello che gli serve in una sola lettura — il testo del messaggio (con il corpo HTML ripulito come
 * per l'AI interna), il testo degli allegati leggibili, l'anagrafica esistente dell'organizzazione del messaggio
 * (per collegare invece di duplicare) e le proposte già presenti sul messaggio (per non ripartire da capo).
 * Nessuna AI, nessuna scrittura. Il messaggio deve appartenere a una delle organizzazioni visibili a chi chiama,
 * e l'anagrafica è sempre e solo quella dell'organizzazione del messaggio.
 */

export const DEFAULT_MAX_CHARS = 20_000;
export const MAX_MAX_CHARS = 100_000;

export interface AnalysisMessage {
  id: string;
  organizationId: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  receivedAt: Date | string | null;
  threadId: string | null;
  attachments: string[] | null;
  projectId: string | null;
  taskId: string | null;
  partnerId: string | null;
  body: string | null;
  htmlBody: string | null;
}

export interface ProjectAnalysisDeps {
  getMessage(id: string): Promise<AnalysisMessage | undefined>;
  analysisText(message: AnalysisMessage): string;
  attachmentText(messageId: string, filename: string): Promise<string | null>;
  projects(organizationId: string): Promise<Array<{ id: string; name: string; status: string | null; clientId: string | null; parentProjectId: string | null }>>;
  partners(organizationId: string): Promise<Array<{ id: string; name: string; company: string | null; email: string | null; domain: string | null; type: string | null }>>;
  contacts(organizationId: string): Promise<Array<{ id: string; name: string; email: string | null; partnerId: string | null }>>;
  tasks(organizationId: string): Promise<Array<{ id: string; title: string; status: string | null; projectId: string | null }>>;
  proposals(messageId: string): Promise<Array<{ id: string; status: string | null; modelKey: string | null; proposalData: unknown; createdAt: Date | string | null }>>;
}

/** maxChars dalla query: assente → predefinito, valido 1..MAX_MAX_CHARS, altrimenti null (→ 400). */
export function parseMaxChars(raw: unknown): number | null {
  if (raw === undefined) return DEFAULT_MAX_CHARS;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= MAX_MAX_CHARS ? value : null;
}

function clip(text: string, maxChars: number): { text: string; truncated: boolean } {
  return text.length > maxChars ? { text: text.slice(0, maxChars), truncated: true } : { text, truncated: false };
}

/** Una proposta è «in lavorazione» finché l'AI interna non ha scritto il risultato (proposalData.processing). */
function isProcessing(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { processing?: unknown }).processing === true;
}

export async function buildProjectAnalysisContext(
  deps: ProjectAnalysisDeps,
  input: { organizationIds: string[]; messageId: string; maxChars: number },
) {
  const message = await deps.getMessage(input.messageId);
  if (!message || !message.organizationId || !input.organizationIds.includes(message.organizationId)) return null;
  const organizationId = message.organizationId;

  const body = clip(deps.analysisText(message), input.maxChars);

  // Il limite vale per ogni allegato; quelli non leggibili (PDF, immagini…) restano in elenco con text null.
  const attachments = [];
  for (const filename of message.attachments ?? []) {
    let text: string | null = null;
    try {
      text = await deps.attachmentText(message.id, filename);
    } catch {
      text = null;
    }
    const clipped = text ? clip(text, input.maxChars) : null;
    attachments.push({ filename, text: clipped?.text ?? null, truncated: clipped?.truncated ?? false });
  }

  const [projects, partners, contacts, tasks, proposals] = await Promise.all([
    deps.projects(organizationId),
    deps.partners(organizationId),
    deps.contacts(organizationId),
    deps.tasks(organizationId),
    deps.proposals(message.id),
  ]);

  return {
    message: {
      id: message.id,
      organizationId,
      subject: message.subject,
      fromEmail: message.fromEmail,
      fromName: message.fromName,
      toEmail: message.toEmail,
      receivedAt: message.receivedAt,
      threadId: message.threadId,
      projectId: message.projectId,
      taskId: message.taskId,
      partnerId: message.partnerId,
      body: body.text,
      bodyTruncated: body.truncated,
    },
    attachments,
    existing: {
      projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, clientId: p.clientId, parentProjectId: p.parentProjectId })),
      partners: partners.map((p) => ({ id: p.id, name: p.name, company: p.company, email: p.email, domain: p.domain, type: p.type })),
      contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, partnerId: c.partnerId })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, projectId: t.projectId })),
    },
    proposals: proposals.map((p) => ({
      id: p.id,
      status: p.status,
      modelKey: p.modelKey,
      processing: isProcessing(p.proposalData),
      createdAt: p.createdAt,
    })),
  };
}
