import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { autoInitializeEmailServices } from "./email-auto-init";
import { testDatabaseConnection, checkDatabaseHealth, closeDatabasePool, runStartupMigrations } from "./db";

// Add global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught Exception:', error);
  
  // Don't exit the process for email-related errors
  if (error.message?.includes('Timed out while authenticating') || 
      error.message?.includes('IMAP') ||
      (error as any).source === 'timeout-auth') {
    console.error('[PROCESS] Email service error caught, server continuing...');
    return;
  }
  
  // Don't exit the process for database connection errors - handle gracefully
  if (error.message?.includes('terminating connection due to administrator command') ||
      error.message?.includes('Connection terminated') ||
      error.message?.includes('FATAL') ||
      (error as any).code === '57P01' || // Connection termination error code
      (error as any).code === '08003' || // Connection does not exist
      (error as any).code === '08006') { // Connection failure
    console.error('[PROCESS] Database connection error caught, attempting recovery...');
    // Attempt to reconnect after a short delay
    setTimeout(async () => {
      console.log('[PROCESS] Testing database connection recovery...');
      const connected = await testDatabaseConnection();
      if (connected) {
        console.log('[PROCESS] Database connection recovered successfully');
      } else {
        console.error('[PROCESS] Database connection recovery failed');
      }
    }, 5000);
    return;
  }
  
  console.error('[PROCESS] Critical error, exiting...');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit for email-related rejections
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const httpServer = server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Test database connection on startup
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.warn('[SERVER] Database connection failed during startup, but server will continue running');
    }
    
    // Run startup migrations if database is connected
    if (dbConnected) {
      await runStartupMigrations();
    }
    
    // Auto-initialize email services after server starts
    setTimeout(async () => {
      await autoInitializeEmailServices();
    }, 2000); // Wait 2 seconds for server to fully start
    
    // Start periodic database health checks every 5 minutes
    const healthCheckInterval = setInterval(async () => {
      try {
        const health = await checkDatabaseHealth();
        if (!health.healthy) {
          console.warn('[SERVER] Database health check failed, attempting recovery...');
          await testDatabaseConnection();
        }
      } catch (error) {
        console.error('[SERVER] Health check error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    // Store the interval so we can clear it on shutdown
    (global as any).healthCheckInterval = healthCheckInterval;
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`[SERVER] Received ${signal}, starting graceful shutdown...`);
    
    // Clear health check interval
    if ((global as any).healthCheckInterval) {
      clearInterval((global as any).healthCheckInterval);
    }
    
    // Close HTTP server
    httpServer.close(async (err) => {
      if (err) {
        console.error('[SERVER] Error closing HTTP server:', err);
      } else {
        console.log('[SERVER] HTTP server closed');
      }
      
      // Close database pool
      await closeDatabasePool();
      
      console.log('[SERVER] Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force exit after 30 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('[SERVER] Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000);
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
