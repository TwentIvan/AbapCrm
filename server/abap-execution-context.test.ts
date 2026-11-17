import { describe, it, expect } from "vitest";
import {
  abapExecutionContext,
  isProductionSystem,
  MAX_COMMENT_CHARS,
  MAX_COMMENTS,
  type AbapExecutionDeps,
  type StoredSapSystem,
} from "./abap-execution-context";

const task = {
  id: "t1",
  organizationId: "o1",
  title: "Report ZSD_ORDINI: nuovo campo",
  description: "Aggiungere il campo cliente finale",
  status: "todo",
  priority: "high",
  taskType: "development",
  projectId: "p1",
  sapSystemId: null as string | null,
  externalWorkItemId: "1174",
  externalSystem: "azure_devops",
  externalWorkItemUrl: "https://dev.azure.com/x/_workitems/edit/1174",
  dueDate: null,
  estimatedEffort: 8,
  remainingEffort: 8,
  completionPercentage: 0,
  aiSpec: null,
};

const project = { id: "p1", organizationId: "o1", name: "Evolutive SD", description: "CR del 2026", clientId: "c1" };

function system(over: Partial<StoredSapSystem> & { id: string }): StoredSapSystem & Record<string, unknown> {
  return {
    organizationId: "o1",
    partnerId: "c1",
    name: over.id.toUpperCase(),
    systemId: over.id.toUpperCase(),
    systemType: "s4hana",
    status: "active",
    systemNumber: "00",
    sapReleaseVersion: "757",
    landscapeType: "development",
    landscapeLevel: 1,
    connectionType: "sapgui",
    isActive: true,
    // campi che non devono uscire
    serverHost: "10.0.0.1",
    sapRouterString: "/H/router/S/3299",
    defaultPassword: "segreto",
    ...over,
  };
}

const dev = system({ id: "dev", landscapeLevel: 1 });
const qas = system({ id: "qas", landscapeLevel: 3, landscapeType: "quality" });
const prd = system({ id: "prd", landscapeLevel: 5, landscapeType: "production" });
const otherOrg = system({ id: "alt", organizationId: "o2", landscapeLevel: 0 });

function deps(over: Partial<AbapExecutionDeps> = {}, t: typeof task = task) {
  const systems = [dev, qas, prd, otherOrg];
  const d: AbapExecutionDeps = {
    getTask: async (id) => (id === t.id ? t : null),
    getProject: async (id) => (id === project.id ? project : null),
    getSapSystem: async (id) => systems.find((s) => s.id === id) ?? null,
    getPartnerSapSystems: async (partnerId) => systems.filter((s) => s.partnerId === partnerId),
    getTransports: async () => [],
    getComments: async () => [],
    ...over,
  };
  return d;
}

const input = { taskId: "t1", organizationIds: ["o1"] };

describe("abapExecutionContext", () => {
  it("task fuori dalle organizzazioni della richiesta → 404", async () => {
    const r = await abapExecutionContext(deps(), { taskId: "t1", organizationIds: ["o2"] });
    expect(r).toEqual({ status: 404, body: { error: "task non trovato" } });
  });

  it("task inesistente → 404", async () => {
    const r = await abapExecutionContext(deps(), { taskId: "zz", organizationIds: ["o1"] });
    expect(r.status).toBe(404);
  });

  it("senza sistema sul task usa il default del partner: il livello più basso della stessa organizzazione", async () => {
    const r = await abapExecutionContext(deps(), input);
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.body.sapSystem).toMatchObject({ id: "dev", sid: "DEV", source: "partner-default", landscapeLevel: 1 });
    expect(r.body.readiness).toEqual({ ready: true, blockers: [] });
    expect(r.body.execution).toEqual({
      runner: "botcave-local-node",
      sapSystemId: "dev",
      agentRunsPath: "/api/tasks/t1/agent-runs",
    });
    expect(r.body.task).toMatchObject({ id: "t1", externalWorkItemId: "1174", taskType: "development" });
    expect(r.body.project).toEqual({ id: "p1", name: "Evolutive SD", description: "CR del 2026" });
  });

  it("nessun segreto né host del sistema SAP nel pacchetto", async () => {
    const r = await abapExecutionContext(deps(), input);
    const json = JSON.stringify(r.body);
    expect(json).not.toContain("10.0.0.1");
    expect(json).not.toContain("router");
    expect(json).not.toContain("segreto");
    if (r.status === 200) expect(r.body.task).not.toHaveProperty("sapSystemId");
  });

  it("l'override del task vince sul default del partner", async () => {
    const r = await abapExecutionContext(deps({}, { ...task, sapSystemId: "qas" }), input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.sapSystem).toMatchObject({ id: "qas", source: "task" });
    expect(r.body.readiness.ready).toBe(true);
  });

  it("override su un sistema di un'altra organizzazione → nessun sistema, bloccato", async () => {
    const r = await abapExecutionContext(deps({}, { ...task, sapSystemId: "alt" }), input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.sapSystem).toBeNull();
    expect(r.body.readiness).toEqual({ ready: false, blockers: ["no_sap_system"] });
    expect(r.body.execution.sapSystemId).toBeNull();
  });

  it("sistema produttivo o inattivo e task completato bloccano l'esecuzione", async () => {
    const r = await abapExecutionContext(deps({}, { ...task, sapSystemId: "prd", status: "completed" }), input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.readiness.blockers).toEqual(["task_completed", "sap_system_production"]);

    const inactive = system({ id: "dev", status: "maintenance" });
    const r2 = await abapExecutionContext(
      deps({ getPartnerSapSystems: async () => [inactive], getSapSystem: async () => inactive }),
      input,
    );
    if (r2.status !== 200) throw new Error("atteso 200");
    // il default del partner considera solo i sistemi attivi (isActive), lo stato «maintenance» blocca
    expect(r2.body.readiness.blockers).toEqual(["sap_system_inactive"]);
  });

  it("senza progetto né sistema sul task → no_sap_system; progetto di un'altra organizzazione ignorato", async () => {
    const r = await abapExecutionContext(deps({}, { ...task, projectId: null }), input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.project).toBeNull();
    expect(r.body.readiness.blockers).toEqual(["no_sap_system"]);

    const r2 = await abapExecutionContext(
      deps({ getProject: async () => ({ ...project, organizationId: "o2" }) }),
      input,
    );
    if (r2.status !== 200) throw new Error("atteso 200");
    expect(r2.body.project).toBeNull();
    expect(r2.body.sapSystem).toBeNull();
  });

  it("trasporti del task e del progetto, solo su sistemi dell'organizzazione, i più recenti prima", async () => {
    const calls: Array<[string, string | null]> = [];
    const r = await abapExecutionContext(
      deps({
        getTransports: async (taskId, projectId) => {
          calls.push([taskId, projectId]);
          return [
            { id: "x1", taskId: null, sapSystemId: "dev", requestNumber: "DEVK900001", description: "vecchio", type: "workbench", status: "released", includedObjects: null, createdAt: "2026-01-01T00:00:00Z" },
            { id: "x2", taskId: "t1", sapSystemId: "dev", requestNumber: "DEVK900002", description: "del task", type: "workbench", status: "development", includedObjects: ["PROG ZSD_ORDINI"], createdAt: "2026-11-01T00:00:00Z" },
            { id: "x3", taskId: "t1", sapSystemId: "alt", requestNumber: "ALTK900003", description: "altra org", type: "workbench", status: "development", includedObjects: [], createdAt: "2026-11-02T00:00:00Z" },
          ];
        },
      }),
      input,
    );
    if (r.status !== 200) throw new Error("atteso 200");
    expect(calls).toEqual([["t1", "p1"]]);
    expect(r.body.transports).toEqual([
      { requestNumber: "DEVK900002", description: "del task", type: "workbench", status: "development", includedObjects: ["PROG ZSD_ORDINI"], scope: "task" },
      { requestNumber: "DEVK900001", description: "vecchio", type: "workbench", status: "released", includedObjects: [], scope: "project" },
    ]);
  });

  it("commenti in ordine cronologico, gli ultimi MAX_COMMENTS, ognuno troncato", async () => {
    const rows = Array.from({ length: MAX_COMMENTS + 5 }, (_, i) => ({
      id: `c${i}`,
      content: i === MAX_COMMENTS + 4 ? "x".repeat(MAX_COMMENT_CHARS + 10) : `commento ${i}`,
      isInternal: i % 2 === 0,
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
    })).reverse();
    const r = await abapExecutionContext(deps({ getComments: async () => rows }), input);
    if (r.status !== 200) throw new Error("atteso 200");
    expect(r.body.comments).toHaveLength(MAX_COMMENTS);
    expect(r.body.comments[0].id).toBe("c5");
    expect(r.body.comments.at(-1)!.id).toBe(`c${MAX_COMMENTS + 4}`);
    expect(r.body.comments.at(-1)!.content).toHaveLength(MAX_COMMENT_CHARS);
  });
});

describe("isProductionSystem", () => {
  it("il livello ha la precedenza sul tipo (che nasce «production» di predefinito)", () => {
    expect(isProductionSystem({ landscapeLevel: 1, landscapeType: "production" })).toBe(false);
    expect(isProductionSystem({ landscapeLevel: 5, landscapeType: "development" })).toBe(true);
    expect(isProductionSystem({ landscapeLevel: null, landscapeType: "production" })).toBe(true);
    expect(isProductionSystem({ landscapeLevel: null, landscapeType: "quality" })).toBe(false);
  });
});
