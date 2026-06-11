---
name: Phase 5 context packs & draft tasks
description: context_packs table scope/upsert pattern, getQueryFn URL-join convention, draft task lifecycle, inline panel component placements
---

## context_packs table
- Scope: `scopeType` = "organization" | "project", `scopeId` = project UUID or NULL for org.
- Endpoints: GET/PUT `/api/context-packs/:scopeType/:scopeId?`
- Upsert in routes.ts uses `onConflictDoUpdate` on unique index `(organizationId, scopeType, scopeId)`.

## getQueryFn URL-join rule
`getQueryFn` joins **all string parts** of the queryKey with `/`. So:
- `["/api/context-packs/project", projectId]` → fetches `/api/context-packs/project/{projectId}` ✅
- `["/api/tasks", task.id, "assembled-context"]` → `/api/tasks/{id}/assembled-context` ✅
Never embed the full path in a single string if you want cache segments to work for invalidation.

## Draft task lifecycle
- AI agent sets `status="draft"` when `confidence < 0.7` OR `openQuestions.length > 0`.
- `aiSpec` (jsonb) stored on tasks: `{ summary, objective, deliverables, acceptanceCriteria, openQuestions, confidence, suggestedModelKey }`.
- `suggestedModelKey` is analytics-driven (avg rating / cost from ai_task_executions), never auto-applied — only shown as a hint in the form.
- Confirm draft: PUT `/api/tasks/:id` `{ status: "todo" }`.

## UI placements (Phase 5)
- **task-form-container.tsx**: Tab "Spec AI" (7th tab, `value="ai-spec"`) → `AiSpecPanel` inline component.
- **project-form-container.tsx**: Tab "Contesto AI" (2nd tab, `value="contesto-ai"`) → `ContextPackPanel` inline component.
- **task-form.tsx**: suggested model hint rendered inside `agentModelId` FormField render prop (reads `task.aiSpec.suggestedModelKey`).
- **tasks-page.tsx**: dropdown has "Conferma Bozza" item (purple) visible only when `task.status === "draft"`.
- **entity-constants.ts**: draft → `bg-purple-100 text-purple-800` / label "Bozza".

**Why:**
Inline panel components (AiSpecPanel, ContextPackPanel) keep Phase 5 UI self-contained inside the existing form containers without creating new page routes. Follows the existing pattern of AiCostsPanel, ToolCallsPanel, PendingActionsPanel in task-form-container.tsx.
