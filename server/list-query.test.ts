import { describe, it, expect } from "vitest";
import { applyListQuery, parseListQuery, sendList, LIST_SPECS, type ListSpec } from "./list-query";

type Row = { id: string; name: string; status: string | null; projectId: string | null; updatedAt: Date | null };

const spec: ListSpec = {
  filters: ["status", "projectId"],
  search: ["name"],
  sort: ["name", "updatedAt"],
  updatedField: "updatedAt",
};

const rows: Row[] = [
  { id: "1", name: "Alfa", status: "open", projectId: "p1", updatedAt: new Date("2026-01-01T00:00:00Z") },
  { id: "2", name: "beta", status: "done", projectId: "p1", updatedAt: new Date("2026-02-01T00:00:00Z") },
  { id: "3", name: "Gamma", status: "open", projectId: "p2", updatedAt: new Date("2026-03-01T00:00:00Z") },
  { id: "4", name: "delta", status: null, projectId: null, updatedAt: null },
];

function run(query: Record<string, unknown>) {
  const parsed = parseListQuery(query, spec);
  if (!parsed.ok) throw new Error(parsed.details.join("; "));
  return applyListQuery(rows, parsed.query, spec);
}

describe("parseListQuery", () => {
  it("senza parametri: nessun filtro, nessuna pagina, risposta come prima", () => {
    const parsed = parseListQuery({}, spec);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.active).toBe(false);
    expect(parsed.query.paginated).toBe(false);
    expect(run({}).items.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("limit fuori intervallo, offset negativo, sort e filtri sconosciuti → errori", () => {
    for (const q of [{ limit: "0" }, { limit: "501" }, { limit: "abc" }, { offset: "-1" }, { sort: "secret" }, { updatedSince: "ieri" }, { paginated: "forse" }]) {
      const parsed = parseListQuery(q, spec);
      expect(parsed.ok, JSON.stringify(q)).toBe(false);
    }
  });

  it("parametri ripetuti (array) rifiutati", () => {
    expect(parseListQuery({ limit: ["1", "2"] }, spec).ok).toBe(false);
    expect(parseListQuery({ status: ["open", "done"] }, spec).ok).toBe(false);
  });

  it("parametri non gestiti dall'elenco vengono ignorati", () => {
    const parsed = parseListQuery({ foo: "bar", summary: "true" }, spec);
    expect(parsed.ok).toBe(true);
  });
});

describe("applyListQuery", () => {
  it("filtro di uguaglianza, anche con più valori separati da virgola", () => {
    expect(run({ status: "open" }).items.map((r) => r.id)).toEqual(["1", "3"]);
    expect(run({ status: "open,done" }).items.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(run({ status: "open", projectId: "p2" }).items.map((r) => r.id)).toEqual(["3"]);
  });

  it("filtro sul valore vuoto con «null»", () => {
    expect(run({ projectId: "null" }).items.map((r) => r.id)).toEqual(["4"]);
  });

  it("q cerca senza distinzione di maiuscole nei campi di ricerca", () => {
    expect(run({ q: "ALF" }).items.map((r) => r.id)).toEqual(["1"]);
    expect(run({ q: "  " }).items.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("updatedSince esclude le righe più vecchie o senza data", () => {
    expect(run({ updatedSince: "2026-02-01T00:00:00Z" }).items.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("ordinamento crescente e decrescente, i null in fondo", () => {
    expect(run({ sort: "name" }).items.map((r) => r.name)).toEqual(["Alfa", "beta", "delta", "Gamma"]);
    expect(run({ sort: "-updatedAt" }).items.map((r) => r.id)).toEqual(["3", "2", "1", "4"]);
    expect(run({ sort: "updatedAt" }).items.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("limit e offset dopo i filtri, total conta tutte le righe filtrate", () => {
    const page = run({ status: "open,done", limit: "2", offset: "1" });
    expect(page.items.map((r) => r.id)).toEqual(["2", "3"]);
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(false);
    const first = run({ limit: "2" });
    expect(first).toMatchObject({ total: 4, limit: 2, offset: 0, hasMore: true });
  });
});

describe("sendList", () => {
  function fakeRes() {
    const res: any = { headers: {} as Record<string, string>, body: undefined };
    res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
    res.json = (b: unknown) => { res.body = b; return res; };
    return res;
  }

  it("senza paginated=true restituisce l'array, il totale in X-Total-Count", () => {
    const parsed = parseListQuery({ status: "open" }, spec);
    if (!parsed.ok) throw new Error();
    const res = fakeRes();
    sendList(res, rows, parsed.query, spec);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.headers["X-Total-Count"]).toBe("2");
  });

  it("con paginated=true restituisce la busta { items, total, limit, offset, hasMore }", () => {
    const parsed = parseListQuery({ paginated: "true", limit: "1" }, spec);
    if (!parsed.ok) throw new Error();
    const res = fakeRes();
    sendList(res, rows, parsed.query, spec);
    expect(res.body).toEqual({ items: [rows[0]], total: 4, limit: 1, offset: 0, hasMore: true });
  });

  it("paginated=true senza limit usa il limite predefinito", () => {
    const parsed = parseListQuery({ paginated: "1" }, spec);
    if (!parsed.ok) throw new Error();
    expect(parsed.query.limit).toBe(50);
  });
});

describe("LIST_SPECS", () => {
  it("non permette filtri o ordinamenti su campi interni dell'utente", () => {
    for (const s of Object.values(LIST_SPECS)) {
      expect(s.filters as string[]).not.toContain("userId");
      expect(s.search as string[]).not.toContain("userId");
    }
  });
});
