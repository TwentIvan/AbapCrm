import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { sql, inArray, eq, and, desc, asc } from "drizzle-orm";
import { generateVPNAutomationScript, discoverVPNConnections, discoverAvailableVPNSoftware, testVPNConnection } from "./vpn-automation";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { 
  insertProjectSchema, insertTaskSchema, insertPartnerSchema, 
  insertDealSchema, insertCalendarEventSchema, insertPlanningWindowSchema, insertTimeEntrySchema,
  insertMessageSchema, insertCommentSchema, insertMessageLinkSchema, insertEmailConfigSchema, insertTimesheetSchema,
  insertSalesOrderSchema, insertSalesOrderItemSchema, insertRateAgreementSchema,
  insertHumanResourceSchema, insertSapSystemSchema, insertSapSystemCredentialsSchema,
  insertVpnConnectionSchema, insertVpnCredentialsSchema, insertTransportRequestSchema,
  insertInterventionDocumentSchema, insertSystemCredentialsSchema,
  insertVpnSoftwareSchema, insertVpnSystemsSchema, vpnConnections,
  insertDiscoveredVpnSoftwareSchema, insertDiscoveredVpnConfigurationSchema,
  insertOrganizationSchema, insertUserOrganizationSchema, insertOrganizationInvitationSchema,
  insertOrganizationDomainSchema, insertEmailFeedbackSchema, insertEmailTrainingSelectionSchema,
  type EmailConfig,
  projects, tasks, partners, messages, deals, calendarEvents, salesOrders, rateAgreements,
  humanResources, sapSystems, systemCredentials, timesheets, comments
} from "@shared/schema";
import { aiService } from "./ai-service";
import { initializeEmailService, getEmailService } from "./imap-service";
import { AuditService } from "./audit-service";
import { MessageLogService } from "./message-log-service";
import { gmailService } from "./gmail-service";
import { AttachmentsService } from "./attachments-service";
import { EmailForwardCleaner } from './email-forward-cleaner';

// Helper function to extract organizationId from request header
function getOrganizationId(req: any): string {
  const organizationId = req.headers['x-organization-id'] as string;
  // Return default organization if header not present
  return organizationId || '4ca22699-5fd4-4030-8bb5-4e7cef9ce8be';
}

// Helper function to safely get organizationId (returns null if not present)
function getOptionalOrganizationId(req: any): string | null {
  return req.headers['x-organization-id'] as string || null;
}

// Helper function to get Personal scope from request header
function getPersonalScope(req: any): 'personal' | 'all' {
  const scope = req.headers['x-organization-scope'] as string;
  return (scope === 'all' || scope === 'personal') ? scope : 'personal';
}

// Helper function to get all organization IDs for a user (for Personal "all" scope)
async function getUserOrganizationIds(userId: string): Promise<string[]> {
  const userOrgs = await storage.getUserOrganizations(userId);
  return userOrgs.map(org => org.id);
}

// Helper function to get organization IDs to filter by, considering Personal scope
async function getOrganizationIdsForFilter(req: any): Promise<string[]> {
  const organizationId = getOrganizationId(req);
  const scope = getPersonalScope(req);
  
  // Check if this is the "Personal" organization (by name check via storage)
  const orgs = await storage.getUserOrganizations(req.user.id);
  const currentOrg = orgs.find(org => org.id === organizationId);
  const isPersonal = currentOrg?.name === 'Personal';
  
  // If Personal + scope 'all', return ALL user's organization IDs
  if (isPersonal && scope === 'all') {
    return orgs.map(org => org.id);
  }
  
  // Otherwise, return just the current organization ID
  return [organizationId];
}

// Chat content parser - normalizes different platform formats into structured conversation data
function parseChatContent(content: string, platform: string): {
  participants: Array<{id: string, name: string}>;
  messages: Array<{id: string, senderId: string, senderName: string, timestamp: string, text: string}>;
  firstAuthor: string | null;
  summary: string;
  rawSource: string;
} {
  const lines = content.trim().split('\n');
  const messages: Array<{id: string, senderId: string, senderName: string, timestamp: string, text: string}> = [];
  const participantMap = new Map<string, {id: string, name: string}>();
  
  if (platform === 'teams') {
    // Teams real export format:
    // "Nome da preview..."
    // "Nome"
    // "[timestamp]" (optional)
    // ""
    // "messaggio"
    
    // Filter out Teams UI noise (menu, buttons, etc) but KEEP date separators
    const uiNoisePatterns = [
      /^Ha il menu contestuale$/i,
      /^Chat$/i,
      /^Non letto$/i,
      /^Canali$/i,
      /^Messaggi non letti/i,
      /^Ultimo messaggio/i,
      /^Chat di gruppo/i,
      /^Chat della riunione/i,
      /^Personale menzionato/i,
      /^Tutti gli utenti menzionati/i,
      /^Importante$/i,
      /^Urgente$/i,
      /^Bozza$/i,
      /^Colori spenti$/i,
      /^Riunione/i,
      /^Privata$/i,
      /^Condiviso$/i,
      /^Canale/i,
      /^Team$/i,
      /^Visualizzazione temporanea$/i,
      /^Community$/i,
      /^Mostra altro$/i,
      /^\d+\sreazione/i,  // "1 reazione Mi piace"
      /^[👍❤️😮😆🎉]+$/   // Solo emoji
    ];
    
    // Pattern for date separators (keep these!)
    // Expanded to handle optional weekday prefix and year suffix
    const dateSeparatorPattern = /^(?:[\p{L}]+[,\s]+)?\d{1,2}\s+[\p{L}]+(?:\s+\d{4})?$/iu;
    
    const cleanLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !uiNoisePatterns.some(pattern => pattern.test(trimmed));
    });
    
    // Helper to normalize line by removing hidden Unicode markers
    const normalizeLine = (line: string): string => {
      return line
        .replace(/[\u200e\u200f\u202a-\u202e]/g, '') // Remove zero-width marks
        .replace(/\s*[·•]\s*\d{1,2}:\d{2}\s*$/g, '') // Remove trailing bullet+time
        .trim();
    };
    
    // State machine: preview → name → timestamp (sticky) → blank → body
    let i = 0;
    let lastTimestamp = ''; // Sticky timestamp - riusa l'ultimo se manca
    
    while (i < cleanLines.length) {
      const line = cleanLines[i].trim();
      const normalizedLine = normalizeLine(line);
      
      // Check for date separator (e.g., "24 September", "Giovedì 25 September", "Monday", "Ieri")
      if (dateSeparatorPattern.test(normalizedLine)) {
        messages.push({
          id: `date-${messages.length}`,
          senderId: 'date-separator',
          senderName: '',
          timestamp: '',
          text: normalizedLine
        });
        i++;
        continue;
      }
      
      // Look for preview line pattern: "Nome da text..."
      const previewMatch = line.match(/^([A-Za-z\s]+?)\s+da\s+.*/);
      if (previewMatch) {
        const senderName = previewMatch[1].trim();
        i++; // Move to name line
        
        // Next line should be just the name (confirm it matches)
        if (i < cleanLines.length && cleanLines[i].trim() === senderName) {
          i++; // Move past name
        }
        
        // Check for timestamp (optional - HH:MM format)
        // If present, update lastTimestamp; if not, use sticky lastTimestamp
        if (i < cleanLines.length && /^\d{1,2}:\d{2}$/.test(cleanLines[i].trim())) {
          lastTimestamp = cleanLines[i].trim();
          i++;
        }
        // If no timestamp, lastTimestamp remains from previous message
        
        // Skip blank lines
        while (i < cleanLines.length && !cleanLines[i].trim()) {
          i++;
        }
        
        // Collect message body until next preview pattern or date separator
        const messageLines: string[] = [];
        while (i < cleanLines.length) {
          const nextLine = cleanLines[i].trim();
          const normalizedNextLine = normalizeLine(nextLine);
          
          // Stop at next message (preview pattern)
          if (/^[A-Za-z\s]+?\s+da\s+/.test(nextLine)) break;
          
          // Stop at date separator (use normalized line)
          if (dateSeparatorPattern.test(normalizedNextLine)) break;
          
          // Skip emoji-only lines and reactions
          if (!/^[👍❤️😮😆🎉]+$/.test(nextLine) && !/^\d+\sreazione/i.test(nextLine)) {
            messageLines.push(cleanLines[i]);
          }
          i++;
        }
        
        const text = messageLines.join('\n').trim();
        if (text) {
          const senderId = senderName.toLowerCase().replace(/\s+/g, '-');
          
          if (!participantMap.has(senderId)) {
            participantMap.set(senderId, { id: senderId, name: senderName });
          }
          
          messages.push({
            id: `msg-${messages.length}`,
            senderId,
            senderName,
            timestamp: lastTimestamp || '',
            text
          });
        }
      } else {
        i++; // Skip unrecognized lines
      }
    }
  } else if (platform === 'whatsapp') {
    // WhatsApp format: "[date, ]time - Name: message" (supports date prefix, 12h/24h time)
    // Examples: 
    // - "03/10/2025, 10:31 - Marco: Hello"
    // - "10:31 AM - Marco: Hello"
    // - "22:45 - Marco: Hello" (24h format)
    const whatsappPattern = /^(?:\d{1,2}\/\d{1,2}\/\d{4},?\s*)?([\d:]+(?:\s*[AP]M)?)\s*[-–]\s*([^:]+):\s*(.+)/;
    
    let currentMessage: { timestamp: string; senderName: string; text: string } | null = null;
    
    for (const line of lines) {
      const match = line.match(whatsappPattern);
      if (match) {
        // Save previous message if exists
        if (currentMessage) {
          const senderId = currentMessage.senderName.toLowerCase().replace(/\s+/g, '-');
          if (!participantMap.has(senderId)) {
            participantMap.set(senderId, { id: senderId, name: currentMessage.senderName });
          }
          messages.push({
            id: `msg-${messages.length}`,
            senderId,
            senderName: currentMessage.senderName,
            timestamp: currentMessage.timestamp,
            text: currentMessage.text.trim()
          });
        }
        
        // Start new message
        currentMessage = {
          timestamp: match[1].trim(),
          senderName: match[2].trim(),
          text: match[3].trim()
        };
      } else if (currentMessage && line.trim()) {
        // Multi-line message continuation
        currentMessage.text += '\n' + line;
      }
    }
    
    // Save last message
    if (currentMessage) {
      const senderId = currentMessage.senderName.toLowerCase().replace(/\s+/g, '-');
      if (!participantMap.has(senderId)) {
        participantMap.set(senderId, { id: senderId, name: currentMessage.senderName });
      }
      messages.push({
        id: `msg-${messages.length}`,
        senderId,
        senderName: currentMessage.senderName,
        timestamp: currentMessage.timestamp,
        text: currentMessage.text.trim()
      });
    }
  } else if (platform === 'googlemeet') {
    // Google Meet format: "Name\ntimestamp\nmessage" (repeating)
    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 < lines.length) {
        const senderName = lines[i].trim();
        const timestamp = lines[i + 1].trim();
        const text = lines[i + 2].trim();
        const senderId = senderName.toLowerCase().replace(/\s+/g, '-');
        
        if (!participantMap.has(senderId)) {
          participantMap.set(senderId, { id: senderId, name: senderName });
        }
        
        messages.push({
          id: `msg-${messages.length}`,
          senderId,
          senderName,
          timestamp,
          text
        });
      }
    }
  }
  
  const participants = Array.from(participantMap.values());
  // Find first real author (skip date separators - both old 'system' and new 'date-separator')
  const firstRealMessage = messages.find(msg => msg.senderId !== 'date-separator' && msg.senderId !== 'system');
  const firstAuthor = firstRealMessage ? firstRealMessage.senderName : null;
  const participantNames = participants.map(p => p.name).join(', ');
  const summary = participants.length > 1 
    ? `Chat among ${participants.length} participants` 
    : firstAuthor 
      ? `Chat with ${firstAuthor}` 
      : 'Chat conversation';
  
  return {
    participants,
    messages,
    firstAuthor,
    summary,
    rawSource: content.trim()
  };
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Health check endpoint for debugging
  app.get('/api/__health', (req, res) => {
    res.json({ 
      ok: true, 
      env: (app as any).get('env'), 
      NODE_ENV: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  });

  // Debug endpoint for authentication (DEV ONLY) - NEW PATH to avoid conflicts
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/auth-probe/:username', async (req, res) => {
      console.log('[AUTH-PROBE] routes.ts handler executing');
      try {
        const { username } = req.params;
        const password = String(req.query.password || '');
        const probe = ['true','1','yes','on'].includes(String(req.query.probe || '').toLowerCase());
        
        let user = await storage.getUserByEmail(username);
        if (!user && !username.includes('@')) user = await storage.getUserByUsername(username);
        if (!user) return res.status(404).json({ found: false });
        
        const stored = user.password || '';
        const [hash = '', salt = ''] = stored.split('.');
        const isSaltHex = /^[0-9a-f]+$/i.test(salt) && salt.length % 2 === 0;
        let match = false, error;
        
        // Import comparePasswords dynamically to avoid circular imports
        const { comparePasswords } = await import('./auth');
        try { 
          match = await comparePasswords(password, stored); 
        } catch (e: any) { 
          error = e.message || String(e); 
        }

        const result: any = { 
          found: true, 
          user: { id: user.id, username: user.username, email: user.email }, 
          hashInfo: { hashLen: hash.length, saltLen: salt.length, isSaltHex }, 
          match, 
          error,
          probeRequested: probe,
          probeResults: []
        };

        // Probe legacy algorithms if requested
        if (probe && password) {
          try {
            const crypto = await import('crypto');
            const util = await import('util');
            const pbkdf2 = util.promisify(crypto.pbkdf2);
            
            const hashBuf = Buffer.from(hash, 'hex');
            const saltBuf = Buffer.from(salt, 'hex');
            const saltStr = salt;
            const keyLen = hashBuf.length;
            
            const probeResults: any[] = [];

          // Test PBKDF2-SHA512 with various iterations
          for (const iterations of [10000, 50000, 100000]) {
            try {
              // Try with hex-decoded salt
              const derived1 = await pbkdf2(password, saltBuf, iterations, keyLen, 'sha512');
              if (hashBuf.length === derived1.length && crypto.timingSafeEqual(hashBuf, derived1)) {
                probeResults.push({ algorithm: 'PBKDF2-SHA512', iterations, saltEncoding: 'hex', match: true });
              }
              
              // Try with string salt
              const derived2 = await pbkdf2(password, saltStr, iterations, keyLen, 'sha512');
              if (hashBuf.length === derived2.length && crypto.timingSafeEqual(hashBuf, derived2)) {
                probeResults.push({ algorithm: 'PBKDF2-SHA512', iterations, saltEncoding: 'string', match: true });
              }
            } catch (e) {
              // Continue with next iteration
            }
          }

          // Test SHA-512 variations
          try {
            // SHA-512(salt + password)
            const sha1 = crypto.createHash('sha512').update(saltBuf).update(password, 'utf8').digest();
            if (crypto.timingSafeEqual(hashBuf, sha1)) {
              probeResults.push({ algorithm: 'SHA-512', method: 'salt+password', saltEncoding: 'hex', match: true });
            }

            // SHA-512(password + salt)
            const sha2 = crypto.createHash('sha512').update(password, 'utf8').update(saltBuf).digest();
            if (crypto.timingSafeEqual(hashBuf, sha2)) {
              probeResults.push({ algorithm: 'SHA-512', method: 'password+salt', saltEncoding: 'hex', match: true });
            }

            // SHA-512(salt + password) with string salt
            const sha3 = crypto.createHash('sha512').update(saltStr, 'utf8').update(password, 'utf8').digest();
            if (crypto.timingSafeEqual(hashBuf, sha3)) {
              probeResults.push({ algorithm: 'SHA-512', method: 'salt+password', saltEncoding: 'string', match: true });
            }

            // SHA-512(password + salt) with string salt
            const sha4 = crypto.createHash('sha512').update(password, 'utf8').update(saltStr, 'utf8').digest();
            if (crypto.timingSafeEqual(hashBuf, sha4)) {
              probeResults.push({ algorithm: 'SHA-512', method: 'password+salt', saltEncoding: 'string', match: true });
            }
          } catch (e) {
            // Continue
          }

          // Test MD5 variations (some legacy systems use double MD5)
          try {
            // MD5(MD5(password) + salt)
            const md5_1 = crypto.createHash('md5').update(password, 'utf8').digest('hex');
            const md5_2 = crypto.createHash('md5').update(md5_1 + saltStr).digest('hex');
            if (md5_2.toLowerCase() === hash.toLowerCase()) {
              probeResults.push({ algorithm: 'MD5', method: 'MD5(MD5(password)+salt)', match: true });
            }

            // MD5(salt + MD5(password))
            const md5_3 = crypto.createHash('md5').update(saltStr + md5_1).digest('hex');
            if (md5_3.toLowerCase() === hash.toLowerCase()) {
              probeResults.push({ algorithm: 'MD5', method: 'MD5(salt+MD5(password))', match: true });
            }
          } catch (e) {
            // Continue
          }

          // Test SHA-1 variations
          try {
            // SHA-1(password + salt)
            const sha1_1 = crypto.createHash('sha1').update(password + saltStr).digest('hex');
            if (sha1_1.toLowerCase() === hash.toLowerCase()) {
              probeResults.push({ algorithm: 'SHA-1', method: 'SHA1(password+salt)', match: true });
            }

            // SHA-1(salt + password)
            const sha1_2 = crypto.createHash('sha1').update(saltStr + password).digest('hex');
            if (sha1_2.toLowerCase() === hash.toLowerCase()) {
              probeResults.push({ algorithm: 'SHA-1', method: 'SHA1(salt+password)', match: true });
            }
          } catch (e) {
            // Continue
          }

          // Test lower iterations PBKDF2 (some legacy systems use very low)
          try {
            for (const iterations of [1, 100, 1000, 5000]) {
              const derived = await pbkdf2(password, saltBuf, iterations, keyLen, 'sha512');
              if (hashBuf.length === derived.length && crypto.timingSafeEqual(hashBuf, derived)) {
                probeResults.push({ algorithm: 'PBKDF2-SHA512-low', iterations, match: true });
              }
            }
          } catch (e) {
            // Continue
          }

          // Test different password case variations
          try {
            const passwordLower = password.toLowerCase();
            const passwordUpper = password.toUpperCase();
            
            for (const pwd of [passwordLower, passwordUpper]) {
              // PBKDF2 with case variations
              const derived = await pbkdf2(pwd, saltBuf, 10000, keyLen, 'sha512');
              if (hashBuf.length === derived.length && crypto.timingSafeEqual(hashBuf, derived)) {
                probeResults.push({ algorithm: 'PBKDF2-SHA512', passwordCase: pwd === passwordLower ? 'lower' : 'upper', match: true });
              }
              
              // SHA-512 with case variations
              const sha = crypto.createHash('sha512').update(pwd, 'utf8').update(saltBuf).digest();
              if (crypto.timingSafeEqual(hashBuf, sha)) {
                probeResults.push({ algorithm: 'SHA-512', passwordCase: pwd === passwordLower ? 'lower' : 'upper', method: 'password+salt', match: true });
              }
            }
          } catch (e) {
            // Continue
          }

          // Test HMAC-SHA512 variations (final attempt before reset flow)
          try {
            // HMAC-SHA512 with hex salt as key
            const hmac1 = crypto.createHmac('sha512', saltBuf).update(password, 'utf8').digest();
            if (crypto.timingSafeEqual(hashBuf, hmac1)) {
              probeResults.push({ algorithm: 'HMAC-SHA512', saltEncoding: 'hex', match: true });
            }

            // HMAC-SHA512 with string salt as key
            const hmac2 = crypto.createHmac('sha512', saltStr).update(password, 'utf8').digest();
            if (crypto.timingSafeEqual(hashBuf, hmac2)) {
              probeResults.push({ algorithm: 'HMAC-SHA512', saltEncoding: 'string', match: true });
            }
          } catch (e) {
            // Continue
          }

          result.probeResults = probeResults;
          } catch (probeError: any) {
            result.probeError = probeError.message || String(probeError);
          }
        }
        
        res.json(result);
      } catch (e: any) { 
        res.status(500).json({ error: e.message }); 
      }
    });
  }

  // Users
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const users = await storage.getUsers();
    res.json(users);
  });

  // Organizations
  app.get("/api/organizations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizations = await storage.getOrganizations(req.user!.id);
    res.json(organizations);
  });

  app.get("/api/organizations/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organization = await storage.getOrganization(req.params.id);
    if (!organization) return res.sendStatus(404);
    res.json(organization);
  });

  app.post("/api/organizations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const data = insertOrganizationSchema.parse(req.body);
      const auditContext = AuditService.createContext(req);
      const organization = await storage.createOrganization(data, auditContext);
      
      // Automatically add the creator as admin of the new organization
      await storage.addUserToOrganization({
        userId: req.user!.id,
        organizationId: organization.id,
        role: 'admin',
        isActive: true
      });
      
      res.json(organization);
    } catch (error) {
      res.status(400).json({ error: "Invalid organization data" });
    }
  });

  app.put("/api/organizations/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const data = insertOrganizationSchema.partial().parse(req.body);
      const auditContext = AuditService.createContext(req);
      const organization = await storage.updateOrganization(req.params.id, data, auditContext);
      if (!organization) return res.sendStatus(404);
      res.json(organization);
    } catch (error) {
      res.status(400).json({ error: "Invalid organization data" });
    }
  });

  app.delete("/api/organizations/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteOrganization(req.params.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // User-Organization relationships
  app.get("/api/user-organizations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userOrganizations = await storage.getUserOrganizations(req.user!.id);
    res.json(userOrganizations);
  });

  app.post("/api/user-organizations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const data = insertUserOrganizationSchema.parse(req.body);
      const userOrganization = await storage.addUserToOrganization(data);
      res.json(userOrganization);
    } catch (error) {
      res.status(400).json({ error: "Invalid user-organization data" });
    }
  });

  app.delete("/api/user-organizations/:organizationId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const removed = await storage.removeUserFromOrganization(req.user!.id, req.params.organizationId);
    if (!removed) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Organization Invitations
  app.post("/api/organizations/:id/invite", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { email, role, message } = req.body;
      
      // Verify organization exists and user has admin rights
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) return res.status(404).json({ error: "Organization not found" });
      
      // Generate unique token for invitation
      const token = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
      
      const invitation = await storage.createInvitation({
        organizationId: req.params.id,
        invitedByUserId: req.user!.id,
        invitedEmail: email,
        role: role || "member",
        message: message || null,
        token,
        expiresAt,
        status: "pending"
      });
      
      res.status(201).json(invitation);
    } catch (error) {
      res.status(400).json({ error: "Invalid invitation data" });
    }
  });

  app.get("/api/invitations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user || !user.email) return res.status(400).json({ error: "User email not found" });
      
      const invitations = await storage.getInvitationsByEmail(user.email);
      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.post("/api/invitations/:token/accept", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const invitation = await storage.getInvitationByToken(req.params.token);
      if (!invitation) return res.status(404).json({ error: "Invitation not found" });
      
      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "Invitation already processed" });
      }
      
      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ error: "Invitation expired" });
      }
      
      // Accept invitation and add user to organization
      await storage.updateInvitationStatus(req.params.token, "accepted");
      await storage.addUserToOrganization({
        userId: req.user!.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        isActive: true
      });
      
      res.json({ message: "Invitation accepted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });

  app.post("/api/invitations/:token/decline", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const invitation = await storage.getInvitationByToken(req.params.token);
      if (!invitation) return res.status(404).json({ error: "Invitation not found" });
      
      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "Invitation already processed" });
      }
      
      await storage.updateInvitationStatus(req.params.token, "declined");
      res.json({ message: "Invitation declined successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to decline invitation" });
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const projectsList = await db.select().from(projects)
        .where(and(
          eq(projects.userId, req.user!.id),
          inArray(projects.organizationId, organizationIds)
        ));
      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const project = await storage.getProject(req.params.id, req.user!.id, organizationId);
      if (!project) return res.sendStatus(404);
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Convert data before validation
      const processedData = {
        name: req.body.name,
        description: req.body.description || null,
        status: req.body.status || "planning",
        clientId: req.body.clientId || null,
        parentProjectId: req.body.parentProjectId || null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        budget: req.body.budget || null,
        progress: req.body.progress || 0,
        estimatedEffort: req.body.estimatedEffort || null,
        userId: req.user!.id
      };
      
      const organizationId = getOrganizationId(req);
      console.log("Processing project data:", processedData);
      const projectData = insertProjectSchema.parse({ ...processedData, organizationId });
      const auditContext = AuditService.createContext(req);
      const project = await storage.createProject({ ...projectData, organizationId }, auditContext);
      res.status(201).json(project);
    } catch (error) {
      console.error("Project creation error:", error);
      res.status(400).json({ error: "Invalid project data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        parentProjectId: req.body.parentProjectId || null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      };
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const project = await storage.updateProject(req.params.id, updateData, req.user!.id, organizationId, auditContext);
      if (!project) return res.sendStatus(404);
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteProject(req.params.id, req.user!.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Tasks
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const tasksList = await db.select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        taskType: tasks.taskType,
        projectId: tasks.projectId,
        parentTaskId: tasks.parentTaskId,
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        sapSystemId: tasks.sapSystemId,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        estimatedEffort: tasks.estimatedEffort,
        remainingEffort: tasks.remainingEffort,
        completionPercentage: tasks.completionPercentage,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        organizationId: tasks.organizationId,
        projectName: projects.name,
      }).from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(and(
          eq(tasks.userId, req.user!.id),
          inArray(tasks.organizationId, organizationIds)
        ))
        .orderBy(desc(tasks.updatedAt));
      res.json(tasksList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const task = await storage.getTask(req.params.id, req.user!.id, organizationId);
      if (!task) return res.sendStatus(404);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Get connection info for a task (VPN + SAP)
  app.get("/api/tasks/:id/connection-info", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connectionInfo = await storage.getTaskConnectionInfo(req.params.id, req.user!.id);
      if (!connectionInfo) {
        return res.status(404).json({ error: "Task not found or no SAP system configured" });
      }
      res.json(connectionInfo);
    } catch (error) {
      console.error('Error getting task connection info:', error);
      res.status(500).json({ error: "Failed to get connection info" });
    }
  });

  // Execute VPN connection automation
  app.post("/api/tasks/:id/execute-connection", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connectionInfo = await storage.getTaskConnectionInfo(req.params.id, req.user!.id);
      if (!connectionInfo) {
        return res.status(404).json({ error: "Task not found or no SAP system configured" });
      }

      // Check if VPN connection has pre-generated automation script
      if (connectionInfo.vpnConnectionId) {
        const vpnConnection = await storage.getVpnConnection(connectionInfo.vpnConnectionId, req.user!.id);
        
        if (vpnConnection?.automationScript) {
          // Use the pre-generated intelligent script from database
          console.log('Using pre-generated VPN automation script from database');
          const automationResult = {
            success: true,
            connectionType: vpnConnection.scriptType || 'unknown',
            executionCommand: vpnConnection.automationScript,
            instructions: `🚀 Script Intelligente Pre-Configurato
            
Questo script è stato generato e validato durante la configurazione della VPN "${vpnConnection.name}".

Comando di esecuzione:
${vpnConnection.automationScript}

Tipo script: ${vpnConnection.scriptType}
Generato il: ${vpnConnection.scriptGeneratedAt ? new Date(vpnConnection.scriptGeneratedAt).toLocaleString() : 'N/A'}
Validato il: ${vpnConnection.scriptValidatedAt ? new Date(vpnConnection.scriptValidatedAt).toLocaleString() : 'N/A'}

✅ Questo script è pronto per l'uso immediato!`,
            scriptPath: vpnConnection.scriptType === 'applescript' ? '/tmp/forticlient_automation.scpt' : 
                       vpnConnection.scriptType === 'scutil' ? '/tmp/native_vpn.sh' : '/tmp/vpn_script.sh'
          };
          
          return res.json(automationResult);
        }
      }

      // Fallback: Generate automation scripts on the fly (legacy behavior)
      console.log('No pre-generated script found, generating on-the-fly...');
      const automationResult = await generateVPNAutomationScript(connectionInfo);
      res.json(automationResult);
    } catch (error) {
      console.error('Error executing VPN automation:', error);
      res.status(500).json({ error: "Failed to execute VPN automation" });
    }
  });

  // VPN Software Discovery endpoint - NEW HYBRID APPROACH
  app.get('/api/vpn/software', async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    console.log('[VPN-SOFTWARE-API] ========== SOFTWARE DISCOVERY REQUEST ==========');
    
    try {
      const availableSoftware = await discoverAvailableVPNSoftware(req.user!.id);
      
      console.log('[VPN-SOFTWARE-API] Found', availableSoftware.length, 'VPN software packages');
      availableSoftware.forEach(sw => {
        console.log(`[VPN-SOFTWARE-API] - ${sw.name}: ${sw.installed ? '✅' : '❌'} installed, configs: ${sw.canReadConfigs ? '✅' : '❌'}, automation: ${sw.automationType}`);
      });
      
      res.json({
        success: true,
        software: availableSoftware
      });
    } catch (error) {
      console.error('[VPN-SOFTWARE-API] Error during software discovery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to discover VPN software'
      });
    }
  });

  // VPN Discovery endpoint (updated for hybrid approach)
  app.post("/api/vpn/discover", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { software } = req.body;
      console.log('[VPN-DISCOVERY-API] ========== NEW DISCOVERY REQUEST ==========');
      console.log('[VPN-DISCOVERY-API] Request for software:', software);
      console.log('[VPN-DISCOVERY-API] Request body:', req.body);
      console.log('[VPN-DISCOVERY-API] Platform:', process.platform);
      console.log('[VPN-DISCOVERY-API] Starting discovery...');
      
      // Get all available VPN connections for the specified software
      const allConnections = await discoverVPNConnections(software, req.user!.id);
      
      console.log('[VPN-DISCOVERY-API] ===== ALL CONNECTIONS FOUND =====');
      console.log('[VPN-DISCOVERY-API] Total connections:', allConnections.length);
      console.log('[VPN-DISCOVERY-API] Connections:', allConnections);
      
      // Transform to simpler format for frontend
      const connectionsForFrontend = allConnections.map(conn => ({
        id: conn.id,
        name: conn.name,
        type: conn.type,
        details: conn.description || `${conn.name} (${conn.type})`,
        configured: conn.status === 'configured',
        server: conn.server,
        port: conn.port
      }));

      console.log('[VPN-DISCOVERY-API] ===== FINAL RESPONSE =====');
      console.log('[VPN-DISCOVERY-API] Response:', {
        success: true,
        software: software || 'all',
        connections: connectionsForFrontend
      });
      console.log('[VPN-DISCOVERY-API] ========================================');

      res.json({
        success: true,
        software: software || 'all',
        connections: connectionsForFrontend
      });
    } catch (error) {
      console.error('[VPN-DISCOVERY-API] Error during discovery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to discover VPN connections',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Upload real FortiClient profiles extracted with fccconfig
  app.post("/api/vpn/upload-real-profiles", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { source, hostname, timestamp, extraction_method, connection_count, connections } = req.body;
      
      console.log('[VPN-REAL-PROFILES] ========== REAL PROFILES UPLOAD ==========');
      console.log('[VPN-REAL-PROFILES] Source:', source);
      console.log('[VPN-REAL-PROFILES] Hostname:', hostname);
      console.log('[VPN-REAL-PROFILES] Extraction method:', extraction_method);
      console.log('[VPN-REAL-PROFILES] Timestamp:', timestamp);
      console.log('[VPN-REAL-PROFILES] Profile count:', connection_count);
      console.log('[VPN-REAL-PROFILES] Profiles:', JSON.stringify(connections, null, 2));
      
      // Store the real profiles globally for discovery
      (global as any).realFortiClientProfiles = {
        source,
        hostname,
        timestamp,
        extraction_method,
        connection_count,
        connections: Array.isArray(connections) ? connections : JSON.parse(connections),
        userId: req.user!.id
      };
      
      // ALSO save real profiles to database for persistence
      const connectionsArray = Array.isArray(connections) ? connections : JSON.parse(connections);
      for (const conn of connectionsArray) {
        try {
          // Create a minimal partner entry for discovered connections if needed
          const organizationId = getOrganizationId(req);
          const discoverPartner = await storage.createPartner({
            userId: req.user!.id,
            name: `Discovered from ${hostname}`,
            company: hostname,
            type: 'client',
            email: '',
            phone: '',
            address: '',
            country: '',
            notes: `Auto-created for real VPN profiles discovered from ${hostname}`,
            organizationId
          });

          // Save the real VPN connection to database
          const vpnConnectionData = {
            partnerId: discoverPartner.id,
            name: conn.name || `Real VPN ${conn.id}`,
            description: `${conn.description || ''} (Real profile from ${extraction_method})`,
            connectionType: 'other' as const,
            status: 'active' as const,
            serverHost: conn.server || hostname,
            serverPort: conn.port || 443,
            protocol: 'ssl',
            automationScript: 'applescript-advanced',
            scriptType: 'real-discovered',
            notes: `Real FortiClient profile discovered from ${hostname} via ${extraction_method}`,
            isActive: true
          };
          
          const vpnConnectionDataWithOrg = {
            ...vpnConnectionData,
            organizationId: '4ca22699-5fd4-4030-8bb5-4e7cef9ce8be' // TODO: Get from user session
          };
          await storage.createVpnConnection(vpnConnectionDataWithOrg, req.user!.id);
          console.log('[VPN-REAL-PROFILES] ✅ Saved real profile to database:', conn.name);
        } catch (error) {
          console.error('[VPN-REAL-PROFILES] ⚠️ Could not save to database:', error);
        }
      }
      
      console.log('[VPN-REAL-PROFILES] ✅ Real profiles stored successfully');
      
      res.json({
        success: true,
        message: "Real FortiClient profiles uploaded successfully",
        profile_count: connection_count,
        extraction_method: extraction_method,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('[VPN-REAL-PROFILES] Error uploading real profiles:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to upload real profiles",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Upload local VPN connections from user's workstation
  app.post("/api/vpn/upload-local-connections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { source, hostname, username, timestamp, forticlient_installed, connection_count, connections } = req.body;
      
      console.log('[VPN-UPLOAD] ========== LOCAL CONNECTIONS UPLOAD ==========');
      console.log('[VPN-UPLOAD] Source:', source);
      console.log('[VPN-UPLOAD] Hostname:', hostname);
      console.log('[VPN-UPLOAD] Username:', username);
      console.log('[VPN-UPLOAD] Timestamp:', timestamp);
      console.log('[VPN-UPLOAD] FortiClient installed:', forticlient_installed);
      console.log('[VPN-UPLOAD] Connection count:', connection_count);
      console.log('[VPN-UPLOAD] Connections:', JSON.stringify(connections, null, 2));
      
      // Store the uploaded connections (in production, save to database)
      (global as any).uploadedVPNConnections = {
        source,
        hostname,
        username,
        timestamp,
        forticlient_installed,
        connection_count,
        connections: JSON.parse(connections),
        userId: req.user!.id
      };
      
      console.log('[VPN-UPLOAD] ✅ Connections stored successfully');
      
      res.json({
        success: true,
        message: "VPN connections uploaded successfully",
        connection_count: connection_count,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('[VPN-UPLOAD] Error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to upload VPN connections",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Legacy GET endpoint for backward compatibility
  app.get("/api/vpn/discover", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const availableConnections = await discoverVPNConnections(undefined, req.user!.id);
      res.json(availableConnections);
    } catch (error) {
      console.error('Error discovering VPN connections:', error);
      res.status(500).json({ error: "Failed to discover VPN connections" });
    }
  });

  // Get tasks by project
  app.get("/api/tasks/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const tasks = await storage.getTasksByProject(req.params.projectId, req.user!.id, organizationId);
    res.json(tasks);
  });

  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const completionPercentage = req.body.completionPercentage || 0;
      const estimatedEffort = req.body.estimatedEffort || null;
      
      // Calculate initial remaining effort (in minutes to avoid decimal issues)  
      let remainingEffort = null;
      if (estimatedEffort && completionPercentage < 100) {
        const remainingPercentage = 100 - completionPercentage;
        const remainingHours = (estimatedEffort * remainingPercentage) / 100;
        remainingEffort = Math.round(remainingHours * 60); // Convert to minutes
      }

      const organizationId = getOrganizationId(req);
      const taskData = insertTaskSchema.parse({ 
        title: req.body.title,
        description: req.body.description || null,
        status: req.body.status,
        priority: req.body.priority,
        projectId: req.body.projectId,
        parentTaskId: req.body.parentTaskId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        estimatedEffort: estimatedEffort,
        remainingEffort: remainingEffort,
        completionPercentage: completionPercentage,
        userId: req.user!.id,
        organizationId: organizationId
      });
      const auditContext = AuditService.createContext(req);
      const task = await storage.createTask({ ...taskData, organizationId }, auditContext);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Create a partial update schema that makes all fields optional
      const updateData: any = {};
      
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description || null;
      if (req.body.status !== undefined) updateData.status = req.body.status;
      if (req.body.priority !== undefined) updateData.priority = req.body.priority;
      if (req.body.projectId !== undefined) updateData.projectId = req.body.projectId;
      if (req.body.sapSystemId !== undefined) updateData.sapSystemId = req.body.sapSystemId;
      if (req.body.dueDate !== undefined) updateData.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (req.body.estimatedEffort !== undefined) updateData.estimatedEffort = req.body.estimatedEffort || null;
      if (req.body.completionPercentage !== undefined) updateData.completionPercentage = req.body.completionPercentage;
      if (req.body.assignedTo !== undefined) updateData.assignedTo = req.body.assignedTo || null;

      // Auto-calculate remaining effort when completion percentage changes
      if (req.body.completionPercentage !== undefined) {
        // Get current task to access previous remaining effort and estimated effort
        const organizationId = getOrganizationId(req);
        const currentTask = await storage.getTask(req.params.id, req.user!.id, organizationId);
        
        if (currentTask && currentTask.estimatedEffort && req.body.completionPercentage > 0) {
          const newCompletionPercentage = req.body.completionPercentage;
          const oldCompletionPercentage = currentTask.completionPercentage || 0;
          
          // Debug logging
          console.log(`Smart remaining effort calculation:`, {
            oldCompletion: oldCompletionPercentage,
            newCompletion: newCompletionPercentage,
            currentRemainingEffort: currentTask.remainingEffort,
            estimatedEffort: currentTask.estimatedEffort
          });
          
          if (currentTask.remainingEffort !== null && oldCompletionPercentage > 0) {
            // Update existing remaining effort incrementally
            const remainingPercentage = 100 - newCompletionPercentage;
            const oldRemainingPercentage = 100 - oldCompletionPercentage;
            
            // Proportionally adjust remaining effort based on new completion
            const currentRemainingMinutes = currentTask.remainingEffort;
            const adjustedRemainingMinutes = (currentRemainingMinutes * remainingPercentage) / oldRemainingPercentage;
            
            updateData.remainingEffort = Math.max(0, Math.round(adjustedRemainingMinutes));
            
            console.log(`Adjusted remaining: ${Math.round(adjustedRemainingMinutes)} minutes (${(adjustedRemainingMinutes/60).toFixed(1)}h)`);
          } else {
            // Initial calculation based on estimated effort (in minutes)
            const remainingPercentage = 100 - newCompletionPercentage;
            const remainingHours = (currentTask.estimatedEffort * remainingPercentage) / 100;
            updateData.remainingEffort = Math.max(0, Math.round(remainingHours * 60)); // Convert to minutes
            
            console.log(`Initial remaining: ${Math.round(remainingHours * 60)} minutes (${remainingHours.toFixed(1)}h)`);
          }
        }
      }

      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const task = await storage.updateTask(req.params.id, updateData, req.user!.id, organizationId, auditContext);
      if (!task) return res.sendStatus(404);
      res.json(task);
    } catch (error) {
      console.error("Task update error:", error);
      res.status(400).json({ error: "Invalid task data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const deleted = await storage.deleteTask(req.params.id, req.user!.id, organizationId, auditContext);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE TASK] Error:", error);
      res.sendStatus(500);
    }
  });

  // Partners
  app.get("/api/partners", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const partnersList = await db.select().from(partners)
        .where(and(
          eq(partners.userId, req.user!.id),
          inArray(partners.organizationId, organizationIds)
        ));
      res.json(partnersList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const partner = await storage.getPartner(req.params.id, req.user!.id, organizationId);
    if (!partner) return res.sendStatus(404);
    res.json(partner);
  });

  app.post("/api/partners", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const organizationId = getOrganizationId(req);
      const partnerData = insertPartnerSchema.parse({
        name: req.body.name,
        email: req.body.email || null,
        phone: req.body.phone || null,
        company: req.body.company || null,
        position: req.body.position || null,
        address: req.body.address || null,
        city: req.body.city || null,
        postalCode: req.body.postalCode || null,
        country: req.body.country || 'IT',
        fiscalCode: req.body.fiscalCode || null,
        vatNumber: req.body.vatNumber || null,
        logoUrl: req.body.logoUrl || null,
        website: req.body.website || null,
        type: req.body.type,
        notes: req.body.notes || null,
        userId: req.user!.id,
        organizationId: organizationId
      });
      
      const auditContext = AuditService.createContext(req);
      const partner = await storage.createPartner({ ...partnerData, organizationId }, auditContext);
      res.status(201).json(partner);
    } catch (error) {
      res.status(400).json({ error: "Invalid partner data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const partner = await storage.updatePartner(req.params.id, req.body, req.user!.id, organizationId, auditContext);
      if (!partner) return res.sendStatus(404);
      res.json(partner);
    } catch (error) {
      res.status(400).json({ error: "Invalid partner data" });
    }
  });

  app.delete("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const deleted = await storage.deletePartner(req.params.id, req.user!.id, organizationId, auditContext);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE PARTNER] Error:", error);
      res.sendStatus(500);
    }
  });

  // Search or create partner automatically 
  app.post("/api/partners/search-or-create", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { groupName } = req.body;
      if (!groupName || typeof groupName !== 'string') {
        return res.status(400).json({ error: "Group name is required" });
      }

      const userId = req.user!.id;
      
      // 1. Prima cerca nei partner esistenti
      const organizationId = getOrganizationId(req);
      const existingPartners = await storage.getPartners(userId, organizationId);
      const foundPartner = existingPartners.find(p => 
        p.name.toLowerCase().includes(groupName.toLowerCase()) ||
        (p.company && p.company.toLowerCase().includes(groupName.toLowerCase()))
      );
      
      if (foundPartner) {
        return res.json({ partner: foundPartner, created: false });
      }
      
      // 2. Se non trova, cerca con company lookup service
      const { CompanyLookupService } = await import('./company-lookup-service');
      const companies = await CompanyLookupService.searchCompanies(groupName);
      
      let companyInfo = null;
      if (companies.length > 0) {
        companyInfo = companies[0]; // Usa il primo risultato
      }
      
      // 3. Crea nuovo partner con le info trovate
      const partnerData = insertPartnerSchema.parse({
        name: companyInfo?.name || groupName,
        company: companyInfo?.name || groupName,
        email: null,
        phone: null,
        address: companyInfo?.address || null,
        city: companyInfo?.city || null,
        postalCode: companyInfo?.postalCode || null,
        country: companyInfo?.country || 'IT',
        fiscalCode: companyInfo?.fiscalCode || null,
        vatNumber: companyInfo?.vatNumber || null,
        website: companyInfo?.website || null,
        type: 'client',
        notes: `Auto-created from SAP XML import for group: ${groupName}`,
        userId,
        organizationId
      });
      
      const newPartner = await storage.createPartner({ ...partnerData, organizationId });
      res.status(201).json({ partner: newPartner, created: true });
      
    } catch (error) {
      console.error("Partner search-or-create error:", error);
      res.status(400).json({ 
        error: "Failed to search or create partner", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Address suggestions endpoint
  app.get("/api/address/suggestions", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    try {
      const { AddressService } = await import('./address-service');
      const suggestions = await AddressService.getAddressSuggestions(q);
      res.json(suggestions);
    } catch (error) {
      console.error('Address suggestions error:', error);
      res.json([]);
    }
  });

  // City suggestions endpoint
  app.get("/api/address/cities", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    try {
      const { AddressService } = await import('./address-service');
      const suggestions = await AddressService.getCitySuggestions(q);
      res.json(suggestions);
    } catch (error) {
      console.error('City suggestions error:', error);
      res.json([]);
    }
  });

  // Validate Italian fiscal code
  app.post("/api/validate/fiscal-code", async (req, res) => {
    const { fiscalCode } = req.body;
    try {
      const { ItalianValidationService } = await import('./italian-validation');
      const result = ItalianValidationService.validateFiscalCode(fiscalCode);
      res.json(result);
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Errore di validazione' });
    }
  });

  // Validate Italian VAT number
  app.post("/api/validate/vat-number", async (req, res) => {
    const { vatNumber } = req.body;
    try {
      const { ItalianValidationService } = await import('./italian-validation');
      const result = ItalianValidationService.validateVatNumber(vatNumber);
      res.json(result);
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Errore di validazione' });
    }
  });

  // Company lookup endpoints
  app.get("/api/companies/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    try {
      const { CompanyLookupService } = await import('./company-lookup-service');
      const companies = await CompanyLookupService.searchCompanies(q);
      res.json(companies);
    } catch (error) {
      console.error('Company search error:', error);
      res.json([]);
    }
  });

  app.get("/api/companies/details/:identifier", async (req, res) => {
    try {
      const { CompanyLookupService } = await import('./company-lookup-service');
      const company = await CompanyLookupService.getCompanyDetails(req.params.identifier);
      if (company) {
        res.json(company);
      } else {
        res.status(404).json({ error: 'Company not found' });
      }
    } catch (error) {
      console.error('Company details error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Enrich company data with Italian fiscal information
  app.post("/api/companies/enrich", async (req, res) => {
    try {
      const { CompanyLookupService } = await import('./company-lookup-service');
      const companyData = req.body;
      
      if (!companyData || !companyData.name) {
        return res.status(400).json({ error: 'Company name is required' });
      }
      
      const enrichedData = await CompanyLookupService.enrichWithItalianFiscalData(companyData);
      res.json(enrichedData);
    } catch (error) {
      console.error('Company enrich error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Logo upload endpoint
  app.post("/api/partners/logo/upload", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getLogoUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error('Logo upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Normalize logo URL for proper access
  app.post("/api/partners/logo/normalize", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { uploadURL } = req.body;
      if (!uploadURL) {
        return res.status(400).json({ error: "Upload URL is required" });
      }

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeLogoPath(uploadURL);
      
      res.json({ normalizedPath });
    } catch (error) {
      console.error('Error normalizing logo URL:', error);
      res.status(500).json({ error: 'Failed to normalize logo URL' });
    }
  });

  // Serve logo files
  app.get("/objects/logos/:logoId", async (req, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const logoFile = await objectStorageService.getLogoFile(`/objects/logos/${req.params.logoId}`);
      objectStorageService.downloadObject(logoFile, res);
    } catch (error) {
      console.error('Logo download error:', error);
      res.sendStatus(404);
    }
  });

  // Deals
  app.get("/api/deals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const dealsList = await db.select().from(deals)
        .where(and(
          eq(deals.userId, req.user!.id),
          inArray(deals.organizationId, organizationIds)
        ));
      res.json(dealsList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const deal = await storage.getDeal(req.params.id, req.user!.id, organizationId);
    if (!deal) return res.sendStatus(404);
    res.json(deal);
  });

  app.post("/api/deals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const dealData = insertDealSchema.parse({
        title: req.body.title,
        description: req.body.description || null,
        value: req.body.value,
        stage: req.body.stage,
        probability: req.body.probability,
        partnerId: req.body.partnerId,
        expectedCloseDate: req.body.expectedCloseDate,
        notes: req.body.notes || null,
        userId: req.user!.id,
        organizationId: organizationId
      });
      const auditContext = AuditService.createContext(req);
      const deal = await storage.createDeal({ ...dealData, organizationId }, auditContext);
      res.status(201).json(deal);
    } catch (error) {
      console.error("Deal creation error:", error);
      res.status(400).json({ error: "Invalid deal data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const deal = await storage.updateDeal(req.params.id, req.body, req.user!.id, organizationId, auditContext);
      if (!deal) return res.sendStatus(404);
      res.json(deal);
    } catch (error) {
      res.status(400).json({ error: "Invalid deal data" });
    }
  });

  app.delete("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const deleted = await storage.deleteDeal(req.params.id, req.user!.id, organizationId, auditContext);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE DEAL] Error:", error);
      res.sendStatus(500);
    }
  });

  // Calendar Events
  app.get("/api/calendar-events", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const events = await storage.getCalendarEvents(req.user!.id);
    res.json(events);
  });

  app.get("/api/calendar-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const event = await storage.getCalendarEvent(req.params.id, req.user!.id);
    if (!event) return res.sendStatus(404);
    res.json(event);
  });

  app.post("/api/calendar-events", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const eventData = insertCalendarEventSchema.parse({ ...req.body, userId: req.user!.id });
      const auditContext = AuditService.createContext(req);
      const event = await storage.createCalendarEvent(eventData, auditContext);
      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ error: "Invalid calendar event data" });
    }
  });

  app.put("/api/calendar-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const auditContext = AuditService.createContext(req);
      const event = await storage.updateCalendarEvent(req.params.id, req.body, req.user!.id, auditContext);
      if (!event) return res.sendStatus(404);
      res.json(event);
    } catch (error) {
      res.status(400).json({ error: "Invalid calendar event data" });
    }
  });

  app.delete("/api/calendar-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const auditContext = AuditService.createContext(req);
      const deleted = await storage.deleteCalendarEvent(req.params.id, req.user!.id, auditContext);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE CALENDAR EVENT] Error:", error);
      res.sendStatus(500);
    }
  });

  // Planning Windows
  app.get("/api/planning-windows/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const windows = await storage.getAllPlanningWindowsForUser(req.user!.id);
    res.json(windows);
  });

  app.get("/api/planning-windows/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const windows = await storage.getPlanningWindows(req.params.projectId, req.user!.id);
    res.json(windows);
  });

  app.get("/api/planning-windows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const window = await storage.getPlanningWindow(req.params.id, req.user!.id);
    if (!window) return res.sendStatus(404);
    res.json(window);
  });

  app.post("/api/planning-windows", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const windowData = insertPlanningWindowSchema.parse({
        projectId: req.body.projectId,
        name: req.body.name,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        startTime: req.body.startTime || '09:00',
        endTime: req.body.endTime || '17:00',
        workingHoursPerDay: req.body.workingHoursPerDay || 8,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        recurrenceType: req.body.recurrenceType || 'none',
        daysOfWeek: req.body.daysOfWeek || [],
        recurrenceInterval: req.body.recurrenceInterval || 1,
        recurrenceEnd: req.body.recurrenceEnd ? new Date(req.body.recurrenceEnd) : null,
        notes: req.body.notes || null
      });
      const window = await storage.createPlanningWindow(windowData);
      res.status(201).json(window);
    } catch (error) {
      console.error("Planning window creation error:", error);
      res.status(400).json({ error: "Invalid planning window data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/planning-windows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        recurrenceEnd: req.body.recurrenceEnd ? new Date(req.body.recurrenceEnd) : undefined,
      };
      const window = await storage.updatePlanningWindow(req.params.id, updateData, req.user!.id);
      if (!window) return res.sendStatus(404);
      res.json(window);
    } catch (error) {
      console.error("Planning window update error:", error);
      res.status(400).json({ error: "Invalid planning window data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/planning-windows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deletePlanningWindow(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Time Entries
  app.get("/api/time-entries", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entries = await storage.getTimeEntries(req.user!.id);
    res.json(entries);
  });

  app.get("/api/time-entries/task/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entries = await storage.getTimeEntriesByTask(req.params.taskId, req.user!.id);
    res.json(entries);
  });

  app.get("/api/time-entries/running", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entry = await storage.getRunningTimeEntry(req.user!.id);
    res.json(entry || null);
  });

  app.post("/api/time-entries", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Get task to retrieve organizationId (using direct DB query to avoid organizationId filter)
      const [task] = await db.select().from(tasks)
        .where(and(eq(tasks.id, req.body.taskId), eq(tasks.userId, req.user!.id)));
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const entryData = insertTimeEntrySchema.parse({
        taskId: req.body.taskId,
        organizationId: task.organizationId,
        startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
        description: req.body.description || undefined,
        isRunning: req.body.isRunning === true,
        userId: req.user!.id
      });

      // If creating a running timer, stop ALL existing running timers first
      if (entryData.isRunning) {
        const allRunning = await storage.getAllRunningTimeEntries(req.user!.id);
        for (const running of allRunning) {
          await storage.stopTimeEntry(running.id, req.user!.id);
        }
      }

      const entry = await storage.createTimeEntry(entryData);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Time entry creation error:", error);
      res.status(400).json({ error: "Invalid time entry data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/time-entries/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const entry = await storage.updateTimeEntry(req.params.id, req.body, req.user!.id);
      if (!entry) return res.sendStatus(404);
      res.json(entry);
    } catch (error) {
      res.status(400).json({ error: "Invalid time entry data" });
    }
  });

  app.post("/api/time-entries/:id/stop", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entry = await storage.stopTimeEntry(req.params.id, req.user!.id);
    if (!entry) return res.sendStatus(404);
    res.json(entry);
  });

  app.delete("/api/time-entries/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteTimeEntry(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Timesheets
  app.get("/api/timesheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const timesheets = await storage.getTimesheets(req.user!.id);
    res.json(timesheets);
  });

  app.get("/api/timesheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const timesheet = await storage.getTimesheet(req.params.id, req.user!.id);
    if (!timesheet) return res.sendStatus(404);
    res.json(timesheet);
  });

  app.post("/api/timesheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Create static snapshots from grouped data for independence from time entries
      const groupSnapshots: Record<string, any> = {};
      if (req.body.groupedData) {
        Object.entries(req.body.groupedData).forEach(([groupKey, entries]: [string, any]) => {
          const entriesArray = Array.isArray(entries) ? entries : [];
          
          // Calculate initial duration
          const totalDuration = entriesArray.reduce((sum, entry) => {
            let duration = entry.durationMinutes || entry.duration || 0;
            if (!duration && entry.startTime && entry.endTime) {
              const start = new Date(entry.startTime);
              const end = new Date(entry.endTime);
              duration = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
            }
            return sum + duration;
          }, 0);
          
          // Apply 15-minute normalization
          const normalizedDuration = Math.round(totalDuration / 15) * 15;
          
          groupSnapshots[groupKey] = {
            duration: normalizedDuration,
            entryCount: entriesArray.length,
            entries: entriesArray.map(entry => ({
              id: entry.id,
              taskTitle: entry.taskTitle || 'Task sconosciuto',
              projectName: entry.projectName || 'No Project',
              startTime: entry.startTime,
              endTime: entry.endTime,
              description: entry.description || '',
              duration: entry.durationMinutes || entry.duration || 0
            }))
          };
        });
      }

      const timesheetData = insertTimesheetSchema.parse({
        name: req.body.name,
        description: req.body.description || null,
        groupingFields: req.body.groupingFields,
        timeEntryIds: req.body.timeEntryIds,
        groupedData: JSON.stringify(req.body.groupedData),
        groupSnapshots: JSON.stringify(groupSnapshots),
        totalDuration: req.body.totalDuration,
        totalEntries: req.body.totalEntries,
        userId: req.user!.id
      });

      const timesheet = await storage.createTimesheet(timesheetData);
      res.status(201).json(timesheet);
    } catch (error) {
      console.error("Timesheet creation error:", error);
      res.status(400).json({ error: "Invalid timesheet data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/timesheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const timesheet = await storage.updateTimesheet(req.params.id, req.body, req.user!.id);
      if (!timesheet) return res.sendStatus(404);
      res.json(timesheet);
    } catch (error) {
      res.status(400).json({ error: "Invalid timesheet data" });
    }
  });

  app.delete("/api/timesheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteTimesheet(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Messages with pagination
  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const messagesList = await db.select().from(messages)
        .where(and(
          eq(messages.userId, req.user!.id),
          inArray(messages.organizationId, organizationIds)
        ))
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${messages.receivedAt} DESC`);
      res.json(messagesList);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Message threads grouped by conversation
  app.get("/api/message-threads", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    try {
      const threads = await storage.getMessageThreads(req.user!.id, limit, offset);
      res.json(threads);
    } catch (error) {
      console.error("Error fetching message threads:", error);
      res.status(500).json({ error: "Failed to fetch message threads" });
    }
  });

  // TEMPORARY: Backfill thread IDs with normalized Message-ID logic
  app.post("/api/messages/backfill-thread-ids", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      console.log('[BACKFILL] Starting thread ID backfill for user:', req.user!.id);
      
      const result = await storage.backfillThreadIds(req.user!.id);
      
      console.log('[BACKFILL] Completed:', result);
      res.json(result);
    } catch (error) {
      console.error('[BACKFILL] Error during thread ID backfill:', error);
      res.status(500).json({ error: 'Failed to backfill thread IDs' });
    }
  });

  // Download attachment endpoint
  app.get("/api/messages/:messageId/attachments/:filename", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { messageId, filename } = req.params;
      
      // Verifica che il messaggio appartenga all'utente  
      const message = await storage.getMessage(messageId, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      // Verifica che l'allegato esista 
      if (!message.attachments || !message.attachments.includes(filename)) {
        return res.sendStatus(404);
      }

      // Determina il tipo MIME dal file
      const getMimeType = (filename: string): string => {
        const ext = filename.toLowerCase().split('.').pop();
        const mimeTypes: { [key: string]: string } = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg', 
          'png': 'image/png',
          'gif': 'image/gif',
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'txt': 'text/plain'
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
      };

      const mimeType = getMimeType(filename);
      const isImage = mimeType.startsWith('image/');

      if (isImage) {
        // Per le immagini, servi direttamente per l'anteprima
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
      } else {
        // Per altri file, forza il download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', mimeType);
      }

      // Usa AttachmentsService per leggere file reali
      const attachmentData = await AttachmentsService.getAttachment(messageId, filename);
      if (!attachmentData) {
        return res.sendStatus(404);
      }

      res.send(attachmentData.data);
      
    } catch (error) {
      console.error('Attachment download error:', error);
      res.status(500).json({ error: "Failed to download attachment" });
    }
  });

  app.get("/api/messages/unread", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const messages = await storage.getUnreadMessages(req.user!.id);
    res.json(messages);
  });

  app.get("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const message = await storage.getMessage(req.params.id, req.user!.id);
    if (!message) return res.sendStatus(404);
    res.json(message);
  });

  app.get("/api/messages/:id/rendered", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // 🎯 TARGETED FIX: Disable caching only for this endpoint
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    try {
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);

      // 🎯 SIMPLE MODE: Just strip signatures and headers, no thread splitting
      console.log(`[RENDER-ROUTE] Processing message ${req.params.id}: text=${(message.body || '').length} chars, html=${(message.htmlBody || '').length} chars`);
      
      // Apply simple deterministic cleaning
      const cleanedHtml = EmailForwardCleaner.stripSignaturesAndHeaders(message.htmlBody || null);
      
      const renderedContent = {
        bodyText: message.body ?? "",
        bodyHtml: cleanedHtml,
        remainderText: null,
        remainderHtml: null,
        headerSummary: null,
        isForwarded: false,
        metadata: message.metadata || undefined
      };
      
      console.log(`[RENDER-ROUTE] 🎯 Simple mode result: bodyHtml=${cleanedHtml?.length || 0} chars (original: ${message.htmlBody?.length || 0})`);
      console.log(`[RENDER-ROUTE] 🔍 Metadata debug:`, JSON.stringify(message.metadata));

      // 🚀 FORCE FRESH CONTENT: Add timestamp to bypass ALL caching
      const responseWithTimestamp = {
        ...renderedContent,
        _lastProcessed: new Date().toISOString(), // Force unique content every time
        _cacheBreaker: Date.now() // Additional cache breaker
      };
      
      res.json(responseWithTimestamp);
    } catch (error) {
      console.error("Message rendering error:", error);
      res.status(500).json({ error: "Failed to render message content" });
    }
  });

  // Chat normalization endpoint
  app.post("/api/messages/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { content, platform, type } = req.body;
      
      if (!content || !platform || !type) {
        return res.status(400).json({ error: "content, platform, and type are required" });
      }

      // Parse chat content based on platform - returns structured conversation data
      const parsed = parseChatContent(content, platform);
      
      console.log('[CHAT-PARSER] firstAuthor:', parsed.firstAuthor);
      console.log('[CHAT-PARSER] First 3 messages:', JSON.stringify(parsed.messages.slice(0, 3)));
      
      // Format body as readable conversation (for compatibility with existing UI)
      const formattedBody = parsed.messages.map(msg => 
        `[${msg.timestamp}] ${msg.senderName}: ${msg.text}`
      ).join('\n\n');
      
      // If parsing failed (no messages extracted), use raw content as fallback
      const finalBody = formattedBody || parsed.rawSource;
      
      // Build metadata with structured conversation
      const metadata = {
        platform,
        participants: parsed.participants,
        messages: parsed.messages,
        summary: parsed.summary,
        rawSource: parsed.rawSource,
        parsingFailed: parsed.messages.length === 0
      };
      
      const organizationId = getOrganizationId(req);
      const messageData = insertMessageSchema.parse({
        type,
        status: "unread",
        fromEmail: parsed.firstAuthor ? `${parsed.firstAuthor.toLowerCase().replace(/\s+/g, '.')}@${platform}.local` : "unknown@chat.local",
        fromName: parsed.firstAuthor || "Sconosciuto",
        toEmail: req.user!.email || "me@chat.local",
        toName: req.user!.username || "Me",
        subject: parsed.summary,
        body: finalBody,
        htmlBody: "",
        metadata,
        messageId: `${platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        attachments: [],
        userId: req.user!.id,
        organizationId,
        receivedAt: new Date()
      });
      
      const message = await storage.createMessage(messageData);
      
      // Run AI analysis in background
      if (process.env.OPENAI_API_KEY) {
        aiService.analyzeMessage(message, req.user!.id).then(analysis => {
          if (analysis.bestMatch) {
            aiService.updateMessageWithSuggestion(message.id, analysis.bestMatch, req.user!.id);
          }
        }).catch(console.error);
      }
      
      res.status(201).json(message);
    } catch (error) {
      console.error("Chat normalization error:", error);
      res.status(400).json({ error: "Failed to normalize chat", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const messageData = insertMessageSchema.parse({
        ...req.body,
        userId: req.user!.id,
        organizationId,
        receivedAt: req.body.receivedAt ? new Date(req.body.receivedAt) : new Date()
      });
      const message = await storage.createMessage(messageData);
      
      // Run AI analysis in background
      if (process.env.OPENAI_API_KEY) {
        aiService.analyzeMessage(message, req.user!.id).then(analysis => {
          if (analysis.bestMatch) {
            aiService.updateMessageWithSuggestion(message.id, analysis.bestMatch, req.user!.id);
          }
        }).catch(console.error);
      }
      
      res.status(201).json(message);
    } catch (error) {
      console.error("Message creation error:", error);
      res.status(400).json({ error: "Invalid message data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const message = await storage.updateMessage(req.params.id, req.body, req.user!.id);
      if (!message) return res.sendStatus(404);
      res.json(message);
    } catch (error) {
      res.status(400).json({ error: "Invalid message data" });
    }
  });

  app.post("/api/messages/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const message = await storage.markMessageAsRead(req.params.id, req.user!.id);
    if (!message) return res.sendStatus(404);
    res.json(message);
  });

  app.delete("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteMessage(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Comments
  app.get("/api/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getComments(req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getCommentsByProject(req.params.projectId, req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/task/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getCommentsByTask(req.params.taskId, req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/message/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getCommentsByMessage(req.params.messageId, req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comment = await storage.getComment(req.params.id, req.user!.id);
    if (!comment) return res.sendStatus(404);
    res.json(comment);
  });

  app.post("/api/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const commentData = insertCommentSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      const comment = await storage.createComment(commentData);
      res.status(201).json(comment);
    } catch (error) {
      console.error("Comment creation error:", error);
      res.status(400).json({ error: "Invalid comment data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const comment = await storage.updateComment(req.params.id, req.body, req.user!.id);
      if (!comment) return res.sendStatus(404);
      res.json(comment);
    } catch (error) {
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteComment(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // AI Analysis
  app.post("/api/messages/:id/analyze", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      const analysis = await aiService.analyzeMessage(message, req.user!.id);
      res.json(analysis);
    } catch (error) {
      console.error("AI analysis error:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  app.post("/api/messages/:id/apply-suggestion", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { suggestion } = req.body;
      if (!suggestion) return res.status(400).json({ error: "Suggestion required" });
      
      await aiService.updateMessageWithSuggestion(req.params.id, suggestion, req.user!.id);
      
      // Return updated message
      const updatedMessage = await storage.getMessage(req.params.id, req.user!.id);
      res.json(updatedMessage);
    } catch (error) {
      console.error("Apply suggestion error:", error);
      res.status(500).json({ error: "Failed to apply suggestion" });
    }
  });

  // Feedback on email cleaning
  app.post("/api/messages/:id/feedback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const messageId = req.params.id;
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      // Validate message exists
      const message = await storage.getMessage(messageId, userId);
      if (!message) return res.sendStatus(404);
      
      // Server-side validation: require non-empty comment when category is 'other'
      if (req.body.category === 'other' && (!req.body.comment || !req.body.comment.trim())) {
        return res.status(400).json({ 
          error: "Comment is required when feedback category is 'other'" 
        });
      }
      
      // Parse and validate feedback data
      const feedbackData = insertEmailFeedbackSchema.parse({
        messageId,
        userId,
        organizationId,
        isCorrect: req.body.isCorrect,
        category: req.body.category || null,
        comment: req.body.comment || null,
        customReasonId: req.body.customReasonId || null,
        messageSubject: message.subject,
        fromEmail: message.fromEmail,
        messageLength: message.body?.length || 0,
        hasHtml: !!message.htmlBody,
        htmlLength: message.htmlBody?.length || 0
      });
      
      // Save feedback to database
      const savedFeedback = await storage.createEmailFeedback(feedbackData);
      
      // Handle custom feedback reasons
      try {
        if (savedFeedback.customReasonId) {
          // If customReasonId is provided, increment the usage count for that existing reason
          await storage.incrementCustomFeedbackReasonUsage(savedFeedback.customReasonId);
          console.log('[CUSTOM-FEEDBACK-REASON] Incremented usage for existing reason:', {
            reasonId: savedFeedback.customReasonId,
            userId
          });
        } else if (savedFeedback.category === 'other' && savedFeedback.comment && savedFeedback.comment.trim()) {
          // If category is 'other' and there's a comment, save it as a new custom feedback reason
          const customReason = await storage.findOrCreateCustomFeedbackReason(
            userId,
            organizationId, 
            savedFeedback.comment.trim()
          );
          console.log('[CUSTOM-FEEDBACK-REASON] Saved/updated custom reason:', {
            reasonId: customReason.id,
            reason: customReason.reason,
            usageCount: customReason.usageCount,
            userId
          });
        }
      } catch (error) {
        console.error('[CUSTOM-FEEDBACK-REASON] Failed to process custom reason:', error);
        // Non-critical error, continue with feedback submission
      }
      
      console.log('[FEEDBACK-SYSTEM] User feedback saved to database:', {
        feedbackId: savedFeedback.id,
        messageId,
        isCorrect: savedFeedback.isCorrect,
        category: savedFeedback.category,
        userId
      });
      
      res.json({ 
        success: true, 
        message: "Feedback salvato con successo",
        feedbackId: savedFeedback.id
      });
    } catch (error) {
      console.error("Feedback submission error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Custom Feedback Reasons - get user's saved custom reasons
  app.get("/api/feedback/custom-reasons", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      const customReasons = await storage.getCustomFeedbackReasons(userId, organizationId);
      res.json(customReasons);
    } catch (error) {
      console.error("Failed to get custom feedback reasons:", error);
      res.status(500).json({ error: "Failed to get custom reasons" });
    }
  });

  // ✅ LIGHT DELETION: Re-process email with improved training algorithm
  app.post("/api/messages/:id/reprocess", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const messageId = req.params.id;
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);

      // Get the original message
      const message = await storage.getMessage(messageId, userId);
      if (!message) return res.sendStatus(404);

      // Store original content for comparison
      const originalSubject = message.subject || '';
      const originalBody = message.body || '';
      const originalHtmlBody = message.htmlBody;
      // 🔧 PLAN B: Get forward artifacts for cascade pipeline
      const forwardArtifacts = message.forwardArtifacts || null;

      // Re-apply cleaning algorithm with current training data
      // 🔧 PLAN B: Now includes forwardArtifacts for cascade pipeline
      const cleanedResult = await EmailForwardCleaner.cleanForwardedEmailWithTraining(
        originalSubject,
        originalBody,
        originalHtmlBody,
        userId,
        true, // forceCleanForwarded - ensure we re-process it
        null,  // no custom signature for now
        messageId, // Pass messageId for message-specific training
        forwardArtifacts // 🔧 PLAN B: Forward artifacts for cascade
      );

      // Check if content actually changed
      const subjectChanged = cleanedResult.originalSubject !== originalSubject;
      const bodyChanged = cleanedResult.originalBody !== originalBody;
      const htmlChanged = cleanedResult.originalHtmlBody !== originalHtmlBody;
      const hasChanges = subjectChanged || bodyChanged || htmlChanged;

      if (hasChanges) {
        // Update the message with cleaned content (originalX contains the CLEANED content)
        await storage.updateMessage(messageId, {
          subject: cleanedResult.originalSubject,
          body: cleanedResult.originalBody,
          htmlBody: cleanedResult.originalHtmlBody,
          status: 'processed' // Mark as re-processed
        }, userId);
      }

      // Get the updated message to return
      const updatedMessage = await storage.getMessage(messageId, userId);

      console.log('[EMAIL-REPROCESS] Email re-processed with training data:', {
        messageId,
        userId,
        organizationId,
        originalLength: originalBody.length,
        newLength: cleanedResult.originalBody.length,
        hasChanges,
        subjectChanged,
        bodyChanged,
        htmlChanged
      });

      res.json({
        success: true,
        changed: hasChanges,
        message: hasChanges 
          ? "Email re-processata con successo con i dati di training aggiornati"
          : "Email già ottimizzata - nessuna modifica necessaria",
        updatedMessage,
        changes: {
          subject: subjectChanged,
          body: bodyChanged,
          html: htmlChanged
        }
      });

    } catch (error) {
      console.error('Email reprocess error:', error);
      res.status(500).json({ error: 'Errore durante il re-processing della email' });
    }
  });

  // AI Project Agent - Analyze message and propose project/partner/tasks
  app.post("/api/messages/:id/analyze-project", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      const organizationId = getOrganizationId(req);
      const messageId = req.params.id;
      
      // Check if this message has already been processed
      const existingProjects = await storage.getProjects(req.user!.id, organizationId);
      const existingPartners = await storage.getPartners(req.user!.id, organizationId);
      const existingTasks = await storage.getTasks(req.user!.id, organizationId);
      
      const linkedProject = existingProjects.find(p => p.sourceMessageIds?.includes(messageId));
      const linkedPartner = existingPartners.find(p => p.sourceMessageIds?.includes(messageId));
      const linkedTasks = existingTasks.filter(t => t.sourceMessageIds?.includes(messageId));
      
      // If already processed, return a special response
      if (linkedProject || linkedPartner || linkedTasks.length > 0) {
        return res.json({
          alreadyProcessed: true,
          warning: "Questo messaggio è già stato processato. Riprocessarlo potrebbe creare duplicati.",
          existing: {
            project: linkedProject,
            partner: linkedPartner,
            tasks: linkedTasks
          }
        });
      }
      
      // Import and use AI agent
      const { analyzeMessageForProject } = await import('./ai-project-agent');
      const proposal = await analyzeMessageForProject(
        message,
        existingProjects,
        existingPartners,
        existingTasks
      );
      
      res.json(proposal);
    } catch (error) {
      console.error("AI project analysis error:", error);
      res.status(500).json({ error: "Failed to analyze message for project", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Apply AI project proposal - creates/updates project, partner, tasks
  app.post("/api/messages/:id/apply-project-proposal", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { proposal } = req.body;
      if (!proposal) return res.status(400).json({ error: "Proposal required" });
      
      const organizationId = getOrganizationId(req);
      const userId = req.user!.id;
      const results: any = {
        project: null,
        partner: null,
        tasks: []
      };
      
      // 1. Create or update partner
      if (proposal.partner) {
        if (proposal.partner.isNew) {
          const partnerData: any = {
            name: proposal.partner.name,
            email: proposal.partner.email,
            company: proposal.partner.company,
            type: proposal.partner.type,
            sourceMessageIds: [req.params.id],
            userId,
            organizationId
          };
          results.partner = await storage.createPartner(partnerData, { userId });
        } else if (proposal.partner.existingId) {
          results.partner = await storage.getPartner(proposal.partner.existingId, userId);
          // Add messageId to existing partner's sourceMessageIds if not already there
          if (results.partner && (!results.partner.sourceMessageIds || !results.partner.sourceMessageIds.includes(req.params.id))) {
            const updatedSourceIds = [...(results.partner.sourceMessageIds || []), req.params.id];
            await storage.updatePartner(results.partner.id, { sourceMessageIds: updatedSourceIds }, userId, organizationId);
          }
        }
      }
      
      // 2. Create or update project
      if (proposal.project) {
        if (proposal.project.isNew) {
          const projectData: any = {
            name: proposal.project.name,
            description: proposal.project.description,
            status: proposal.project.status,
            startDate: proposal.project.startDate ? new Date(proposal.project.startDate) : undefined,
            endDate: proposal.project.endDate ? new Date(proposal.project.endDate) : undefined,
            estimatedEffort: proposal.project.estimatedEffort,
            clientId: results.partner?.id,
            sourceMessageIds: [req.params.id],
            userId,
            organizationId
          };
          results.project = await storage.createProject(projectData, { userId });
        } else if (proposal.project.existingId) {
          // Update existing project with message link
          const existingProject = await storage.getProject(proposal.project.existingId, userId);
          if (existingProject && (!existingProject.sourceMessageIds || !existingProject.sourceMessageIds.includes(req.params.id))) {
            const updatedSourceIds = [...(existingProject.sourceMessageIds || []), req.params.id];
            await storage.updateProject(proposal.project.existingId, { sourceMessageIds: updatedSourceIds }, userId, organizationId);
          }
          // Update existing project fields
          const updateData = {
            description: proposal.project.description,
            status: proposal.project.status,
            endDate: proposal.project.endDate ? new Date(proposal.project.endDate) : undefined,
          };
          results.project = await storage.updateProject(proposal.project.existingId, updateData, userId, organizationId);
        }
      }
      
      // 3. Create or update tasks
      if (proposal.tasks && proposal.tasks.length > 0) {
        for (const taskProposal of proposal.tasks) {
          if (taskProposal.isNew) {
            const taskData: any = {
              title: taskProposal.title,
              description: taskProposal.description,
              priority: taskProposal.priority,
              taskType: taskProposal.taskType,
              estimatedEffort: taskProposal.estimatedEffort,
              dueDate: taskProposal.dueDate ? new Date(taskProposal.dueDate) : undefined,
              projectId: results.project?.id,
              sourceMessageIds: [req.params.id],
              userId,
              organizationId
            };
            const task = await storage.createTask(taskData, { userId });
            results.tasks.push(task);
          } else if (taskProposal.existingId) {
            // Add messageId to existing task's sourceMessageIds if not already there
            const existingTask = await storage.getTask(taskProposal.existingId, userId);
            if (existingTask && (!existingTask.sourceMessageIds || !existingTask.sourceMessageIds.includes(req.params.id))) {
              const updatedSourceIds = [...(existingTask.sourceMessageIds || []), req.params.id];
              await storage.updateTask(taskProposal.existingId, { sourceMessageIds: updatedSourceIds }, userId, organizationId);
            }
            // Update existing task
            const updateData = {
              description: taskProposal.description,
              priority: taskProposal.priority,
              estimatedEffort: taskProposal.estimatedEffort,
              dueDate: taskProposal.dueDate ? new Date(taskProposal.dueDate) : undefined,
            };
            const task = await storage.updateTask(taskProposal.existingId, updateData, userId, organizationId);
            results.tasks.push(task);
          }
        }
      }
      
      // 4. Link message to project
      if (results.project) {
        await storage.updateMessage(req.params.id, {
          projectId: results.project.id,
          partnerId: results.partner?.id,
          status: 'processed'
        }, userId);
      }
      
      console.log('[AI-PROJECT-AGENT] Applied proposal:', {
        messageId: req.params.id,
        projectCreated: proposal.project?.isNew,
        partnerCreated: proposal.partner?.isNew,
        tasksCreated: proposal.tasks?.filter((t: any) => t.isNew).length
      });
      
      res.json({
        success: true,
        results
      });
    } catch (error) {
      console.error("Apply project proposal error:", error);
      res.status(500).json({ error: "Failed to apply proposal", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Message Links
  app.get("/api/messages/linked/:tableName/:recordId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { tableName, recordId } = req.params;
      const organizationId = getOrganizationId(req);
      
      const linkedMessages = await MessageLogService.getLinkedMessages(tableName, recordId, organizationId);
      res.json(linkedMessages);
    } catch (error) {
      console.error("Get linked messages error:", error);
      res.status(500).json({ error: "Failed to get linked messages" });
    }
  });

  app.post("/api/messages/:messageId/link", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { messageId } = req.params;
      const data = insertMessageLinkSchema.parse({
        ...req.body,
        messageId,
        userId: req.user!.id
      });
      
      const context = MessageLogService.createContext(req);
      const link = await MessageLogService.linkMessage(
        messageId,
        data.linkedTableName,
        data.linkedRecordId,
        context,
        {
          linkType: data.linkType,
          isAutomatic: data.isAutomatic,
          notes: data.notes || undefined
        }
      );
      
      res.json(link);
    } catch (error) {
      console.error("Link message error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid link data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to link message" });
      }
    }
  });

  app.get("/api/messages/:messageId/links", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { messageId } = req.params;
      const links = await MessageLogService.getMessageLinks(messageId);
      res.json(links);
    } catch (error) {
      console.error("Get message links error:", error);
      res.status(500).json({ error: "Failed to get message links" });
    }
  });

  app.put("/api/message-links/:linkId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { linkId } = req.params;
      const { notes, linkType } = req.body;
      
      const updates: any = {};
      if (notes !== undefined) updates.notes = notes;
      if (linkType !== undefined) updates.linkType = linkType;
      
      const updatedLink = await MessageLogService.updateLink(linkId, updates, req.user!.id);
      if (!updatedLink) return res.sendStatus(404);
      
      res.json(updatedLink);
    } catch (error) {
      console.error("Update message link error:", error);
      res.status(500).json({ error: "Failed to update message link" });
    }
  });

  app.delete("/api/message-links/:linkId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { linkId } = req.params;
      const success = await MessageLogService.unlinkMessage(linkId, req.user!.id);
      if (!success) return res.sendStatus(404);
      
      res.sendStatus(204);
    } catch (error) {
      console.error("Unlink message error:", error);
      res.status(500).json({ error: "Failed to unlink message" });
    }
  });

  app.post("/api/messages/:messageId/link-bulk", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { messageId } = req.params;
      const { links, isAutomatic = false } = req.body;
      
      if (!Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ error: "Links array is required" });
      }
      
      const context = MessageLogService.createContext(req);
      const results = await MessageLogService.linkMessageBulk(messageId, links, context, isAutomatic);
      
      res.json(results);
    } catch (error) {
      console.error("Bulk link message error:", error);
      res.status(500).json({ error: "Failed to bulk link message" });
    }
  });

  // Email Configuration
  app.post("/api/email/configure", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validatedData = insertEmailConfigSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      
      // Deactivate all existing configs for this user
      await storage.deactivateAllEmailConfigs(req.user!.id);
      
      // Create new active config
      const savedConfig = await storage.createEmailConfig(validatedData);

      // Usa la prima cartella dall'array, o "INBOX" come default
      const firstFolder = savedConfig.folders && savedConfig.folders.length > 0 
        ? savedConfig.folders[0] 
        : "INBOX";
      
      const config = {
        user: savedConfig.email,
        password: savedConfig.password,
        host: savedConfig.host,
        port: savedConfig.port,
        tls: savedConfig.tls,
        folder: firstFolder,
        userId: req.user!.id,
        organizationId: getOrganizationId(req)
      };

      // Disconnect existing service first
      const existingService = getEmailService();
      if (existingService) {
        existingService.disconnect();
      }
      
      initializeEmailService(config);
      
      res.json({ 
        message: "Email service configured successfully",
        status: "connected",
        folder: config.folder,
        configId: savedConfig.id
      });
    } catch (error) {
      console.error("Email configuration error:", error);
      res.status(500).json({ error: "Failed to configure email service" });
    }
  });

  app.get("/api/email/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const service = getEmailService();
    const activeConfig = await storage.getActiveEmailConfig(req.user!.id);
    
    res.json({
      connected: service !== null,
      status: service ? "active" : (activeConfig ? "configured" : "not_configured"),
      config: activeConfig ? {
        id: activeConfig.id,
        email: activeConfig.email,
        folders: activeConfig.folders,
        folder: activeConfig.folders && activeConfig.folders.length > 0 ? activeConfig.folders[0] : "INBOX",
        host: activeConfig.host,
        port: activeConfig.port
      } : null
    });
  });

  app.post("/api/email/disconnect", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const service = getEmailService();
    if (service) {
      service.disconnect();
    }
    
    res.json({ message: "Email service disconnected" });
  });

  // Get all email configurations for user
  app.get("/api/email/configs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const configs = await storage.getEmailConfigs(req.user!.id);
      res.json(configs);
    } catch (error) {
      console.error("Get email configs error:", error);
      res.status(500).json({ error: "Failed to get email configurations" });
    }
  });

  // Create new email configuration
  app.post("/api/email/configs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validatedData = insertEmailConfigSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      
      const newConfig = await storage.createEmailConfig(validatedData);
      res.json(newConfig);
    } catch (error) {
      console.error("Create email config error:", error);
      res.status(500).json({ error: "Failed to create email configuration" });
    }
  });

  // Update email configuration
  app.put("/api/email/configs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const validatedData = insertEmailConfigSchema.partial().parse(req.body);
      
      const updatedConfig = await storage.updateEmailConfig(id, validatedData, req.user!.id);
      if (!updatedConfig) {
        return res.status(404).json({ error: "Email configuration not found" });
      }
      
      // Se questa configurazione è attiva e ha password, riavvia il servizio email
      if (updatedConfig.isActive && updatedConfig.password && updatedConfig.password.trim() !== '' && !updatedConfig.isForwarder) {
        console.log(`[EMAIL] Restarting service for updated config: ${updatedConfig.email}`);
        
        // Disconnetti il servizio esistente
        const existingService = getEmailService();
        if (existingService) {
          existingService.disconnect();
        }
        
        // Riavvia con le nuove credenziali
        const firstFolder = updatedConfig.folders && updatedConfig.folders.length > 0 
          ? updatedConfig.folders[0] 
          : "INBOX";
        
        const imapConfig = {
          user: updatedConfig.email,
          password: updatedConfig.password,
          host: updatedConfig.host,
          port: updatedConfig.port,
          tls: updatedConfig.tls,
          folder: firstFolder,
          userId: req.user!.id,
          organizationId: getOrganizationId(req)
        };
        
        try {
          initializeEmailService(imapConfig);
          console.log(`[EMAIL] ✓ Service restarted for ${updatedConfig.email}`);
        } catch (error) {
          console.error(`[EMAIL] ✗ Failed to restart service for ${updatedConfig.email}:`, error);
        }
      }
      
      res.json(updatedConfig);
    } catch (error) {
      console.error("Update email config error:", error);
      res.status(500).json({ error: "Failed to update email configuration" });
    }
  });

  // Delete email configuration
  app.delete("/api/email/configs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const deleted = await storage.deleteEmailConfig(id, req.user!.id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Email configuration not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete email config error:", error);
      res.status(500).json({ error: "Failed to delete email configuration" });
    }
  });

  // Set active email configuration
  app.post("/api/email/configs/:id/activate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      
      // Deactivate all configs for this user
      await storage.deactivateAllEmailConfigs(req.user!.id);
      
      // Activate the selected config
      const config = await storage.getEmailConfig(id, req.user!.id);
      if (!config) {
        return res.status(404).json({ error: "Email configuration not found" });
      }
      
      const updatedConfig = await storage.updateEmailConfig(id, { isActive: true }, req.user!.id);
      
      // Restart email service with new config
      const existingService = getEmailService();
      if (existingService) {
        existingService.disconnect();
      }
      
      if (updatedConfig) {
        const firstFolder = updatedConfig.folders && updatedConfig.folders.length > 0 
          ? updatedConfig.folders[0] 
          : "INBOX";
        
        const imapConfig = {
          user: updatedConfig.email,
          password: updatedConfig.password,
          host: updatedConfig.host,
          port: updatedConfig.port,
          tls: updatedConfig.tls,
          folder: firstFolder,
          userId: req.user!.id,
          organizationId: getOrganizationId(req)
        };
        
        initializeEmailService(imapConfig);
      }
      
      res.json(updatedConfig);
    } catch (error) {
      console.error("Activate email config error:", error);
      res.status(500).json({ error: "Failed to activate email configuration" });
    }
  });

  // Email sync endpoint for manual refresh
  app.post("/api/email/sync", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    let service = getEmailService();
    if (!service) {
      return res.status(400).json({ error: "Email service not configured" });
    }

    // Check if service is connected
    if (!(service as any).isServiceConnected()) {
      console.log('[SYNC] Email service not connected, attempting to reconnect...');
      
      // Try to reinitialize the service with current config
      try {
        const emailConfigs = await storage.getEmailConfigs(req.user!.id);
        const activeConfig = emailConfigs.find((c: EmailConfig) => c.isActive);
        
        if (activeConfig) {
          const firstFolder = activeConfig.folders && activeConfig.folders.length > 0 
            ? activeConfig.folders[0] 
            : "INBOX";
          
          const imapConfig = {
            user: activeConfig.email,
            password: activeConfig.password,
            host: activeConfig.host,
            port: activeConfig.port,
            tls: activeConfig.tls,
            folder: firstFolder,
            userId: req.user!.id,
            organizationId: getOrganizationId(req)
          };
          
          console.log('[SYNC] Reinitializing email service...');
          initializeEmailService(imapConfig);
          
          // Get the reinitialized service
          service = getEmailService();
          
          if (!service || !(service as any).isServiceConnected()) {
            const status = (service as any)?.getConnectionStatus() || { error: 'Service failed to reconnect' };
            return res.status(400).json({ 
              error: "Email service not connected", 
              details: status.error 
            });
          }
          
          console.log('[SYNC] Email service reconnected successfully');
        } else {
          return res.status(400).json({ error: "No active email configuration found" });
        }
      } catch (error) {
        console.error('[SYNC] Failed to reconnect email service:', error);
        return res.status(500).json({ error: "Failed to reconnect email service" });
      }
    }

    try {
      // Force a sync by checking for both existing and new emails
      (service as any).checkForExistingEmails();
      (service as any).checkForNewEmails();
      res.json({ message: "Sync initiated" });
    } catch (error) {
      console.error("Email sync error:", error);
      res.status(500).json({ error: "Failed to sync emails" });
    }
  });

  // Gmail sending service initialization
  app.post("/api/email/initialize-gmail", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const initialized = await gmailService.initialize(req.user!.id);
      if (initialized) {
        res.json({ message: "Gmail service initialized successfully" });
      } else {
        res.status(400).json({ error: "No active Gmail account found for sending" });
      }
    } catch (error) {
      console.error("Gmail initialization error:", error);
      res.status(500).json({ error: "Failed to initialize Gmail service" });
    }
  });

  // Get available email senders
  app.get("/api/email/senders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const senders = await gmailService.getAvailableSenders(req.user!.id);
      res.json(senders);
    } catch (error) {
      console.error("Get senders error:", error);
      res.status(500).json({ error: "Failed to get available senders" });
    }
  });

  // Send email via Gmail
  app.post("/api/email/send", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { from, to, subject, text, html, replyTo, attachments } = req.body;
      
      // Validate required fields
      if (!to || !subject) {
        return res.status(400).json({ error: "Missing required fields: to, subject" });
      }

      // Validate sender if specified
      if (from) {
        const isValidSender = await gmailService.isValidSender(req.user!.id, from);
        if (!isValidSender) {
          return res.status(400).json({ error: "Invalid sender email address" });
        }
      }

      // Initialize Gmail service if not already done
      const initialized = await gmailService.initialize(req.user!.id);
      if (!initialized) {
        return res.status(400).json({ error: "No active Gmail account found for sending" });
      }

      // Send email
      const sent = await gmailService.sendEmail({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html,
        replyTo,
        attachments
      });

      if (sent) {
        res.json({ message: "Email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send email" });
      }

    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Email Training Selections Management
  app.post("/api/email-training-selections", async (req, res) => {
      console.log('[TRAINING-SAVE] POST received:', {
        authenticated: !!req.user,
        userId: req.user?.id || 'none',
        bodyKeys: Object.keys(req.body || {}),
        timestamp: new Date().toISOString()
      });
      
      if (!req.isAuthenticated()) {
        console.log('[TRAINING-SAVE] REJECTED: Not authenticated');
        return res.sendStatus(401);
      }
    
      try {
        console.log('[TRAINING-SAVE] Validating payload:', req.body);
        const validatedData = insertEmailTrainingSelectionSchema.parse({
          ...req.body,
          userId: req.user!.id
        });
        
        console.log('[TRAINING-SAVE] Payload validated. Attempting database save...');
        const savedSelection = await storage.createEmailTrainingSelection(validatedData);
        
        console.log('[TRAINING-SAVE] SUCCESS - Selection saved:', {
          id: savedSelection.id,
          messageId: savedSelection.messageId,
          selectionType: savedSelection.selectionType
        });
        
        res.json(savedSelection);
      } catch (error) {
        console.error("[TRAINING-SAVE] CRITICAL FAILURE:", {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          code: (error as any)?.code,
          detail: (error as any)?.detail,
          constraint: (error as any)?.constraint,
          userId: req.user?.id,
          body: req.body
        });
        res.status(500).json({ error: "Failed to save email training selection" });
    }
  });

  // ✅ MODULAR: Now returns array of individual selections
  app.get("/api/email-training-selections/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { messageId } = req.params;
      const selections = await storage.getEmailTrainingSelection(messageId, req.user!.id);
      res.json(selections); // Always return array (empty if no selections)
    } catch (error) {
      console.error("Get email training selection error:", error);
      res.status(500).json({ error: "Failed to get email training selection" });
    }
  });

  app.delete("/api/email-training-selections/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { messageId } = req.params;
      const success = await storage.deleteEmailTrainingSelection(messageId, req.user!.id);
      if (!success) {
        return res.status(404).json({ error: "Email training selection not found" });
      }
      res.sendStatus(204);
    } catch (error) {
      console.error("Delete email training selection error:", error);
      res.status(500).json({ error: "Failed to delete email training selection" });
    }
  });

  // Training Data Analysis API
  app.get("/api/training-data-analysis", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const analysisResult = await EmailForwardCleaner.analyzeTrainingData(req.user!.id);
      
      // Get additional statistics
      const trainingSelections = await storage.getEmailTrainingSelections(req.user!.id);
      
      // ✅ MODULAR: Count individual selections by type
      const stats = {
        totalSelections: trainingSelections.length,
        selectionsByType: {
          body: trainingSelections.filter(sel => sel.selectionType === "body").length,
          header: trainingSelections.filter(sel => sel.selectionType === "header").length,
          thread: trainingSelections.filter(sel => sel.selectionType === "thread").length,
          signatureBody: trainingSelections.filter(sel => sel.selectionType === "signatureBody").length,
          signatureHeader: trainingSelections.filter(sel => sel.selectionType === "signatureHeader").length,
          mailThread: trainingSelections.filter(sel => sel.selectionType === "mailThread").length
        },
        lastTrainingDate: trainingSelections.length > 0 
          ? (() => {
              const validDates = trainingSelections
                .map(s => new Date(s.updatedAt))
                .filter(date => !isNaN(date.getTime()));
              return validDates.length > 0 
                ? new Date(Math.max(...validDates.map(d => d.getTime())))
                : null;
            })()
          : null,
        patterns: analysisResult
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Training data analysis error:", error);
      res.status(500).json({ error: "Failed to analyze training data" });
    }
  });

  // Organization Domains Management
  app.get("/api/organization-domains", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const domains = await storage.getOrganizationDomains(organizationId);
      res.json(domains);
    } catch (error) {
      console.error("Get organization domains error:", error);
      res.status(500).json({ error: "Failed to get organization domains" });
    }
  });

  app.post("/api/organization-domains", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const validatedData = insertOrganizationDomainSchema.parse({
        ...req.body,
        organizationId
      });
      
      const auditContext = AuditService.createContext(req);
      const newDomain = await storage.createOrganizationDomain(validatedData, auditContext);
      res.json(newDomain);
    } catch (error) {
      console.error("Create organization domain error:", error);
      res.status(500).json({ error: "Failed to create organization domain" });
    }
  });

  app.put("/api/organization-domains/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const validatedData = insertOrganizationDomainSchema.partial().parse(req.body);
      
      const auditContext = AuditService.createContext(req);
      const updatedDomain = await storage.updateOrganizationDomain(id, validatedData, auditContext);
      
      if (!updatedDomain) {
        return res.status(404).json({ error: "Organization domain not found" });
      }
      
      res.json(updatedDomain);
    } catch (error) {
      console.error("Update organization domain error:", error);
      res.status(500).json({ error: "Failed to update organization domain" });
    }
  });

  app.delete("/api/organization-domains/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const deleted = await storage.deleteOrganizationDomain(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Organization domain not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete organization domain error:", error);
      res.status(500).json({ error: "Failed to delete organization domain" });
    }
  });

  app.delete("/api/organization-domains", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Invalid or empty ids array" });
      }
      
      const deletedCount = await storage.deleteOrganizationDomains(ids);
      res.json({ success: true, deletedCount });
    } catch (error) {
      console.error("Bulk delete organization domains error:", error);
      res.status(500).json({ error: "Failed to delete organization domains" });
    }
  });

  // Email Accounts Extended Management
  app.get("/api/email-accounts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const emailAccounts = await storage.getEmailConfigsByOrganization(organizationId);
      res.json(emailAccounts);
    } catch (error) {
      console.error("Get email accounts error:", error);
      res.status(500).json({ error: "Failed to get email accounts" });
    }
  });

  // Sales Orders
  app.get("/api/sales-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const orders = await storage.getSalesOrders(req.user!.id);
    res.json(orders);
  });

  app.get("/api/sales-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const order = await storage.getSalesOrder(req.params.id, req.user!.id);
    if (!order) return res.sendStatus(404);
    res.json(order);
  });

  app.post("/api/sales-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const orderData = insertSalesOrderSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      const order = await storage.createSalesOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      console.error("Sales order creation error:", error);
      res.status(400).json({ error: "Invalid sales order data" });
    }
  });

  app.put("/api/sales-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const order = await storage.updateSalesOrder(req.params.id, req.body, req.user!.id);
      if (!order) return res.sendStatus(404);
      res.json(order);
    } catch (error) {
      res.status(400).json({ error: "Invalid sales order data" });
    }
  });

  app.delete("/api/sales-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteSalesOrder(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Convert timesheet entries to sales order
  app.post("/api/sales-orders/from-timesheet", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { timeEntryIds, partnerId, description, hourlyRate } = req.body;
      
      if (!timeEntryIds || !Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        return res.status(400).json({ error: "No time entries provided" });
      }
      
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID is required" });
      }

      // Get time entries and calculate totals
      const timeEntries = await Promise.all(
        timeEntryIds.map((id: string) => storage.getTimeEntry(id, req.user!.id))
      );
      
      const validEntries = timeEntries.filter(entry => entry !== undefined);
      if (validEntries.length === 0) {
        return res.status(400).json({ error: "No valid time entries found" });
      }

      // Calculate total hours and amount
      const totalMinutes = validEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const totalHours = Number((totalMinutes / 60).toFixed(2));
      const rate = parseFloat(hourlyRate) || 50; // Default rate
      const subtotal = Number((totalHours * rate).toFixed(2));
      const taxes = Number((subtotal * 0.22).toFixed(2)); // 22% VAT
      const total = Number((subtotal + taxes).toFixed(2));

      // Create sales order
      const salesOrder = await storage.createSalesOrder({
        userId: req.user!.id,
        partnerId,
        description: description || "Time tracking services",
        subtotal: subtotal.toString(),
        taxes: taxes.toString(),
        total: total.toString(),
        currency: "EUR",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: "draft"
      });

      // Create sales order item
      await storage.createSalesOrderItem({
        salesOrderId: salesOrder.id,
        description: `Time tracking - ${totalHours}h @ €${rate}/h`,
        quantity: totalHours.toString(),
        unitPrice: rate.toString(),
        lineTotal: subtotal.toString(),
        workDate: new Date(validEntries[0].startTime),
        timeEntryIds: timeEntryIds
      });

      res.status(201).json(salesOrder);
    } catch (error) {
      console.error("Sales order conversion error:", error);
      res.status(500).json({ error: "Failed to convert timesheet to sales order" });
    }
  });

  // Sales Order Items
  app.get("/api/sales-order-items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { salesOrderId } = req.query;
    if (!salesOrderId || typeof salesOrderId !== 'string') {
      return res.status(400).json({ error: "salesOrderId is required" });
    }
    const items = await storage.getSalesOrderItems(salesOrderId, req.user!.id);
    res.json(items);
  });

  app.get("/api/sales-order-items/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const item = await storage.getSalesOrderItem(req.params.id, req.user!.id);
    if (!item) return res.sendStatus(404);
    res.json(item);
  });

  app.post("/api/sales-order-items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const itemData = insertSalesOrderItemSchema.parse(req.body);
      const item = await storage.createSalesOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Sales order item creation error:", error);
      res.status(400).json({ error: "Invalid sales order item data" });
    }
  });

  app.put("/api/sales-order-items/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const item = await storage.updateSalesOrderItem(req.params.id, req.body, req.user!.id);
      if (!item) return res.sendStatus(404);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid sales order item data" });
    }
  });

  app.delete("/api/sales-order-items/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteSalesOrderItem(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Rate Agreements
  app.get("/api/rate-agreements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agreements = await storage.getRateAgreements(req.user!.id);
    res.json(agreements);
  });

  app.get("/api/rate-agreements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agreement = await storage.getRateAgreement(req.params.id, req.user!.id);
    if (!agreement) return res.sendStatus(404);
    res.json(agreement);
  });

  app.get("/api/rate-agreements/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agreements = await storage.getActiveRateAgreements(req.user!.id);
    res.json(agreements);
  });

  app.post("/api/rate-agreements/resolve", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { partnerId, projectId, taskId, taskType, humanResourceId } = req.body;
      const agreement = await storage.resolveRateForContext(req.user!.id, {
        partnerId,
        projectId,
        taskId,
        taskType,
        humanResourceId
      });
      res.json(agreement || null);
    } catch (error) {
      console.error("Rate resolution error:", error);
      res.status(500).json({ error: "Failed to resolve rate" });
    }
  });

  app.post("/api/rate-agreements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const agreementData = insertRateAgreementSchema.parse({
        ...req.body,
        userId: req.user!.id,
        groupingValues: JSON.stringify(req.body.groupingValues),
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : new Date(),
        validTo: req.body.validTo ? new Date(req.body.validTo) : null
      });
      const agreement = await storage.createRateAgreement(agreementData);
      res.status(201).json(agreement);
    } catch (error) {
      console.error("Rate agreement creation error:", error);
      res.status(400).json({ error: "Invalid rate agreement data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/rate-agreements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        groupingValues: req.body.groupingValues ? JSON.stringify(req.body.groupingValues) : undefined,
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : undefined,
        validTo: req.body.validTo ? new Date(req.body.validTo) : undefined
      };
      const agreement = await storage.updateRateAgreement(req.params.id, updateData, req.user!.id);
      if (!agreement) return res.sendStatus(404);
      res.json(agreement);
    } catch (error) {
      console.error("Rate agreement update error:", error);
      res.status(400).json({ error: "Invalid rate agreement data" });
    }
  });

  app.delete("/api/rate-agreements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteRateAgreement(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Human Resources routes
  app.get("/api/human-resources", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const resourcesList = await db.select().from(humanResources)
        .where(and(
          eq(humanResources.userId, req.user!.id),
          inArray(humanResources.organizationId, organizationIds)
        ));
      res.json(resourcesList);
    } catch (error) {
      console.error("Error fetching human resources:", error);
      res.status(500).json({ error: "Failed to fetch human resources" });
    }
  });

  app.get("/api/human-resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const resource = await storage.getHumanResource(req.params.id, req.user!.id);
      if (!resource) {
        return res.status(404).json({ error: "Human resource not found" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error fetching human resource:", error);
      res.status(500).json({ error: "Failed to fetch human resource" });
    }
  });

  app.post("/api/human-resources", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Aggiungi automaticamente l'userId dell'utente autenticato e converti le date
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        // Converti stringhe ISO in oggetti Date se presenti
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      };
      
      const validation = insertHumanResourceSchema.safeParse(dataWithUserId);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const resource = await storage.createHumanResource(validation.data);
      res.status(201).json(resource);
    } catch (error) {
      console.error("Error creating human resource:", error);
      res.status(500).json({ error: "Failed to create human resource" });
    }
  });

  app.put("/api/human-resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validation = insertHumanResourceSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const resource = await storage.updateHumanResource(req.params.id, validation.data, req.user!.id);
      if (!resource) {
        return res.status(404).json({ error: "Human resource not found" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error updating human resource:", error);
      res.status(500).json({ error: "Failed to update human resource" });
    }
  });

  app.delete("/api/human-resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteHumanResource(req.params.id, req.user!.id);
      if (!success) {
        return res.status(404).json({ error: "Human resource not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting human resource:", error);
      res.status(500).json({ error: "Failed to delete human resource" });
    }
  });

  // SAP Systems
  app.get("/api/sap-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const systemsList = await db.select().from(sapSystems)
        .where(and(
          eq(sapSystems.userId, req.user!.id),
          inArray(sapSystems.organizationId, organizationIds)
        ));
      res.json(systemsList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/sap-systems/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getSapSystemsByPartner(req.params.partnerId, req.user!.id);
    res.json(systems);
  });

  app.get("/api/sap-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const system = await storage.getSapSystem(req.params.id, req.user!.id);
    if (!system) return res.sendStatus(404);
    res.json(system);
  });

  app.post("/api/sap-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const systemData = { ...req.body, userId: req.user!.id };
      const validatedData = insertSapSystemSchema.parse(systemData);
      const system = await storage.createSapSystem(validatedData);
      res.status(201).json(system);
    } catch (error) {
      res.status(400).json({ error: "Invalid SAP system data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/sap-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const system = await storage.updateSapSystem(req.params.id, req.body, req.user!.id);
      if (!system) return res.sendStatus(404);
      res.json(system);
    } catch (error) {
      res.status(400).json({ error: "Failed to update SAP system", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/sap-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteSapSystem(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // SAP System Credentials
  app.get("/api/sap-systems/:systemId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getSapSystemCredentials(req.params.systemId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/sap-systems/:systemId/credentials/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getActiveSapSystemCredentials(req.params.systemId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/sap-system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credential = await storage.getSapSystemCredential(req.params.id, req.user!.id);
    if (!credential) return res.sendStatus(404);
    res.json(credential);
  });

  app.post("/api/sap-systems/:systemId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credentialData = { ...req.body, sapSystemId: req.params.systemId, userId: req.user!.id };
      const validatedData = insertSapSystemCredentialsSchema.parse(credentialData);
      const credential = await storage.createSapSystemCredential(validatedData);
      res.status(201).json(credential);
    } catch (error) {
      res.status(400).json({ error: "Invalid SAP system credential data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/sap-system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credential = await storage.updateSapSystemCredential(req.params.id, req.body, req.user!.id);
      if (!credential) return res.sendStatus(404);
      res.json(credential);
    } catch (error) {
      res.status(400).json({ error: "Failed to update SAP credential", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/sap-system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteSapSystemCredential(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Connections
  app.get("/api/vpn-connections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const connections = await storage.getVpnConnections(req.user!.id);
    res.json(connections);
  });

  app.get("/api/vpn-connections/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const connections = await storage.getVpnConnectionsByPartner(req.params.partnerId, req.user!.id);
    res.json(connections);
  });

  app.get("/api/vpn-connections/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const connection = await storage.getVpnConnection(req.params.id, req.user!.id);
    if (!connection) return res.sendStatus(404);
    res.json(connection);
  });

  app.post("/api/vpn-connections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connectionData = { 
        ...req.body, 
        id: undefined  // Let database generate ID
      };
      
      // Validate basic required fields
      if (!connectionData.name || !connectionData.partnerId || !connectionData.serverHost) {
        return res.status(400).json({ error: "Missing required fields: name, partnerId, serverHost" });
      }
      
      const validatedData = insertVpnConnectionSchema.parse(connectionData);
      const connection = await storage.createVpnConnection(validatedData, req.user!.id);
      res.status(201).json(connection);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN connection data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-connections/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connection = await storage.updateVpnConnection(req.params.id, req.body, req.user!.id);
      if (!connection) return res.sendStatus(404);
      res.json(connection);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN connection", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-connections/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnConnection(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Test VPN connection
  app.post("/api/vpn-connections/:id/test", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const connection = await storage.getVpnConnection(req.params.id, req.user!.id);
      if (!connection) return res.sendStatus(404);

      // Test VPN connectivity and script validation
      const testResult = await testVPNConnection(connection);
      
      res.json({
        success: true,
        connection: connection,
        testResult: testResult
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to test VPN connection", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Generate VPN automation script
  app.post("/api/vpn-connections/:id/generate-script", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const connection = await storage.getVpnConnection(req.params.id, req.user!.id);
      if (!connection) return res.sendStatus(404);

      // Create a VPN connection object for the automation script generator
      const vpnConnectionInfo = {
        id: connection.id,
        name: connection.name,
        type: req.body.connectionType || 'forticlient', // Let user specify the type
        server: connection.serverHost,
        port: connection.serverPort,
        status: 'configured',
        description: connection.description || `VPN automation for ${connection.name}`
      };

      // Generate the automation script
      const automationResult = await generateVPNAutomationScript({ vpnConnection: vpnConnectionInfo });

      if (automationResult.success) {
        // Save the generated script to the database
        const scriptType = automationResult.connectionType === 'forticlient' ? 'applescript' : 
                         automationResult.connectionType === 'native' ? 'scutil' : 'shell';
        
        const updatedConnection = await storage.updateVpnConnection(req.params.id, {
          automationScript: automationResult.executionCommand,
          scriptType: scriptType
          // scriptGeneratedAt and scriptValidatedAt are auto-generated in database
        }, req.user!.id);

        res.json({
          success: true,
          connection: updatedConnection,
          automationResult: automationResult
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: automationResult.error 
        });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to generate automation script", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // VPN Credentials
  app.get("/api/vpn-connections/:connectionId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getVpnCredentials(req.params.connectionId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/vpn-connections/:connectionId/credentials/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getActiveVpnCredentials(req.params.connectionId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/vpn-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credential = await storage.getVpnCredential(req.params.id, req.user!.id);
    if (!credential) return res.sendStatus(404);
    res.json(credential);
  });

  app.post("/api/vpn-connections/:connectionId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credentialData = { ...req.body, vpnConnectionId: req.params.connectionId, userId: req.user!.id };
      const validatedData = insertVpnCredentialsSchema.parse(credentialData);
      const credential = await storage.createVpnCredential(validatedData);
      res.status(201).json(credential);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN credential data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credential = await storage.updateVpnCredential(req.params.id, req.body, req.user!.id);
      if (!credential) return res.sendStatus(404);
      res.json(credential);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN credential", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnCredential(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Software (Master Data)
  app.get("/api/vpn-software", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const software = await storage.getVpnSoftware();
    
    // Enhance software with automation capabilities based on vendor
    const enhancedSoftware = software.map(sw => {
      let canReadConfigs = false;
      let automationType = 'manual';
      
      switch (sw.vendor?.toLowerCase()) {
        case 'cisco':
          canReadConfigs = true;
          automationType = 'full';
          break;
        case 'fortinet':
          canReadConfigs = true;
          automationType = 'full';
          break;
        case 'microsoft':
          canReadConfigs = false;
          automationType = 'credentials';
          break;
        case 'palo alto networks':
          canReadConfigs = true;
          automationType = 'full';
          break;
        case 'openvpn inc.':
          canReadConfigs = false;
          automationType = 'manual';
          break;
        default:
          canReadConfigs = false;
          automationType = 'manual';
      }
      
      return {
        ...sw,
        canReadConfigs,
        automationType
      };
    });
    
    res.json(enhancedSoftware);
  });

  app.get("/api/vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const software = await storage.getVpnSoftwareById(req.params.id);
    if (!software) return res.sendStatus(404);
    res.json(software);
  });

  app.post("/api/vpn-software", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validatedData = insertVpnSoftwareSchema.parse(req.body);
      const software = await storage.createVpnSoftware(validatedData);
      res.status(201).json(software);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN software data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const software = await storage.updateVpnSoftware(req.params.id, req.body);
      if (!software) return res.sendStatus(404);
      res.json(software);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN software", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnSoftware(req.params.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Systems
  app.get("/api/vpn-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getVpnSystems(req.user!.id);
    res.json(systems);
  });

  app.get("/api/vpn-systems/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getVpnSystemsByPartner(req.params.partnerId, req.user!.id);
    res.json(systems);
  });

  app.get("/api/vpn-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const system = await storage.getVpnSystem(req.params.id, req.user!.id);
    if (!system) return res.sendStatus(404);
    res.json(system);
  });

  app.post("/api/vpn-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const systemData = { ...req.body, userId: req.user!.id };
      const validatedData = insertVpnSystemsSchema.parse(systemData);
      const system = await storage.createVpnSystem(validatedData);
      res.status(201).json(system);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN system data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const system = await storage.updateVpnSystem(req.params.id, req.body, req.user!.id);
      if (!system) return res.sendStatus(404);
      res.json(system);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN system", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnSystem(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Discovered VPN Software - Pre-caricamento discovery risultati
  app.get("/api/discovered-vpn-software", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const software = await storage.getDiscoveredVpnSoftware(req.user!.id);
    res.json(software);
  });

  app.get("/api/discovered-vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const software = await storage.getDiscoveredVpnSoftwareById(req.params.id, req.user!.id);
    if (!software) return res.sendStatus(404);
    res.json(software);
  });

  app.post("/api/discovered-vpn-software", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const softwareData = { ...req.body, userId: req.user!.id };
      const validatedData = insertDiscoveredVpnSoftwareSchema.parse(softwareData);
      const software = await storage.createDiscoveredVpnSoftware(validatedData);
      res.status(201).json(software);
    } catch (error) {
      res.status(400).json({ error: "Invalid discovered VPN software data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/discovered-vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const software = await storage.updateDiscoveredVpnSoftware(req.params.id, req.body, req.user!.id);
      if (!software) return res.sendStatus(404);
      res.json(software);
    } catch (error) {
      res.status(400).json({ error: "Failed to update discovered VPN software", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/discovered-vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteDiscoveredVpnSoftware(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Endpoint per eseguire discovery e salvare risultati nel database
  app.post("/api/discovered-vpn-software/run-discovery", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      console.log('[VPN-DISCOVERY] Avvio discovery completo e salvataggio nel database...');
      
      // Pulisci discovery precedenti per questo utente
      await storage.clearDiscoveredVpnSoftware(req.user!.id);
      
      // Scopri software disponibili 
      const availableSoftware = await discoverAvailableVPNSoftware(req.user!.id);
      console.log('[VPN-DISCOVERY] Software trovati:', availableSoftware);
      
      const discoveredSoftwareIds = [];
      
      for (const software of availableSoftware) {
        // Salva il software scoperto nel database
        const softwareData = {
          userId: req.user!.id,
          softwareKey: software.software, // Corretto: usa 'software' invece di 'key'
          name: software.name,
          vendor: 'Unknown', // Non disponibile dal discoverAvailableVPNSoftware
          installed: software.installed,
          canReadConfigs: software.canReadConfigs || false,
          configCount: software.configCount || 0,
          automationType: software.automationType,
          description: software.description || '',
          installPath: null, // Non disponibile dal discoverAvailableVPNSoftware
          configPath: null, // Non disponibile dal discoverAvailableVPNSoftware
          executablePath: null, // Non disponibile dal discoverAvailableVPNSoftware
          discoveryMethod: 'filesystem', // Default
          platform: process.platform || 'unknown'
        };
        
        const discoveredSoftware = await storage.createDiscoveredVpnSoftware(softwareData);
        discoveredSoftwareIds.push(discoveredSoftware.id);
        
        // Se il software ha configurazioni, esegui gli script sulla workstation per trovarle
        if (software.installed && software.canReadConfigs) {
          console.log(`[VPN-DISCOVERY] Software ${software.name} può leggere configurazioni - eseguendo discovery sulla workstation...`);
          
          try {
            console.log(`[VPN-DISCOVERY] 🔍 Executing REAL discovery scripts on user workstation for ${software.name}...`);
            
            // Execute REAL discovery on user workstation - no fake data
            // This should call actual scripts on the user's machine via API or remote execution
            console.log(`[VPN-DISCOVERY] Waiting for real discovery results from user workstation...`);
            
            // TODO: Implement actual remote script execution on user workstation
            // For now, only save if we get REAL results from actual workstation
            
            console.log(`[VPN-DISCOVERY] No real configurations found - workstation discovery returned empty`);
            
          } catch (error) {
            console.warn(`[VPN-DISCOVERY] Error discovering configs for ${software.software}:`, error);
          }
        }
      }
      
      console.log('[VPN-DISCOVERY] ✅ Discovery completato e salvato nel database');
      
      res.json({
        success: true,
        message: 'Discovery completato e risultati salvati nel database',
        discoveredSoftwareCount: availableSoftware.length,
        discoveredSoftwareIds: discoveredSoftwareIds
      });
      
    } catch (error) {
      console.error('[VPN-DISCOVERY] Error during discovery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run VPN discovery and save to database',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Discovered VPN Configurations
  app.get("/api/discovered-vpn-configurations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const configurations = await storage.getDiscoveredVpnConfigurations(req.user!.id);
    res.json(configurations);
  });

  app.get("/api/discovered-vpn-configurations/software/:softwareId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const configurations = await storage.getDiscoveredVpnConfigurationsBySoftware(req.params.softwareId, req.user!.id);
    res.json(configurations);
  });

  app.get("/api/discovered-vpn-configurations/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const configuration = await storage.getDiscoveredVpnConfigurationById(req.params.id, req.user!.id);
    if (!configuration) return res.sendStatus(404);
    res.json(configuration);
  });

  app.post("/api/discovered-vpn-configurations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const configData = { ...req.body, userId: req.user!.id };
      const validatedData = insertDiscoveredVpnConfigurationSchema.parse(configData);
      const configuration = await storage.createDiscoveredVpnConfiguration(validatedData);
      res.status(201).json(configuration);
    } catch (error) {
      res.status(400).json({ error: "Invalid discovered VPN configuration data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/discovered-vpn-configurations/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const configuration = await storage.updateDiscoveredVpnConfiguration(req.params.id, req.body, req.user!.id);
      if (!configuration) return res.sendStatus(404);
      res.json(configuration);
    } catch (error) {
      res.status(400).json({ error: "Failed to update discovered VPN configuration", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/discovered-vpn-configurations/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteDiscoveredVpnConfiguration(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Transport Requests
  app.get("/api/transport-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getTransportRequests(req.user!.id);
    res.json(requests);
  });

  app.get("/api/transport-requests/sap-system/:systemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getTransportRequestsBySapSystem(req.params.systemId, req.user!.id);
    res.json(requests);
  });

  app.get("/api/transport-requests/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getTransportRequestsByProject(req.params.projectId, req.user!.id);
    res.json(requests);
  });

  app.get("/api/transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const request = await storage.getTransportRequest(req.params.id, req.user!.id);
    if (!request) return res.sendStatus(404);
    res.json(request);
  });

  app.get("/api/transport-requests/number/:requestNumber", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const request = await storage.getTransportRequestByNumber(req.params.requestNumber, req.user!.id);
    if (!request) return res.sendStatus(404);
    res.json(request);
  });

  app.post("/api/transport-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const requestData = { ...req.body, userId: req.user!.id };
      const validatedData = insertTransportRequestSchema.parse(requestData);
      const request = await storage.createTransportRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      res.status(400).json({ error: "Invalid transport request data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const request = await storage.updateTransportRequest(req.params.id, req.body, req.user!.id);
      if (!request) return res.sendStatus(404);
      res.json(request);
    } catch (error) {
      res.status(400).json({ error: "Failed to update transport request", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteTransportRequest(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Intervention Documents
  app.get("/api/intervention-documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocuments(req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocumentsByProject(req.params.projectId, req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/transport-request/:transportRequestId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocumentsByTransportRequest(req.params.transportRequestId, req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/status/:status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocumentsByStatus(req.params.status, req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const document = await storage.getInterventionDocument(req.params.id, req.user!.id);
    if (!document) return res.sendStatus(404);
    res.json(document);
  });

  app.post("/api/intervention-documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const documentData = { ...req.body, userId: req.user!.id };
      const validatedData = insertInterventionDocumentSchema.parse(documentData);
      const document = await storage.createInterventionDocument(validatedData);
      res.status(201).json(document);
    } catch (error) {
      res.status(400).json({ error: "Invalid intervention document data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/intervention-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const document = await storage.updateInterventionDocument(req.params.id, req.body, req.user!.id);
      if (!document) return res.sendStatus(404);
      res.json(document);
    } catch (error) {
      res.status(400).json({ error: "Failed to update intervention document", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/intervention-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteInterventionDocument(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // System Credentials (unified SAP + VPN)
  app.get("/api/system-credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getSystemCredentials(req.user!.id);
    res.json(credentials);
  });

  app.get("/api/system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credential = await storage.getSystemCredential(req.params.id, req.user!.id);
    if (!credential) return res.sendStatus(404);
    res.json(credential);
  });

  app.post("/api/system-credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const processedData = {
        ...req.body,
        userId: req.user!.id,
        expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null
      };
      const credentialData = insertSystemCredentialsSchema.parse(processedData);
      const credential = await storage.createSystemCredential(credentialData);
      res.status(201).json(credential);
    } catch (error) {
      console.error("System credential creation error:", error);
      res.status(400).json({ error: "Invalid credential data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null
      };
      const credential = await storage.updateSystemCredential(req.params.id, updateData, req.user!.id);
      if (!credential) return res.sendStatus(404);
      res.json(credential);
    } catch (error) {
      res.status(400).json({ error: "Failed to update credential", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteSystemCredential(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // AI Documentation Generation
  app.post("/api/intervention-documents/generate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { transportRequestId, title, type = "transport_analysis" } = req.body;
      
      if (!transportRequestId) {
        return res.status(400).json({ error: "Transport request ID is required" });
      }

      // Get transport request with cofile content for AI analysis
      const transportRequest = await storage.getTransportRequest(transportRequestId, req.user!.id);
      if (!transportRequest) {
        return res.status(404).json({ error: "Transport request not found" });
      }

      if (!transportRequest.cofileContent) {
        return res.status(400).json({ error: "Transport request must have cofile content for AI analysis" });
      }

      // Generate AI documentation
      const analysisPrompt = `Analyze this SAP transport request and generate professional documentation:
      
Transport: ${transportRequest.requestNumber}
Description: ${transportRequest.description}
Owner: ${transportRequest.owner}
Type: ${transportRequest.type}
Status: ${transportRequest.status}

Cofile Content:
${transportRequest.cofileContent}

Objects Included: ${transportRequest.includedObjects?.join(', ') || 'Not specified'}

Please generate a comprehensive intervention document that includes:
1. Executive Summary
2. Technical Changes Overview
3. Objects Modified/Created
4. Impact Analysis
5. Testing Recommendations
6. Deployment Notes
7. Rollback Procedures (if applicable)

Format the response as professional documentation suitable for client delivery.`;

      const aiResponse = await aiService.generateDocumentation(analysisPrompt);
      
      // Create intervention document with AI content
      const documentData = {
        userId: req.user!.id,
        transportRequestId,
        title: title || `Documentation for Transport ${transportRequest.requestNumber}`,
        type,
        aiGeneratedContent: aiResponse.content,
        aiConfidenceScore: aiResponse.confidence,
        aiModel: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        analysisPrompt,
        sourceFiles: transportRequest.cofilePath ? [transportRequest.cofilePath] : [],
        sapSystemId: transportRequest.sapSystemId,
        projectId: transportRequest.projectId,
        taskId: transportRequest.taskId
      };

      const validatedData = insertInterventionDocumentSchema.parse(documentData);
      const document = await storage.createInterventionDocument(validatedData);
      
      res.status(201).json({
        document,
        aiGenerated: true,
        confidence: aiResponse.confidence
      });
    } catch (error) {
      console.error("AI documentation generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate AI documentation", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Audit API endpoints
  app.get("/api/audit/:tableName/:recordId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { tableName, recordId } = req.params;
      
      // Validate table name to prevent injection
      const allowedTables = [
        'projects', 'tasks', 'partners', 'deals', 'calendar_events', 
        'time_entries', 'messages', 'timesheets', 'sales_orders',
        'rate_agreements', 'human_resources', 'sap_systems', 
        'vpn_connections', 'system_credentials', 'organizations'
      ];
      
      if (!allowedTables.includes(tableName)) {
        return res.status(400).json({ error: "Invalid table name" });
      }
      
      // Get audit trail from new simple table - use the SAME logic as audit saving
      const user = req.user as any;
      const auditContext = AuditService.createContext(req);
      const organizationId = auditContext.organizationId;
      
      console.log(`[AUDIT API] Looking for ${tableName}:${recordId} in org: ${organizationId}`);
      const result = await db.execute(sql.raw(`
        SELECT 
          a.id,
          a.record_id,
          a.table_name,
          a.field_name,
          a.old_value,
          a.new_value,
          a.created_at,
          u.id as user_id,
          u.first_name as user_firstName,
          u.last_name as user_lastName,
          u.email as user_email
        FROM audit_trail a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.table_name = '${tableName}' AND a.record_id = '${recordId}' AND a.organization_id = '${organizationId}'
        ORDER BY a.created_at DESC
      `));

      // Group by timestamp to create audit entries
      const auditMap = new Map();
      for (const row of result.rows) {
        const timestamp = row.created_at;
        if (!auditMap.has(timestamp)) {
          auditMap.set(timestamp, {
            id: row.id,
            tableName: row.table_name,
            recordId: row.record_id,
            action: row.old_value === null ? 'CREATE' : (row.new_value === null ? 'DELETE' : 'UPDATE'),
            oldValues: null,
            newValues: null,
            changedFields: [],
            createdAt: row.created_at,
            user: {
              id: row.user_id,
              firstName: row.user_firstname || 'Unknown',
              lastName: row.user_lastname || 'User',
              email: row.user_email || 'unknown@example.com',
            },
            userAgent: null,
            ipAddress: null,
            fieldChanges: []
          });
        }
        
        const entry = auditMap.get(timestamp);
        entry.changedFields.push(row.field_name);
        entry.fieldChanges.push({
          field: row.field_name,
          oldValue: row.old_value,
          newValue: row.new_value
        });
      }

      const logs = Array.from(auditMap.values());
      res.json(logs);
    } catch (error) {
      console.error("Audit history error:", error);
      res.status(500).json({ 
        error: "Failed to retrieve audit history", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
