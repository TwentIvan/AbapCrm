import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createApiTokenAuth } from "./api-token-auth";
import { generateApiToken, hashApiToken, TOKEN_MESSAGES } from "./api-tokens";

const NOW = new Date("2026-11-07T10:00:00Z");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ORG_X = "33333333-3333-4333-8333-333333333333";

function setup(opts: { fullUser?: boolean; memberOf?: string[]; user?: boolean; findActive?: () => Promise<any>; sessionUser?: boolean; allOrgs?: boolean } = {}) {
  const { token, hash } = generateApiToken();
  const row = { id: 7, userId: "u1", organizationId: opts.allOrgs ? null : "org1", tokenHash: hash };
  const touch = vi.fn(async () => {});
  const findActive =
    opts.findActive ?? (async (h: string) => (h === hashApiToken(token) ? (row as any) : undefined));
  const mw = createApiTokenAuth({
    findActive,
    touch,
    getUser: async (id) =>
      opts.user === false
        ? undefined
        : ({ id, ...(opts.fullUser ? { password: "hash", resetToken: "t", resetTokenExpiry: NOW, email: "a@b.c" } : {}) } as any),
    getUserOrganizationIds: async () => opts.memberOf ?? (opts.allOrgs ? [ORG_A, ORG_B] : ["org1"]),
    now: () => NOW,
  });
  const app = express();
  app.use((req: any, _res, next) => {
    if (opts.sessionUser) req.user = { id: "sess" };
    req.isAuthenticated = () => !!req.user;
    next();
  });
  app.use(mw);
  app.use((req: any, res) =>
    res.json({
      user: req.user?.id,
      org: req.headers["x-organization-id"],
      scope: req.headers["x-organization-scope"],
      full: req.user,
      auth: req.isAuthenticated?.() ?? !!req.user,
      hasOrgHeader: "x-organization-id" in req.headers,
      apiToken: req.apiToken,
    }),
  );
  return { app, token, touch };
}

describe("createApiTokenAuth", () => {
  it("req.user non contiene password né token di reset", async () => {
    const { app, token } = setup({ fullUser: true });
    const res = await request(app).get("/api/user").set("Authorization", `Bearer ${token}`);
    expect(res.body.full).toEqual({ id: "u1", email: "a@b.c" });
  });

  it("autentica con un token valido", async () => {
    const { app, token } = setup();
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: "u1", org: "org1", scope: "personal", auth: true });
  });

  it("sovrascrive gli header di organizzazione del client", async () => {
    const { app, token } = setup();
    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", "altra")
      .set("x-organization-scope", "all");
    expect(res.body.org).toBe("org1");
    expect(res.body.scope).toBe("personal");
  });

  it("il token vince sull'utente di sessione", async () => {
    const { app, token } = setup({ sessionUser: true });
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.body.user).toBe("u1");
  });

  it("token sconosciuto: 401", async () => {
    const { app } = setup();
    const other = generateApiToken().token;
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${other}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(TOKEN_MESSAGES.invalid);
  });

  it("utente non più membro: 401", async () => {
    const { app, token } = setup({ memberOf: ["altra"] });
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("utente inesistente: 401", async () => {
    const { app, token } = setup({ user: false });
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("route vietata: 403", async () => {
    const { app, token } = setup();
    const res = await request(app).get("/api/ai/models").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(TOKEN_MESSAGES.denied);
  });

  it("121ª richiesta nel minuto: 429", async () => {
    const { app, token } = setup();
    for (let i = 0; i < 120; i++) {
      const r = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
      expect(r.status).toBe(200);
    }
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(429);
    expect(res.body.message).toBe(TOKEN_MESSAGES.rate);
  });

  it("Bearer del companion passa intatto", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/projects").set("Authorization", "Bearer abc");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeUndefined();
  });

  it("touch al più una volta al minuto", async () => {
    const { app, token, touch } = setup();
    await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(touch).toHaveBeenCalledTimes(1);
  });

  it("errore del DB: 500 senza dettagli", async () => {
    const { app, token } = setup({
      findActive: async () => {
        throw new Error("boom segreto");
      },
    });
    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "errore interno" });
  });
});

describe("createApiTokenAuth: token «tutte le mie organizzazioni»", () => {
  const call = (app: any, token: string, headers: Record<string, string> = {}) => {
    let r = request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return r;
  };

  it("organizzazione di cui l'utente è membro: header rispettati", async () => {
    const { app, token } = setup({ allOrgs: true });
    const res = await call(app, token, { "x-organization-id": ORG_B, "x-organization-scope": "all" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: "u1", org: ORG_B, scope: "all" });
    expect(res.body.apiToken).toEqual({ id: 7, organizationId: null });
  });

  it("organizzazione di cui l'utente non è membro: 403", async () => {
    const { app, token } = setup({ allOrgs: true });
    const res = await call(app, token, { "x-organization-id": ORG_X });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: TOKEN_MESSAGES.organization });
  });

  it("header non valido (non uuid, ripetuto): 403", async () => {
    const { app, token } = setup({ allOrgs: true });
    for (const value of ["org1", `${ORG_A}, ${ORG_B}`, "x".repeat(500)]) {
      const res = await call(app, token, { "x-organization-id": value });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(TOKEN_MESSAGES.organization);
    }
  });

  it("senza X-Organization-Id non impone nessuna organizzazione", async () => {
    const { app, token } = setup({ allOrgs: true });
    const res = await call(app, token);
    expect(res.status).toBe(200);
    expect(res.body.hasOrgHeader).toBe(false);
    expect(res.body.scope).toBe("personal");
  });

  it("scope non valido diventa personal; personal resta", async () => {
    const { app, token } = setup({ allOrgs: true });
    const bad = await call(app, token, { "x-organization-id": ORG_A, "x-organization-scope": "tutto" });
    expect(bad.body).toMatchObject({ org: ORG_A, scope: "personal" });
    const ok = await call(app, token, { "x-organization-id": ORG_A, "x-organization-scope": "personal" });
    expect(ok.body.scope).toBe("personal");
  });

  it("utente senza organizzazioni resta autenticato ma non può indicarne una", async () => {
    const { app, token } = setup({ allOrgs: true, memberOf: [] });
    expect((await call(app, token)).status).toBe(200);
    expect((await call(app, token, { "x-organization-id": ORG_A })).status).toBe(403);
  });

  it("le route vietate restano vietate", async () => {
    const { app, token } = setup({ allOrgs: true });
    const res = await request(app)
      .get("/api/ai/models")
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", ORG_A);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(TOKEN_MESSAGES.denied);
  });
});

describe("createApiTokenAuth: token con una organizzazione", () => {
  it("ignora l'organizzazione della richiesta anche se l'utente ne è membro", async () => {
    const { app, token } = setup({ memberOf: ["org1", ORG_B] });
    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", ORG_B)
      .set("x-organization-scope", "all");
    expect(res.body).toMatchObject({ org: "org1", scope: "personal" });
    expect(res.body.apiToken).toEqual({ id: 7, organizationId: "org1" });
  });
});
