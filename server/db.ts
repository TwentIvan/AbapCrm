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

// Add error handling for pool connections
pool.on('connect', (client) => {
  console.log('[DB] New client connected to pool');
});

pool.on('error', (err, client) => {
  console.error('[DB] Pool error:', err);
  // Don't throw, just log the error to prevent uncaught exceptions
});

pool.on('acquire', (client) => {
  console.log('[DB] Client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('[DB] Client removed from pool');
});

// Create database connection with error handling
export const db = drizzle({ client: pool, schema });

// Test the connection on startup
export async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('[DB] Database connection successful');
    client.release();
    return true;
  } catch (error) {
    console.error('[DB] Database connection failed:', error);
    return false;
  }
}