---
name: MCP Phase 3 Architecture
description: Key decisions for the MCP tool-use system built on top of Phase 1 (ai-gateway) and Phase 2 (budget/costs).
---

## Core Rules

**Read-only guardrail (hard rule):** Phase 3 only exposes tools with `classification === "read"` to the model. `classifyTool()` in `server/mcp-client.ts` defaults to `"write"` on any ambiguity (fail-safe). PRD environment configs always force `readOnly=true` at both API layer (route validation) and executor level.

**Agentic loop:** `MAX_ITER=8` in `server/ai-task-executor.ts`. Loop continues while model returns `tool_calls`; exits when model returns no tool calls (final answer) or when budget cap is hit. Falls back to single-call behavior when no MCP tools are available (backward compatible).

**EventBus export:** `export const EventBus = new EventBusClass()` — capital E, named export, not default. Import as `{ EventBus }` from `./event-bus`. The instance name is `EventBus` (not `eventBus`).

**Audit pattern:** Use `db.insert(auditLogs).values({...})` (Drizzle standard insert) for MCP tool call audit. No `sql.raw`, no string interpolation. `tableName: "mcp_tool_calls"` (virtual table name, not a real table).

**SDK imports:** `@modelcontextprotocol/sdk/client` (Client), `@modelcontextprotocol/sdk/client/streamableHttp` (StreamableHTTPClientTransport), `@modelcontextprotocol/sdk/client/sse` (SSEClientTransport).

## Tables Added (via direct SQL)
- `mcp_catalog` — registry of available MCP servers (synced from GitHub)
- `mcp_server_configs` — per-org server configurations with `read_only`, `environment`, `tool_allowlist`, `last_health`
- `tasks.mcp_config_ids` — array of config IDs linked to a task
- `ai_task_executions.tool_calls_log` — jsonb log of tool calls per execution

## Why
- Tool-use must never mutate SAP state in Phase 3; only read access is safe for automated AI execution.
- PRD guardrail is enforced at multiple layers (API validation + executor check) to prevent misconfiguration.
- Graceful degradation: unreachable MCP servers are logged and skipped, never abort the AI execution.
- MAX_ITER=8 prevents infinite loops while allowing multi-step tool chains (typical SAP queries need 2-4 hops).
