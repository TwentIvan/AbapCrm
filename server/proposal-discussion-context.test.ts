import { describe, it, expect } from "vitest";
import { proposalDiscussionContext, type DiscussionContextDeps } from "./proposal-discussion-context";

const proposal = {
  id: "p1",
  userId: "u1",
  organizationId: "o1",
  messageId: "m1",
  status: "pending",
  proposalData: { project: { name: "Migrazione S/4" }, tasks: [] },
  modelKey: "botcave/alfred",
  decisionSummary: null,
  decisionReasoning: null,
  createdAt: "2026-11-10T10:00:00.000Z",
  updatedAt: "2026-11-11T10:00:00.000Z",
};

const message = {
  id: "m1",
  subject: "Richiesta di offerta",
  fromEmail: "cliente@example.com",
  fromName: "Cliente",
  receivedAt: "2026-11-09T08:00:00.000Z",
  body: "<p>corpo lungo che non deve uscire</p>",
};

const rows = [
  { id: "d1", role: "user", content: "Togli il secondo task", proposalDataSnapshot: null, createdAt: "2026-11-11T09:00:00.000Z" },
  { id: "d2", role: "assistant", content: "Fatto", proposalDataSnapshot: { tasks: [] }, createdAt: "2026-11-11T09:00:00.001Z" },
];

function deps(over: Partial<DiscussionContextDeps> = {}) {
  const calls: string[] = [];
  const d: DiscussionContextDeps = {
    getProposal: async (id) => (calls.push(`proposal:${id}`), id === proposal.id ? proposal : null),
    getMessage: async (id) => (calls.push(`message:${id}`), id === message.id ? message : null),
    getDiscussion: async (id) => (calls.push(`discussion:${id}`), rows),
    ...over,
  };
  return { d, calls };
}

const input = { proposalId: "p1", userId: "u1", organizationIds: ["o1"] };

describe("proposalDiscussionContext", () => {
  it("proposta, messaggio ridotto e discussione in ordine", async () => {
    const { d } = deps();
    const r = await proposalDiscussionContext(d, input);
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.body.proposal).toMatchObject({ id: "p1", messageId: "m1", status: "pending", modelKey: "botcave/alfred" });
    expect(r.body.proposal.proposalData).toEqual(proposal.proposalData);
    expect(r.body.message).toEqual({
      id: "m1",
      subject: "Richiesta di offerta",
      fromEmail: "cliente@example.com",
      fromName: "Cliente",
      receivedAt: "2026-11-09T08:00:00.000Z",
    });
    expect(r.body.discussion.map((x) => x.id)).toEqual(["d1", "d2"]);
    expect(r.body.canUpdate).toBe(true);
  });

  it("le righe dicono se hanno rivisto la proposta, senza lo snapshot intero", async () => {
    const { d } = deps();
    const r = await proposalDiscussionContext(d, input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.discussion.map((x) => x.proposalUpdated)).toEqual([false, true]);
    expect(r.body.discussion[1]).not.toHaveProperty("proposalDataSnapshot");
  });

  it("la proposta non porta userId", async () => {
    const { d } = deps();
    const r = await proposalDiscussionContext(d, input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.proposal).not.toHaveProperty("userId");
  });

  it("proposta inesistente → 404", async () => {
    const { d, calls } = deps();
    const r = await proposalDiscussionContext(d, { ...input, proposalId: "nessuna" });
    expect(r.status).toBe(404);
    expect(calls).toEqual(["proposal:nessuna"]);
  });

  it("proposta di un altro utente → 404 senza leggere altro", async () => {
    const { d, calls } = deps();
    const r = await proposalDiscussionContext(d, { ...input, userId: "u2" });
    expect(r.status).toBe(404);
    expect(calls).toEqual(["proposal:p1"]);
  });

  it("proposta fuori dalle organizzazioni della richiesta → 404", async () => {
    const { d } = deps();
    expect((await proposalDiscussionContext(d, { ...input, organizationIds: ["o2"] })).status).toBe(404);
    expect((await proposalDiscussionContext(d, { ...input, organizationIds: [] })).status).toBe(404);
  });

  it("una delle organizzazioni della richiesta basta (token «tutte le organizzazioni»)", async () => {
    const { d } = deps();
    expect((await proposalDiscussionContext(d, { ...input, organizationIds: ["o2", "o1"] })).status).toBe(200);
  });

  it("messaggio sparito → message null, il resto c'è", async () => {
    const { d } = deps({ getMessage: async () => null });
    const r = await proposalDiscussionContext(d, input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.message).toBeNull();
    expect(r.body.discussion).toHaveLength(2);
  });

  it("proposta già decisa → canUpdate false", async () => {
    for (const status of ["accepted", "rejected", "partially_accepted"]) {
      const { d } = deps({ getProposal: async () => ({ ...proposal, status }) });
      const r = await proposalDiscussionContext(d, input);
      if (r.status !== 200) throw new Error("atteso 200");
      expect(r.body.canUpdate).toBe(false);
    }
  });

  it("analisi ancora in corso → canUpdate false", async () => {
    const { d } = deps({ getProposal: async () => ({ ...proposal, proposalData: { processing: true } }) });
    const r = await proposalDiscussionContext(d, input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.canUpdate).toBe(false);
  });

  it("nessuna discussione → elenco vuoto", async () => {
    const { d } = deps({ getDiscussion: async () => [] });
    const r = await proposalDiscussionContext(d, input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.discussion).toEqual([]);
  });
});
