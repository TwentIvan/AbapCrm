import { describe, it, expect, vi } from "vitest";
import { parseProposalUpdate, discussionRows, updatePendingProposal, type ProposalUpdateDeps, type ProposalUpdate } from "./proposal-update";

const PID = "55555555-5555-4555-8555-555555555555";
const PRJ = "22222222-2222-4222-8222-222222222222";
const PAR = "33333333-3333-4333-8333-333333333333";

const data = {
  reasoning: " rivista dopo la discussione ",
  project: { isNew: false, existingId: PRJ, name: "Progetto" },
  tasks: [{ isNew: true, title: "Analisi" }],
};

const ok = (body: unknown): ProposalUpdate => {
  const r = parseProposalUpdate(body);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("parseProposalUpdate", () => {
  it("proposta rivista con le regole della creazione, discussione ripulita", () => {
    const v = ok({
      proposalData: { ...data, processing: true },
      modelKey: "botcave/smistatore",
      discussion: [{ role: "user", content: " togli il task di test " }, { role: "assistant", content: "Fatto." }],
    });
    expect(v.proposalData?.reasoning).toBe("rivista dopo la discussione");
    expect(v.proposalData && "processing" in v.proposalData).toBe(false);
    expect(v.modelKey).toBe("botcave/smistatore");
    expect(v.discussion).toEqual([
      { role: "user", content: "togli il task di test" },
      { role: "assistant", content: "Fatto." },
    ]);
  });

  it("basta la sola discussione o la sola proposta", () => {
    expect(ok({ discussion: [{ role: "assistant", content: "Il progetto è quello giusto." }] }).proposalData).toBeUndefined();
    expect(ok({ proposalData: data }).discussion).toEqual([]);
  });

  it("rifiuta corpi non validi", () => {
    const bad: unknown[] = [
      null, "x", [], {}, { modelKey: "x" },
      { discussion: [{ role: "user", content: "x" }], modelKey: "botcave/x" },
      { proposalData: { reasoning: "" } },
      { proposalData: data, modelKey: "con spazi" },
      { discussion: [] }, { discussion: "ciao" }, { discussion: ["ciao"] },
      { discussion: [{ role: "system", content: "x" }] },
      { discussion: [{ role: "user", content: "   " }] },
      { discussion: [{ role: "user" }] },
      { discussion: [{ role: "user", content: "x".repeat(20_001) }] },
      { discussion: Array(51).fill({ role: "user", content: "x" }) },
    ];
    for (const b of bad) expect(parseProposalUpdate(b).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
  });
});

describe("discussionRows", () => {
  it("la revisione va sull'ultima riga se è dell'assistente", () => {
    const v = ok({ proposalData: data, discussion: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] });
    const rows = discussionRows(v);
    expect(rows).toHaveLength(2);
    expect(rows[0].proposalDataSnapshot).toBeNull();
    expect(rows[1].proposalDataSnapshot).toEqual(v.proposalData);
  });

  it("altrimenti aggiunge una riga dell'assistente con la revisione", () => {
    const v = ok({ proposalData: data, modelKey: "botcave/x", discussion: [{ role: "user", content: "a" }] });
    const rows = discussionRows(v);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ role: "assistant", content: "Proposta aggiornata da botcave/x.", proposalDataSnapshot: v.proposalData });
    expect(discussionRows(ok({ proposalData: data }))).toEqual([
      { role: "assistant", content: "Proposta aggiornata.", proposalDataSnapshot: expect.any(Object) },
    ]);
  });

  it("solo discussione: nessuna revisione", () => {
    const rows = discussionRows(ok({ discussion: [{ role: "assistant", content: "b" }] }));
    expect(rows).toEqual([{ role: "assistant", content: "b", proposalDataSnapshot: null }]);
  });
});

function deps(over: Partial<ProposalUpdateDeps> = {}, stored: Record<string, unknown> = {}) {
  const orgs: Record<string, string> = { [PRJ]: "org1", [PAR]: "org2" };
  return {
    getProposal: vi.fn(async (id: string) =>
      id === PID ? { id: PID, userId: "u1", organizationId: "org1", status: "pending", proposalData: { reasoning: "x" }, ...stored } : null,
    ),
    recordOrg: vi.fn(async (_t: string, id: string) => orgs[id] ?? null),
    save: vi.fn(async (input: any) => ({
      proposal: { id: input.proposalId, proposalData: input.proposalData },
      discussion: input.rows.map((r: any, i: number) => ({ id: `d${i}`, ...r })),
    })),
    ...over,
  };
}

const input = (update: ProposalUpdate, organizationIds = ["org1"], userId = "u1", proposalId = PID) => ({
  proposalId, userId, organizationIds, update,
});

describe("updatePendingProposal", () => {
  it("salva proposta e discussione nell'organizzazione della proposta", async () => {
    const d = deps();
    const v = ok({ proposalData: data, modelKey: "botcave/x", discussion: [{ role: "user", content: "a" }] });
    const r = await updatePendingProposal(d, input(v, ["org0", "org1"]));
    expect(r.status).toBe(200);
    expect(d.save).toHaveBeenCalledWith({
      proposalId: PID, organizationId: "org1", userId: "u1",
      proposalData: v.proposalData, modelKey: "botcave/x", rows: discussionRows(v),
    });
    if (r.status === 200) expect(r.body.discussion).toHaveLength(2);
  });

  it("solo discussione: proposta e modelKey non toccati", async () => {
    const d = deps();
    const r = await updatePendingProposal(d, input(ok({ discussion: [{ role: "assistant", content: "b" }] })));
    expect(r.status).toBe(200);
    const arg = d.save.mock.calls[0][0];
    expect("proposalData" in arg || "modelKey" in arg).toBe(false);
  });

  it("404 se la proposta non esiste, è di un altro utente o fuori perimetro", async () => {
    const v = ok({ proposalData: data });
    for (const i of [input(v, ["org1"], "u1", PAR), input(v, ["org1"], "u2"), input(v, ["org2"])]) {
      const d = deps();
      expect((await updatePendingProposal(d, i)).status).toBe(404);
      expect(d.save).not.toHaveBeenCalled();
    }
  });

  it("409 se la proposta è già decisa o ancora in analisi", async () => {
    for (const stored of [{ status: "accepted" }, { status: "rejected" }, { proposalData: { processing: true } }]) {
      const d = deps({}, stored);
      expect((await updatePendingProposal(d, input(ok({ proposalData: data })))).status).toBe(409);
      expect(d.save).not.toHaveBeenCalled();
    }
  });

  it("una proposta fallita in attesa si può correggere", async () => {
    const d = deps({}, { proposalData: { processing: false, failed: true } });
    expect((await updatePendingProposal(d, input(ok({ proposalData: data })))).status).toBe(200);
  });

  it("400 se un oggetto esistente citato non è nell'organizzazione della proposta", async () => {
    const d = deps();
    const v = ok({ proposalData: { ...data, partner: { isNew: false, existingId: PAR } } });
    expect((await updatePendingProposal(d, input(v, ["org1", "org2"]))).status).toBe(400);
    expect(d.save).not.toHaveBeenCalled();
  });

  it("409 se la proposta viene decisa mentre si salva", async () => {
    const d = deps({ save: vi.fn(async () => null) });
    expect((await updatePendingProposal(d, input(ok({ proposalData: data })))).status).toBe(409);
  });
});
