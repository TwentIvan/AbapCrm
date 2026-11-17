// Server MCP di The Hub Up (`POST /mcp`) per gli strumenti SAP.
//
// Rilancia agli agenti esterni (Botcave) gli strumenti dei server MCP SAP configurati per l'organizzazione:
// credenziali, validazione del catalogo e regole PRD/sola lettura restano in The Hub Up.
// Ogni strumento dichiara il livello d'azione in `_meta["casello/level"]`:
//   - lettura → L0;
//   - scrittura → L2 (Botcave la mette in «Da confermare» prima di chiamarla);
//   - scrittura su un sistema PRD o su una configurazione in sola lettura → L3 (mai offerta al modello,
//     e comunque rifiutata qui se chiamata).
// Il livello si ricalcola a ogni chiamata: una configurazione passata a PRD o a sola lettura blocca subito le scritture.
//
// Server senza stato (Streamable HTTP, risposte JSON): ogni richiesta crea e chiude il proprio server MCP.
// Serve un token personale `thu_…`; l'organizzazione è quella del token o, per i token «tutte le mie
// organizzazioni», l'header `X-Organization-Id` (già verificato dal middleware del token).
//
// Questo modulo non tocca il database: le sorgenti stanno in `thu-mcp-sources.ts`.

import type { Express, Request, RequestHandler, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig } from "@shared/schema";
import type { McpToolInfo } from "./mcp-client";

export type ToolLevel = "L0" | "L2" | "L3";

/** Chiave dei metadati MCP con cui Botcave legge il livello d'azione. */
export const LEVEL_META_KEY = "casello/level";

/** Nomi ammessi da Botcave per gli strumenti MCP. */
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const EXPOSED_NAME_RE = /^sap_([a-f0-9]{8})__(.+)$/;

/** Testo massimo della risposta di uno strumento rilanciato. */
export const RESULT_MAX_CHARS = 20_000;

export const MCP_MESSAGES = {
  tokenRequired: "serve un token API",
  organizationRequired: "X-Organization-Id obbligatorio con un token «tutte le mie organizzazioni»",
  methodNotAllowed: "metodo non ammesso: usa POST",
  unknownTool: "strumento sconosciuto o non più disponibile",
  forbiddenTool: "strumento non disponibile: scrittura su un sistema PRD o su una configurazione in sola lettura",
  badArguments: "argomenti non validi: serve un oggetto",
  unreachable: "server SAP non raggiungibile",
  internal: "errore interno",
} as const;

/** Una configurazione MCP utilizzabile, con le credenziali già risolte. */
export type SapMcpConfig = McpServerConfig;

export interface ThuMcpDeps {
  /** Configurazioni abilitate e validate dell'organizzazione, con `credentialsRef` risolto. */
  listConfigs(organizationId: string): Promise<SapMcpConfig[]>;
  /** Strumenti di un server, già classificati (con le deroghe della configurazione). Lancia se irraggiungibile. */
  listTools(config: SapMcpConfig): Promise<McpToolInfo[]>;
  /** Chiama uno strumento col nome originale. Lancia se irraggiungibile. */
  callTool(
    config: SapMcpConfig,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; text: string; durationMs: number }>;
  /** Registra la chiamata (mai il risultato completo né credenziali). */
  audit(entry: ToolCallAudit): Promise<void>;
}

export interface ToolCallAudit {
  organizationId: string;
  userId: string;
  apiTokenId: number;
  configId: string;
  toolName: string;
  exposedName: string;
  level: ToolLevel;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface CatalogEntry {
  exposedName: string;
  toolName: string;
  config: SapMcpConfig;
  level: ToolLevel;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Nome esposto: `sap_<primi 8 caratteri dell'id della configurazione>__<nome originale>`. */
export function exposedToolName(configId: string, toolName: string): string {
  return `sap_${configId.slice(0, 8)}__${toolName}`;
}

/**
 * Lettura o scrittura: vale la classificazione di The Hub Up (che nel dubbio dice scrittura), ma le
 * annotazioni del server possono solo renderla più prudente (`readOnlyHint: false`, `destructiveHint: true`).
 */
export function effectiveClassification(tool: McpToolInfo): "read" | "write" {
  if (tool.classification === "write") return "write";
  const a = tool.annotations ?? {};
  if (a.readOnlyHint === false || a.destructiveHint === true) return "write";
  return "read";
}

/** Livello d'azione per Botcave. PRD vale sempre come sola lettura, anche se la configurazione dice altro. */
export function toolLevel(config: Pick<McpServerConfig, "environment" | "readOnly">, classification: "read" | "write"): ToolLevel {
  if (classification === "read") return "L0";
  return config.environment === "PRD" || config.readOnly ? "L3" : "L2";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Voci del catalogo di una configurazione: lista bianca, nomi validi, livello. */
export function catalogForConfig(config: SapMcpConfig, tools: McpToolInfo[]): CatalogEntry[] {
  const allowlist = (config.toolAllowlist as string[] | null) ?? [];
  const entries: CatalogEntry[] = [];
  for (const t of tools) {
    if (allowlist.length > 0 && !allowlist.includes(t.name)) continue;
    const exposedName = exposedToolName(config.id, t.name);
    if (!TOOL_NAME_RE.test(exposedName)) continue;
    const env = config.environment || "DEV";
    entries.push({
      exposedName,
      toolName: t.name,
      config,
      level: toolLevel(config, effectiveClassification(t)),
      description: `[${config.name} · ${env}] ${t.description ?? ""}`.trim(),
      inputSchema: isPlainObject(t.inputSchema) ? t.inputSchema : { type: "object", properties: {} },
    });
  }
  return entries;
}

/**
 * Catalogo degli strumenti SAP dell'organizzazione. I server irraggiungibili si saltano (nel log solo il
 * nome della configurazione). Con `prefix` legge solo le configurazioni il cui id inizia così.
 */
export async function buildCatalog(
  deps: ThuMcpDeps,
  organizationId: string,
  prefix?: string,
): Promise<CatalogEntry[]> {
  const configs = (await deps.listConfigs(organizationId)).filter((c) => !prefix || c.id.startsWith(prefix));
  const results = await Promise.allSettled(configs.map(async (c) => catalogForConfig(c, await deps.listTools(c))));
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`[THU-MCP] server "${configs[i].name}" non raggiungibile: saltato`);
      return;
    }
    for (const e of r.value) {
      // Due configurazioni con lo stesso prefisso di id: vince la prima, l'altra non è indirizzabile.
      if (seen.has(e.exposedName)) continue;
      seen.add(e.exposedName);
      entries.push(e);
    }
  });
  return entries;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const errorResult = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

export interface CallContext {
  organizationId: string;
  userId: string;
  apiTokenId: number;
}

/** Esegue `tools/call`: ritrova lo strumento, ricontrolla il livello, rilancia e registra. */
export async function callSapTool(
  deps: ThuMcpDeps,
  ctx: CallContext,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const m = EXPOSED_NAME_RE.exec(name);
  if (!m) return errorResult(MCP_MESSAGES.unknownTool);
  if (rawArgs !== undefined && !isPlainObject(rawArgs)) return errorResult(MCP_MESSAGES.badArguments);
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const entry = (await buildCatalog(deps, ctx.organizationId, m[1])).find((e) => e.exposedName === name);
  if (!entry) return errorResult(MCP_MESSAGES.unknownTool);

  const base = {
    ...ctx,
    configId: entry.config.id,
    toolName: entry.toolName,
    exposedName: entry.exposedName,
    level: entry.level,
    args,
  };
  if (entry.level === "L3") {
    await deps.audit({ ...base, ok: false, durationMs: 0, error: "bloccato: L3" }).catch(() => {});
    return errorResult(MCP_MESSAGES.forbiddenTool);
  }

  const started = Date.now();
  let result: { ok: boolean; text: string; durationMs: number };
  try {
    result = await deps.callTool(entry.config, entry.toolName, args);
  } catch {
    await deps
      .audit({ ...base, ok: false, durationMs: Date.now() - started, error: "non raggiungibile" })
      .catch(() => {});
    return errorResult(MCP_MESSAGES.unreachable);
  }
  await deps.audit({ ...base, ok: result.ok, durationMs: result.durationMs }).catch(() => {});
  const text = result.text.slice(0, RESULT_MAX_CHARS);
  return result.ok ? { content: [{ type: "text", text }] } : errorResult(text || "errore dello strumento");
}

/** Server MCP di una singola richiesta, legato al contesto del token. */
export function createSapMcpServer(deps: ThuMcpDeps, ctx: CallContext): Server {
  const server = new Server({ name: "the-hub-up", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const entries = await buildCatalog(deps, ctx.organizationId);
    return {
      tools: entries.map((e) => ({
        name: e.exposedName,
        description: e.description,
        inputSchema: e.inputSchema as { type: "object"; [k: string]: unknown },
        annotations: { readOnlyHint: e.level === "L0", openWorldHint: true },
        _meta: { [LEVEL_META_KEY]: e.level },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callSapTool(deps, ctx, request.params.name, request.params.arguments),
  );

  return server;
}

function jsonRpcError(res: Response, status: number, message: string) {
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

/** Contesto della richiesta o un errore HTTP già inviato. */
function requestContext(req: Request, res: Response): CallContext | null {
  const token = req.apiToken;
  const user = req.user as { id?: string } | undefined;
  if (!token || !user?.id) {
    jsonRpcError(res, 401, MCP_MESSAGES.tokenRequired);
    return null;
  }
  const org = req.headers["x-organization-id"];
  if (typeof org !== "string" || org === "") {
    jsonRpcError(res, 400, MCP_MESSAGES.organizationRequired);
    return null;
  }
  return { organizationId: org, userId: user.id, apiTokenId: token.id };
}

/** Handler di `POST /mcp`. */
export function createThuMcpHandler(deps: ThuMcpDeps): RequestHandler {
  return async (req, res) => {
    const ctx = requestContext(req, res);
    if (!ctx) return;
    const server = createSapMcpServer(deps, ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[THU-MCP] errore:", error instanceof Error ? error.name : "errore");
      if (!res.headersSent) jsonRpcError(res, 500, MCP_MESSAGES.internal);
    }
  };
}

/** Monta `/mcp`: POST col server, gli altri metodi (GET per l'SSE, DELETE della sessione) → 405. */
export function registerThuMcpRoutes(app: Express, deps: ThuMcpDeps): void {
  app.post("/mcp", createThuMcpHandler(deps));
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    jsonRpcError(res, 405, MCP_MESSAGES.methodNotAllowed);
  });
}
