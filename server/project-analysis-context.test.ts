import { describe, it, expect, vi } from "vitest";
import {
  buildProjectAnalysisContext,
  parseMaxChars,
  DEFAULT_MAX_CHARS,
  MAX_MAX_CHARS,
  type AnalysisMessage,
  type ProjectAnalysisDeps,
} from "./project-analysis-context";

const message: AnalysisMessage = {
  id: "m1",
  organizationId: "o1",
  subject: "Nuovo sviluppo ABAP",
  fromEmail: "cliente@acme.it",
  fromName: "Cliente",
  toEmail: "io@thu.it",
  receivedAt: "2026-11-17T10:00:00.000Z",
  threadId: "t1",
  attachments: ["specifica.xlsx", "logo.png"],
  projectId: null,
  taskId: null,
  partnerId: null,
  body: "corpo testuale",
  htmlBody: null,
};

function makeDeps(overrides: Partial<ProjectAnalysisDeps> = {}): ProjectAnalysisDeps {
  return {
    getMessage: async (id) => (id === "m1" ? message : undefined),
    analysisText: (m) => m.body ?? "",
    attachmentText: async (_id, filename) => (filename.endsWith(".xlsx") ? "riga1;riga2" : null),
    projects: async (org) => [{ id: `p-${org}`, name: "Progetto", status: "active", clientId: "pa1", parentProjectId: null, budget: "1000" } as any],
    partners: async (org) => [{ id: `pa-${org}`, name: "Acme", company: "Acme SpA", email: "info@acme.it", domain: "acme.it", type: "client", notes: "riservato" } as any],
    contacts: async (org) => [{ id: `c-${org}`, name: "Mario", email: "mario@acme.it", partnerId: "pa1", phone: "333" } as any],
    tasks: async (org) => [{ id: `t-${org}`, title: "Analisi", status: "todo", projectId: "p1", description: "lunga" } as any],
    proposals: async () => [
      { id: "pr1", status: "pending", modelKey: "botcave", proposalData: { processing: true }, createdAt: "2026-11-17T11:00:00.000Z" },
      { id: "pr0", status: "rejected", modelKey: null, proposalData: { project: {} }, createdAt: "2026-11-16T11:00:00.000Z" },
    ],
    ...overrides,
  };
}

describe("parseMaxChars", () => {
  it("assente → predefinito", () => {
    expect(parseMaxChars(undefined)).toBe(DEFAULT_MAX_CHARS);
  });
  it("valori validi", () => {
    expect(parseMaxChars("1")).toBe(1);
    expect(parseMaxChars(String(MAX_MAX_CHARS))).toBe(MAX_MAX_CHARS);
  });
  it("valori non validi → null", () => {
    for (const raw of ["0", "-5", "abc", "1.5", "", String(MAX_MAX_CHARS + 1), ["10"]]) {
      expect(parseMaxChars(raw)).toBeNull();
    }
  });
});

describe("buildProjectAnalysisContext", () => {
  const input = { organizationIds: ["o1"], messageId: "m1", maxChars: DEFAULT_MAX_CHARS };

  it("messaggio inesistente → null", async () => {
    expect(await buildProjectAnalysisContext(makeDeps(), { ...input, messageId: "nope" })).toBeNull();
  });

  it("messaggio di un'altra organizzazione → null, senza leggere l'anagrafica", async () => {
    const projects = vi.fn(async () => []);
    const result = await buildProjectAnalysisContext(makeDeps({ projects }), { ...input, organizationIds: ["o2"] });
    expect(result).toBeNull();
    expect(projects).not.toHaveBeenCalled();
  });

  it("messaggio senza organizzazione → null", async () => {
    const deps = makeDeps({ getMessage: async () => ({ ...message, organizationId: null }) });
    expect(await buildProjectAnalysisContext(deps, input)).toBeNull();
  });

  it("assembla messaggio, allegati, anagrafica e proposte", async () => {
    const result = await buildProjectAnalysisContext(makeDeps(), input);
    expect(result?.message).toMatchObject({ id: "m1", organizationId: "o1", subject: "Nuovo sviluppo ABAP", body: "corpo testuale", bodyTruncated: false });
    expect(result?.attachments).toEqual([
      { filename: "specifica.xlsx", text: "riga1;riga2", truncated: false },
      { filename: "logo.png", text: null, truncated: false },
    ]);
    expect(result?.proposals).toEqual([
      { id: "pr1", status: "pending", modelKey: "botcave", processing: true, createdAt: "2026-11-17T11:00:00.000Z" },
      { id: "pr0", status: "rejected", modelKey: null, processing: false, createdAt: "2026-11-16T11:00:00.000Z" },
    ]);
  });

  it("anagrafica solo dell'organizzazione del messaggio, anche se chi chiama ne vede altre", async () => {
    const result = await buildProjectAnalysisContext(makeDeps(), { ...input, organizationIds: ["o2", "o1"] });
    expect(result?.existing.projects.map((p) => p.id)).toEqual(["p-o1"]);
    expect(result?.existing.partners.map((p) => p.id)).toEqual(["pa-o1"]);
    expect(result?.existing.contacts.map((c) => c.id)).toEqual(["c-o1"]);
    expect(result?.existing.tasks.map((t) => t.id)).toEqual(["t-o1"]);
  });

  it("anagrafica ridotta ai campi per riconoscere gli oggetti", async () => {
    const result = await buildProjectAnalysisContext(makeDeps(), input);
    expect(result?.existing.projects[0]).toEqual({ id: "p-o1", name: "Progetto", status: "active", clientId: "pa1", parentProjectId: null });
    expect(result?.existing.partners[0]).not.toHaveProperty("notes");
    expect(result?.existing.contacts[0]).not.toHaveProperty("phone");
    expect(result?.existing.tasks[0]).not.toHaveProperty("description");
  });

  it("usa il testo di analisi (HTML ripulito) e non il corpo grezzo", async () => {
    const deps = makeDeps({ analysisText: () => "testo dall'HTML" });
    const result = await buildProjectAnalysisContext(deps, input);
    expect(result?.message.body).toBe("testo dall'HTML");
    expect(result?.message).not.toHaveProperty("htmlBody");
  });

  it("maxChars tronca corpo e ogni allegato", async () => {
    const deps = makeDeps({ analysisText: () => "0123456789", attachmentText: async () => "abcdefghij" });
    const result = await buildProjectAnalysisContext(deps, { ...input, maxChars: 4 });
    expect(result?.message).toMatchObject({ body: "0123", bodyTruncated: true });
    expect(result?.attachments[0]).toEqual({ filename: "specifica.xlsx", text: "abcd", truncated: true });
  });

  it("un allegato che fallisce non blocca l'analisi", async () => {
    const deps = makeDeps({
      attachmentText: async (_id, filename) => {
        if (filename === "specifica.xlsx") throw new Error("file corrotto");
        return "ok";
      },
    });
    const result = await buildProjectAnalysisContext(deps, input);
    expect(result?.attachments).toEqual([
      { filename: "specifica.xlsx", text: null, truncated: false },
      { filename: "logo.png", text: "ok", truncated: false },
    ]);
  });

  it("messaggio senza allegati → elenco vuoto", async () => {
    const deps = makeDeps({ getMessage: async () => ({ ...message, attachments: null }) });
    expect((await buildProjectAnalysisContext(deps, input))?.attachments).toEqual([]);
  });
});
