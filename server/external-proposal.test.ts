import { describe, it, expect, vi } from "vitest";
import { parseExternalProposal, existingRefs, createExternalProposal, type ExternalProposalDeps } from "./external-proposal";

const MSG = "11111111-1111-4111-8111-111111111111";
const PRJ = "22222222-2222-4222-8222-222222222222";
const PAR = "33333333-3333-4333-8333-333333333333";
const TSK = "44444444-4444-4444-8444-444444444444";

const data = {
  reasoning: "  richiesta di sviluppo di un report  ",
  project: { isNew: false, existingId: PRJ, name: "Progetto" },
  partner: { isNew: true, name: "Cliente Srl", type: "client" },
  tasks: [
    { isNew: true, title: "Analisi", description: "", priority: "medium", taskType: "analysis" },
    { isNew: false, existingId: TSK, title: "Esistente" },
  ],
  contacts: [{ name: "Mario", email: "m@example.com" }],
};

describe("parseExternalProposal", () => {
  it("proposta valida: reasoning ripulito, modelKey facoltativo", () => {
    const r = parseExternalProposal({ proposalData: data, modelKey: "botcave/smistatore" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.modelKey).toBe("botcave/smistatore");
    expect(r.value.proposalData.reasoning).toBe("richiesta di sviluppo di un report");
    expect(r.value.proposalData.tasks).toEqual(data.tasks);
    const senza = parseExternalProposal({ proposalData: data });
    expect(senza.ok && "modelKey" in senza.value).toBe(false);
  });

  it("basta un solo task", () => {
    expect(parseExternalProposal({ proposalData: { reasoning: "x", tasks: [data.tasks[0]] } }).ok).toBe(true);
  });

  it("toglie i campi di servizio processing e failed", () => {
    const r = parseExternalProposal({ proposalData: { ...data, processing: true, failed: true } });
    expect(r.ok && ("processing" in r.value.proposalData || "failed" in r.value.proposalData)).toBe(false);
  });

  it("rifiuta corpi non validi", () => {
    const bad: unknown[] = [
      null, "x", [], {}, { proposalData: [] }, { proposalData: "x" },
      { proposalData: { ...data, reasoning: "" } },
      { proposalData: { ...data, reasoning: "   " } },
      { proposalData: { ...data, reasoning: "x".repeat(10_001) } },
      { proposalData: { reasoning: "solo motivo" } },
      { proposalData: { reasoning: "x", tasks: [] } },
      { proposalData: { ...data, project: "p" } },
      { proposalData: { ...data, project: { name: "senza isNew" } } },
      { proposalData: { ...data, project: { isNew: true, name: "" } } },
      { proposalData: { ...data, project: { isNew: false, existingId: "42" } } },
      { proposalData: { ...data, partner: { isNew: false } } },
      { proposalData: { ...data, tasks: { isNew: true, title: "t" } } },
      { proposalData: { ...data, tasks: [{ isNew: true }] } },
      { proposalData: { ...data, tasks: Array(51).fill(data.tasks[0]) } },
      { proposalData: { ...data, contacts: "m@example.com" } },
      { proposalData: { ...data, reasoningExtra: "x".repeat(200_001) } },
      { proposalData: data, modelKey: "" },
      { proposalData: data, modelKey: 42 },
      { proposalData: data, modelKey: "con spazi" },
    ];
    for (const b of bad) expect(parseExternalProposal(b).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
  });
});

describe("existingRefs", () => {
  it("elenca progetto, partner e task esistenti", () => {
    expect(existingRefs(data)).toEqual([
      { table: "projects", id: PRJ },
      { table: "tasks", id: TSK },
    ]);
    expect(existingRefs({ ...data, partner: { isNew: false, existingId: PAR } })).toContainEqual({ table: "partners", id: PAR });
  });
});

function deps(over: Partial<ExternalProposalDeps> = {}) {
  const orgs: Record<string, string> = { [MSG]: "org1", [PRJ]: "org1", [TSK]: "org1", [PAR]: "org2" };
  return {
    messageOrg: vi.fn(async (id: string) => orgs[id] ?? null),
    recordOrg: vi.fn(async (_t: string, id: string) => orgs[id] ?? null),
    proposalsByMessage: vi.fn(async () => [] as Array<{ id: string; status: string; proposalData: unknown }>),
    create: vi.fn(async (input: any) => ({ id: "p-new", ...input })),
    ...over,
  };
}

const parsed = (d: Record<string, unknown> = data, modelKey?: string) => {
  const r = parseExternalProposal({ proposalData: d, modelKey });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("createExternalProposal", () => {
  it("crea la proposta pending nell'organizzazione del messaggio", async () => {
    const d = deps();
    const r = await createExternalProposal(d, { userId: "u1", messageId: MSG, organizationIds: ["org0", "org1"], proposal: parsed(data, "botcave/x") });
    expect(r.status).toBe(201);
    expect(d.create).toHaveBeenCalledWith({
      userId: "u1", organizationId: "org1", messageId: MSG, status: "pending",
      proposalData: parsed().proposalData, modelKey: "botcave/x",
    });
    expect(r.body.id).toBe("p-new");
  });

  it("404 se il messaggio non esiste o è fuori perimetro", async () => {
    for (const [messageId, organizationIds] of [[MSG, ["org2"]], [PAR + "0", ["org1"]]] as const) {
      const d = deps();
      const r = await createExternalProposal(d, { userId: "u1", messageId, organizationIds: [...organizationIds], proposal: parsed() });
      expect(r.status).toBe(404);
      expect(d.create).not.toHaveBeenCalled();
    }
  });

  it("400 se un oggetto esistente citato non è nell'organizzazione del messaggio", async () => {
    const d = deps();
    const r = await createExternalProposal(d, {
      userId: "u1", messageId: MSG, organizationIds: ["org1", "org2"],
      proposal: parsed({ ...data, partner: { isNew: false, existingId: PAR } }),
    });
    expect(r.status).toBe(400);
    expect(d.create).not.toHaveBeenCalled();
  });

  it("409 con l'id se c'è già una proposta in attesa; le fallite e le chiuse non contano", async () => {
    const d = deps({ proposalsByMessage: vi.fn(async () => [{ id: "p-old", status: "pending", proposalData: { reasoning: "x" } }]) });
    const r = await createExternalProposal(d, { userId: "u1", messageId: MSG, organizationIds: ["org1"], proposal: parsed() });
    expect(r).toEqual({ status: 409, body: { error: expect.any(String), proposalId: "p-old" } });
    expect(d.create).not.toHaveBeenCalled();

    const d2 = deps({ proposalsByMessage: vi.fn(async () => [
      { id: "p-failed", status: "pending", proposalData: { processing: false, failed: true } },
      { id: "p-done", status: "accepted", proposalData: { reasoning: "x" } },
    ]) });
    const r2 = await createExternalProposal(d2, { userId: "u1", messageId: MSG, organizationIds: ["org1"], proposal: parsed() });
    expect(r2.status).toBe(201);
  });
});
