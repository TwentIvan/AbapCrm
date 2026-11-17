import { describe, it, expect } from "vitest";
import {
  buildAssembledContext,
  type AssembledContextDeps,
  type ContextPackData,
  type ContextProject,
  type ContextTask,
} from "./assembled-context";

function makeDeps(data: {
  tasks?: ContextTask[];
  projects?: ContextProject[];
  projectPacks?: { organizationId: string; projectId: string; pack: ContextPackData }[];
  orgPacks?: { organizationId: string; pack: ContextPackData }[];
}) {
  const calls = { projectPacks: [] as string[], orgPacks: [] as string[] };
  const deps: AssembledContextDeps = {
    getTask: async id => data.tasks?.find(t => t.id === id) ?? null,
    getProject: async id => data.projects?.find(p => p.id === id) ?? null,
    getProjectPack: async (org, projectId) => {
      calls.projectPacks.push(`${org}/${projectId}`);
      return data.projectPacks?.find(p => p.organizationId === org && p.projectId === projectId)?.pack ?? null;
    },
    getOrganizationPack: async org => {
      calls.orgPacks.push(org);
      return data.orgPacks?.find(p => p.organizationId === org)?.pack ?? null;
    },
  };
  return { deps, calls };
}

const task: ContextTask = { id: "t1", title: "Fix stampa", description: "Correggere la stampa", projectId: "p1", organizationId: "o1" };
const p1: ContextProject = { id: "p1", name: "Stampe", parentProjectId: "p0", organizationId: "o1" };
const p0: ContextProject = { id: "p0", name: "Cliente", description: "Progetto radice", parentProjectId: null, organizationId: "o1" };

describe("buildAssembledContext: perimetro della richiesta", () => {
  it("task inesistente → null", async () => {
    const { deps } = makeDeps({});
    expect(await buildAssembledContext(deps, { taskId: "x", organizationIds: ["o1"] })).toBeNull();
    expect(await buildAssembledContext(deps, { taskId: "x" })).toBeNull();
  });

  it("task di un'organizzazione fuori perimetro → null, senza leggere progetti e pack", async () => {
    const { deps, calls } = makeDeps({ tasks: [task], projects: [p1, p0] });
    expect(await buildAssembledContext(deps, { taskId: "t1", organizationIds: ["o2"] })).toBeNull();
    expect(calls.projectPacks).toEqual([]);
    expect(calls.orgPacks).toEqual([]);
  });

  it("perimetro vuoto → null", async () => {
    const { deps } = makeDeps({ tasks: [task] });
    expect(await buildAssembledContext(deps, { taskId: "t1", organizationIds: [] })).toBeNull();
  });

  it("task senza organizzazione → null", async () => {
    const { deps } = makeDeps({ tasks: [{ ...task, organizationId: null }] });
    expect(await buildAssembledContext(deps, { taskId: "t1", organizationIds: ["o1"] })).toBeNull();
  });

  it("task nel perimetro (anche tra più organizzazioni) → contesto", async () => {
    const { deps } = makeDeps({ tasks: [task] });
    const ctx = await buildAssembledContext(deps, { taskId: "t1", organizationIds: ["o2", "o1"] });
    expect(ctx?.text).toContain("## TASK: Fix stampa");
    expect(ctx?.text).toContain("Correggere la stampa");
  });

  it("senza perimetro (uso interno) → contesto del task", async () => {
    const { deps } = makeDeps({ tasks: [task] });
    const ctx = await buildAssembledContext(deps, { taskId: "t1" });
    expect(ctx?.sections.map(s => s.label)).toEqual(["task"]);
  });
});

describe("buildAssembledContext: solo dati dell'organizzazione del task", () => {
  it("catena dei progetti e pack dell'organizzazione del task", async () => {
    const { deps, calls } = makeDeps({
      tasks: [task],
      projects: [p1, p0],
      projectPacks: [
        { organizationId: "o1", projectId: "p1", pack: { brief: "Brief stampe", decisions: [{ date: "2026-11-01", text: "Usare SFP" }], conventions: "Prefisso Z" } },
        { organizationId: "o1", projectId: "p0", pack: { brief: "Brief cliente" } },
      ],
      orgPacks: [{ organizationId: "o1", pack: { conventions: "Naming Derga", glossary: { GAP: "sviluppo" } } }],
    });
    const ctx = await buildAssembledContext(deps, { taskId: "t1", organizationIds: ["o1"] });
    expect(ctx?.sections.map(s => s.label)).toEqual(["task", "progetto:Stampe", "progetto-padre-L1:Cliente", "organizzazione"]);
    expect(ctx?.text).toContain("Brief stampe");
    expect(ctx?.text).toContain("- 2026-11-01: Usare SFP");
    expect(ctx?.text).toContain("Prefisso Z");
    expect(ctx?.text).toContain("Brief cliente");
    expect(ctx?.text).toContain("Naming Derga");
    expect(ctx?.text).toContain("GAP=sviluppo");
    expect(calls.projectPacks).toEqual(["o1/p1", "o1/p0"]);
    expect(calls.orgPacks).toEqual(["o1"]);
    expect(ctx?.tokensUsed).toBe(ctx!.sections.reduce((s, x) => s + x.tokens, 0));
  });

  it("progetto del task di un'altra organizzazione → nessun progetto nel contesto", async () => {
    const { deps, calls } = makeDeps({
      tasks: [task],
      projects: [{ ...p1, organizationId: "o2" }, p0],
      projectPacks: [{ organizationId: "o2", projectId: "p1", pack: { brief: "Segreto o2" } }],
    });
    const ctx = await buildAssembledContext(deps, { taskId: "t1", organizationIds: ["o1", "o2"] });
    expect(ctx?.sections.map(s => s.label)).toEqual(["task"]);
    expect(ctx?.text).not.toContain("Segreto o2");
    expect(calls.projectPacks).toEqual([]);
  });

  it("progetto padre di un'altra organizzazione → la catena si ferma prima", async () => {
    const { deps } = makeDeps({
      tasks: [task],
      projects: [p1, { ...p0, organizationId: "o2", description: "Segreto o2" }],
    });
    const ctx = await buildAssembledContext(deps, { taskId: "t1" });
    expect(ctx?.sections.map(s => s.label)).toEqual(["task", "progetto:Stampe"]);
    expect(ctx?.text).not.toContain("Segreto o2");
  });

  it("pack del progetto di un'altra organizzazione → ignorato", async () => {
    const { deps } = makeDeps({
      tasks: [task],
      projects: [{ ...p1, parentProjectId: null }],
      projectPacks: [{ organizationId: "o2", projectId: "p1", pack: { brief: "Segreto o2" } }],
    });
    const ctx = await buildAssembledContext(deps, { taskId: "t1" });
    expect(ctx?.text).toContain("## PROGETTO: Stampe");
    expect(ctx?.text).not.toContain("Segreto o2");
  });

  it("pack di un'altra organizzazione → nessuna sezione organizzazione", async () => {
    const { deps } = makeDeps({
      tasks: [task],
      orgPacks: [{ organizationId: "o2", pack: { conventions: "Segreto o2" } }],
    });
    const ctx = await buildAssembledContext(deps, { taskId: "t1" });
    expect(ctx?.sections.map(s => s.label)).toEqual(["task"]);
    expect(ctx?.text).not.toContain("Segreto o2");
  });

  it("ciclo nella gerarchia dei progetti → ogni progetto una volta sola", async () => {
    const { deps } = makeDeps({
      tasks: [task],
      projects: [p1, { ...p0, parentProjectId: "p1" }],
    });
    const ctx = await buildAssembledContext(deps, { taskId: "t1" });
    expect(ctx?.sections.map(s => s.label)).toEqual(["task", "progetto:Stampe", "progetto-padre-L1:Cliente"]);
  });
});
