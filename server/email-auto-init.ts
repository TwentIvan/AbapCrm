import { storage } from "./storage";
import { initializeEmailService } from "./imap-service";
import { db } from "./db";
import { users } from "@shared/schema";

export async function autoInitializeEmailServices() {
  try {
    console.log('[EMAIL-INIT] Checking for saved email configurations...');
    
    try {
      const allUsers = await db.select().from(users);
      
      for (const user of allUsers) {
        try {
          const activeConfig = await storage.getActiveEmailConfig(user.id);
          
          if (activeConfig && activeConfig.password && activeConfig.password.trim() !== '' && !activeConfig.isForwarder) {
            console.log(`[EMAIL-INIT] Restoring email service for user: ${activeConfig.email}`);
            
            const firstFolder = activeConfig.folders && activeConfig.folders.length > 0 
              ? activeConfig.folders[0] 
              : "INBOX";
            
            const config = {
              user: activeConfig.email,
              password: activeConfig.password,
              host: activeConfig.host,
              port: activeConfig.port,
              tls: activeConfig.tls,
              folder: firstFolder,
              userId: user.id,
              organizationId: activeConfig.organizationId!
            };
            
            try {
              initializeEmailService(config);
              console.log(`[EMAIL-INIT] ✓ Email service restored for ${activeConfig.email}`);
            } catch (error) {
              console.error(`[EMAIL-INIT] ✗ Failed to restore email service for ${activeConfig.email}:`, error);
            }

            await new Promise(resolve => setTimeout(resolve, 15000));
          } else if (activeConfig && activeConfig.isForwarder) {
            console.log(`[EMAIL-INIT] Skipping forwarder account: ${activeConfig.email}`);
          } else if (activeConfig && (!activeConfig.password || activeConfig.password.trim() === '')) {
            console.log(`[EMAIL-INIT] Skipping account without password: ${activeConfig.email}`);
          }
        } catch (error) {
          console.error(`[EMAIL-INIT] ✗ Failed to get email config for user ${user.id}:`, error);
        }
      }
    } catch (dbError) {
      console.warn('[EMAIL-INIT] Database not ready yet, skipping email auto-initialization:', (dbError as Error).message);
      return;
    }
  } catch (error) {
    console.warn('[EMAIL-INIT] Error during auto-initialization, continuing server startup:', (error as Error).message);
  }
}
