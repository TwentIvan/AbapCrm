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
    
    // Add new email training selection columns if they don't exist
    const migrationSQL = `
      ALTER TABLE email_training_selections
        ADD COLUMN IF NOT EXISTS signature_body_selections text[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS signature_header_selections text[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS mail_thread_selections jsonb NOT NULL DEFAULT '[]'::jsonb;
    `;
    
    await client.query(migrationSQL);
    console.log('[DB] ✓ Email training selection columns added successfully');
    
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