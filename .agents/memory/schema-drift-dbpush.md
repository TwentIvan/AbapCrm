---
name: Schema drift & db:push
description: Why drizzle-kit push must never run unattended in this project, and how to apply schema changes safely.
---

# Schema changes: use direct SQL, never unattended `drizzle-kit push`

The live PostgreSQL DB intentionally drifts from `shared/schema.ts` in several
places (confirmed example: `intervention_documents` in the DB still has the old
file-attachment shape — title/file_path/file_name/file_size/mime_type/uploaded_by —
while schema.ts defines a much richer AI-generated-document table). There are
likely other drifted tables too.

**Rule:** Apply schema changes (new tables, enums, columns) with **direct SQL**
(via `executeSql` in code_execution), using `CREATE TABLE IF NOT EXISTS`,
`DO $$ ... CREATE TYPE ... $$` enum guards, and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**Why:** `npm run db:push` is plain `drizzle-kit push` (interactive). Because of
the drift it (a) prompts "created or renamed?" for ambiguous columns/enums, and
(b) would apply destructive renames/drops that lose data. Stdin is closed during
post-merge setup, so it fails immediately.

**How to apply:**
- Post-merge script (`scripts/post-merge.sh`) must NOT call `db:push`. Keep it to
  `npm install` only. Schema is the task author's responsibility via direct SQL
  before/at merge time.
- When a merged task adds AI/other tables but post-merge fails on an enum prompt,
  create the missing enums+tables directly to match schema.ts exactly, then
  re-run `runPostMergeSetup()` to confirm green.
- Seed data scripts (e.g. `scripts/seed-ai-models.ts`, idempotent upsert) are run
  manually once after creating empty tables; they are not part of post-merge.
