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
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (opts.user !== false) req.user = { id: "u1" };
    req.isAuthenticated = () => !!req.user;
    req.headers["x-organization-id"] = "org1";
    next();
  });
  registerApiTokenRoutes(app, { createApiToken, listApiTokens, revokeApiToken, now: () => NOW });
  return { app, createApiToken, rows };
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
