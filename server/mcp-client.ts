// MCP Client — Phase 4
// The CRM backend acts as the MCP CLIENT.
// Connects to remote MCP servers, lists tools, classifies and namespaces them.
// Phase 3: only read tools exposed to AI model.
// Phase 4: write tools also exposed (non-PRD, non-readOnly), namespaced, marked requiresApproval.

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { mcpServerConfigs } from "@shared/schema";
import type { McpServerConfig } from "@shared/schema";

export type { McpServerConfig };

const TOOL_RESULT_MAX_CHARS = 20_000;
const CONNECT_TIMEOUT_MS = 10_000;

// ── Tool classification ──────────────────────────────────────────────────────

const WRITE_KEYWORDS =
  /\b(create|creat|update|updat|delete|delet|write|writ|insert|modify|modif|activate|activ|deploy|transport|execute|execut|run\b|set\b|submit|release|lock|unlock|post\b|put\b|patch\b|drop|truncat|alter\b|grant|revoke|send|publish|trigger|start|stop|restart|remove|erase)\b/i;

const READ_KEYWORDS =
  /\b(get|fetch|read|list|query|search|find|show|view|describe|explain|analyz|check|ping|test|monitor|status|info|report|count|display|preview|inspect)\b/i;

/**
 * Classify a tool as "read" or "write".
 * Default is "write" (fail-safe: unknown = write).
 */
export function classifyTool(
  name: string,
  description: string | undefined | null
): "read" | "write" {
  if (!description || description.trim() === "") return "write";
  const combined = `${name} ${description}`;
  if (WRITE_KEYWORDS.test(combined)) return "write";
  if (READ_KEYWORDS.test(combined)) return "read";
  return "write";
}

/**
 * Return the namespaced tool name for a given config + tool.
 * Format: mcp__{first8charsOfConfigId}__{originalToolName}
 */
export function namespaceTool(configId: string, toolName: string): string {
  return `mcp__${configId.slice(0, 8)}__${toolName}`;
}

/**
 * Extract original tool name from a namespaced name.
 * Returns null if not a namespaced MCP tool.
 */
export function denamespaceTool(namespacedName: string): { prefix: string; toolName: string } | null {
  const m = namespacedName.match(/^mcp__([a-f0-9]{8})__(.+)$/);
  if (!m) return null;
  return { prefix: m[1], toolName: m[2] };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`MCP connect timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function buildClient(endpoint: string): Promise<{ client: Client; kind: "streamable-http" | "sse" }> {
  const url = new URL(endpoint);

  try {
    const transport = new StreamableHTTPClientTransport(url);
    const client = new Client({ name: "crm-backend", version: "1.0.0" });
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS);
    return { client, kind: "streamable-http" };
  } catch {
    const transport = new SSEClientTransport(url);
    const client = new Client({ name: "crm-backend", version: "1.0.0" });
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS);
    return { client, kind: "sse" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface McpToolInfo {
  name: string;           // original tool name (e.g. "sap_ping")
  namespacedName: string; // namespaced for model (e.g. "mcp__abc12345__sap_ping")
  description?: string;
  inputSchema?: any;
  classification: "read" | "write";
}

export interface ConnectResult {
  tools: McpToolInfo[];
  transport: "streamable-http" | "sse";
}

/**
 * Connect to an MCP server, list its tools, classify and namespace each one.
 * Applies toolClassificationOverrides from config (read→write only; write→read silently ignored).
 * Throws on connection failure — caller is responsible for graceful degradation.
 */
export async function connectAndListTools(config: McpServerConfig): Promise<ConnectResult> {
  const { client, kind } = await buildClient(config.endpoint);
  try {
    const result = await client.listTools();
    const overrides: Record<string, "read" | "write"> =
      (config.toolClassificationOverrides as Record<string, "read" | "write"> | null) ?? {};

    const tools: McpToolInfo[] = (result.tools ?? []).map((t) => {
      let classification = classifyTool(t.name, t.description);

      // Apply override: only read→write is allowed
      if (overrides[t.name]) {
        const ov = overrides[t.name];
        if (ov === "write" && classification === "read") {
          classification = "write";
        }
        // write→read is silently ignored (defensive — API layer should have rejected it)
      }

      return {
        name: t.name,
        namespacedName: namespaceTool(config.id, t.name),
        description: t.description,
        inputSchema: t.inputSchema,
        classification,
      };
    });
    return { tools, transport: kind };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Connect to an arbitrary endpoint (no DB config needed) and list tools.
 * Used by the custom-server validation endpoint.
 */
export async function connectAndListToolsRaw(
  endpoint: string,
  toolClassificationOverrides: Record<string, "read" | "write"> = {}
): Promise<ConnectResult & { configId: "_validate_" }> {
  const fakeConfig = {
    id: "_validate_",
    endpoint,
    toolClassificationOverrides,
  } as unknown as McpServerConfig;
  const result = await connectAndListTools(fakeConfig);
  return { ...result, configId: "_validate_" };
}

/**
 * Call a single tool on an MCP server and return its text output.
 * Takes the ORIGINAL tool name (not namespaced).
 * Result is truncated to TOOL_RESULT_MAX_CHARS.
 */
export async function callTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; text: string; durationMs: number }> {
  const startMs = Date.now();
  const { client } = await buildClient(config.endpoint);
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = Array.isArray(result.content)
      ? (result.content as Array<any>)
          .filter((c) => c.type === "text")
          .map((c) => String(c.text ?? ""))
          .join("\n")
          .slice(0, TOOL_RESULT_MAX_CHARS)
      : String(result.content ?? "").slice(0, TOOL_RESULT_MAX_CHARS);

    return { ok: !result.isError, text, durationMs: Date.now() - startMs };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Run a health check against a config by ID.
 * Updates last_health in the DB regardless of outcome.
 */
export async function healthCheck(configId: string): Promise<{
  ok: boolean;
  transport?: string;
  toolCount?: number;
  readToolCount?: number;
  writeToolCount?: number;
  error?: string;
  durationMs: number;
}> {
  const [config] = await db
    .select()
    .from(mcpServerConfigs)
    .where(eq(mcpServerConfigs.id, configId))
    .limit(1);

  if (!config) throw new Error(`MCP config ${configId} not found`);

  const startMs = Date.now();
  let health: any;

  try {
    const result = await connectAndListTools(config);
    const readTools = result.tools.filter((t) => t.classification === "read");
    const writeTools = result.tools.filter((t) => t.classification === "write");
    health = {
      ok: true,
      transport: result.transport,
      toolCount: result.tools.length,
      readToolCount: readTools.length,
      writeToolCount: writeTools.length,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
    };
  } catch (err: any) {
    health = {
      ok: false,
      error: err?.message ?? "Unknown error",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
    };
  }

  await db
    .update(mcpServerConfigs)
    .set({ lastHealth: health, updatedAt: new Date() })
    .where(eq(mcpServerConfigs.id, configId));

  return health;
}
