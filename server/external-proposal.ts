// Proposta su un messaggio scritta da chi chiama (`POST /api/messages/:id/proposals`), ad es. un agente di Botcave.
// Nessuna AI interna: la proposta arriva già pronta, con la stessa forma di quella dell'analisi interna
// (`ProjectProposal` in ai-project-agent.ts), e resta `pending` finché qualcuno non la applica o la rifiuta.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_KEY = /^[A-Za-z0-9._:/-]{1,100}$/;
const MAX_REASONING = 10_000;
const MAX_NAME = 500;
const MAX_TASKS = 50;
const MAX_JSON = 200_000;
// Campi di servizio dell'analisi interna in background: non li decide chi chiama.
const RESERVED_KEYS = ["processing", "failed"];
// Elenchi facoltativi della proposta: se ci sono devono essere array.
const OPTIONAL_LISTS = ["contacts", "stakeholders", "workflows", "systems", "connections", "clarificationQuestions"];

export type ExternalProposal = { proposalData: Record<string, unknown>; modelKey?: string };
export type ParseResult = { ok: true; value: ExternalProposal } | { ok: false; error: string };

/** Riferimenti a oggetti esistenti nella proposta, da verificare nell'organizzazione del messaggio. */
export type ExistingRef = { table: "projects" | "partners" | "tasks"; id: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown, max: number) => typeof v === "string" && v.trim() !== "" && v.length <= max;

/** Voce nuova (`isNew: true` con il campo del nome) o esistente (`isNew: false` con `existingId` UUID). */
function entryError(entry: unknown, label: string, nameField: string): string | null {
  if (!isObject(entry)) return `${label}: deve essere un oggetto`;
  if (typeof entry.isNew !== "boolean") return `${label}: isNew deve essere true o false`;
  if (entry.isNew) {
    if (!isText(entry[nameField], MAX_NAME)) return `${label}: ${nameField} obbligatorio (max ${MAX_NAME} caratteri)`;
  } else if (typeof entry.existingId !== "string" || !UUID.test(entry.existingId)) {
    return `${label}: existingId deve essere un UUID quando isNew è false`;
  }
  return null;
}

/**
 * Corpo `{ proposalData, modelKey? }` validato. `proposalData` deve avere `reasoning` e almeno uno fra
 * progetto, partner e task; i campi di servizio `processing` e `failed` vengono tolti.
 */
export function parseExternalProposal(body: unknown): ParseResult {
  if (!isObject(body)) return { ok: false, error: "corpo non valido: { proposalData, modelKey? }" };
  const { proposalData, modelKey } = body;
  if (!isObject(proposalData)) return { ok: false, error: "proposalData deve essere un oggetto" };
  if (modelKey !== undefined && (typeof modelKey !== "string" || !MODEL_KEY.test(modelKey))) {
    return { ok: false, error: "modelKey non valido (1..100 caratteri: lettere, cifre, . _ : / -)" };
  }
  if (JSON.stringify(proposalData).length > MAX_JSON) return { ok: false, error: "proposalData troppo grande" };
  if (!isText(proposalData.reasoning, MAX_REASONING)) {
    return { ok: false, error: `proposalData.reasoning obbligatorio (max ${MAX_REASONING} caratteri)` };
  }

  const { project, partner, tasks } = proposalData;
  if (project == null && partner == null && (!Array.isArray(tasks) || tasks.length === 0)) {
    return { ok: false, error: "la proposta deve contenere almeno un progetto, un partner o un task" };
  }
  if (project != null) {
    const e = entryError(project, "project", "name");
    if (e) return { ok: false, error: e };
  }
  if (partner != null) {
    const e = entryError(partner, "partner", "name");
    if (e) return { ok: false, error: e };
  }
  if (tasks != null) {
    if (!Array.isArray(tasks)) return { ok: false, error: "tasks deve essere un array" };
    if (tasks.length > MAX_TASKS) return { ok: false, error: `al massimo ${MAX_TASKS} task` };
    for (let i = 0; i < tasks.length; i++) {
      const e = entryError(tasks[i], `tasks[${i}]`, "title");
      if (e) return { ok: false, error: e };
    }
  }
  for (const key of OPTIONAL_LISTS) {
    if (proposalData[key] != null && !Array.isArray(proposalData[key])) {
      return { ok: false, error: `${key} deve essere un array` };
    }
  }

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposalData)) if (!RESERVED_KEYS.includes(k)) clean[k] = v;
  clean.reasoning = (proposalData.reasoning as string).trim();
  return { ok: true, value: { proposalData: clean, ...(modelKey !== undefined ? { modelKey } : {}) } };
}

/** Oggetti esistenti citati dalla proposta (progetto, partner, task con `isNew: false`). */
export function existingRefs(proposalData: Record<string, unknown>): ExistingRef[] {
  const refs: ExistingRef[] = [];
  const add = (entry: unknown, table: ExistingRef["table"]) => {
    if (isObject(entry) && entry.isNew === false && typeof entry.existingId === "string") refs.push({ table, id: entry.existingId });
  };
  add(proposalData.project, "projects");
  add(proposalData.partner, "partners");
  if (Array.isArray(proposalData.tasks)) for (const t of proposalData.tasks) add(t, "tasks");
  return refs;
}

export interface ExternalProposalDeps {
  messageOrg(messageId: string): Promise<string | null>;
  recordOrg(table: string, id: string): Promise<string | null>;
  /** Proposte dell'utente sul messaggio (id, stato e dati). */
  proposalsByMessage(messageId: string, userId: string): Promise<Array<{ id: string; status: string; proposalData: unknown }>>;
  create(input: {
    userId: string;
    organizationId: string;
    messageId: string;
    status: "pending";
    proposalData: Record<string, unknown>;
    modelKey?: string;
  }): Promise<{ id: string }>;
}

export type CreateResult =
  | { status: 201; body: { id: string } & Record<string, unknown> }
  | { status: 400 | 404 | 409; body: { error: string; proposalId?: string } };

/**
 * Crea la proposta nell'organizzazione del messaggio, se il messaggio sta nel perimetro della richiesta.
 * Gli oggetti esistenti citati devono stare nella stessa organizzazione. Se c'è già una proposta in attesa
 * dell'utente sul messaggio (non fallita) risponde 409 col suo id: va aggiornata, non duplicata.
 */
export async function createExternalProposal(
  deps: ExternalProposalDeps,
  input: { userId: string; messageId: string; organizationIds: string[]; proposal: ExternalProposal },
): Promise<CreateResult> {
  const organizationId = await deps.messageOrg(input.messageId);
  if (!organizationId || !input.organizationIds.includes(organizationId)) {
    return { status: 404, body: { error: "messaggio non trovato" } };
  }

  for (const ref of existingRefs(input.proposal.proposalData)) {
    if ((await deps.recordOrg(ref.table, ref.id)) !== organizationId) {
      return { status: 400, body: { error: `${ref.table} ${ref.id} non trovato nell'organizzazione del messaggio` } };
    }
  }

  const pending = (await deps.proposalsByMessage(input.messageId, input.userId)).find(
    (p) => p.status === "pending" && !(isObject(p.proposalData) && p.proposalData.failed === true),
  );
  if (pending) {
    return { status: 409, body: { error: "c'è già una proposta in attesa per questo messaggio", proposalId: pending.id } };
  }

  const created = await deps.create({
    userId: input.userId,
    organizationId,
    messageId: input.messageId,
    status: "pending",
    proposalData: input.proposal.proposalData,
    ...(input.proposal.modelKey ? { modelKey: input.proposal.modelKey } : {}),
  });
  return { status: 201, body: created as { id: string } & Record<string, unknown> };
}
