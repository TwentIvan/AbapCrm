import { describe, it, expect, vi } from "vitest";
import {
  parseObligationRun,
  parseObligationRunQuery,
  recordObligationRun,
  listObligationRuns,
  type ObligationRunDeps,
  type ObligationRunInput,
} from "./obligation-runs";

const ORG = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const OBL = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-11-17T10:00:00Z");

const ok = (body: unknown) => {
  const r = parseObligationRun(body);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

function deps(over: Partial<ObligationRunDeps> = {}) {
  const base: ObligationRunDeps = {
    obligation: vi.fn(async () => ({ organizationId: ORG, active: true, nextDueDate: "2026-11-30" })),
    findByExternalId: vi.fn(async () => null),
    insert: vi.fn(async (row) => ({ id: "r1", status: String(row.status), ...row })),
    update: vi.fn(async (id, values) => ({ id, status: String(values.status), ...values })),
    list: vi.fn(async () => [{ id: "r1", status: "done" }]),
    now: () => NOW,
  };
  return { ...base, ...over };
}

const record = (d: ObligationRunDeps, run: ObligationRunInput, organizationIds = [ORG], obligationId = OBL) =>
  recordObligationRun(d, { obligationId, userId: USER, organizationIds, run });

describe("parseObligationRun", () => {
  it("corpo minimo e completo", () => {
    expect(ok({ period: " 2026-Q3 ", status: "running" })).toEqual({ period: "2026-Q3", status: "running", links: [] });
    expect(
      ok({
        period: "2026-10",
        status: "done",
        outcome: " Inviata ",
        detail: "dettaglio",
        agent: "botcave/sviluppatore",
        externalRunId: 42,
        dueDate: "2026-11-30",
        protocol: "26111712345678901",
        links: ["https://example.com/ricevuta.pdf", { url: "https://example.com/pr/1", label: "PR" }],
        startedAt: "2026-11-17T09:00:00Z",
        finishedAt: "2026-11-17T09:30:00Z",
      }),
    ).toEqual({
      period: "2026-10",
      status: "done",
      outcome: "Inviata",
      detail: "dettaglio",
      agent: "botcave/sviluppatore",
      externalRunId: "42",
      dueDate: "2026-11-30",
      protocol: "26111712345678901",
      links: [{ url: "https://example.com/ricevuta.pdf" }, { url: "https://example.com/pr/1", label: "PR" }],
      startedAt: new Date("2026-11-17T09:00:00Z"),
      finishedAt: new Date("2026-11-17T09:30:00Z"),
    });
  });

  it("rifiuta corpi non validi", () => {
    const bad: unknown[] = [
      null,
      [],
      { status: "running" },
      { period: "2026 Q3", status: "running" },
      { period: "2026-Q3", status: "pending" },
      { period: "2026-Q3", status: "done" },
      { period: "2026-Q3", status: "failed", outcome: "x".repeat(301) },
      { period: "2026-Q3", status: "running", detail: "x".repeat(20_001) },
      { period: "2026-Q3", status: "running", agent: "nome con spazi" },
      { period: "2026-Q3", status: "running", externalRunId: "a b" },
      { period: "2026-Q3", status: "running", dueDate: "2026-02-30" },
      { period: "2026-Q3", status: "running", protocol: "x".repeat(101) },
      { period: "2026-Q3", status: "running", links: "https://example.com" },
      { period: "2026-Q3", status: "running", links: ["http://example.com"] },
      { period: "2026-Q3", status: "running", startedAt: "ieri" },
      { period: "2026-Q3", status: "running", finishedAt: "2026-11-17T09:00:00Z" },
      { period: "2026-Q3", status: "done", outcome: "ok", startedAt: "2026-11-17T10:00:00Z", finishedAt: "2026-11-17T09:00:00Z" },
    ];
    for (const b of bad) expect(parseObligationRun(b).ok, JSON.stringify(b)).toBe(false);
  });
});

describe("parseObligationRunQuery", () => {
  it("filtri per periodo e stato", () => {
    expect(parseObligationRunQuery({})).toEqual({ ok: true, value: {} });
    expect(parseObligationRunQuery({ period: "2026-Q3", status: "done" })).toEqual({
      ok: true,
      value: { period: "2026-Q3", status: "done" },
    });
    expect(parseObligationRunQuery({ status: "pending" }).ok).toBe(false);
    expect(parseObligationRunQuery({ period: ["2026-Q3", "2026-Q4"] }).ok).toBe(false);
  });
});

describe("recordObligationRun", () => {
  it("crea l'esecuzione nell'organizzazione dell'obbligo con la scadenza corrente", async () => {
    const d = deps();
    const r = await record(d, ok({ period: "2026-10", status: "running", agent: "botcave" }));
    expect(r.status).toBe(201);
    expect(d.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        obligationId: OBL,
        organizationId: ORG,
        userId: USER,
        period: "2026-10",
        status: "running",
        agent: "botcave",
        externalRunId: null,
        dueDate: "2026-11-30",
        startedAt: NOW,
        finishedAt: null,
      }),
    );
  });

  it("un esito finale senza finishedAt si chiude adesso; dueDate esplicita vince", async () => {
    const d = deps();
    await record(d, ok({ period: "2026-09", status: "done", outcome: "Inviata", dueDate: "2026-10-31" }));
    expect(d.insert).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-10-31", startedAt: null, finishedAt: NOW, outcome: "Inviata" }),
    );
  });

  it("404 se l'obbligo non esiste, è fuori perimetro o l'id non è un uuid", async () => {
    const run = ok({ period: "2026-10", status: "running" });
    expect((await record(deps({ obligation: vi.fn(async () => null) }), run)).status).toBe(404);
    expect((await record(deps(), run, [OTHER])).status).toBe(404);
    expect((await record(deps(), run, [ORG.toUpperCase()])).status).toBe(201);
    const d = deps();
    expect((await record(d, run, [ORG], "non-un-uuid")).status).toBe(404);
    expect(d.obligation).not.toHaveBeenCalled();
  });

  it("idempotente con externalRunId: aggiorna l'esecuzione esistente", async () => {
    const d = deps({ findByExternalId: vi.fn(async () => ({ id: "r1", status: "running" })) });
    const r = await record(d, ok({ period: "2026-10", status: "done", outcome: "Inviata", externalRunId: "run-7" }));
    expect(r.status).toBe(200);
    expect(d.insert).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "done", finishedAt: NOW, updatedAt: NOW }));
  });

  it("409 se un'esecuzione conclusa dovrebbe tornare running, anche in concorrenza", async () => {
    const run = ok({ period: "2026-10", status: "running", externalRunId: "run-7" });
    const done = deps({ findByExternalId: vi.fn(async () => ({ id: "r1", status: "done" })) });
    expect((await record(done, run)).status).toBe(409);
    expect(done.update).not.toHaveBeenCalled();
    const race = deps({
      findByExternalId: vi.fn(async () => ({ id: "r1", status: "running" })),
      update: vi.fn(async () => null),
    });
    expect((await record(race, run)).status).toBe(409);
  });

  it("obbligo non attivo: niente nuove esecuzioni, ma quelle registrate si concludono", async () => {
    const inactive = vi.fn(async () => ({ organizationId: ORG, active: false, nextDueDate: null }));
    const d = deps({ obligation: inactive });
    expect((await record(d, ok({ period: "2026-10", status: "running" }))).status).toBe(409);
    expect(d.insert).not.toHaveBeenCalled();
    const e = deps({ obligation: inactive, findByExternalId: vi.fn(async () => ({ id: "r1", status: "running" })) });
    const r = await record(e, ok({ period: "2026-10", status: "failed", outcome: "Errore", externalRunId: "run-7" }));
    expect(r.status).toBe(200);
  });

  it("409 se l'inserimento collide con una registrazione concorrente", async () => {
    const d = deps({ insert: vi.fn(async () => null) });
    expect((await record(d, ok({ period: "2026-10", status: "running", externalRunId: "run-7" }))).status).toBe(409);
  });
});

describe("listObligationRuns", () => {
  it("elenca con i filtri se l'obbligo è nel perimetro, altrimenti 404", async () => {
    const d = deps();
    const r = await listObligationRuns(d, { obligationId: OBL, organizationIds: [ORG], query: { status: "done" } });
    expect(r).toEqual({ status: 200, body: [{ id: "r1", status: "done" }] });
    expect(d.list).toHaveBeenCalledWith(OBL, { status: "done" });
    const out = await listObligationRuns(d, { obligationId: OBL, organizationIds: [OTHER], query: {} });
    expect(out.status).toBe(404);
  });
});
