---
name: Connection Workflows
description: Key decisions and gotchas for the connection_workflows table and UI implementation
---

## Forward reference in Drizzle schema
`tasks.connectionWorkflowId` references `connectionWorkflows` which is defined AFTER `tasks` in schema.ts. This works fine using the arrow function syntax: `references(() => connectionWorkflows.id, { onDelete: "set null" })`. Drizzle resolves it lazily.

## form.watch() must come AFTER useForm()
In task-form.tsx, `const watchSapSystemId = form.watch("sapSystemId")` must be declared AFTER `const form = useForm(...)`. Placing it before causes a TDZ (Temporal Dead Zone) runtime error. This is easy to miss when inserting code near other hooks.

**Why:** `const` variables are not hoisted — accessing `form` before line 154 where `useForm` is called throws "Cannot access 'form' before initialization".

## Header component requires title + subtitle
`<Header />` requires both `title: string` and `subtitle: string` props. Using `<Header />` without them causes a TS2739 error at compile time.

## ConnectionStep Zod validation with superRefine
Per-type params validation is done via `superRefine` on the step schema, dispatching to a `stepParamsValidator` map keyed by `ConnectionStepType`. This avoids a complex discriminated union while still giving field-level error paths under `params.*`.

## Connection plan resolution priority
`GET /api/tasks/:id/connection-plan` resolves:
1. `task.connectionWorkflowId` (explicit override) → source: "task-override"
2. First workflow where `sap_system_id = task.sapSystemId` (ordered by createdAt) → source: "sap-system"
3. `{ workflow: null, steps: [], source: "none" }`

Each step gets `autoExecutable = (actor === "auto")` added.

## lucide-react icons
`Script` icon does NOT exist in lucide-react — use `ScrollText` instead.
`HandMetal`, `Cookie`, `Activity`, `Terminal`, `Wifi`, `Globe` all exist.
