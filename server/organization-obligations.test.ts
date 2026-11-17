import { describe, it, expect, vi } from "vitest";
import { parseObligationQuery, listObligations, getObligation, isDay } from "./organization-obligations";

const ORG = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const OBL = "44444444-4444-4444-8444-444444444444";

const ok = (query: unknown) => {
  const r = parseObligationQuery(query);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("isDay", () => {
  it("solo giorni di calendario YYYY-MM-DD", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-1-01")).toBe(false);
    expect(isDay("2026-01-01T00:00:00Z")).toBe(false);
    expect(isDay(20260101)).toBe(false);
  });
});

describe("parseObligationQuery", () => {
  it("senza parametri nessun filtro", () => {
    expect(ok({})).toEqual({});
    expect(ok(undefined)).toEqual({});
    expect(ok({ active: "all", frequency: "" })).toEqual({});
  });

  it("filtri completi", () => {
    expect(
      ok({ organizationId: ORG.toUpperCase(), active: "false", frequency: "quarterly", dueFrom: "2026-11-01", dueTo: "2026-11-30" }),
    ).toEqual({ organizationId: ORG, active: false, frequency: "quarterly", dueFrom: "2026-11-01", dueTo: "2026-11-30" });
    expect(ok({ active: "true", dueFrom: "2026-11-17", dueTo: "2026-11-17" })).toEqual({
      active: true,
      dueFrom: "2026-11-17",
      dueTo: "2026-11-17",
    });
  });

  it("rifiuta parametri non validi", () => {
    const bad: Record<string, unknown>[] = [
      { organizationId: "non-un-uuid" },
      { organizationId: [ORG, OTHER] },
      { active: "yes" },
      { frequency: "weekly" },
      { dueFrom: "17/11/2026" },
      { dueTo: "2026-02-30" },
      { dueFrom: "2026-12-01", dueTo: "2026-11-30" },
    ];
    for (const q of bad) expect(parseObligationQuery(q).ok, JSON.stringify(q)).toBe(false);
  });
});

describe("listObligations", () => {
  const rows = [{ id: OBL, organizationId: ORG, code: "LIPE" }];

  it("legge gli obblighi di tutto il perimetro con i filtri", async () => {
    const list = vi.fn().mockResolvedValue(rows);
    const r = await listObligations({ list }, { organizationIds: [ORG, OTHER], query: { active: true, dueTo: "2026-12-31" } });
    expect(r).toEqual({ status: 200, body: rows });
    expect(list).toHaveBeenCalledWith({ organizationIds: [ORG, OTHER], active: true, dueTo: "2026-12-31" });
  });

  it("con organizationId solo quella organizzazione, se è nel perimetro", async () => {
    const list = vi.fn().mockResolvedValue(rows);
    const r = await listObligations({ list }, { organizationIds: [ORG.toUpperCase(), OTHER], query: { organizationId: ORG } });
    expect(r.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ organizationIds: [ORG] });
  });

  it("organizzazione fuori dal perimetro: 404 senza leggere", async () => {
    const list = vi.fn();
    const r = await listObligations({ list }, { organizationIds: [OTHER], query: { organizationId: ORG } });
    expect(r).toEqual({ status: 404, body: { error: "organizzazione non trovata" } });
    expect(list).not.toHaveBeenCalled();
  });

  it("perimetro vuoto o non valido: elenco vuoto senza leggere", async () => {
    const list = vi.fn();
    expect(await listObligations({ list }, { organizationIds: [], query: {} })).toEqual({ status: 200, body: [] });
    expect(await listObligations({ list }, { organizationIds: ["", "x"], query: {} })).toEqual({ status: 200, body: [] });
    expect(list).not.toHaveBeenCalled();
  });
});

describe("getObligation", () => {
  const row = { id: OBL, organizationId: ORG, code: "F24" };

  it("obbligo nel perimetro", async () => {
    const findById = vi.fn().mockResolvedValue(row);
    expect(await getObligation({ findById }, { id: OBL, organizationIds: [ORG] })).toEqual({ status: 200, body: row });
  });

  it("fuori dal perimetro, inesistente o id non valido: 404", async () => {
    const findById = vi.fn().mockResolvedValue(row);
    expect((await getObligation({ findById }, { id: OBL, organizationIds: [OTHER] })).status).toBe(404);
    expect((await getObligation({ findById: vi.fn().mockResolvedValue(null) }, { id: OBL, organizationIds: [ORG] })).status).toBe(404);
    const never = vi.fn();
    expect((await getObligation({ findById: never }, { id: "1 or 1=1", organizationIds: [ORG] })).status).toBe(404);
    expect(never).not.toHaveBeenCalled();
  });
});
