// MCP Template Resolver — Phase 5
// Resolves ${placeholder} syntax in configTemplate using data from DB entities.
// Each placeholder follows the format: ${source.field}
// Supported sources: sap_systems, system_credentials, vpn_systems

import { db } from "./db";
import { eq } from "drizzle-orm";
import { sapSystems, systemCredentials, vpnSystems } from "@shared/schema";
import type { McpServerConfig } from "@shared/schema";

interface FieldMapping {
  source: string;
  field: string;
}

type FieldMappings = Record<string, FieldMapping>;
type ConfigTemplate = Record<string, string>;

const SOURCE_TABLES: Record<string, { table: any; idField: (config: McpServerConfig) => string | null }> = {
  sap_systems: {
    table: sapSystems,
    idField: (config) => config.sapSystemId,
  },
  system_credentials: {
    table: systemCredentials,
    idField: (config) => config.credentialsRef,
  },
  vpn_systems: {
    table: vpnSystems,
    idField: (config) => null, // linked via sap_systems.vpnConnectionId or explicitly
  },
};

async function fetchSourceData(
  source: string,
  entityId: string | null
): Promise<Record<string, any> | null> {
  if (!entityId) return null;
  const sourceConfig = SOURCE_TABLES[source];
  if (!sourceConfig) return null;

  const [row] = await db
    .select()
    .from(sourceConfig.table)
    .where(eq(sourceConfig.table.id, entityId))
    .limit(1);

  return row ?? null;
}

/**
 * Resolve a configTemplate using fieldMappings and data from the linked entities.
 * Returns a flat Record<string, string> ready to be used as env vars.
 */
export async function resolveTemplate(
  config: McpServerConfig
): Promise<Record<string, string>> {
  const template = (config.configTemplate ?? {}) as ConfigTemplate;
  const mappings = (config.fieldMappings ?? {}) as FieldMappings;

  if (Object.keys(mappings).length === 0 && Object.keys(template).length === 0) {
    return {};
  }

  // Cache fetched source data to avoid duplicate queries
  const sourceCache: Record<string, Record<string, any> | null> = {};

  async function getSourceData(source: string): Promise<Record<string, any> | null> {
    if (source in sourceCache) return sourceCache[source];
    const entityId = SOURCE_TABLES[source]?.idField(config) ?? null;
    const data = await fetchSourceData(source, entityId);
    sourceCache[source] = data;
    return data;
  }

  const resolved: Record<string, string> = {};

  for (const [envVar, templateValue] of Object.entries(template)) {
    // Check if there's a direct mapping for this env var
    const mapping = mappings[envVar];
    if (mapping) {
      const data = await getSourceData(mapping.source);
      if (data && mapping.field in data) {
        resolved[envVar] = String(data[mapping.field] ?? "");
        continue;
      }
    }

    // Fallback: resolve ${source.field} placeholders in the template value
    const placeholderPattern = /\$\{(\w+)\.(\w+)\}/g;
    let result = templateValue;
    let match: RegExpExecArray | null;

    while ((match = placeholderPattern.exec(templateValue)) !== null) {
      const [fullMatch, source, field] = match;
      const data = await getSourceData(source);
      const value = data?.[field];
      if (value !== undefined && value !== null) {
        result = result.replace(fullMatch, String(value));
      }
    }

    resolved[envVar] = result;
  }

  return resolved;
}

/**
 * Describes available source fields for the mapping facilitator.
 * Returns a map of source → field names with types and descriptions.
 */
export function describeAvailableSources(): Record<string, Array<{ field: string; description: string }>> {
  return {
    sap_systems: [
      { field: "serverHost", description: "SAP server hostname/IP" },
      { field: "systemNumber", description: "SAP system number (00, 01, ...)" },
      { field: "systemId", description: "SAP System ID (3 chars, e.g. PRD)" },
      { field: "name", description: "System display name" },
      { field: "systemType", description: "System type (ecc, s4hana, btp, ...)" },
      { field: "applicationServerPort", description: "Application server port (32XX)" },
      { field: "messageServerPort", description: "Message server port (36XX)" },
      { field: "sapReleaseVersion", description: "SAP release version (750, 740, ...)" },
      { field: "defaultUsername", description: "Legacy default username" },
      { field: "defaultPassword", description: "Legacy default password (encrypted)" },
      { field: "cloudLink", description: "Cloud endpoint URL (BTP, S/4 Cloud)" },
      { field: "portalUrl", description: "Portal URL for cookie-based auth" },
      { field: "sapRouterString", description: "SAProuter string for internet access (/H/host/S/port/...)" },
    ],
    system_credentials: [
      { field: "username", description: "Credential username" },
      { field: "password", description: "Credential password (encrypted)" },
      { field: "systemName", description: "System name associated with credential" },
      { field: "webLink", description: "Web access URL" },
    ],
    vpn_systems: [
      { field: "serverHost", description: "VPN server hostname/IP" },
      { field: "serverPort", description: "VPN server port" },
      { field: "username", description: "VPN username" },
      { field: "connectionProfile", description: "VPN connection profile name" },
    ],
  };
}
