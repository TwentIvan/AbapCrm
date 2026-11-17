import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeniedForToken } from "./api-tokens";
import {
  buildTokenOpenApi,
  expressPathVariants,
  isTokenOpenRoute,
  listRegisteredRoutes,
  registerOpenApiRoute,
  type RegisteredRoute,
} from "./openapi";

const noop = (_req: any, res: any) => res.sendStatus(204);

function operations(doc: ReturnType<typeof buildTokenOpenApi>) {
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => ({ method, path, op: op as any })),
  );
}

/** Le route dichiarate nei sorgenti del server, lette dal testo (senza avviare il database). */
function sourceRoutes(): RegisteredRoute[] {
  const files = ["routes.ts", "auth.ts", "api-token-routes.ts"];
  const out: RegisteredRoute[] = [];
  for (const f of files) {
    const text = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), "utf8");
    for (const m of text.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
      out.push({ method: m[1] as RegisteredRoute["method"], path: m[2] });
    }
  }
  // Registrata da registerOpenApiRoute con una costante, non con un letterale.
  out.push({ method: "get", path: "/api/openapi.json" });
  return out;
}

describe("listRegisteredRoutes", () => {
  it("raccoglie metodi e percorsi dell'app e dei router montati, senza doppioni", () => {
    const app = express();
    app.get("/api/tasks", noop);
    app.route("/api/tasks/:id").get(noop).put(noop);
    app.get("/api/tasks", noop); // doppione: vince la prima
    app.get(["/api/a", "/api/b"], noop);
    const router = express.Router();
    router.post("/runs", noop);
    app.use("/api/agents", router);
    app.use(express.json());

    const routes = listRegisteredRoutes(app);
    expect(routes).toEqual([
      { method: "get", path: "/api/tasks" },
      { method: "get", path: "/api/tasks/:id" },
      { method: "put", path: "/api/tasks/:id" },
      { method: "get", path: "/api/a" },
      { method: "get", path: "/api/b" },
      { method: "post", path: "/api/agents/runs" },
    ]);
  });
});

describe("expressPathVariants", () => {
  it("converte i parametri, toglie i vincoli e sdoppia il parametro finale opzionale", () => {
    expect(expressPathVariants("/api/tasks/:id/comments/:commentId")).toEqual([
      { expressPath: "/api/tasks/:id/comments/:commentId", openApiPath: "/api/tasks/{id}/comments/{commentId}", params: ["id", "commentId"] },
    ]);
    expect(expressPathVariants("/api/items/:id(\\d+)")).toEqual([
      { expressPath: "/api/items/:id", openApiPath: "/api/items/{id}", params: ["id"] },
    ]);
    expect(expressPathVariants("/api/context-packs/:scopeType/:scopeId?")).toEqual([
      { expressPath: "/api/context-packs/:scopeType", openApiPath: "/api/context-packs/{scopeType}", params: ["scopeType"] },
      {
        expressPath: "/api/context-packs/:scopeType/:scopeId",
        openApiPath: "/api/context-packs/{scopeType}/{scopeId}",
        params: ["scopeType", "scopeId"],
      },
    ]);
  });

  it("scarta i percorsi con caratteri jolly", () => {
    expect(expressPathVariants("/api/files/*")).toBeNull();
    expect(expressPathVariants("/api/a+b")).toBeNull();
  });
});

describe("isTokenOpenRoute", () => {
  it("esclude le route vietate ai token, anche con parametri", () => {
    expect(isTokenOpenRoute("GET", "/api/tasks/:id")).toBe(true);
    expect(isTokenOpenRoute("GET", "/api/account/api-tokens")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/users/:id")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/sap-systems/:systemId/credentials")).toBe(false);
    expect(isTokenOpenRoute("POST", "/api/sap-systems/:systemId/credentials")).toBe(false);
    expect(isTokenOpenRoute("POST", "/api/hubup/jobs/:id/result")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/hubup/jobs/next")).toBe(false);
  });

  it("organizzazioni e catalogo MCP: lettura sì, scrittura no", () => {
    expect(isTokenOpenRoute("GET", "/api/organizations")).toBe(true);
    expect(isTokenOpenRoute("PUT", "/api/organizations/:id")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/mcp/catalog")).toBe(true);
    expect(isTokenOpenRoute("POST", "/api/mcp/catalog")).toBe(false);
  });

  it("fuori contratto: percorsi non /api, diagnostica, debug e risorsa variabile", () => {
    expect(isTokenOpenRoute("GET", "/objects/logos/:logoId")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/__health")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/debug/auth-probe/:username")).toBe(false);
    expect(isTokenOpenRoute("GET", "/api/:entity/:id")).toBe(false);
  });
});

describe("buildTokenOpenApi", () => {
  const routes: RegisteredRoute[] = [
    { method: "get", path: "/api/tasks" },
    { method: "post", path: "/api/tasks" },
    { method: "get", path: "/api/tasks/:id" },
    { method: "delete", path: "/api/tasks/:id" },
    { method: "get", path: "/api/account/api-tokens" },
    { method: "get", path: "/api/sap-systems/:systemId/credentials" },
    { method: "get", path: "/api/organizations" },
    { method: "post", path: "/api/organizations" },
    { method: "get", path: "/api/messages" },
    { method: "get", path: "/api/__health" },
    { method: "get", path: "/" },
  ];

  it("OpenAPI 3.1 con autenticazione bearer e solo le operazioni aperte ai token", () => {
    const doc = buildTokenOpenApi(routes, { version: "2.0.0", serverUrl: "https://hub.example" });
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.version).toBe("2.0.0");
    expect(doc.servers).toEqual([{ url: "https://hub.example" }]);
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(operations(doc).map((o) => `${o.method} ${o.path}`).sort()).toEqual([
      "delete /api/tasks/{id}",
      "get /api/messages",
      "get /api/organizations",
      "get /api/tasks",
      "get /api/tasks/{id}",
      "post /api/tasks",
    ]);
    expect(doc.tags.map((t) => t.name)).toEqual(["messages", "organizations", "tasks"]);
  });

  it("parametri di percorso, header di organizzazione, risposte d'errore del token e corpo per le scritture", () => {
    const doc = buildTokenOpenApi(routes);
    const get = (doc.paths["/api/tasks/{id}"] as any).get;
    expect(get.operationId).toBe("getTasksById");
    expect(get.summary).toBe("Dettaglio di un task");
    expect(get.parameters).toContainEqual({ name: "id", in: "path", required: true, schema: { type: "string" } });
    expect(get.parameters).toContainEqual({ $ref: "#/components/parameters/OrganizationId" });
    expect(Object.keys(get.responses)).toEqual(expect.arrayContaining(["200", "401", "403", "404", "429"]));
    expect(get.requestBody).toBeUndefined();

    const post = (doc.paths["/api/tasks"] as any).post;
    expect(post.requestBody).toBeDefined();
    expect(post.responses["201"]).toBeDefined();
    expect(post.description).toContain("work item esterno");
    expect((doc.paths["/api/tasks/{id}"] as any).delete.requestBody).toBeUndefined();

    const messages = (doc.paths["/api/messages"] as any).get;
    expect(messages.parameters).toContainEqual(expect.objectContaining({ name: "summary", in: "query" }));
  });

  it("senza descrizione curata il riassunto è metodo e percorso", () => {
    const doc = buildTokenOpenApi([{ method: "patch", path: "/api/widgets/:id" }]);
    expect((doc.paths["/api/widgets/{id}"] as any).patch.summary).toBe("PATCH /api/widgets/{id}");
  });

  describe("sulle route reali del server", () => {
    const doc = buildTokenOpenApi(sourceRoutes());
    const ops = operations(doc);

    it("nessuna operazione del contratto è vietata ai token", () => {
      expect(ops.length).toBeGreaterThan(100);
      for (const { method, path } of ops) {
        const sample = path.replace(/\{\w+\}/g, "abc");
        expect(isDeniedForToken(method, sample), `${method} ${path}`).toBe(false);
      }
    });

    it("le route vietate più delicate non compaiono", () => {
      const paths = Object.keys(doc.paths);
      for (const prefix of [
        "/api/account/api-tokens",
        "/api/users",
        "/api/login",
        "/api/system-credentials",
        "/api/vpn",
        "/api/email",
        "/api/ai",
        "/api/hubup/companion",
        "/api/debug",
      ]) {
        expect(paths.filter((p) => p === prefix || p.startsWith(prefix + "/")), prefix).toEqual([]);
      }
      expect(paths.some((p) => /^\/api\/sap-systems\/\{\w+\}\/credentials/.test(p))).toBe(false);
    });

    it("contiene le operazioni principali usate dagli agenti", () => {
      const keys = new Set(ops.map((o) => `${o.method} ${o.path}`));
      for (const key of [
        "get /api/openapi.json",
        "get /api/user",
        "get /api/tasks",
        "post /api/tasks",
        "get /api/tasks/{id}",
        "get /api/messages",
        "get /api/proposals/{id}",
        "post /api/comments",
        "get /api/context-packs/{scopeType}/{scopeId}",
      ]) {
        expect(keys.has(key), key).toBe(true);
      }
    });

    it("operationId univoci e ogni parametro del percorso dichiarato", () => {
      const ids = ops.map((o) => o.op.operationId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const { path, op } of ops) {
        const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const declared = op.parameters.filter((p: any) => p.in === "path").map((p: any) => p.name);
        expect(declared, path).toEqual(inPath);
      }
    });
  });
});

describe("GET /api/openapi.json", () => {
  function setup(user: boolean) {
    const app = express();
    app.use((req: any, _res, next) => {
      if (user) req.user = { id: "u1" };
      req.isAuthenticated = () => !!req.user;
      next();
    });
    registerOpenApiRoute(app);
    app.get("/api/tasks", noop);
    app.get("/api/account/api-tokens", noop);
    return app;
  }

  it("senza autenticazione → 401", async () => {
    const res = await request(setup(false)).get("/api/openapi.json");
    expect(res.status).toBe(401);
  });

  it("con utente (sessione o token) → contratto con le route registrate anche dopo", async () => {
    const app = setup(true);
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.paths).sort()).toEqual(["/api/openapi.json", "/api/tasks"]);
    const again = await request(app).get("/api/openapi.json");
    expect(again.body).toEqual(res.body);
  });
});
