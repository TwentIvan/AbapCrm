import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerApiTokenRoutes } from "./api-token-routes";

const NOW = new Date("2026-11-07T10:00:00Z");

function setup(opts: { user?: boolean } = {}) {
  const rows: any[] = [];
  const createApiToken = vi.fn(async (input: any) => {
    const row = { id: rows.length + 1, ...input, createdAt: NOW, revokedAt: null, lastUsedAt: null };
    rows.push(row);
    return row;
  });
  const listApiTokens = vi.fn(async (userId: string) => rows.filter((r) => r.userId === userId));
  const revokeApiToken = vi.fn(async (userId: string, id: number) =>
    rows.some((r) => r.userId === userId && r.id === id),
  );
  // Token 1 di u1 (anche revocato), token 2 di u2; 5 scritture del token 1 con id 1..5.
  const tokens = [
    { id: 1, userId: "u1", revokedAt: NOW },
    { id: 2, userId: "u2", revokedAt: null },
  ];
  const writes = [1, 2, 3, 4, 5].map((id) => ({
    id,
    tokenId: 1,
    userId: "u1",
    organizationId: "org1",
    method: "POST",
    path: `/api/tasks/${id}`,
    statusCode: 201,
    durationMs: 12,
    ipAddress: "127.0.0.1",
    userAgent: "botcave",
    createdAt: NOW,
  }));
  const getApiTokenOfUser = vi.fn(async (userId: string, id: number) =>
    tokens.find((t) => t.userId === userId && t.id === id) as any,
  );
  const listApiTokenWrites = vi.fn(async (tokenId: number, o: { limit: number; beforeId?: number }) =>
    writes
      .filter((w) => w.tokenId === tokenId && (o.beforeId === undefined || w.id < o.beforeId))
      .sort((a, b) => b.id - a.id)
      .slice(0, o.limit) as any,
  );
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (opts.user !== false) req.user = { id: "u1" };
    req.isAuthenticated = () => !!req.user;
    req.headers["x-organization-id"] = "org1";
    next();
  });
  registerApiTokenRoutes(app, {
    createApiToken,
    listApiTokens,
    revokeApiToken,
    getApiTokenOfUser,
    listApiTokenWrites,
    now: () => NOW,
  });
  return { app, createApiToken, rows, listApiTokenWrites };
}

describe("route dei token API", () => {
  it("POST crea il token: 201, thu_, salva solo l'hash, scadenza a 365 giorni", async () => {
    const { app, createApiToken } = setup();
    const res = await request(app).post("/api/account/api-tokens").send({ name: "Agenti" });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^thu_/);
    expect(res.body.tokenHash).toBeUndefined();
    expect(res.body.organizationId).toBe("org1");
    const input = createApiToken.mock.calls[0][0];
    expect(input.tokenHash).not.toBe(res.body.token);
    expect(input.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(input)).not.toContain(res.body.token);
    const diff = input.expiresAt.getTime() - NOW.getTime();
    expect(Math.abs(diff - 365 * 86400000)).toBeLessThan(60000);
  });

  it("POST con nome vuoto o troppo lungo → 400", async () => {
    const { app } = setup();
    for (const name of ["", "   ", "x".repeat(101), undefined, 5]) {
      const res = await request(app).post("/api/account/api-tokens").send({ name });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "nome obbligatorio, al massimo 100 caratteri" });
    }
  });

  it("POST con allOrganizations: true → organizationId null, anche nell'elenco", async () => {
    const { app, createApiToken } = setup();
    const res = await request(app).post("/api/account/api-tokens").send({ name: "Botcave", allOrganizations: true });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBeNull();
    expect(createApiToken.mock.calls[0][0].organizationId).toBeNull();
    await request(app).post("/api/account/api-tokens").send({ name: "Una", allOrganizations: false });
    const list = await request(app).get("/api/account/api-tokens");
    expect(list.body.map((t: any) => [t.name, t.organizationId])).toEqual([
      ["Botcave", null],
      ["Una", "org1"],
    ]);
  });

  it("POST con allOrganizations non booleano → 400", async () => {
    const { app, createApiToken } = setup();
    for (const allOrganizations of ["true", 1, null, {}]) {
      const res = await request(app).post("/api/account/api-tokens").send({ name: "A", allOrganizations });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "allOrganizations deve essere true o false" });
    }
    expect(createApiToken).not.toHaveBeenCalled();
  });

  it("GET non contiene mai token né tokenHash", async () => {
    const { app } = setup();
    await request(app).post("/api/account/api-tokens").send({ name: "A" });
    const res = await request(app).get("/api/account/api-tokens");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty("token");
    expect(res.body[0]).not.toHaveProperty("tokenHash");
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ["createdAt", "expiresAt", "id", "lastUsedAt", "name", "organizationId", "prefix"],
    );
  });

  it("DELETE: proprio 204, altrui o id non valido 404", async () => {
    const { app, rows } = setup();
    await request(app).post("/api/account/api-tokens").send({ name: "A" });
    rows.push({ id: 99, userId: "other" });
    expect((await request(app).delete("/api/account/api-tokens/1")).status).toBe(204);
    const other = await request(app).delete("/api/account/api-tokens/99");
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ message: "token non trovato" });
    for (const id of ["abc", "0", "-1", "1.5"]) {
      expect((await request(app).delete(`/api/account/api-tokens/${id}`)).status).toBe(404);
    }
  });

  it("senza utente → 401", async () => {
    const { app } = setup({ user: false });
    expect((await request(app).get("/api/account/api-tokens")).status).toBe(401);
    expect((await request(app).post("/api/account/api-tokens").send({ name: "A" })).status).toBe(401);
    expect((await request(app).delete("/api/account/api-tokens/1")).status).toBe(401);
  });
});

describe("GET /api/account/api-tokens/:id/writes", () => {
  it("senza sessione → 401", async () => {
    const { app } = setup({ user: false });
    const res = await request(app).get("/api/account/api-tokens/1/writes");
    expect(res.status).toBe(401);
  });

  it("restituisce le scritture del proprio token, dalla più recente, anche se revocato", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/account/api-tokens/1/writes");
    expect(res.status).toBe(200);
    expect(res.body.items.map((w: any) => w.id)).toEqual([5, 4, 3, 2, 1]);
    expect(res.body.items[0]).toEqual({
      id: 5,
      method: "POST",
      path: "/api/tasks/5",
      statusCode: 201,
      durationMs: 12,
      organizationId: "org1",
      ipAddress: "127.0.0.1",
      userAgent: "botcave",
      createdAt: NOW.toISOString(),
    });
    expect(res.body.items[0].tokenId).toBeUndefined();
    expect(res.body.nextBefore).toBeNull();
  });

  it("pagina con limit e before", async () => {
    const { app, listApiTokenWrites } = setup();
    const first = await request(app).get("/api/account/api-tokens/1/writes?limit=2");
    expect(first.body.items.map((w: any) => w.id)).toEqual([5, 4]);
    expect(first.body.nextBefore).toBe(4);
    expect(listApiTokenWrites).toHaveBeenLastCalledWith(1, { limit: 3, beforeId: undefined });
    const second = await request(app).get("/api/account/api-tokens/1/writes?limit=2&before=4");
    expect(second.body.items.map((w: any) => w.id)).toEqual([3, 2]);
    expect(second.body.nextBefore).toBe(2);
    const last = await request(app).get("/api/account/api-tokens/1/writes?limit=2&before=2");
    expect(last.body.items.map((w: any) => w.id)).toEqual([1]);
    expect(last.body.nextBefore).toBeNull();
  });

  it("token di un altro utente o inesistente → 404, senza leggere l'audit", async () => {
    const { app, listApiTokenWrites } = setup();
    for (const id of ["2", "99", "abc", "0", "-1"]) {
      const res = await request(app).get(`/api/account/api-tokens/${id}/writes`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "token non trovato" });
    }
    expect(listApiTokenWrites).not.toHaveBeenCalled();
  });

  it("limit o before non validi → 400", async () => {
    const { app } = setup();
    for (const q of ["limit=0", "limit=201", "limit=abc", "limit=1.5", "before=0", "before=x"]) {
      const res = await request(app).get(`/api/account/api-tokens/1/writes?${q}`);
      expect(res.status).toBe(400);
    }
  });
});
