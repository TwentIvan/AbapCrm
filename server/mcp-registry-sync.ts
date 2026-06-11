// MCP Registry Sync — Phase 3
// Fetches the SAP MCP server catalog from the GitHub registry
// (marianfoo/sap-ai-mcp-servers) and upserts into mcp_catalog.
// Uses the Drizzle sql template tag for the upsert (parameterized — no raw interpolation).

import { db } from "./db";
import { sql } from "drizzle-orm";

const REGISTRY_API =
  "https://api.github.com/repos/marianfoo/sap-ai-mcp-servers/contents/data";

export interface SyncResult {
  inserted: number;
  updated: number;
  total: number;
  errors: string[];
}

export async function syncMcpCatalog(): Promise<SyncResult> {
  const headers: Record<string, string> = {
    "User-Agent": "crm-backend/1.0",
    Accept: "application/vnd.github.v3+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  // Step 1: list files in /data
  const listRes = await fetch(REGISTRY_API, { headers });
  if (!listRes.ok) {
    throw new Error(
      `GitHub API error: ${listRes.status} ${listRes.statusText}`
    );
  }
  const files: Array<{ name: string; download_url: string; type: string }> =
    await listRes.json();

  const jsonFiles = files.filter(
    (f) => f.type === "file" && f.name.endsWith(".json")
  );

  const result: SyncResult = { inserted: 0, updated: 0, total: 0, errors: [] };

  // Step 2: fetch + upsert each catalog entry
  for (const file of jsonFiles) {
    try {
      const rawRes = await fetch(file.download_url, { headers });
      if (!rawRes.ok) {
        result.errors.push(`${file.name}: HTTP ${rawRes.status}`);
        continue;
      }
      const data: any = await rawRes.json();

      const name: string = String(
        data.name || file.name.replace(/\.json$/, "")
      );
      const repoUrl: string | null =
        data.repoUrl ?? data.repo_url ?? data.repository ?? null;
      const category: string | null = data.category ?? null;
      const description: string | null = data.description ?? null;
      const transport: string = data.transport ?? "http";
      const authModel: string = data.authModel ?? data.auth_model ?? "none";
      const writeCapable: boolean = Boolean(
        data.writeCapable ?? data.write_capable ?? false
      );
      const maturityJson: string = JSON.stringify(data.maturity ?? {});

      // Upsert using Drizzle sql template tag — all values are bound parameters, never interpolated
      const upsertResult = await db.execute(sql`
        INSERT INTO mcp_catalog
          (name, source, repo_url, category, description, transport, auth_model, write_capable, maturity, synced_at)
        VALUES
          (${name}, 'registry', ${repoUrl}, ${category}, ${description},
           ${transport}, ${authModel}, ${writeCapable}, ${maturityJson}::jsonb, now())
        ON CONFLICT (name, repo_url) DO UPDATE SET
          source       = EXCLUDED.source,
          category     = EXCLUDED.category,
          description  = EXCLUDED.description,
          transport    = EXCLUDED.transport,
          auth_model   = EXCLUDED.auth_model,
          write_capable = EXCLUDED.write_capable,
          maturity     = EXCLUDED.maturity,
          synced_at    = now()
        RETURNING (xmax = 0) AS was_insert
      `);

      const rows = upsertResult.rows as Array<{ was_insert: boolean }>;
      if (rows[0]?.was_insert) {
        result.inserted++;
      } else {
        result.updated++;
      }
      result.total++;
    } catch (e: any) {
      result.errors.push(`${file.name}: ${e?.message ?? "unknown error"}`);
    }
  }

  return result;
}
