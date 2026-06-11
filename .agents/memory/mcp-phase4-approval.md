---
name: MCP Phase 4 Approval Loop
description: Write tool calls pause the agentic loop for human approval before execution. Resume flow, PRD defense, wizard for custom server registration.
---

## Rule
When an MCP tool call is classified as "write" and the config is NOT read-only and NOT PRD, the loop does NOT execute the tool immediately. Instead it:
1. Saves a row to `ai_pending_actions` (status=pending) per tool call
2. Saves `loop_state` (full loop snapshot as JSONB) to `ai_task_executions.loop_state`
3. Sets `ai_task_executions.status = 'awaiting_approval'` and breaks the loop

## Resume flow
`POST /api/executions/:id/decide` — body: `{ decisions: [{pendingActionId, approved, note}] }`
- Applies decisions: approved → calls the tool, rejected → inserts a rejection message  
- Then calls `resumeExecutionAfterApproval(executionId)` which reloads loop_state and continues the agentic loop
- If another write tool arises mid-resume, it pauses again (same mechanism)

## PRD defense in depth
1. During tool collection: write tools from PRD configs are silently skipped (never registered)
2. During callTool/resume: hard block if the config's environment === 'PRD'

**Why:** PRD systems must never be mutated by AI without explicit human confirmation AND environment-level protection. Two layers prevent both accidental and edge-case execution.

## Override rule
Only `read → write` promotion is allowed (user explicitly promotes a tool). `write → read` demotion is silently ignored (already conservative; no need to loosen).

## Namespace
`mcp__${configId.slice(0,8)}__${toolName}` — used for all tool names in the loop's toolRegistry and pendingCallIds map.

## loop_state structure (JSONB)
messages, iter, cumulativeTokens, warning80Emitted, toolCallsLog, toolRegistry (serialized Map), pendingCallIds (aiPendingActionId→openaiToolCallId), taskId, organizationId, userId, modelKey, budgetCapEur.

## Custom Server Wizard (UI)
3-step wizard in `client/src/pages/mcp-library-page.tsx` component `CustomServerWizard`:
- Step 1: endpoint URL + validate (POST /api/mcp/custom/validate)
- Step 2: tool list with read/write classification overrides
- Step 3: name, environment, readOnly toggle, project/SAP system binding → register (POST /api/mcp/custom/register)
Opened via "Registra Custom" button in the Configurazioni tab.

## Header badge
`client/src/components/layout/header.tsx` polls `/api/mcp/pending-actions/count` every 10s. Shows amber ShieldAlert badge only when count > 0, links to /mcp-library.

## DB tables added (via direct SQL)
- `ai_pending_actions`: id, execution_id, tool_name, tool_args, status, decided_by, decided_at, decision_note, model_rationale, created_at, expires_at
- `ai_task_executions.loop_state`: jsonb column for loop snapshot
- `ai_task_executions.status`: added 'awaiting_approval' to enum
- `mcp_server_configs.tool_classification_overrides`: jsonb default {}
