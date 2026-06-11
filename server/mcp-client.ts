// MCP Client — Phase 3
// The CRM backend acts as the MCP CLIENT.
// Connects to remote MCP servers, lists tools, and executes tool calls.
// Only tools classified as "read" are exposed to the AI model.

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

// Keywords that unambiguously indicate a mutating/write operation.
const WRITE_KEYWORDS =
  /\b(create|creat|update|updat|delete|delet|write|writ|insert|modify|modif|activate|activ|deploy|transport|execute|execut|run\b|set\b|submit|release|lock|unlock|post\b|put\b|patch\b|drop|truncat|alter\b|grant|revoke|send|publish|trigger|start|stop|restart|remove|erase)\b/i;

// Keywords that unambiguously indicate a read/query operation.
const READ_KEYWORDS =
  /\b(get|fetch|read|list|query|search|find|show|view|describe|explain|analyz|check|ping|test|monitor|status|info|report|count|display|preview|inspect)\b/i;

/**
 * Classify a tool as "read" or "write".
 *
 * Rules (applied in order):
 *  1. No description (undefined, null, or blank) → "write"   [fail-safe: unknown = write]
 *  2. Write keyword found in name OR description   → "write"
 *  3. Read keyword found in name OR description (no write keyword) → "read"
 *  4. In doubt (no keyword matched)               → "write"   // DEFAULT IS WRITE — fail-safe per spec
 */
export function classifyTool(
  name: string,
  description: string | undefined | null
): "read" | "write" {
  // Rule 1: no description → write (fail-safe: we cannot assess what it does)
  if (!description || description.trim() === "") return "write";

  const combined = `${name} ${description}`;

  // Rule 2: write keyword detected → write
  if (WRITE_KEYWORDS.test(combined)) return "write";

  // Rule 3: read keyword (and no write keyword already caught) → read
  if (READ_KEYWORDS.test(combined)) return "read";

  // Rule 4: no match → "write" (fail-safe default: when in doubt, exclude from model)
  return "write";
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

  // Try StreamableHTTP (MCP 2025 spec) first, then SSE (legacy MCP)
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
  name: string;
  description?: string;
  inputSchema?: any;
  classification: "read" | "write";
}

export interface ConnectResult {
  tools: McpToolInfo[];
  transport: "streamable-http" | "sse";
}

/**
 * Connect to an MCP server, list its tools, classify each one, then disconnect.
 * Throws on connection failure — caller is responsible for graceful degradation.
 */
export async function connectAndListTools(config: McpServerConfig): Promise<ConnectResult> {
  const { client, kind } = await buildClient(config.endpoint);
  try {
    const result = await client.listTools();
    const tools: McpToolInfo[] = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      classification: classifyTool(t.name, t.description),
    }));
    return { tools, transport: kind };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Call a single tool on an MCP server and return its text output.
 * Result is truncated to TOOL_RESULT_MAX_CHARS to prevent context explosion.
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
    health = {
      ok: true,
      transport: result.transport,
      toolCount: result.tools.length,
      readToolCount: readTools.length,
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
