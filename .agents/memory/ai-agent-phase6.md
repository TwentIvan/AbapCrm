---
name: AI Agent Phase 6
description: Gotchas from integrating SAP systems, VPN connections, and MCP context into the AI project agent
---

## Backticks in template-literal system prompts
The system prompt is defined as a backtick template literal. Any backtick-quoted markdown (e.g., `subProjects[]`) inside the string causes TS parse errors (TS1005, TS1443). **Fix**: remove or rewrite backtick-wrapped terms as plain text in that string.

**Why:** TypeScript sees the inner backtick as a new template literal start, producing confusing cascade errors at the char positions of `[` and `]`.

## vpnConnections.partnerId is NOT NULL
Creating a stub VPN connection requires a resolved partner — the column is `notNull()`. The approval handler must skip stub VPN creation and log a warning when `results.partner` is absent.

**How to apply:** Always guard stub VPN creation with `if (!results.partner?.id) { skip; }`.

## sapSystems required fields for stubs
Minimum required fields: `userId`, `organizationId`, `name`, `systemId` (3 chars), `serverHost`, `systemNumber`. Use `'TBC'` as placeholder for `serverHost` and `'00'` for `systemNumber` when creating AI-proposed stubs. Include a note: `needsManualConfig=true`.

## systemNameToId map flow
The approval handler builds `systemNameToId: Map<string, string>` in step 2c (before tasks), populated from `proposalData.systems[]`. Tasks then look up their `sapSystemRef` in this map to resolve `sapSystemId`. The map also holds matched existing systems (existingId path).

## MCP configId resolution
`aiSpec.proposedMcpConfigs[].configId` contains actual `mcp_server_configs.id` values when the agent matched a real config. The approval handler collects these into `mcpConfigIds: string[]` and persists them to `tasks.mcpConfigIds`. Empty array is skipped (pass `undefined` to avoid overwriting with `[]`).
