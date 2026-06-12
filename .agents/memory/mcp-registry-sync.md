---
name: MCP registry sync
description: How mcp-registry-sync.ts fetches and upserts the SAP MCP catalog
---

## Rule
The sync function fetches two files directly from raw.githubusercontent.com:
- `catalog.json` — contains `categories[].entries[]` (name, repo, purpose, notes, type)
- `overrides.json` — flat map of repo→{license, …}

It iterates `categories[].entries[]` and upserts on `(name, repo_url)`. Stale marking: collect all upserted IDs from `RETURNING id`, then SELECT all source='registry' AND stale=false, filter client-side for IDs NOT in seenIds set, then UPDATE stale=true in batches of 100 using `unnest($ids::uuid[])`.

**Why:** The original approach used `NOT IN (unnest($array::text[]))` which fails with "cannot cast type record to text[]" in Drizzle's sql template — UUID array cast works instead.

**How to apply:** If stale marking needs changing, always pass UUID arrays via `unnest($batch::uuid[])`. Never attempt `::text[]` cast on a Drizzle-interpolated JS array.
