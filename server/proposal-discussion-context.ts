// Contesto per discutere una proposta nel pannello Botcave (`GET /api/proposals/:id/discussion-context`).
// In una sola lettura l'agente riceve la proposta, il messaggio da cui nasce (ridotto ai campi per
// riconoscerlo) e la discussione già registrata, in ordine. Nessuna AI e nessuna scrittura: la proposta rivista
// e i messaggi della discussione l'agente li scrive con `PATCH /api/proposals/:id`.

type StoredProposal = {
  id: string;
  userId: string;
  organizationId: string;
  messageId: string;
  status: string;
  proposalData: unknown;
  modelKey: string | null;
  decisionSummary: string | null;
  decisionReasoning: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type StoredMessage = {
  id: string;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  receivedAt: Date | string | null;
};

type StoredDiscussion = {
  id: string;
  role: string;
  content: string;
  proposalDataSnapshot: unknown;
  createdAt: Date | string;
};

export interface DiscussionContextDeps {
  getProposal(id: string): Promise<StoredProposal | null>;
  getMessage(id: string): Promise<StoredMessage | null>;
  /** Discussione della proposta ordinata per `createdAt` crescente. */
  getDiscussion(proposalId: string): Promise<StoredDiscussion[]>;
}

export type DiscussionContext = {
  proposal: {
    id: string;
    organizationId: string;
    messageId: string;
    status: string;
    proposalData: unknown;
    modelKey: string | null;
    decisionSummary: string | null;
    decisionReasoning: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  message: StoredMessage | null;
  discussion: Array<{ id: string; role: string; content: string; proposalUpdated: boolean; createdAt: Date | string }>;
  /** Vero se la proposta si può ancora rivedere con `PATCH /api/proposals/:id`. */
  canUpdate: boolean;
};

export type DiscussionContextResult =
  | { status: 200; body: DiscussionContext }
  | { status: 404; body: { error: string } };

const isProcessing = (data: unknown) =>
  !!data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).processing === true;

/**
 * Proposta dell'utente nelle organizzazioni della richiesta, altrimenti 404 (senza dire se esiste altrove).
 * Le righe della discussione non portano lo snapshot intero: `proposalUpdated` dice se quella riga ha rivisto la
 * proposta, la versione corrente è già in `proposal.proposalData`.
 */
export async function proposalDiscussionContext(
  deps: DiscussionContextDeps,
  input: { proposalId: string; userId: string; organizationIds: string[] },
): Promise<DiscussionContextResult> {
  const proposal = await deps.getProposal(input.proposalId);
  if (!proposal || proposal.userId !== input.userId || !input.organizationIds.includes(proposal.organizationId)) {
    return { status: 404, body: { error: "proposta non trovata" } };
  }
  const [message, rows] = await Promise.all([deps.getMessage(proposal.messageId), deps.getDiscussion(proposal.id)]);
  return {
    status: 200,
    body: {
      proposal: {
        id: proposal.id,
        organizationId: proposal.organizationId,
        messageId: proposal.messageId,
        status: proposal.status,
        proposalData: proposal.proposalData,
        modelKey: proposal.modelKey,
        decisionSummary: proposal.decisionSummary,
        decisionReasoning: proposal.decisionReasoning,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
      },
      message: message
        ? {
            id: message.id,
            subject: message.subject,
            fromEmail: message.fromEmail,
            fromName: message.fromName,
            receivedAt: message.receivedAt,
          }
        : null,
      discussion: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        proposalUpdated: r.proposalDataSnapshot != null,
        createdAt: r.createdAt,
      })),
      canUpdate: proposal.status === "pending" && !isProcessing(proposal.proposalData),
    },
  };
}
