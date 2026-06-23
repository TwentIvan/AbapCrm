// MCP Registry Sync — Phase 3 rev2
// Fetches the SAP MCP server catalog from marianfoo/sap-ai-mcp-servers
// Reads catalog.json + overrides.json directly (no folder listing).
// Iterates categories[].entries[] — only real MCP server entries.

import { db } from "./db";
import { sql } from "drizzle-orm";

const RAW_BASE =
  "https://raw.githubusercontent.com/marianfoo/sap-ai-mcp-servers/main/data";

export interface SyncResult {
  inserted: number;
  updated: number;
  stale: number;
  total: number;
  errors: string[];
}

// Heuristic: does name/purpose/notes suggest write capability?
function classifyTool(name: string, purpose: string, notes: string): boolean {
  const text = `${name} ${purpose} ${notes}`.toLowerCase();
  const writeSignals = [
    "creat", "updat", "delet", "modif", "write", "post", "put", "patch",
    "insert", "remov", "execut", "trigger", "send", "submit", "push",
    "deploy", "transport", "release",
  ];
  return writeSignals.some((s) => text.includes(s));
}

export async function syncMcpCatalog(): Promise<SyncResult> {
  const headers: Record<string, string> = { "User-Agent": "crm-backend/1.0" };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  // Step 1: fetch catalog.json + overrides.json in parallel
  const [catalogRes, overridesRes] = await Promise.all([
    fetch(`${RAW_BASE}/catalog.json`, { headers }),
    fetch(`${RAW_BASE}/overrides.json`, { headers }),
  ]);

  if (!catalogRes.ok) {
    throw new Error(
      `catalog.json fetch failed: ${catalogRes.status} ${catalogRes.statusText}`
    );
  }

  const catalogData: any = await catalogRes.json();
  let overrides: Record<string, any> = {};
  if (overridesRes.ok) {
    const od: any = await overridesRes.json();
    overrides = od?.repos ?? {};
  }

  // Step 2: cleanup old spurious registry entries (catalog/overrides filenames)
  await db.execute(sql`
    DELETE FROM mcp_catalog
    WHERE source = 'registry'
      AND (repo_url IS NULL OR name IN ('catalog', 'overrides'))
  `);

  const result: SyncResult = { inserted: 0, updated: 0, stale: 0, total: 0, errors: [] };
  const seenIds = new Set<string>();

  // Step 3: iterate categories[].entries[]
  const categories: any[] = catalogData?.categories ?? [];
  for (const cat of categories) {
    const categoryId: string = cat.id ?? "";
    const categoryTitle: string = cat.title ?? "";
    const entries: any[] = cat.entries ?? [];

    for (const entry of entries) {
      try {
        const name: string = String(entry.name ?? "").trim();
        const repo: string = String(entry.repo ?? "").trim();
        if (!name || !repo) continue;

        const repoUrl = `https://github.com/${repo}`;

        const purpose: string = entry.purpose ?? "";
        const notes: string = entry.notes ?? "";
        const description = notes ? `${purpose} — ${notes}` : purpose;
        const entryType: string = entry.type ?? "Community";
        const license: string | null = overrides[repo]?.license ?? null;
        const writeCapable = classifyTool(name, purpose, notes);

        const maturityJson = JSON.stringify({
          type: entryType,
          license,
          registryCategoryTitle: categoryTitle,
        });

        const upsertResult = await db.execute(sql`
          INSERT INTO mcp_catalog
            (name, source, repo_url, category, description, transport,
             auth_model, write_capable, maturity, stale, synced_at)
          VALUES
            (${name}, 'registry', ${repoUrl}, ${categoryId}, ${description},
             'http', 'none', ${writeCapable}, ${maturityJson}::jsonb, false, now())
          ON CONFLICT (name, repo_url) DO UPDATE SET
            source        = 'registry',
            category      = EXCLUDED.category,
            description   = EXCLUDED.description,
            transport     = EXCLUDED.transport,
            write_capable = EXCLUDED.write_capable,
            maturity      = EXCLUDED.maturity,
            stale         = false,
            synced_at     = now()
          RETURNING id, (xmax = 0) AS was_insert
        `);

        const rows = upsertResult.rows as Array<{ id: string; was_insert: boolean }>;
        if (rows[0]?.id) seenIds.add(rows[0].id);
        if (rows[0]?.was_insert) result.inserted++;
        else result.updated++;
        result.total++;
      } catch (e: any) {
        result.errors.push(`${entry.name ?? "?"}: ${e?.message ?? "unknown"}`);
      }
    }
  }

  // Step 4: mark registry entries not touched in this sync as stale (never delete)
  if (seenIds.size > 0) {
    // Select all registry IDs, exclude seen ones
    const allRegistry = await db.execute(sql`
      SELECT id FROM mcp_catalog WHERE source = 'registry' AND stale = false
    `);
    const toStale = (allRegistry.rows as Array<{ id: string }>)
      .filter(r => !seenIds.has(r.id))
      .map(r => r.id);

    if (toStale.length > 0) {
      // Update in batches of 100 to avoid huge IN clauses
      for (let i = 0; i < toStale.length; i += 100) {
        const batch = toStale.slice(i, i + 100);
        // Build parameterized IN list — avoid casting JS array as record type
        const uuidList = sql.join(batch.map(id => sql`${id}::uuid`), sql`, `);
        await db.execute(sql`
          UPDATE mcp_catalog SET stale = true
          WHERE id IN (${uuidList})
        `);
      }
      result.stale = toStale.length;
    }
  }

  return result;
}
