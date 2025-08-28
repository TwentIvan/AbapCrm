import { storage } from "./storage";
import { initializeEmailService } from "./imap-service";
import { db } from "./db";
import { users } from "@shared/schema";

// Auto-initialize email services for all active configurations on server startup
export async function autoInitializeEmailServices() {
  try {
    console.log('[EMAIL-INIT] Checking for saved email configurations...');
    
    // Get all users with active email configs
    const allUsers = await db.select().from(users);
    
    for (const user of allUsers) {
      const activeConfig = await storage.getActiveEmailConfig(user.id);
      
      if (activeConfig) {
        console.log(`[EMAIL-INIT] Restoring email service for user: ${activeConfig.email}`);
        
        const config = {
          user: activeConfig.email,
          password: activeConfig.password,
          host: activeConfig.host,
          port: activeConfig.port,
          tls: activeConfig.tls,
          folder: activeConfig.folder
        };
        
        try {
          initializeEmailService(config);
          console.log(`[EMAIL-INIT] ✓ Email service restored for ${activeConfig.email}`);
        } catch (error) {
          console.error(`[EMAIL-INIT] ✗ Failed to restore email service for ${activeConfig.email}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[EMAIL-INIT] Error during auto-initialization:', error);
  }
}