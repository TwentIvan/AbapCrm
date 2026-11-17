import { describe, it, expect, vi } from "vitest";
import {
  parseAgentRun,
  runValues,
  recordAgentRun,
  listAgentRuns,
  type AgentRunDeps,
  type AgentRunInput,
} from "./task-agent-runs";

const TASK = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-17T10:00:00Z");

const ok = (body: unknown): AgentRunInput => {
  const r = parseAgentRun(body);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("parseAgentRun", () => {
  it("esito completo ripulito", () => {
    expect(
      ok({
        agent: " botcave/sviluppatore ",
        externalRunId: 372,
        status: "done",
        outcome: " Endpoint aggiunto ",
        detail: " dettaglio ",
        links: ["https://github.com/o/r/pull/1", { url: " https://dev.azure.com/x ", label: " work item " }],
        startedAt: "2026-11-17T09:00:00Z",
        finishedAt: "2026-11-17T09:30:00Z",
      }),
    ).toEqual({
      agent: "botcave/sviluppatore",
      externalRunId: "372",
      status: "done",
      outcome: "Endpoint aggiunto",
      detail: "dettaglio",
      links: [{ url: "https://github.com/o/r/pull/1" }, { url: "https://dev.azure.com/x", label: "work item" }],
      startedAt: new Date("2026-11-17T09:00:00Z"),
      finishedAt: new Date("2026-11-17T09:30:00Z"),
    });
  });

  it("running senza outcome", () => {
    expect(ok({ agent: "botcave", status: "running" })).toEqual({ agent: "botcave", status: "running", links: [] });
  });

  it("rifiuta corpi non validi", () => {
    const bad: unknown[] = [
      null, "x", [], {},
      { status: "done", outcome: "x" },
      { agent: "con spazi", status: "done", outcome: "x" },
      { agent: "a", status: "completed", outcome: "x" },
      { agent: "a", status: "done" },
      { agent: "a", status: "failed", outcome: "   " },
      { agent: "a", status: "done", outcome: "x".repeat(301) },
      { agent: "a", status: "done", outcome: "x", detail: "x".repeat(20_001) },
      { agent: "a", status: "done", outcome: "x", detail: 5 },
      { agent: "a", status: "done", outcome: "x", externalRunId: "con spazi" },
      { agent: "a", status: "done", outcome: "x", externalRunId: { id: 1 } },
      { agent: "a", status: "done", outcome: "x", links: "https://x.it" },
      { agent: "a", status: "done", outcome: "x", links: ["http://x.it"] },
      { agent: "a", status: "done", outcome: "x", links: [{ url: "javascript:alert(1)" }] },
      { agent: "a", status: "done", outcome: "x", links: [{ url: "https://x.it", label: "x".repeat(101) }] },
      { agent: "a", status: "done", outcome: "x", links: Array(21).fill("https://x.it") },
      { agent: "a", status: "done", outcome: "x", startedAt: "ieri" },
      { agent: "a", status: "running", finishedAt: "2026-11-17T09:00:00Z" },
      { agent: "a", status: "done", outcome: "x", startedAt: "2026-11-17T10:00:00Z", finishedAt: "2026-11-17T09:00:00Z" },
    ];
    for (const b of bad) expect(parseAgentRun(b).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
  });
});

describe("runValues", () => {
  it("un esito finale senza finishedAt si chiude adesso; running resta aperto", () => {
    expect(runValues(ok({ agent: "a", status: "blocked", outcome: "manca il branch" }), NOW).finishedAt).toEqual(NOW);
    expect(runValues(ok({ agent: "a", status: "running" }), NOW).finishedAt).toBeNull();
  });
});

function deps(over: Partial<AgentRunDeps> = {}): AgentRunDeps {
  return {
    taskOrg: vi.fn(async () => ORG),
    findByExternalId: vi.fn(async () => null),
    insert: vi.fn(async (row) => ({ id: "r1", status: String(row.status), ...row })),
    update: vi.fn(async (id, values) => ({ id, status: String(values.status), ...values })),
    now: () => NOW,
    ...over,
  };
}

const input = (body: unknown, organizationIds = [ORG], taskId = TASK) => ({
  taskId,
  userId: "u1",
  organizationIds,
  run: ok(body),
});

describe("recordAgentRun", () => {
  it("registra l'esecuzione nell'organizzazione del task (201)", async () => {
    const d = deps();
    const r = await recordAgentRun(d, input({ agent: "botcave", status: "done", outcome: "fatto" }));
    expect(r.status).toBe(201);
    expect(d.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK,
        organizationId: ORG,
        userId: "u1",
        agent: "botcave",
        status: "done",
        outcome: "fatto",
        externalRunId: null,
        startedAt: null,
        finishedAt: NOW,
      }),
    );
  });

  it("running parte adesso se startedAt manca", async () => {
    const d = deps();
    await recordAgentRun(d, input({ agent: "botcave", status: "running" }));
    expect(d.insert).toHaveBeenCalledWith(expect.objectContaining({ startedAt: NOW, finishedAt: null }));
  });

  it("task fuori dal perimetro, inesistente o con id non valido → 404", async () => {
    const body = { agent: "a", status: "done", outcome: "x" };
    expect((await recordAgentRun(deps(), input(body, [OTHER]))).status).toBe(404);
    expect((await recordAgentRun(deps({ taskOrg: async () => null }), input(body))).status).toBe(404);
    const d = deps();
    expect((await recordAgentRun(d, input(body, [ORG], "non-uuid"))).status).toBe(404);
    expect(d.taskOrg).not.toHaveBeenCalled();
    expect(d.insert).not.toHaveBeenCalled();
  });

  it("stesso externalRunId → aggiorna la stessa esecuzione (200)", async () => {
    const d = deps({ findByExternalId: vi.fn(async () => ({ id: "r9", status: "running" })) });
    const r = await recordAgentRun(d, input({ agent: "a", externalRunId: "4-t4", status: "done", outcome: "ok" }));
    expect(r.status).toBe(200);
    expect(d.findByExternalId).toHaveBeenCalledWith(TASK, "4-t4");
    expect(d.update).toHaveBeenCalledWith("r9", expect.objectContaining({ status: "done", outcome: "ok", finishedAt: NOW, updatedAt: NOW }));
    expect(d.insert).not.toHaveBeenCalled();
  });

  it("un'esecuzione conclusa non torna running (409), ma l'esito finale si può correggere", async () => {
    const done = { findByExternalId: vi.fn(async () => ({ id: "r9", status: "done" })) };
    const d = deps(done);
    expect((await recordAgentRun(d, input({ agent: "a", externalRunId: "x", status: "running" }))).status).toBe(409);
    expect(d.update).not.toHaveBeenCalled();
    expect((await recordAgentRun(deps(done), input({ agent: "a", externalRunId: "x", status: "failed", outcome: "ko" }))).status).toBe(200);
  });

  it("aggiornamento o inserimento in conflitto con uno concorrente → 409", async () => {
    const running = { findByExternalId: vi.fn(async () => ({ id: "r9", status: "running" })), update: vi.fn(async () => null) };
    expect((await recordAgentRun(deps(running), input({ agent: "a", externalRunId: "x", status: "running" }))).status).toBe(409);
    const r = await recordAgentRun(deps({ insert: vi.fn(async () => null) }), input({ agent: "a", externalRunId: "x", status: "running" }));
    expect(r.status).toBe(409);
  });
});

describe("listAgentRuns", () => {
  it("elenco solo per i task nel perimetro", async () => {
    const list = vi.fn(async () => [{ id: "r1", status: "done" }]);
    expect(await listAgentRuns({ taskOrg: async () => ORG, list }, { taskId: TASK, organizationIds: [ORG] })).toEqual({
      status: 200,
      body: [{ id: "r1", status: "done" }],
    });
    expect((await listAgentRuns({ taskOrg: async () => ORG, list }, { taskId: TASK, organizationIds: [OTHER] })).status).toBe(404);
    expect((await listAgentRuns({ taskOrg: async () => ORG, list }, { taskId: "x", organizationIds: [ORG] })).status).toBe(404);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
