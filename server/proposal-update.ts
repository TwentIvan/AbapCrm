// Aggiornamento di una proposta in attesa (`PATCH /api/proposals/:id`) da parte di chi chiama, ad es. un agente
// di Botcave che ha discusso la proposta con l'utente. Nessuna AI interna: chi chiama manda la proposta rivista
// (stessa forma e stesse regole di `POST /api/messages/:id/proposals`) e/o i messaggi della discussione, che
// finiscono in `proposal_discussions` come quelli della discussione interna.

import { parseExternalProposal, existingRefs } from "./external-proposal";

const ROLES = ["user", "assistant"] as const;
const MAX_ENTRIES = 50;
const MAX_CONTENT = 20_000;

export type DiscussionRole = (typeof ROLES)[number];
export type DiscussionEntry = { role: DiscussionRole; content: string };

export type ProposalUpdate = {
  proposalData?: Record<string, unknown>;
  modelKey?: string;
  discussion: DiscussionEntry[];
};
export type ParseUpdateResult = { ok: true; value: ProposalUpdate } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Corpo `{ proposalData?, modelKey?, discussion? }`: almeno uno fra `proposalData` e `discussion`.
 * `proposalData` e `modelKey` seguono le regole della creazione; `discussion` è un elenco ordinato di
 * `{ role: "user" | "assistant", content }`.
 */
export function parseProposalUpdate(body: unknown): ParseUpdateResult {
  if (!isObject(body)) return { ok: false, error: "corpo non valido: { proposalData?, modelKey?, discussion? }" };
  const { proposalData, modelKey, discussion } = body;
  if (proposalData === undefined && discussion === undefined) {
    return { ok: false, error: "serve proposalData, discussion o entrambi" };
  }
  if (proposalData === undefined && modelKey !== undefined) {
    return { ok: false, error: "modelKey si manda solo insieme a proposalData" };
  }

  const entries: DiscussionEntry[] = [];
  if (discussion !== undefined) {
    if (!Array.isArray(discussion) || discussion.length === 0) {
      return { ok: false, error: "discussion deve essere un array non vuoto" };
    }
    if (discussion.length > MAX_ENTRIES) return { ok: false, error: `discussion: al massimo ${MAX_ENTRIES} messaggi` };
    for (let i = 0; i < discussion.length; i++) {
      const d = discussion[i];
      if (!isObject(d)) return { ok: false, error: `discussion[${i}]: deve essere un oggetto` };
      if (!ROLES.includes(d.role as DiscussionRole)) {
        return { ok: false, error: `discussion[${i}]: role deve essere "user" o "assistant"` };
      }
      if (typeof d.content !== "string" || d.content.trim() === "" || d.content.length > MAX_CONTENT) {
        return { ok: false, error: `discussion[${i}]: content obbligatorio (max ${MAX_CONTENT} caratteri)` };
      }
      entries.push({ role: d.role as DiscussionRole, content: d.content.trim() });
    }
  }

  if (proposalData === undefined) return { ok: true, value: { discussion: entries } };
  const parsed = parseExternalProposal({ proposalData, ...(modelKey !== undefined ? { modelKey } : {}) });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { ...parsed.value, discussion: entries } };
}

/** Riga di `proposal_discussions` da scrivere; `proposalDataSnapshot` solo sulla riga che accompagna la revisione. */
export type DiscussionRow = DiscussionEntry & { proposalDataSnapshot: Record<string, unknown> | null };

/**
 * Righe della discussione da registrare, nell'ordine ricevuto. Se la proposta cambia, la revisione va su una
 * riga dell'assistente (come nella discussione interna): l'ultima, se è dell'assistente, altrimenti una riga
 * aggiunta in coda.
 */
export function discussionRows(update: ProposalUpdate): DiscussionRow[] {
  const rows: DiscussionRow[] = update.discussion.map((d) => ({ ...d, proposalDataSnapshot: null }));
  if (update.proposalData) {
    const last = rows[rows.length - 1];
    if (last?.role === "assistant") last.proposalDataSnapshot = update.proposalData;
    else {
      rows.push({
        role: "assistant",
        content: `Proposta aggiornata${update.modelKey ? ` da ${update.modelKey}` : ""}.`,
        proposalDataSnapshot: update.proposalData,
      });
    }
  }
  return rows;
}

type StoredProposal = { id: string; userId: string; organizationId: string; status: string; proposalData: unknown };

export interface ProposalUpdateDeps {
  getProposal(id: string): Promise<StoredProposal | null>;
  recordOrg(table: string, id: string): Promise<string | null>;
  /**
   * Scrive insieme proposta e discussione, solo se la proposta è ancora `pending`; `null` se nel frattempo è
   * stata decisa.
   */
  save(input: {
    proposalId: string;
    organizationId: string;
    userId: string;
    proposalData?: Record<string, unknown>;
    modelKey?: string;
    rows: DiscussionRow[];
  }): Promise<{ proposal: Record<string, unknown>; discussion: Array<Record<string, unknown>> } | null>;
}

export type UpdateResult =
  | { status: 200; body: { proposal: Record<string, unknown>; discussion: Array<Record<string, unknown>> } }
  | { status: 400 | 404 | 409; body: { error: string } };

const ALREADY_DECIDED = "la proposta non è più in attesa: è già stata applicata o rifiutata";

/**
 * Aggiorna la proposta dell'utente se sta nel perimetro della richiesta ed è ancora in attesa (e non in analisi).
 * Gli oggetti esistenti citati devono stare nell'organizzazione della proposta.
 */
export async function updatePendingProposal(
  deps: ProposalUpdateDeps,
  input: { proposalId: string; userId: string; organizationIds: string[]; update: ProposalUpdate },
): Promise<UpdateResult> {
  const proposal = await deps.getProposal(input.proposalId);
  if (!proposal || proposal.userId !== input.userId || !input.organizationIds.includes(proposal.organizationId)) {
    return { status: 404, body: { error: "proposta non trovata" } };
  }
  if (proposal.status !== "pending") return { status: 409, body: { error: ALREADY_DECIDED } };
  if (isObject(proposal.proposalData) && proposal.proposalData.processing === true) {
    return { status: 409, body: { error: "l'analisi della proposta è ancora in corso" } };
  }

  const { proposalData, modelKey } = input.update;
  if (proposalData) {
    for (const ref of existingRefs(proposalData)) {
      if ((await deps.recordOrg(ref.table, ref.id)) !== proposal.organizationId) {
        return { status: 400, body: { error: `${ref.table} ${ref.id} non trovato nell'organizzazione della proposta` } };
      }
    }
  }

  const saved = await deps.save({
    proposalId: proposal.id,
    organizationId: proposal.organizationId,
    userId: input.userId,
    ...(proposalData ? { proposalData } : {}),
    ...(modelKey ? { modelKey } : {}),
    rows: discussionRows(input.update),
  });
  if (!saved) return { status: 409, body: { error: ALREADY_DECIDED } };
  return { status: 200, body: saved };
}
