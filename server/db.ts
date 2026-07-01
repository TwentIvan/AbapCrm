import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection pool for better performance  
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10, // Max connections in pool
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Timeout for new connections
  maxUses: Infinity, // Allow unlimited uses per connection
  allowExitOnIdle: false, // Keep pool alive even when idle
});

pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('[DB] Client error:', err.message);
  });
});

pool.on('error', (err, client) => {
  console.error('[DB] Pool error:', err.message);
  if (err.message?.includes('terminating connection due to administrator command') ||
      err.message?.includes('Connection terminated') ||
      (err as any).code === '57P01') {
    setTimeout(() => { testDatabaseConnection(); }, 5000);
  }
});

// Create database connection with error handling
export const db = drizzle({ client: pool, schema });

// Connection retry logic with exponential backoff
async function retryConnection(maxRetries: number = 3, baseDelay: number = 1000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      console.log(`[DB] Connection successful on attempt ${attempt}`);
      client.release();
      return true;
    } catch (error) {
      console.error(`[DB] Connection attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[DB] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Test the connection on startup
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    console.log('[DB] Database connection successful');
    client.release();
    return true;
  } catch (error) {
    console.error('[DB] Database connection failed:', error);
    
    // Try to recover with retry logic
    console.log('[DB] Attempting connection recovery...');
    const recovered = await retryConnection(3, 2000);
    
    if (recovered) {
      console.log('[DB] Database connection recovered');
      return true;
    } else {
      console.error('[DB] Database connection recovery failed');
      return false;
    }
  }
}

// Startup migrations - Safe additive SQL changes
export async function runStartupMigrations(): Promise<boolean> {
  try {
    console.log('[DB] Running startup migrations...');
    const client = await pool.connect();

    // Esegue una migrazione ISOLATA: un suo fallimento viene loggato ma NON
    // aborta le migrazioni successive (evita che un errore su una tabella
    // opzionale impedisca di crearne altre, es. hubup_jobs).
    const safeMigrate = async (label: string, sqlText: string) => {
      try {
        await client.query(sqlText);
        console.log(`[DB] ✓ ${label}`);
      } catch (e) {
        console.error(`[DB] ✗ ${label} (proseguo):`, e instanceof Error ? e.message : e);
      }
    };

    // Add new email training selection columns if they don't exist
    const migrationSQL = `
      ALTER TABLE email_training_selections
        ADD COLUMN IF NOT EXISTS signature_body_selections text[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS signature_header_selections text[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS mail_thread_selections jsonb NOT NULL DEFAULT '[]'::jsonb;
    `;
    
    await client.query(migrationSQL);
    console.log('[DB] ✓ Email training selection columns added successfully');

    // Add organization_id to vpn_connections if missing
    await client.query(`
      ALTER TABLE vpn_connections
        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
    `);
    console.log('[DB] ✓ vpn_connections.organization_id ensured');

    // Migration 0004: proposal token tracking
    await client.query(`
      ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "prompt_tokens" integer;
      ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "completion_tokens" integer;
      ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "model_key" text;
    `);
    console.log('[DB] ✓ proposals token columns ensured');

    // Migration 0005: proposal estimated tokens
    await client.query(`
      ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "estimate_tokens_min" integer;
      ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "estimate_tokens_max" integer;
    `);
    console.log('[DB] ✓ proposals estimated token columns ensured');

    // Migration 0006: catalog launch defaults
    await client.query(`
      ALTER TABLE "mcp_catalog" ADD COLUMN IF NOT EXISTS "default_launch_command" text;
      ALTER TABLE "mcp_catalog" ADD COLUMN IF NOT EXISTS "default_launch_args" jsonb DEFAULT '[]';
    `);
    console.log('[DB] ✓ mcp_catalog launch defaults ensured');

    // Migration 0007: SAProuter string
    await client.query(`
      ALTER TABLE "sap_systems" ADD COLUMN IF NOT EXISTS "sap_router_string" text;
    `);
    console.log('[DB] ✓ sap_systems.sap_router_string ensured');

    // Migration 0008: project stakeholders (project_contacts)
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "stakeholder_role" AS ENUM ('informed', 'approver', 'responsible', 'reviewer');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS "project_contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
        "role" "stakeholder_role" NOT NULL DEFAULT 'informed',
        "notify" boolean NOT NULL DEFAULT true,
        "notes" text,
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
        "source_message_ids" text[] DEFAULT '{}',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "project_contacts_project_contact_idx" ON "project_contacts" ("project_id", "contact_id");
    `);
    console.log('[DB] ✓ project_contacts table ensured');

    // Migration 0009: stakeholder notifications
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'dismissed');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email_draft', 'email_sent');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
        "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
        "event_type" text NOT NULL,
        "stakeholder_role" "stakeholder_role",
        "channel" "notification_channel" NOT NULL DEFAULT 'in_app',
        "status" "notification_status" NOT NULL DEFAULT 'pending',
        "subject" text,
        "body" text,
        "payload" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "notifications_project_idx" ON "notifications" ("project_id");
      CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications" ("organization_id", "status");
    `);
    console.log('[DB] ✓ notifications table ensured');

    // Migration 0010: generic, entity-agnostic workflows table
    // (supersedes the earlier project-specific project_workflows)
    await client.query(`
      DROP TABLE IF EXISTS "project_workflows";

      DO $$ BEGIN
        CREATE TYPE "workflow_config_status" AS ENUM ('draft', 'active', 'inactive');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS "workflows" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "name" text NOT NULL,
        "description" text,
        "entity_type" text NOT NULL,
        "entity_id" uuid,
        "trigger_event" text NOT NULL,
        "trigger_config" jsonb,
        "conditions" jsonb,
        "actors" jsonb DEFAULT '[]',
        "actions" jsonb DEFAULT '[]',
        "channel" "notification_channel" NOT NULL DEFAULT 'email_draft',
        "status" "workflow_config_status" NOT NULL DEFAULT 'draft',
        "source_message_ids" text[] DEFAULT '{}',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "workflows_entity_idx" ON "workflows" ("organization_id", "entity_type");
    `);
    console.log('[DB] ✓ workflows table ensured');

    // Migration 0011: reassign data stranded under the legacy hardcoded "default"
    // org to each owner's Personal org (only when the owner isn't a member of that
    // legacy org — i.e. truly orphaned rows that were invisible everywhere).
    const LEGACY_ORG = '4ca22699-5fd4-4030-8bb5-4e7cef9ce8be';
    for (const tbl of ['sap_systems', 'vpn_connections']) {
      await client.query(`
        UPDATE "${tbl}" t
        SET organization_id = pers.org_id, updated_at = now()
        FROM (
          SELECT uo.user_id, uo.organization_id AS org_id
          FROM user_organizations uo
          JOIN organizations o ON o.id = uo.organization_id
          WHERE o.name = 'Personal'
        ) pers
        WHERE t.user_id = pers.user_id
          AND t.organization_id = '${LEGACY_ORG}'
          AND NOT EXISTS (
            SELECT 1 FROM user_organizations uo2
            WHERE uo2.user_id = t.user_id AND uo2.organization_id = t.organization_id
          );
      `);
    }
    console.log('[DB] ✓ orphaned sap_systems/vpn_connections reassigned to Personal org');

    // Migration 0012: The Hub Up connection discovery (Modulo F)
    await client.query(`
      DO $$ BEGIN CREATE TYPE "connection_method_kind" AS ENUM ('vpn','vdi','hypervisor','rdp','sap_gui','direct','unknown'); EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN CREATE TYPE "connection_method_role" AS ENUM ('reachability','customer_tunnel'); EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS "connection_method_signatures" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid REFERENCES "organizations"("id"),
        "signature_id" text NOT NULL,
        "kind" "connection_method_kind" NOT NULL DEFAULT 'vpn',
        "role" "connection_method_role",
        "os_list" text[] DEFAULT '{}',
        "detect" jsonb,
        "connect" jsonb,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "conn_method_sig_org_idx" ON "connection_method_signatures" ("organization_id","signature_id");

      CREATE TABLE IF NOT EXISTS "discovered_connection_methods" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
        "method_id" text NOT NULL,
        "kind" "connection_method_kind" NOT NULL DEFAULT 'unknown',
        "role" "connection_method_role",
        "os" text,
        "hostname" text,
        "installed" boolean NOT NULL DEFAULT false,
        "configured" boolean NOT NULL DEFAULT false,
        "connected" boolean NOT NULL DEFAULT false,
        "version" text,
        "profiles" text[] DEFAULT '{}',
        "evidence" text[] DEFAULT '{}',
        "last_probed_at" timestamp NOT NULL DEFAULT now(),
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "discovered_conn_methods_user_host_idx" ON "discovered_connection_methods" ("user_id","hostname");
      CREATE UNIQUE INDEX IF NOT EXISTS "discovered_conn_methods_user_host_method_idx" ON "discovered_connection_methods" ("user_id","hostname","method_id");
    `);
    console.log('[DB] ✓ connection discovery tables (Modulo F) ensured');

    // Migration 0013: vpn_connections.role + methodId (Hub Up readiness planning)
    await client.query(`
      ALTER TABLE "vpn_connections" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'customer_tunnel';
      ALTER TABLE "vpn_connections" ADD COLUMN IF NOT EXISTS "method_id" text;
    `);
    // Seed: SonicWall connections are reachability tunnels (open the corporate net).
    await client.query(`
      UPDATE "vpn_connections"
      SET role = 'reachability'
      WHERE role <> 'reachability'
        AND (
          lower(name) LIKE '%sonicwall%'
          OR lower(coalesce(method_id,'')) IN ('sonicwall_netextender','sonicwall_mobile_connect','sonicwall_cse')
          OR lower(coalesce(connection_type,'')) LIKE '%sonicwall%'
        );
    `);
    console.log('[DB] ✓ vpn_connections.role/method_id ensured + SonicWall reachability seed');

    // Migration 0015: vpn_systems.vpn_software_id ora è il methodId del probe
    // (testo, es. "sonicwall_cse"), non più una FK verso il catalogo statico
    // vpn_software. Tutto il software VPN viene dal probe Hub Up. Rimuoviamo il
    // vincolo FK e convertiamo la colonna a text (idempotente).
    await safeMigrate('vpn_systems.vpn_software_id migrated to probe methodId (text, no FK)', `
      DO $$
      DECLARE fk_name text;
      BEGIN
        -- to_regclass() ritorna NULL (non solleva) se la tabella non esiste:
        -- così la migrazione non aborta su DB dove vpn_systems non c'è mai stato.
        -- Niente RETURN dentro il DO: tutto il corpo è avvolto in un IF.
        IF to_regclass('public.vpn_systems') IS NOT NULL THEN
          SELECT conname INTO fk_name
            FROM pg_constraint
            WHERE conrelid = 'vpn_systems'::regclass
              AND contype = 'f'
              AND conkey = ARRAY[(
                SELECT attnum FROM pg_attribute
                WHERE attrelid = 'vpn_systems'::regclass AND attname = 'vpn_software_id'
              )];
          IF fk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE vpn_systems DROP CONSTRAINT %I', fk_name);
          END IF;
          ALTER TABLE vpn_systems ALTER COLUMN vpn_software_id DROP NOT NULL;
          ALTER TABLE vpn_systems ALTER COLUMN vpn_software_id TYPE text USING vpn_software_id::text;
        END IF;
      END $$;
    `);

    // Migration 0014: module_runs audit sink (Hub Up bootstrap prod-phase; never stores secrets)
    await safeMigrate('module_runs table ensured', `
      CREATE TABLE IF NOT EXISTS "module_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid REFERENCES "users"("id"),
        "organization_id" uuid REFERENCES "organizations"("id"),
        "module" text NOT NULL,
        "version" text,
        "sha256" text,
        "operator" text,
        "exit_code" integer,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    // Migration 0016: hubup_jobs — coda per lo scan server-triggered. L'app
    // accoda un job, il companion sul Mac lo pesca (polling outbound) ed esegue.
    await safeMigrate('hubup_jobs table ensured', `
      CREATE TABLE IF NOT EXISTS "hubup_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "organization_id" uuid REFERENCES "organizations"("id"),
        "module" text NOT NULL DEFAULT 'discovery-mac',
        "status" text NOT NULL DEFAULT 'queued',
        "hostname" text,
        "methods_count" integer,
        "error" text,
        "requested_at" timestamp NOT NULL DEFAULT now(),
        "claimed_at" timestamp,
        "finished_at" timestamp
      );
      CREATE INDEX IF NOT EXISTS "hubup_jobs_user_status_idx" ON "hubup_jobs" ("user_id","status");
    `);

    // Migration 0017: hubup_companions — heartbeat del companion (per capire se
    // è mai stato installato e se è online, così il click sulla scansione può
    // proporre l'installazione).
    await safeMigrate('hubup_companions table ensured', `
      CREATE TABLE IF NOT EXISTS "hubup_companions" (
        "user_id" uuid PRIMARY KEY REFERENCES "users"("id"),
        "hostname" text,
        "last_seen_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    // Migration 0018: hubup_enroll_tokens — credenziale del companion generata
    // dalla UI (Bearer), così non si digitano password sul Mac.
    await safeMigrate('hubup_enroll_tokens table ensured', `
      CREATE TABLE IF NOT EXISTS "hubup_enroll_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token" text NOT NULL UNIQUE,
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "organization_id" uuid REFERENCES "organizations"("id"),
        "label" text,
        "revoked" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "last_used_at" timestamp,
        "expires_at" timestamp
      );
    `);

    client.release();
    return true;
  } catch (error) {
    console.error('[DB] Startup migration failed:', error);
    return false;
  }
}

// Health check function for periodic monitoring
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; totalConnections: number; idleConnections: number }> {
  try {
    const client = await pool.connect();
    
    // Get pool statistics
    const totalConnections = pool.totalCount;
    const idleConnections = pool.idleCount;
    
    console.log(`[DB] Health check - Total: ${totalConnections}, Idle: ${idleConnections}`);
    
    client.release();
    
    return {
      healthy: true,
      totalConnections,
      idleConnections
    };
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return {
      healthy: false,
      totalConnections: 0,
      idleConnections: 0
    };
  }
}

// Graceful shutdown
export async function closeDatabasePool(): Promise<void> {
  try {
    console.log('[DB] Closing database pool...');
    await pool.end();
    console.log('[DB] Database pool closed successfully');
  } catch (error) {
    console.error('[DB] Error closing database pool:', error);
  }
}