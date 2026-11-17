// Sorgenti su database del server MCP di The Hub Up (vedi `thu-mcp-server.ts`).
// Stesse regole dell'esecutore dei task (`ai-task-executor.ts`): configurazioni dell'organizzazione e
// abilitate, voce di catalogo obbligatoria e validata per l'organizzazione (default-deny), credenziali
// ereditate dal sistema SAP della configurazione. Le credenziali non escono mai da The Hub Up.

import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, mcpCatalogValidations, mcpServerConfigs, systemCredentials } from "@shared/schema";
import { db } from "./db";
import { callTool, connectAndListTools } from "./mcp-client";
import type { SapMcpConfig, ThuMcpDeps } from "./thu-mcp-server";

const AUDIT_TEXT_MAX = 2000;

async function listConfigs(organizationId: string): Promise<SapMcpConfig[]> {
  const configs = await db
    .select()
    .from(mcpServerConfigs)
    .where(eq(mcpServerConfigs.organizationId, organizationId));
  const usable = configs.filter((c) => c.enabled !== false && !!c.catalogId);
  if (usable.length === 0) return [];

  const validations = await db
    .select({ catalogId: mcpCatalogValidations.catalogId })
    .from(mcpCatalogValidations)
    .where(
      and(
        eq(mcpCatalogValidations.organizationId, organizationId),
        eq(mcpCatalogValidations.validated, true),
        inArray(mcpCatalogValidations.catalogId, usable.map((c) => c.catalogId!)),
      ),
    );
  const validated = new Set(validations.map((v) => v.catalogId));

  const result: SapMcpConfig[] = [];
  for (const cfg of usable) {
    if (!validated.has(cfg.catalogId!)) continue;
    const effective = { ...cfg };
    if (!effective.credentialsRef && effective.sapSystemId) {
      const [cred] = await db
        .select({ id: systemCredentials.id })
        .from(systemCredentials)
        .where(and(eq(systemCredentials.systemId, effective.sapSystemId), eq(systemCredentials.isActive, true)))
        .limit(1);
      if (cred) effective.credentialsRef = cred.id;
    }
    result.push(effective);
  }
  return result;
}

export const thuMcpDbDeps: ThuMcpDeps = {
  listConfigs,
  listTools: async (config) => (await connectAndListTools(config)).tools,
  callTool: (config, toolName, args) => callTool(config, toolName, args),
  audit: async (e) => {
    await db.insert(auditLogs).values({
      tableName: "mcp_tool_calls",
      recordId: e.configId,
      action: "CREATE",
      newValues: {
        source: "thu-mcp",
        apiTokenId: e.apiTokenId,
        configId: e.configId,
        toolName: e.toolName,
        exposedName: e.exposedName,
        level: e.level,
        args: JSON.stringify(e.args).slice(0, AUDIT_TEXT_MAX),
        ok: e.ok,
        durationMs: e.durationMs,
        ...(e.error ? { error: e.error } : {}),
      },
      changedFields: [e.toolName],
      userId: e.userId,
      organizationId: e.organizationId,
    });
  },
};
