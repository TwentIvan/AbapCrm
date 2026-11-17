import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createApiTokenWriteAudit, auditPath, AUDIT_PATH_MAX, AUDIT_USER_AGENT_MAX } from "./api-token-audit";
import { createApiTokenAuth } from "./api-token-auth";
import { generateApiToken, hashApiToken } from "./api-tokens";

const NOW = new Date("2026-11-17T10:00:00Z");
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

/** App con audit + middleware reale del token, come in auth.ts. */
function setup(opts: { allOrgs?: boolean; record?: (e: any) => Promise<void>; sessionUser?: boolean } = {}) {
  const { token, hash } = generateApiToken();
  const row = { id: 7, userId: "u1", organizationId: opts.allOrgs ? null : ORG_A, tokenHash: hash };
  const entries: any[] = [];
  let resolveRecorded: () => void = () => {};
  let recorded = new Promise<void>((r) => (resolveRecorded = r));
  const record = vi.fn(
    opts.record ??
      (async (e: any) => {
        entries.push(e);
        resolveRecorded();
      }),
  );
  let t = 1000;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (opts.sessionUser) req.user = { id: "sess" };
    req.isAuthenticated = () => !!req.user;
    next();
  });
  app.use(createApiTokenWriteAudit({ record, clock: () => (t += 25) }));
  app.use(
    createApiTokenAuth({
      findActive: async (h) => (h === hashApiToken(token) ? (row as any) : undefined),
      touch: async () => {},
      getUser: async (id) => ({ id }) as any,
      getUserOrganizationIds: async () => [ORG_A, ORG_B],
      now: () => NOW,
    }),
  );
  app.post("/api/tasks", (_req, res) => res.status(201).json({ ok: true }));
  app.put("/api/tasks/:id", (_req, res) => res.json({ ok: true }));
  app.patch("/api/proposals/:id", (_req, res) => res.status(409).json({ message: "conflitto" }));
  app.delete("/api/comments/:id", (_req, res) => res.sendStatus(204));
  app.get("/api/tasks", (_req, res) => res.json([]));
  // Risponde dopo 200 ms: il client chiude prima.
  app.post("/api/slow", (_req, res) => {
    setTimeout(() => {
      if (!res.writableEnded) res.json({ ok: true });
    }, 200);
  });
  app.post("/api/boom", () => {
    throw new Error("boom");
  });
  const nextRecord = async () => {
    await recorded;
    recorded = new Promise<void>((r) => (resolveRecorded = r));
  };
  return { app, token, entries, record, nextRecord };
}

describe("auditPath", () => {
  it("toglie query string e frammento e tronca i percorsi lunghi", () => {
    expect(auditPath("/api/tasks/5?secret=x&y=1")).toBe("/api/tasks/5");
    expect(auditPath("/api/tasks#frag")).toBe("/api/tasks");
    expect(auditPath("?a=1")).toBe("/");
    expect(auditPath("/" + "a".repeat(1000))).toHaveLength(AUDIT_PATH_MAX);
  });
});

describe("createApiTokenWriteAudit", () => {
  it("registra una POST con token: token, utente, organizzazione, metodo, percorso, esito, durata", async () => {
    const { app, token, entries, nextRecord } = setup();
    const res = await request(app)
      .post("/api/tasks?apiKey=segreto")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "botcave/1.0")
      .send({ title: "Task con dato riservato" });
    expect(res.status).toBe(201);
    await nextRecord();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tokenId: 7,
      userId: "u1",
      organizationId: ORG_A,
      method: "POST",
      path: "/api/tasks",
      statusCode: 201,
      userAgent: "botcave/1.0",
    });
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof entries[0].ipAddress).toBe("string");
  });

  it("non conserva mai il corpo né la query string né il token", async () => {
    const { app, token, entries, nextRecord } = setup();
    await request(app)
      .put("/api/tasks/5?apiKey=segreto")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "dato riservato" });
    await nextRecord();
    const serialized = JSON.stringify(entries[0]);
    expect(serialized).not.toContain("dato riservato");
    expect(serialized).not.toContain("segreto");
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(hashApiToken(token));
  });

  it("registra PATCH e DELETE con il loro esito, anche se è un errore", async () => {
    const { app, token, entries, nextRecord } = setup();
    await request(app).patch("/api/proposals/9").set("Authorization", `Bearer ${token}`).send({});
    await nextRecord();
    await request(app).delete("/api/comments/3").set("Authorization", `Bearer ${token}`);
    await nextRecord();
    expect(entries.map((e) => [e.method, e.path, e.statusCode])).toEqual([
      ["PATCH", "/api/proposals/9", 409],
      ["DELETE", "/api/comments/3", 204],
    ]);
  });

  it("registra anche la scrittura su una route vietata ai token (403)", async () => {
    const { app, token, entries, nextRecord } = setup();
    const res = await request(app).post("/api/users").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
    await nextRecord();
    expect(entries[0]).toMatchObject({ method: "POST", path: "/api/users", statusCode: 403, tokenId: 7 });
  });

  it("registra la scrittura finita in errore del server (500)", async () => {
    const { app, token, entries, nextRecord } = setup();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).post("/api/boom").set("Authorization", `Bearer ${token}`).send({});
    err.mockRestore();
    expect(res.status).toBe(500);
    await nextRecord();
    expect(entries[0]).toMatchObject({ path: "/api/boom", statusCode: 500 });
  });

  it("token «tutte le organizzazioni»: registra l'organizzazione indicata dalla richiesta", async () => {
    const { app, token, entries, nextRecord } = setup({ allOrgs: true });
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", ORG_B)
      .send({});
    await nextRecord();
    expect(entries[0].organizationId).toBe(ORG_B);
  });

  it("token «tutte le organizzazioni» senza organizzazione nella richiesta: organizationId null", async () => {
    const { app, token, entries, nextRecord } = setup({ allOrgs: true });
    await request(app).post("/api/tasks").set("Authorization", `Bearer ${token}`).send({});
    await nextRecord();
    expect(entries[0].organizationId).toBeNull();
  });

  it("non registra le letture con token", async () => {
    const { app, token, record } = setup();
    const res = await request(app).get("/api/tasks").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(record).not.toHaveBeenCalled();
  });

  it("non registra le scritture di sessione né quelle senza autenticazione", async () => {
    const { app, record } = setup({ sessionUser: true });
    await request(app).post("/api/tasks").send({});
    const anon = setup();
    await request(anon.app).post("/api/tasks").send({});
    await new Promise((r) => setTimeout(r, 20));
    expect(record).not.toHaveBeenCalled();
    expect(anon.record).not.toHaveBeenCalled();
  });

  it("non registra le scritture con un token non valido (401)", async () => {
    const { app, record } = setup();
    const other = generateApiToken().token;
    const res = await request(app).post("/api/tasks").set("Authorization", `Bearer ${other}`).send({});
    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 20));
    expect(record).not.toHaveBeenCalled();
  });

  it("un errore nel salvataggio dell'audit non cambia la risposta e non logga dati", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, token } = setup({
      record: async () => {
        throw new Error(`fallito ${"x"}`);
      },
    });
    const res = await request(app).post("/api/tasks").set("Authorization", `Bearer ${token}`).send({ a: 1 });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 20));
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0].join(" ")).not.toContain("fallito");
    err.mockRestore();
  });

  it("connessione chiusa dal client prima della risposta: registra l'esito 499", async () => {
    const { app, token, entries, nextRecord } = setup();
    await expect(
      request(app).post("/api/slow").set("Authorization", `Bearer ${token}`).send({}).timeout(30),
    ).rejects.toThrow();
    await nextRecord();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: "/api/slow", statusCode: 499 });
  });

  it("tronca lo user agent troppo lungo", async () => {
    const { app, token, entries, nextRecord } = setup();
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "u".repeat(1000))
      .send({});
    await nextRecord();
    expect(entries[0].userAgent).toHaveLength(AUDIT_USER_AGENT_MAX);
  });
});
