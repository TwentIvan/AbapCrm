import { describe, it, expect, vi } from "vitest";
import {
  nextDueDateAfter,
  readiness,
  obligationAutomation,
  parseDueQuery,
  dueObligations,
  advanceAfterRun,
  type AutomationDeps,
  type DueDeps,
} from "./obligation-automation";

const ORG = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const OBL = "44444444-4444-4444-8444-444444444444";
const OBL2 = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-11-17T10:00:00Z");

const obligation = (over: Record<string, unknown> = {}) => ({
  id: OBL,
  organizationId: ORG,
  code: "LIPE",
  name: "Comunicazione liquidazioni periodiche IVA",
  active: true,
  frequency: "quarterly",
  nextDueDate: "2026-11-30" as string | null,
  ...over,
});

describe("nextDueDateAfter", () => {
  it("avanza secondo la frequenza tenendo il giorno", () => {
    expect(nextDueDateAfter("2026-11-16", "monthly")).toBe("2026-12-16");
    expect(nextDueDateAfter("2026-12-16", "monthly")).toBe("2027-01-16");
    expect(nextDueDateAfter("2026-07-31", "yearly")).toBe("2027-07-31");
    expect(nextDueDateAfter("2026-06-16", "semiannual")).toBe("2026-12-16");
  });

  it("fine mese resta fine mese, il giorno si restringe al mese più corto", () => {
    expect(nextDueDateAfter("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(nextDueDateAfter("2027-02-28", "quarterly")).toBe("2027-05-31");
    expect(nextDueDateAfter("2027-01-29", "monthly")).toBe("2027-02-28");
    expect(nextDueDateAfter("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("once senza altre scadenze, other o data non valida: non si sa", () => {
    expect(nextDueDateAfter("2026-11-30", "once")).toBeNull();
    expect(nextDueDateAfter("2026-11-30", "other")).toBeUndefined();
    expect(nextDueDateAfter("2026-02-30", "monthly")).toBeUndefined();
  });
});

describe("readiness", () => {
  it("pronta senza esecuzioni o dopo un tentativo fallito o bloccato", () => {
    expect(readiness(obligation(), [])).toEqual({ ready: true, blockers: [] });
    expect(readiness(obligation(), [{ id: "r", status: "failed", dueDate: "2026-11-30" }]).ready).toBe(true);
  });

  it("blocchi: non attivo, senza scadenza, già adempiuto, in corso", () => {
    expect(readiness(obligation({ active: false, nextDueDate: null }), []).blockers).toEqual([
      "obligation_inactive",
      "no_due_date",
    ]);
    const runs = [
      { id: "a", status: "running", dueDate: "2026-11-30" },
      { id: "b", status: "done", dueDate: "2026-11-30" },
    ];
    expect(readiness(obligation(), runs)).toEqual({ ready: false, blockers: ["already_done", "run_in_progress"] });
  });
});

function automationDeps(over: Partial<AutomationDeps> = {}): AutomationDeps {
  return {
    findObligation: vi.fn(async () => obligation()),
    runsForDue: vi.fn(async () => [{ id: "r1", status: "failed", dueDate: "2026-11-30" }]),
    recentRuns: vi.fn(async () => [{ id: "r1", status: "failed", dueDate: "2026-11-30" }]),
    now: () => NOW,
    ...over,
  };
}

describe("obligationAutomation", () => {
  it("pacchetto con scadenza in corso, giorni mancanti, scadenza successiva e readiness", async () => {
    const d = automationDeps();
    const r = await obligationAutomation(d, { id: OBL, organizationIds: [ORG] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      obligation: { id: OBL, code: "LIPE" },
      dueDate: "2026-11-30",
      daysToDue: 13,
      overdue: false,
      followingDueDate: "2027-02-28",
      runsForDue: [{ id: "r1" }],
      recentRuns: [{ id: "r1" }],
      readiness: { ready: true, blockers: [] },
    });
    expect(d.runsForDue).toHaveBeenCalledWith(OBL, "2026-11-30");
    expect(d.recentRuns).toHaveBeenCalledWith(OBL, 10);
  });

  it("scaduto e senza scadenza", async () => {
    const late = await obligationAutomation(
      automationDeps({ findObligation: vi.fn(async () => obligation({ nextDueDate: "2026-11-16" })) }),
      { id: OBL, organizationIds: [ORG] },
    );
    expect(late.body).toMatchObject({ daysToDue: -1, overdue: true });

    const d = automationDeps({ findObligation: vi.fn(async () => obligation({ nextDueDate: null })) });
    const none = await obligationAutomation(d, { id: OBL, organizationIds: [ORG] });
    expect(none.body).toMatchObject({ dueDate: null, daysToDue: null, followingDueDate: null, runsForDue: [] });
    expect(d.runsForDue).not.toHaveBeenCalled();
  });

  it("404 fuori perimetro, inesistente o id non valido", async () => {
    expect((await obligationAutomation(automationDeps(), { id: OBL, organizationIds: [OTHER] })).status).toBe(404);
    const missing = automationDeps({ findObligation: vi.fn(async () => null) });
    expect((await obligationAutomation(missing, { id: OBL, organizationIds: [ORG] })).status).toBe(404);
    const d = automationDeps();
    expect((await obligationAutomation(d, { id: "x", organizationIds: [ORG] })).status).toBe(404);
    expect(d.findObligation).not.toHaveBeenCalled();
  });
});

describe("parseDueQuery", () => {
  it("default e valori validi", () => {
    expect(parseDueQuery({})).toEqual({ ok: true, value: { withinDays: 30, includeDone: false } });
    expect(parseDueQuery({ withinDays: "0", organizationId: ORG.toUpperCase(), includeDone: "true" })).toEqual({
      ok: true,
      value: { withinDays: 0, organizationId: ORG, includeDone: true },
    });
  });

  it("400 su valori non validi o ripetuti", () => {
    for (const q of [
      { withinDays: "-1" },
      { withinDays: "367" },
      { withinDays: "1.5" },
      { withinDays: ["1", "2"] },
      { organizationId: "x" },
      { includeDone: "yes" },
    ]) {
      expect(parseDueQuery(q).ok).toBe(false);
    }
  });
});

function dueDeps(over: Partial<DueDeps> = {}): DueDeps {
  return {
    activeDueBy: vi.fn(async () => [
      obligation({ id: OBL2, code: "F24", frequency: "monthly", nextDueDate: "2026-12-16" }),
      obligation(),
    ]),
    runsFor: vi.fn(async () => [
      { id: "r2", obligationId: OBL2, status: "done", dueDate: "2026-11-16" },
      { id: "r1", obligationId: OBL, status: "running", dueDate: "2026-11-30" },
    ]),
    now: () => NOW,
    ...over,
  };
}

describe("dueObligations", () => {
  it("agenda per scadenza con ultima esecuzione e readiness; esecuzioni di scadenze passate non contano", async () => {
    const d = dueDeps();
    const r = await dueObligations(d, { organizationIds: [ORG], query: { withinDays: 30, includeDone: false } });
    expect(d.activeDueBy).toHaveBeenCalledWith([ORG], "2026-12-17");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject([
      { obligation: { id: OBL }, dueDate: "2026-11-30", daysToDue: 13, lastRun: { id: "r1" }, readiness: { ready: false, blockers: ["run_in_progress"] } },
      { obligation: { id: OBL2 }, dueDate: "2026-12-16", daysToDue: 29, lastRun: null, readiness: { ready: true } },
    ]);
  });

  it("già adempiuti esclusi salvo includeDone", async () => {
    const runsFor = vi.fn(async () => [{ id: "r1", obligationId: OBL, status: "done", dueDate: "2026-11-30" }]);
    const without = await dueObligations(dueDeps({ runsFor }), { organizationIds: [ORG], query: { withinDays: 30, includeDone: false } });
    expect((without.body as Array<{ obligation: { id: string } }>).map((i) => i.obligation.id)).toEqual([OBL2]);
    const all = await dueObligations(dueDeps({ runsFor }), { organizationIds: [ORG], query: { withinDays: 30, includeDone: true } });
    expect(all.body).toHaveLength(2);
  });

  it("perimetro: organizationId fuori 404, nessuna organizzazione elenco vuoto senza query", async () => {
    const d = dueDeps();
    expect((await dueObligations(d, { organizationIds: [ORG], query: { withinDays: 30, includeDone: false, organizationId: OTHER } })).status).toBe(404);
    expect(await dueObligations(d, { organizationIds: [], query: { withinDays: 30, includeDone: false } })).toEqual({ status: 200, body: [] });
    expect(d.activeDueBy).not.toHaveBeenCalled();
  });
});

describe("advanceAfterRun", () => {
  const input = (run: { status: string; dueDate?: string | null }, over: Record<string, unknown> = {}) => ({
    obligationId: OBL,
    frequency: "quarterly",
    nextDueDate: "2026-11-30",
    run,
    ...over,
  });

  it("un done per la scadenza in corso la fa avanzare", async () => {
    const advance = vi.fn(async () => true);
    expect(await advanceAfterRun({ advance }, input({ status: "done", dueDate: "2026-11-30" }))).toBe("2027-02-28");
    expect(advance).toHaveBeenCalledWith(OBL, "2026-11-30", "2027-02-28");
    expect(await advanceAfterRun({ advance }, input({ status: "done", dueDate: "2026-11-30" }, { frequency: "once" }))).toBeNull();
  });

  it("niente avanzamento: non done, altra scadenza, other, già avanzata da un altro", async () => {
    const advance = vi.fn(async () => true);
    expect(await advanceAfterRun({ advance }, input({ status: "failed", dueDate: "2026-11-30" }))).toBeUndefined();
    expect(await advanceAfterRun({ advance }, input({ status: "done", dueDate: "2026-08-31" }))).toBeUndefined();
    expect(await advanceAfterRun({ advance }, input({ status: "done", dueDate: "2026-11-30" }, { frequency: "other" }))).toBeUndefined();
    expect(advance).not.toHaveBeenCalled();
    const lost = vi.fn(async () => false);
    expect(await advanceAfterRun({ advance: lost }, input({ status: "done", dueDate: "2026-11-30" }))).toBeUndefined();
  });
});
