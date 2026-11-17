import { describe, it, expect, vi } from "vitest";
import {
  readProjectBrief,
  updateProjectBrief,
  MAX_DECISIONS,
  MAX_BRIEF_CHARS,
  type ProjectBriefDeps,
  type StoredPack,
} from "./project-brief";

const P1 = "11111111-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
const T_OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-17T10:00:00.000Z");
const PACK_TIME = "2026-11-10T08:00:00.000Z";

const project = { id: P1, organizationId: "o1", name: "Evolutive SD" };

function pack(over: Partial<StoredPack> = {}): StoredPack {
  return {
    id: "pk1",
    organizationId: "o1",
    brief: "Brief vecchio",
    conventions: "Prefisso Z_SD",
    decisions: [{ date: "2026-11-01", text: "Si usa la BAPI standard" }],
    glossary: { OdV: "Ordine di vendita" },
    updatedAt: new Date(PACK_TIME),
    updatedBy: "u1",
    ...over,
  };
}

function deps(state: { pack?: StoredPack | null } = {}, over: Partial<ProjectBriefDeps> = {}) {
  let current = state.pack === undefined ? pack() : state.pack;
  const savePack = vi.fn<ProjectBriefDeps["savePack"]>(async (organizationId, _projectId, existingId, values) => {
    current = {
      id: existingId ?? "pk-new",
      organizationId,
      brief: values.brief,
      conventions: current?.conventions ?? null,
      decisions: values.decisions,
      glossary: current?.glossary ?? {},
      updatedAt: values.updatedAt,
      updatedBy: values.updatedBy,
    };
    return current;
  });
  const getChangedTasks = vi.fn<ProjectBriefDeps["getChangedTasks"]>(async () => [
    { id: T1, projectId: P1, title: "Nuovo campo", status: "completed", updatedAt: new Date("2026-11-16T09:00:00Z") },
  ]);
  const d: ProjectBriefDeps = {
    getProject: async (id) => (id === P1 ? project : null),
    getPack: async () => current,
    getChangedTasks,
    getTask: async (id) => (id === T1 ? { id: T1, projectId: P1 } : id === T_OTHER ? { id: T_OTHER, projectId: "altro" } : null),
    savePack,
    now: () => NOW,
    ...over,
  };
  return { d, savePack, getChangedTasks };
}

describe("readProjectBrief", () => {
  it("restituisce brief, decisioni e i task cambiati dopo l'ultimo aggiornamento", async () => {
    const { d, getChangedTasks } = deps();
    const r = await readProjectBrief(d, { projectId: P1, organizationIds: ["o1"] });
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body).toMatchObject({
      projectId: P1,
      organizationId: "o1",
      brief: "Brief vecchio",
      updatedAt: PACK_TIME,
      updatedBy: "u1",
      updatedByAgent: false,
    });
    expect(body.changedTasksSinceUpdate).toEqual([
      { id: T1, title: "Nuovo campo", status: "completed", updatedAt: "2026-11-16T09:00:00.000Z" },
    ]);
    expect(getChangedTasks).toHaveBeenCalledWith(P1, new Date(PACK_TIME), 20);
  });

  it("senza context pack: brief vuoto, updatedAt null e tutti i task", async () => {
    const { d, getChangedTasks } = deps({ pack: null });
    const r = await readProjectBrief(d, { projectId: P1, organizationIds: ["o1"] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ brief: "", decisions: [], updatedAt: null, updatedBy: null });
    expect(getChangedTasks).toHaveBeenCalledWith(P1, null, 20);
  });

  it("progetto fuori perimetro o inesistente: 404", async () => {
    const { d } = deps();
    expect((await readProjectBrief(d, { projectId: P1, organizationIds: ["o2"] })).status).toBe(404);
    expect((await readProjectBrief(d, { projectId: "nope", organizationIds: ["o1"] })).status).toBe(404);
  });
});

describe("updateProjectBrief", () => {
  const base = { projectId: P1, organizationIds: ["o1"], updatedBy: "agent" };

  it("salva il brief dell'agente e aggiunge le decisioni col task di origine", async () => {
    const { d, savePack } = deps();
    const r = await updateProjectBrief(d, {
      ...base,
      body: { brief: "  Brief nuovo  ", newDecisions: ["Campo in VBAK"], sourceTaskId: T1, expectedUpdatedAt: PACK_TIME },
    });
    expect(r.status).toBe(200);
    expect(savePack).toHaveBeenCalledWith("o1", P1, "pk1", {
      brief: "Brief nuovo",
      decisions: [
        { date: "2026-11-01", text: "Si usa la BAPI standard" },
        { date: "2026-11-17", text: "Campo in VBAK", sourceTaskId: T1 },
      ],
      updatedAt: NOW,
      updatedBy: "agent",
    });
    expect(r.body).toMatchObject({ brief: "Brief nuovo", updatedByAgent: true, updatedAt: NOW.toISOString() });
  });

  it("crea il context pack se non c'è (expectedUpdatedAt null)", async () => {
    const { d, savePack } = deps({ pack: null });
    const r = await updateProjectBrief(d, { ...base, body: { brief: "Primo brief", expectedUpdatedAt: null } });
    expect(r.status).toBe(200);
    expect(savePack).toHaveBeenCalledWith("o1", P1, null, expect.objectContaining({ brief: "Primo brief", decisions: [] }));
  });

  it("brief cambiato dopo la lettura: 409 col brief attuale e nessuna scrittura", async () => {
    const { d, savePack } = deps();
    const r = await updateProjectBrief(d, {
      ...base,
      body: { brief: "x", expectedUpdatedAt: "2026-11-09T08:00:00.000Z" },
    });
    expect(r.status).toBe(409);
    expect((r.body as any).current.brief).toBe("Brief vecchio");
    expect(savePack).not.toHaveBeenCalled();
  });

  it("expectedUpdatedAt null ma il pack esiste già: 409", async () => {
    const { d, savePack } = deps();
    const r = await updateProjectBrief(d, { ...base, body: { brief: "x", expectedUpdatedAt: null } });
    expect(r.status).toBe(409);
    expect(savePack).not.toHaveBeenCalled();
  });

  it("senza expectedUpdatedAt scrive comunque", async () => {
    const { d, savePack } = deps();
    expect((await updateProjectBrief(d, { ...base, body: { brief: "x" } })).status).toBe(200);
    expect(savePack).toHaveBeenCalledTimes(1);
  });

  it("le decisioni restano al massimo MAX_DECISIONS, uscono le più vecchie", async () => {
    const old = Array.from({ length: MAX_DECISIONS }, (_, i) => ({ date: "2026-01-01", text: `d${i}` }));
    const { d, savePack } = deps({ pack: pack({ decisions: old }) });
    await updateProjectBrief(d, { ...base, body: { brief: "x", newDecisions: ["nuova1", "nuova2"] } });
    const saved = savePack.mock.calls[0][3].decisions;
    expect(saved).toHaveLength(MAX_DECISIONS);
    expect(saved[0].text).toBe("d2");
    expect(saved.at(-1)).toEqual({ date: "2026-11-17", text: "nuova2" });
  });

  it("sourceTaskId di un altro progetto o inesistente: 400", async () => {
    const { d, savePack } = deps();
    for (const sourceTaskId of [T_OTHER, "44444444-4444-4444-8444-444444444444"]) {
      const r = await updateProjectBrief(d, { ...base, body: { brief: "x", sourceTaskId } });
      expect(r.status).toBe(400);
    }
    expect(savePack).not.toHaveBeenCalled();
  });

  it("corpo non valido: 400 (brief vuoto, troppo lungo, campi sconosciuti, data non valida)", async () => {
    const { d, savePack } = deps();
    const bodies = [
      {},
      { brief: "   " },
      { brief: "a".repeat(MAX_BRIEF_CHARS + 1) },
      { brief: "x", decisions: [] },
      { brief: "x", expectedUpdatedAt: "ieri" },
      { brief: "x", newDecisions: ["a", "b", "c", "d", "e", "f"] },
      null,
    ];
    for (const body of bodies) {
      expect((await updateProjectBrief(d, { ...base, body })).status).toBe(400);
    }
    expect(savePack).not.toHaveBeenCalled();
  });

  it("progetto fuori perimetro: 404 senza scrivere", async () => {
    const { d, savePack } = deps();
    const r = await updateProjectBrief(d, { ...base, organizationIds: ["o2"], body: { brief: "x" } });
    expect(r.status).toBe(404);
    expect(savePack).not.toHaveBeenCalled();
  });
});
