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
  
  // Add error handling for individual client connections
  client.on('error', (err) => {
    console.error('[DB] Client error:', err);
    // Don't throw, handle gracefully
  });
});

pool.on('error', (err, client) => {
  console.error('[DB] Pool error:', err);
  // Don't throw, just log the error to prevent uncaught exceptions
  
  // If it's a connection termination, schedule a connection test
  if (err.message?.includes('terminating connection due to administrator command') ||
      err.message?.includes('Connection terminated') ||
      (err as any).code === '57P01') {
    console.log('[DB] Connection terminated, scheduling recovery check...');
    setTimeout(() => {
      testDatabaseConnection();
    }, 5000);
  }
});

pool.on('acquire', (client) => {
  console.log('[DB] Client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('[DB] Client removed from pool');
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