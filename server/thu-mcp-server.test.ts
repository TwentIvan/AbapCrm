import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  LEVEL_META_KEY,
  MCP_MESSAGES,
  RESULT_MAX_CHARS,
  effectiveClassification,
  exposedToolName,
  registerThuMcpRoutes,
  toolLevel,
  type SapMcpConfig,
  type ThuMcpDeps,
} from "./thu-mcp-server";
import type { McpToolInfo } from "./mcp-client";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

function cfg(id: string, over: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    id,
    organizationId: ORG,
    name: `Server ${id.slice(0, 4)}`,
    environment: "DEV",
    readOnly: false,
    toolAllowlist: [],
    enabled: true,
    catalogId: "cat",
    ...over,
  } as SapMcpConfig;
}

const tool = (name: string, classification: "read" | "write", over: Partial<McpToolInfo> = {}): McpToolInfo => ({
  name,
  namespacedName: name,
  description: `descrizione di ${name}`,
  inputSchema: { type: "object", properties: { q: { type: "string" } } },
  classification,
  ...over,
});

const DEV = "aaaaaaaa-0000-4000-8000-000000000001";
const PRD = "bbbbbbbb-0000-4000-8000-000000000002";
const RO = "cccccccc-0000-4000-8000-000000000003";
const DOWN = "dddddddd-0000-4000-8000-000000000004";

function makeDeps(over: Partial<ThuMcpDeps> = {}) {
  const configs: Record<string, SapMcpConfig[]> = {
    [ORG]: [
      cfg(DEV),
      cfg(PRD, { environment: "PRD", readOnly: false }),
      cfg(RO, { readOnly: true }),
      cfg(DOWN),
    ],
    [OTHER_ORG]: [],
  };
  const tools: Record<string, McpToolInfo[]> = {
    [DEV]: [tool("read_table", "read"), tool("create_transport", "write")],
    [PRD]: [tool("read_table", "read"), tool("activate_object", "write")],
    [RO]: [tool("delete_object", "write")],
  };
  const deps = {
    listConfigs: vi.fn(async (org: string) => configs[org] ?? []),
    listTools: vi.fn(async (c: SapMcpConfig) => {
      if (c.id === DOWN) throw new Error("ECONNREFUSED");
      return tools[c.id] ?? [];
    }),
    callTool: vi.fn(async (_c: SapMcpConfig, name: string, args: Record<string, unknown>) => ({
      ok: true,
      text: `ok ${name} ${JSON.stringify(args)}`,
      durationMs: 5,
    })),
    audit: vi.fn(async () => {}),
    ...over,
  };
  return deps;
}

type Auth = { token?: boolean; org?: string | null };

function makeApp(deps: ThuMcpDeps, auth: Auth = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (auth.token !== false) {
      req.user = { id: "user-1" };
      req.apiToken = { id: 7, organizationId: auth.org === undefined ? ORG : null };
    }
    const org = auth.org === undefined ? ORG : auth.org;
    if (org) req.headers["x-organization-id"] = org;
    next();
  });
  registerThuMcpRoutes(app, deps);
  return app;
}

const servers: HttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function connect(deps: ThuMcpDeps, auth?: Auth) {
  const http = makeApp(deps, auth).listen(0);
  servers.push(http);
  await new Promise((r) => http.once("listening", r));
  const { port } = http.address() as AddressInfo;
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  return client;
}

const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

describe("livelli e classificazione", () => {
  it("lettura L0, scrittura L2, scrittura su PRD o sola lettura L3", () => {
    expect(toolLevel({ environment: "PRD", readOnly: false }, "read")).toBe("L0");
    expect(toolLevel({ environment: "DEV", readOnly: false }, "write")).toBe("L2");
    expect(toolLevel({ environment: "PRD", readOnly: false }, "write")).toBe("L3");
    expect(toolLevel({ environment: "QAS", readOnly: true }, "write")).toBe("L3");
  });

  it("le annotazioni del server possono solo rendere la lettura una scrittura", () => {
    expect(effectiveClassification(tool("x", "read", { annotations: { readOnlyHint: false } }))).toBe("write");
    expect(effectiveClassification(tool("x", "read", { annotations: { destructiveHint: true } }))).toBe("write");
    expect(effectiveClassification(tool("x", "write", { annotations: { readOnlyHint: true } }))).toBe("write");
    expect(effectiveClassification(tool("x", "read", { annotations: { readOnlyHint: true } }))).toBe("read");
  });
});

describe("POST /mcp: tools/list", () => {
  it("rilancia gli strumenti SAP dell'organizzazione con nome, descrizione e livello", async () => {
    const deps = makeDeps();
    const client = await connect(deps);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(Object.keys(byName).sort()).toEqual(
      [
        exposedToolName(DEV, "read_table"),
        exposedToolName(DEV, "create_transport"),
        exposedToolName(PRD, "read_table"),
        exposedToolName(PRD, "activate_object"),
        exposedToolName(RO, "delete_object"),
      ].sort(),
    );
    const level = (n: string) => (byName[n]._meta as any)[LEVEL_META_KEY];
    expect(level(exposedToolName(DEV, "read_table"))).toBe("L0");
    expect(level(exposedToolName(DEV, "create_transport"))).toBe("L2");
    expect(level(exposedToolName(PRD, "read_table"))).toBe("L0");
    expect(level(exposedToolName(PRD, "activate_object"))).toBe("L3");
    expect(level(exposedToolName(RO, "delete_object"))).toBe("L3");
    expect(byName[exposedToolName(DEV, "read_table")].annotations?.readOnlyHint).toBe(true);
    expect(byName[exposedToolName(DEV, "create_transport")].annotations?.readOnlyHint).toBe(false);
    expect(byName[exposedToolName(PRD, "read_table")].description).toBe(`[Server bbbb · PRD] descrizione di read_table`);
    expect(byName[exposedToolName(DEV, "read_table")].inputSchema).toEqual({
      type: "object",
      properties: { q: { type: "string" } },
    });
    expect(deps.listConfigs).toHaveBeenCalledWith(ORG);
  });

  it("server irraggiungibile saltato; lista bianca e nomi non validi per Botcave filtrati", async () => {
    const deps = makeDeps({
      listConfigs: vi.fn(async () => [cfg(DEV, { toolAllowlist: ["read_table", "bad.name"] }), cfg(DOWN)]),
      listTools: vi.fn(async (c: SapMcpConfig) => {
        if (c.id === DOWN) throw new Error("down");
        return [tool("read_table", "read"), tool("create_transport", "write"), tool("bad.name", "read")];
      }),
    });
    const client = await connect(deps);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([exposedToolName(DEV, "read_table")]);
  });

  it("solo le configurazioni dell'organizzazione della richiesta", async () => {
    const deps = makeDeps();
    const client = await connect(deps, { org: OTHER_ORG });
    const { tools } = await client.listTools();
    expect(tools).toEqual([]);
    expect(deps.listConfigs).toHaveBeenCalledWith(OTHER_ORG);
  });
});

describe("POST /mcp: tools/call", () => {
  it("lettura: rilancia allo strumento originale e registra l'audit", async () => {
    const deps = makeDeps();
    const client = await connect(deps);
    const res: any = await client.callTool({ name: exposedToolName(DEV, "read_table"), arguments: { q: "T000" } });
    expect(res.isError).toBeFalsy();
    expect(text(res)).toBe('ok read_table {"q":"T000"}');
    expect(deps.callTool).toHaveBeenCalledTimes(1);
    expect(deps.callTool.mock.calls[0][0].id).toBe(DEV);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        userId: "user-1",
        apiTokenId: 7,
        configId: DEV,
        toolName: "read_table",
        level: "L0",
        ok: true,
      }),
    );
    // Alla chiamata legge solo la configurazione dello strumento.
    expect(deps.listTools).toHaveBeenCalledTimes(1);
  });

  it("scrittura L2 su DEV: eseguita (la conferma l'ha già data Botcave)", async () => {
    const deps = makeDeps();
    const client = await connect(deps);
    const res: any = await client.callTool({ name: exposedToolName(DEV, "create_transport"), arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(deps.callTool).toHaveBeenCalledTimes(1);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ level: "L2", ok: true }));
  });

  it("scrittura su PRD o su configurazione in sola lettura: bloccata e registrata, mai rilanciata", async () => {
    const deps = makeDeps();
    const client = await connect(deps);
    for (const name of [exposedToolName(PRD, "activate_object"), exposedToolName(RO, "delete_object")]) {
      const res: any = await client.callTool({ name, arguments: {} });
      expect(res.isError).toBe(true);
      expect(text(res)).toBe(MCP_MESSAGES.forbiddenTool);
    }
    expect(deps.callTool).not.toHaveBeenCalled();
    expect(deps.audit).toHaveBeenCalledTimes(2);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ level: "L3", ok: false }));
  });

  it("il livello si ricalcola a ogni chiamata: configurazione passata a sola lettura → bloccata", async () => {
    let readOnly = false;
    const deps = makeDeps({ listConfigs: vi.fn(async () => [cfg(DEV, { readOnly })]) });
    const client = await connect(deps);
    const name = exposedToolName(DEV, "create_transport");
    expect(((await client.callTool({ name, arguments: {} })) as any).isError).toBeFalsy();
    readOnly = true;
    const res: any = await client.callTool({ name, arguments: {} });
    expect(res.isError).toBe(true);
    expect(deps.callTool).toHaveBeenCalledTimes(1);
  });

  it("strumento sconosciuto, di un'altra organizzazione o con nome non nostro → errore, nessuna chiamata", async () => {
    const deps = makeDeps();
    const other = await connect(deps, { org: OTHER_ORG });
    const res1: any = await other.callTool({ name: exposedToolName(DEV, "read_table"), arguments: {} });
    expect(text(res1)).toBe(MCP_MESSAGES.unknownTool);
    const client = await connect(deps);
    for (const name of [exposedToolName(DEV, "nope"), "read_table", "mcp__aaaaaaaa__read_table"]) {
      const res: any = await client.callTool({ name, arguments: {} });
      expect(res.isError).toBe(true);
      expect(text(res)).toBe(MCP_MESSAGES.unknownTool);
    }
    expect(deps.callTool).not.toHaveBeenCalled();
  });

  it("server non raggiungibile alla chiamata: messaggio fisso, nessun dettaglio dell'errore", async () => {
    const deps = makeDeps({
      callTool: vi.fn(async () => {
        throw new Error("password=segreta host=10.0.0.1");
      }),
    });
    const client = await connect(deps);
    const res: any = await client.callTool({ name: exposedToolName(DEV, "read_table"), arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe(MCP_MESSAGES.unreachable);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "non raggiungibile" }));
  });

  it("errore dello strumento: isError col testo; risposta lunga troncata", async () => {
    const deps = makeDeps({
      callTool: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, text: "tabella inesistente", durationMs: 1 })
        .mockResolvedValueOnce({ ok: true, text: "x".repeat(RESULT_MAX_CHARS + 50), durationMs: 1 }),
    });
    const client = await connect(deps);
    const name = exposedToolName(DEV, "read_table");
    const r1: any = await client.callTool({ name, arguments: {} });
    expect(r1.isError).toBe(true);
    expect(text(r1)).toBe("tabella inesistente");
    const r2: any = await client.callTool({ name, arguments: {} });
    expect(text(r2)).toHaveLength(RESULT_MAX_CHARS);
  });
});

describe("POST /mcp: accesso", () => {
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } },
  };
  const accept = "application/json, text/event-stream";

  it("senza token (anche con la sessione) → 401", async () => {
    const res = await request(makeApp(makeDeps(), { token: false })).post("/mcp").set("Accept", accept).send(init);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(MCP_MESSAGES.tokenRequired);
  });

  it("token «tutte le mie organizzazioni» senza X-Organization-Id → 400", async () => {
    const res = await request(makeApp(makeDeps(), { org: null })).post("/mcp").set("Accept", accept).send(init);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(MCP_MESSAGES.organizationRequired);
  });

  it("GET e DELETE → 405", async () => {
    const app = makeApp(makeDeps());
    for (const res of [await request(app).get("/mcp"), await request(app).delete("/mcp")]) {
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe("POST");
    }
  });
});
