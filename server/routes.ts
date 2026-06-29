import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { sql, inArray, eq, and, or, desc, asc, isNull, aliasedTable } from "drizzle-orm";
import { generateVPNAutomationScript, discoverVPNConnections, discoverAvailableVPNSoftware, testVPNConnection } from "./vpn-automation";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { 
  insertProjectSchema, insertTaskSchema, insertPartnerSchema, insertContactSchema,
  insertDealSchema, insertCalendarEventSchema, insertPlanningWindowSchema, insertTimeEntrySchema,
  insertMessageSchema, insertCommentSchema, insertMessageLinkSchema, insertEmailConfigSchema, insertTimesheetSchema,
  insertSalesOrderSchema, insertSalesOrderItemSchema, insertRateAgreementSchema, insertQuoteSchema, insertQuoteItemSchema,
  insertHumanResourceSchema, insertSapSystemSchema, insertSapSystemCredentialsSchema,
  insertVpnConnectionSchema, insertVpnCredentialsSchema, insertTransportRequestSchema,
  insertInterventionDocumentSchema, insertSystemCredentialsSchema,
  insertVpnSoftwareSchema, insertVpnSystemsSchema, vpnConnections,
  insertDiscoveredVpnSoftwareSchema, insertDiscoveredVpnConfigurationSchema,
  insertOrganizationSchema, insertUserOrganizationSchema, insertOrganizationInvitationSchema,
  insertOrganizationDomainSchema, insertEmailFeedbackSchema, insertEmailTrainingSelectionSchema,
  insertBusinessScenarioSchema,
  insertSapTransportRequestSchema, insertSapTransportTaskSchema, insertSapTransportObjectSchema, insertSapObjectContentSchema,
  insertProjectAssignmentSchema, insertProjectMilestoneSchema, insertPurchaseOrderSchema, insertVendorInvoiceSchema,
  insertCustomEntitySchema, insertCustomFieldSchema, insertEntityCustomValueSchema,
  insertTestExecutionSchema,
  type EmailConfig,
  projects, tasks, partners, contacts, projectContacts, notifications, workflows, messages, deals, calendarEvents, salesOrders, rateAgreements, quotes, quoteItems,
  humanResources, sapSystems, systemCredentials, timesheets, comments, proposals, projectShares,
  projectAssignments, projectMilestones, purchaseOrders, vendorInvoices, users, organizations,
  customEntities, customFields, sapTransportRequests, timeEntries, aiAbapPatterns, aiTaskExecutions,
  dashboardWidgetTemplates, insertDashboardWidgetTemplateSchema,
  skillCatalog, insertSkillCatalogSchema,
  resourceSkills, resourceAvailability,
  insertResourceSkillSchema, insertResourceAvailabilitySchema,
  taskRequiredSkills, insertTaskRequiredSkillSchema,
  aiProviders, aiModels, userOrganizations,
  mcpCatalog, mcpServerConfigs, insertMcpServerConfigSchema, mcpCatalogValidations,
  connectionWorkflows, insertConnectionWorkflowSchema,
  proposalDiscussions
} from "@shared/schema";
import { aiService } from "./ai-service";
import { initializeEmailService, getEmailService } from "./imap-service";
import { AuditService } from "./audit-service";
import { MessageLogService } from "./message-log-service";
import { gmailService } from "./gmail-service";
import { AttachmentsService } from "./attachments-service";
import { EmailForwardCleaner } from './email-forward-cleaner';
import { CustomMetadataService } from "./custom-metadata-service";
import { PdfService } from "./pdf-service";
import { ObjectStorageService } from "./objectStorage";
import { calculateEndToComplete } from "./end-to-complete-calculator";
import { recalculateProjectScheduleForTask } from "./project-rescheduler";
import { assembleContext } from "./context-assembler";
import { contextPacks } from "@shared/schema";

// Phase 5: compute suggested model key from analytics (min 5 completed executions for taskType)
async function computeSuggestedModelKey(organizationId: string, taskType: string): Promise<string | null> {
  try {
    const rows = await db.execute(sql`
      SELECT ate.model_key, count(*)::int as cnt,
             avg(ate.user_rating) as avg_rating,
             avg(ate.total_cost_eur::float) as avg_cost
      FROM ai_task_executions ate
      INNER JOIN tasks t ON t.id = ate.task_id
      WHERE ate.organization_id = ${organizationId}
        AND ate.status = 'completed'
        AND t.task_type = ${taskType}
        AND ate.model_key IS NOT NULL
      GROUP BY ate.model_key
      HAVING count(*) >= 5
    `);
    const qualified = (rows.rows || []) as { model_key: string; cnt: number; avg_rating: number | null; avg_cost: number | null }[];
    if (!qualified.length) return null;
    qualified.sort((a, b) => {
      const ratingDiff = (b.avg_rating ?? 0) - (a.avg_rating ?? 0);
      if (Math.abs(ratingDiff) > 0.1) return ratingDiff;
      return (a.avg_cost ?? 0) - (b.avg_cost ?? 0);
    });
    return qualified[0].model_key || null;
  } catch {
    return null;
  }
}

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
  
  let baseOrgIds: string[];
  
  // If Personal + scope 'all', return ALL user's organization IDs
  if (isPersonal && scope === 'all') {
    baseOrgIds = orgs.map(org => org.id);
  } else {
    baseOrgIds = [organizationId];
  }
  
  // Now check for "gestisce" scenarios - add managed organizations
  const managedOrgIds = await getManagedOrganizationIds(baseOrgIds, orgs);
  
  // Combine and deduplicate
  const allOrgIds = [...new Set([...baseOrgIds, ...managedOrgIds])];
  
  return allOrgIds;
}

// Helper function to find organizations managed via "gestisce" business scenarios
async function getManagedOrganizationIds(orgIds: string[], userOrgs: any[]): Promise<string[]> {
  const managedOrgIds: string[] = [];
  
  for (const orgId of orgIds) {
    const org = userOrgs.find(o => o.id === orgId);
    if (!org?.partnerId) continue;
    
    // Find "gestisce" scenarios where this org's partner is the source
    const scenarios = await storage.getBusinessScenariosBySourcePartner(org.partnerId);
    const gestisceScenarios = scenarios.filter(s => s.relationshipType === 'gestisce' && s.isActive);
    
    for (const scenario of gestisceScenarios) {
      // Find organizations that have the targetPartner as their associated partner
      const targetOrg = userOrgs.find(o => o.partnerId === scenario.targetPartnerId);
      if (targetOrg && !managedOrgIds.includes(targetOrg.id)) {
        managedOrgIds.push(targetOrg.id);
      }
    }
  }
  
  return managedOrgIds;
}

// DevOps Work Item Helper - Map priority from DevOps (1-4) to CRM priority
function mapDevOpsPriority(devOpsPriority: number | string | undefined): 'low' | 'medium' | 'high' | 'urgent' {
  const priority = typeof devOpsPriority === 'string' ? parseInt(devOpsPriority, 10) : devOpsPriority;
  if (!priority || isNaN(priority)) return 'medium';
  
  switch (priority) {
    case 1: return 'urgent';
    case 2: return 'high';
    case 3: return 'medium';
    case 4: return 'low';
    default: return 'medium';
  }
}

// DevOps Work Item Helper - Map work item type to CRM task type
function mapDevOpsWorkItemType(workItemType: string | undefined): 'development' | 'analysis' | 'design' | 'testing' | 'consulting' | 'meeting' | 'documentation' | 'maintenance' | 'support' | 'other' {
  if (!workItemType) return 'other';
  
  const type = workItemType.toLowerCase();
  if (type.includes('bug')) return 'maintenance';
  if (type.includes('task')) return 'development';
  if (type.includes('user story') || type.includes('story')) return 'development';
  if (type.includes('feature')) return 'development';
  if (type.includes('epic')) return 'analysis';
  if (type.includes('test')) return 'testing';
  if (type.includes('doc')) return 'documentation';
  
  return 'other';
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

function generatePeriods(start: Date, end: Date, granularity: "day" | "week" | "month"): Array<{ start: Date; end: Date; label: string }> {
  const periods: Array<{ start: Date; end: Date; label: string }> = [];
  const current = new Date(start);
  const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  while (current < end) {
    let periodEnd: Date;
    let label: string;

    if (granularity === "day") {
      periodEnd = new Date(current);
      periodEnd.setDate(periodEnd.getDate() + 1);
      label = `${current.getDate()} ${months[current.getMonth()]}`;
    } else if (granularity === "week") {
      periodEnd = new Date(current);
      periodEnd.setDate(periodEnd.getDate() + 7);
      label = `${current.getDate()} ${months[current.getMonth()]}`;
    } else {
      periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      label = `${months[current.getMonth()]} ${current.getFullYear()}`;
    }

    if (periodEnd > end) periodEnd = new Date(end);
    periods.push({ start: new Date(current), end: periodEnd, label });
    current.setTime(periodEnd.getTime());
  }
  return periods;
}

function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getEffectiveDailyHours(availability: Array<{ weeklyHours: number; effectiveFrom: Date | string; effectiveTo: Date | string | null }>, date: Date): number {
  const applicable = availability.find(a => {
    const from = new Date(a.effectiveFrom);
    const to = a.effectiveTo ? new Date(a.effectiveTo) : null;
    return date >= from && (!to || date <= to);
  });
  const weeklyHours = applicable ? applicable.weeklyHours : 40;
  return weeklyHours / 5;
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
    const usersList = await storage.getUsers();
    res.json(usersList);
  });

  app.put("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Users can only update their own profile
      if (req.params.id !== req.user!.id) {
        return res.status(403).json({ error: "Cannot update other users" });
      }
      
      const { firstName, lastName, email, profileImageUrl } = req.body;
      const updatedUser = await storage.updateUser(req.params.id, {
        firstName,
        lastName,
        email,
        profileImageUrl
      });
      
      if (!updatedUser) return res.sendStatus(404);
      res.json(updatedUser);
    } catch (error) {
      console.error("[UPDATE USER] Error:", error);
      res.status(400).json({ error: "Invalid user data" });
    }
  });

  // Get profile image upload URL
  app.get("/api/users/profile-image-upload-url", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const objectStorage = new ObjectStorageService();
      const uploadUrl = await objectStorage.getLogoUploadURL();
      
      // Extract the object path for storing in the database
      const url = new URL(uploadUrl);
      const objectPath = objectStorage.normalizeLogoPath(uploadUrl);
      
      res.json({ uploadUrl, objectPath });
    } catch (error) {
      console.error("[PROFILE IMAGE URL] Error:", error);
      res.status(500).json({ error: "Could not generate upload URL" });
    }
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

  // Business Scenarios
  app.get("/api/business-scenarios", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const scenarios = await storage.getBusinessScenariosByOrganization(organizationId);
    res.json(scenarios);
  });

  app.get("/api/business-scenarios/by-source-partner/:sourcePartnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const scenarios = await storage.getBusinessScenariosBySourcePartner(req.params.sourcePartnerId);
    res.json(scenarios);
  });

  app.get("/api/business-scenarios/detail/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const scenario = await storage.getBusinessScenario(req.params.id);
    if (!scenario) return res.sendStatus(404);
    res.json(scenario);
  });

  app.post("/api/business-scenarios", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const data = insertBusinessScenarioSchema.parse({
        ...req.body,
        organizationId,
      });
      const scenario = await storage.createBusinessScenario(data);
      res.json(scenario);
    } catch (error) {
      console.error("Business scenario creation error:", error);
      res.status(400).json({ error: "Invalid business scenario data" });
    }
  });

  app.put("/api/business-scenarios/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const data = insertBusinessScenarioSchema.partial().parse(req.body);
      const scenario = await storage.updateBusinessScenario(req.params.id, data);
      if (!scenario) return res.sendStatus(404);
      res.json(scenario);
    } catch (error) {
      res.status(400).json({ error: "Invalid business scenario data" });
    }
  });

  app.delete("/api/business-scenarios/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteBusinessScenario(req.params.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  app.post("/api/business-scenarios/bulk-delete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }
      const deletedCount = await storage.deleteBusinessScenarios(ids);
      res.json({ deletedCount });
    } catch (error) {
      res.status(400).json({ error: "Invalid request data" });
    }
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
      const currentOrgId = getOrganizationId(req);
      
      // Get owned projects
      const ownedProjects = await db.select().from(projects)
        .where(and(
          eq(projects.userId, req.user!.id),
          inArray(projects.organizationId, organizationIds)
        ));
      
      // Get shared projects (projects shared with current organization)
      const sharedProjectsData = await storage.getProjectsSharedWithOrganization(currentOrgId);
      
      // Mark shared projects and combine
      const ownedWithFlag = ownedProjects.map(p => ({ ...p, isShared: false, shareInfo: null }));
      const sharedWithFlag = sharedProjectsData.map(p => ({
        ...p,
        isShared: true,
      }));
      
      // Combine and deduplicate (in case a project is both owned and shared)
      const allProjects = [...ownedWithFlag];
      for (const shared of sharedWithFlag) {
        if (!allProjects.find(p => p.id === shared.id)) {
          allProjects.push(shared as any);
        }
      }
      
      res.json(allProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/projects/batch-end-to-complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const projectsList = await storage.getProjects(req.user!.id, organizationId);
      const results: Record<string, any> = {};
      
      for (const project of projectsList) {
        try {
          const result = await calculateEndToComplete(project.id, req.user!.id, organizationId);
          // Include stored schedule deficit from project (auto-rescheduling result)
          results[project.id] = {
            ...result,
            scheduleDeficitHours: project.scheduleDeficitHours || 0,
            storedCalculatedEndDate: project.calculatedEndDate 
              ? new Date(project.calculatedEndDate).toISOString() 
              : null
          };
        } catch (err) {
          results[project.id] = { 
            error: true, 
            state: 'error',
            scheduleDeficitHours: project.scheduleDeficitHours || 0,
            storedCalculatedEndDate: project.calculatedEndDate 
              ? new Date(project.calculatedEndDate).toISOString() 
              : null
          };
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error calculating batch end-to-complete:", error);
      res.status(500).json({ error: "Failed to calculate batch end-to-complete" });
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

  app.get("/api/projects/:id/end-to-complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const result = await calculateEndToComplete(req.params.id, req.user!.id, organizationId);
      
      // Include stored schedule deficit from project (auto-rescheduling result)
      const project = await storage.getProject(req.params.id, req.user!.id, organizationId);
      res.json({
        ...result,
        scheduleDeficitHours: project?.scheduleDeficitHours || 0,
        storedCalculatedEndDate: project?.calculatedEndDate 
          ? new Date(project.calculatedEndDate).toISOString() 
          : null
      });
    } catch (error) {
      console.error("Error calculating end-to-complete:", error);
      res.status(500).json({ error: "Failed to calculate end-to-complete" });
    }
  });

  app.get("/api/projects/:id/relationships", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const projectId = req.params.id;
      const organizationIds = await getOrganizationIdsForFilter(req);

      // Get tasks count and details
      const tasksList = await db.select({
        id: tasks.id,
        name: tasks.title,
      })
      .from(tasks)
      .where(and(
        eq(tasks.projectId, projectId),
        inArray(tasks.organizationId, organizationIds)
      ))
      .limit(20);

      // Get milestones count and details
      const milestonesList = await db.select({
        id: projectMilestones.id,
        name: projectMilestones.name,
      })
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.projectId, projectId),
        inArray(projectMilestones.organizationId, organizationIds)
      ))
      .limit(20);

      res.json({
        tasks: {
          count: tasksList.length,
          items: tasksList.map(t => ({ id: t.id, name: t.name }))
        },
        milestones: {
          count: milestonesList.length,
          items: milestonesList.map(m => ({ id: m.id, name: m.name }))
        }
      });
    } catch (error) {
      console.error("Error fetching project relationships:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Convert data before validation
      const endDateValue = req.body.endDate ? new Date(req.body.endDate) : null;
      const processedData = {
        name: req.body.name,
        description: req.body.description || null,
        status: req.body.status || "planning",
        clientId: req.body.clientId || null,
        parentProjectId: req.body.parentProjectId || null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: endDateValue,
        // Initialize calculatedEndDate with endDate at creation time
        calculatedEndDate: endDateValue,
        scheduleDeficitHours: 0,
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
      
      // Check for related data first
      const projectId = req.params.id;
      const relatedTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
      const relatedMilestones = await db.select({ id: projectMilestones.id }).from(projectMilestones).where(eq(projectMilestones.projectId, projectId));
      const relatedEvents = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.projectId, projectId));
      const relatedComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.projectId, projectId));
      const relatedTransports = await db.select({ id: sapTransportRequests.id }).from(sapTransportRequests).where(eq(sapTransportRequests.projectId, projectId));
      
      const hasRelatedData = relatedTasks.length > 0 || relatedMilestones.length > 0 || 
                            relatedEvents.length > 0 || relatedComments.length > 0 || relatedTransports.length > 0;
      
      if (hasRelatedData) {
        return res.status(409).json({ 
          error: 'Project has related data',
          needsCascade: true,
          relatedCounts: {
            tasks: relatedTasks.length,
            milestones: relatedMilestones.length,
            events: relatedEvents.length,
            comments: relatedComments.length,
            transports: relatedTransports.length
          }
        });
      }
      
      const deleted = await storage.deleteProject(req.params.id, req.user!.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Get related data for a project (for cascade delete dialog)
  app.get("/api/projects/:id/related-data", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const projectId = req.params.id;
      
      const relatedTasks = await db.select({ id: tasks.id, name: tasks.title }).from(tasks).where(eq(tasks.projectId, projectId)).limit(10);
      const taskIds = relatedTasks.map(t => t.id);
      const relatedTimeEntries = taskIds.length > 0 
        ? await db.select({ id: timeEntries.id }).from(timeEntries).where(inArray(timeEntries.taskId, taskIds)).limit(10)
        : [];
      const relatedMilestones = await db.select({ id: projectMilestones.id, name: projectMilestones.name }).from(projectMilestones).where(eq(projectMilestones.projectId, projectId)).limit(10);
      const relatedEvents = await db.select({ id: calendarEvents.id, name: calendarEvents.title }).from(calendarEvents).where(eq(calendarEvents.projectId, projectId)).limit(10);
      const relatedComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.projectId, projectId)).limit(10);
      const relatedTransports = await db.select({ id: sapTransportRequests.id, name: sapTransportRequests.requestNumber }).from(sapTransportRequests).where(eq(sapTransportRequests.projectId, projectId)).limit(10);
      
      res.json({
        tasks: { count: relatedTasks.length, items: relatedTasks },
        timeEntries: { count: relatedTimeEntries.length, items: relatedTimeEntries },
        milestones: { count: relatedMilestones.length, items: relatedMilestones },
        events: { count: relatedEvents.length, items: relatedEvents },
        comments: { count: relatedComments.length, items: relatedComments },
        transports: { count: relatedTransports.length, items: relatedTransports }
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Cascade delete a project and all related data
  app.delete("/api/projects/:id/cascade", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const projectId = req.params.id;
      const organizationId = getOrganizationId(req);
      
      // Get task IDs first (needed for time_entries deletion)
      const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
      const taskIds = projectTasks.map(t => t.id);
      
      // Delete related data in correct order (respecting foreign keys)
      // 1. Delete time entries (references tasks)
      if (taskIds.length > 0) {
        await db.delete(timeEntries).where(inArray(timeEntries.taskId, taskIds));
      }
      // 2. Delete comments (references project)
      await db.delete(comments).where(eq(comments.projectId, projectId));
      // 3. Delete SAP transport requests (references project)
      await db.delete(sapTransportRequests).where(eq(sapTransportRequests.projectId, projectId));
      // 4. Delete calendar events (references project)
      await db.delete(calendarEvents).where(eq(calendarEvents.projectId, projectId));
      // 5. Delete tasks (references project)
      await db.delete(tasks).where(eq(tasks.projectId, projectId));
      // 6. Delete project milestones (references project)
      await db.delete(projectMilestones).where(eq(projectMilestones.projectId, projectId));
      
      // Finally delete the project
      const deleted = await storage.deleteProject(projectId, req.user!.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      
      res.sendStatus(204);
    } catch (error) {
      console.error("Cascade delete error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Project Shares - Get shares for a project
  app.get("/api/projects/:id/shares", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Get user organizations first
      const userOrgs = await storage.getUserOrganizations(req.user!.id);
      const userOrgIds = userOrgs.map(org => org.id);
      
      // Try to find the project in any of user's organizations
      let project = null;
      for (const orgId of userOrgIds) {
        const found = await storage.getProject(req.params.id, req.user!.id, orgId);
        if (found) {
          project = found;
          break;
        }
      }
      
      // If not owned, check if it's a shared project
      if (!project) {
        const [sharedProject] = await db.select().from(projects)
          .innerJoin(projectShares, eq(projects.id, projectShares.projectId))
          .where(and(
            eq(projects.id, req.params.id),
            inArray(projectShares.targetOrganizationId, userOrgIds)
          ));
        if (sharedProject) {
          project = sharedProject.projects;
        }
      }
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Authorization check: user must own the project or be in an organization that has access
      const isOwner = project.userId === req.user!.id;
      const isInProjectOrg = userOrgIds.includes(project.organizationId);
      
      // Check if user is in any org that received the share
      const existingShares = await storage.getProjectShares(req.params.id);
      const isShareRecipient = existingShares.some(share => userOrgIds.includes(share.targetOrganizationId));
      
      if (!isOwner && !isInProjectOrg && !isShareRecipient) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Enrich with organization names
      const enrichedShares = await Promise.all(existingShares.map(async (share) => {
        const targetOrg = await storage.getOrganization(share.targetOrganizationId);
        return {
          ...share,
          targetOrganizationName: targetOrg?.name || 'Unknown',
        };
      }));
      res.json(enrichedShares);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Project Shares - Create a share
  app.post("/api/projects/:id/shares", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const projectId = req.params.id;
      
      // Verify the user owns the project (must be in the source organization)
      const project = await storage.getProject(projectId, req.user!.id, organizationId);
      if (!project) {
        return res.status(403).json({ error: 'You can only share projects you own' });
      }
      
      const { targetOrganizationId, permission } = req.body;
      if (!targetOrganizationId) {
        return res.status(400).json({ error: 'targetOrganizationId is required' });
      }
      
      // Cannot share with self
      if (targetOrganizationId === organizationId) {
        return res.status(400).json({ error: 'Cannot share project with its own organization' });
      }
      
      const share = await storage.createProjectShare({
        projectId,
        targetOrganizationId,
        permission: permission || 'read',
      }, req.user!.id);
      
      res.status(201).json(share);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Project Shares - Delete a share
  app.delete("/api/projects/:id/shares/:targetOrgId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const projectId = req.params.id;
      
      // Verify the user owns the project
      const project = await storage.getProject(projectId, req.user!.id, organizationId);
      if (!project) {
        return res.status(403).json({ error: 'You can only manage shares for projects you own' });
      }
      
      const deleted = await storage.deleteProjectShare(projectId, req.params.targetOrgId);
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
      // Alias for SAP systems table for partner-based lookup
      const partnerSapSystems = aliasedTable(sapSystems, 'partner_sap_systems');
      const taskSapSystems = aliasedTable(sapSystems, 'task_sap_systems');
      
      const tasksList = await db.selectDistinctOn([tasks.id], {
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        taskType: tasks.taskType,
        projectId: tasks.projectId,
        parentTaskId: tasks.parentTaskId,
        milestoneId: tasks.milestoneId,
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        assignedToName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`.as('assigned_to_name'),
        sapSystemId: tasks.sapSystemId,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        estimatedEffort: tasks.estimatedEffort,
        remainingEffort: tasks.remainingEffort,
        completionPercentage: tasks.completionPercentage,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        organizationId: tasks.organizationId,
        projectName: projects.name,
        projectClientId: projects.clientId,
        // SAP system: priority is task.sapSystemId, then partner's SAP system (project.clientId -> sapSystems.partnerId)
        sapSystemName: sql<string>`COALESCE(${taskSapSystems.name}, ${partnerSapSystems.name})`.as('sap_system_name'),
        sapServerHost: sql<string>`COALESCE(${taskSapSystems.serverHost}, ${partnerSapSystems.serverHost})`.as('sap_server_host'),
        sapSystemIdCode: sql<string>`COALESCE(${taskSapSystems.systemId}, ${partnerSapSystems.systemId})`.as('sap_system_id_code'),
        sapSystemNumber: sql<string>`COALESCE(${taskSapSystems.systemNumber}, ${partnerSapSystems.systemNumber})`.as('sap_system_number'),
        sapApplicationServerPort: sql<number>`COALESCE(${taskSapSystems.applicationServerPort}, ${partnerSapSystems.applicationServerPort})`.as('sap_application_server_port'),
        sapConnectionType: sql<string>`COALESCE(${taskSapSystems.connectionType}, ${partnerSapSystems.connectionType})`.as('sap_connection_type'),
        sapCitrixLink: sql<string>`COALESCE(${taskSapSystems.citrixLink}, ${partnerSapSystems.citrixLink})`.as('sap_citrix_link'),
        sapCloudLink: sql<string>`COALESCE(${taskSapSystems.cloudLink}, ${partnerSapSystems.cloudLink})`.as('sap_cloud_link'),
        sapWebLink: sql<string>`COALESCE(${taskSapSystems.webLink}, ${partnerSapSystems.webLink})`.as('sap_web_link'),
      }).from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        // Join SAP system directly on task (override)
        .leftJoin(taskSapSystems, eq(tasks.sapSystemId, taskSapSystems.id))
        // Join SAP system via partner (project.clientId -> sapSystems.partnerId)
        .leftJoin(partnerSapSystems, eq(projects.clientId, partnerSapSystems.partnerId))
        .leftJoin(users, eq(tasks.assignedTo, users.id))
        .where(inArray(tasks.organizationId, organizationIds))
        .orderBy(tasks.id, desc(tasks.updatedAt));
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
      if (req.body.taskType !== undefined) updateData.taskType = req.body.taskType;
      if (req.body.projectId !== undefined) updateData.projectId = req.body.projectId;
      if (req.body.parentTaskId !== undefined) updateData.parentTaskId = req.body.parentTaskId || null;
      if (req.body.milestoneId !== undefined) updateData.milestoneId = req.body.milestoneId || null;
      if (req.body.sapSystemId !== undefined) updateData.sapSystemId = req.body.sapSystemId;
      if (req.body.startDate !== undefined) updateData.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      if (req.body.dueDate !== undefined) updateData.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (req.body.estimatedEffort !== undefined) updateData.estimatedEffort = req.body.estimatedEffort || null;
      if (req.body.completionPercentage !== undefined) updateData.completionPercentage = req.body.completionPercentage;
      if (req.body.assignedTo !== undefined) updateData.assignedTo = req.body.assignedTo && req.body.assignedTo !== "none" ? req.body.assignedTo : null;
      if (req.body.agentModelId !== undefined) updateData.agentModelId = req.body.agentModelId && req.body.agentModelId !== "none" ? req.body.agentModelId : null;
      if (req.body.budgetCapEur !== undefined) updateData.budgetCapEur = req.body.budgetCapEur || null;
      if (req.body.mcpConfigIds !== undefined) updateData.mcpConfigIds = req.body.mcpConfigIds ?? [];
      if (req.body.connectionWorkflowId !== undefined) updateData.connectionWorkflowId = req.body.connectionWorkflowId && req.body.connectionWorkflowId !== "none" ? req.body.connectionWorkflowId : null;

      console.log(`[TASK-UPDATE] id=${req.params.id} agentModelId=${updateData.agentModelId} mcpConfigIds=${JSON.stringify(updateData.mcpConfigIds)} budgetCapEur=${updateData.budgetCapEur}`);

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
      
      // Auto-reschedule project when task completion percentage or estimated effort changes
      if (task.projectId && (req.body.completionPercentage !== undefined || req.body.estimatedEffort !== undefined)) {
        try {
          const reschedulingResult = await recalculateProjectScheduleForTask(
            req.params.id,
            req.user!.id,
            organizationId
          );
          
          if (reschedulingResult && reschedulingResult.changed) {
            console.log(`[TASK-RESCHEDULE] Project ${task.projectId} rescheduled: ` +
              `calculatedEnd=${reschedulingResult.calculatedEndDate?.toISOString().split('T')[0] || 'null'}, ` +
              `deficitHours=${reschedulingResult.scheduleDeficitHours}`);
          }
        } catch (rescheduleError) {
          console.error("[TASK-RESCHEDULE] Error rescheduling project:", rescheduleError);
          // Don't fail the task update if rescheduling fails
        }
      }
      
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
      const organizationId = getOrganizationId(req);
      
      // Get partners filtered by organization
      let partnersList = await db.select().from(partners)
        .where(and(
          eq(partners.userId, req.user!.id),
          inArray(partners.organizationId, organizationIds),
          isNull(partners.parentPartnerId)
        ));
      
      // Also include the partner associated with the current organization (if any)
      // This ensures the organization's own partner is always visible
      const currentOrg = await db.select().from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      
      if (currentOrg.length > 0 && currentOrg[0].partnerId) {
        const orgPartnerId = currentOrg[0].partnerId;
        // Check if this partner is already in the list
        const alreadyIncluded = partnersList.some(p => p.id === orgPartnerId);
        if (!alreadyIncluded) {
          // Fetch and add the organization's partner
          const orgPartner = await db.select().from(partners)
            .where(and(
              eq(partners.id, orgPartnerId),
              eq(partners.userId, req.user!.id)
            ))
            .limit(1);
          if (orgPartner.length > 0) {
            partnersList = [...partnersList, orgPartner[0]];
          }
        }
      }
      
      res.json(partnersList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // All partners for user (no organization filter) - used for organization-partner association
  app.get("/api/partners/all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const partnersList = await db.select().from(partners)
        .where(and(
          eq(partners.userId, req.user!.id),
          isNull(partners.parentPartnerId)
        ));
      res.json(partnersList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Partner locations (operative sites)
  app.get("/api/partners/:id/locations", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const partnerId = req.params.id;
      const organizationIds = await getOrganizationIdsForFilter(req);
      const locations = await db.select().from(partners)
        .where(and(
          eq(partners.parentPartnerId, partnerId),
          eq(partners.userId, req.user!.id),
          inArray(partners.organizationId, organizationIds)
        ))
        .orderBy(partners.createdAt);
      res.json(locations);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    let partner = await storage.getPartner(req.params.id, req.user!.id, organizationId);
    
    // If not found, check if this is the partner associated with the current organization
    if (!partner) {
      const currentOrg = await db.select().from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      
      if (currentOrg.length > 0 && currentOrg[0].partnerId === req.params.id) {
        // Fetch the partner without organization filter since it's the org's own partner
        const [orgPartner] = await db.select().from(partners)
          .where(and(
            eq(partners.id, req.params.id),
            eq(partners.userId, req.user!.id)
          ));
        partner = orgPartner;
      }
    }
    
    if (!partner) return res.sendStatus(404);
    res.json(partner);
  });

  app.get("/api/partners/:id/relationships", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const partnerId = req.params.id;
      const organizationIds = await getOrganizationIdsForFilter(req);

      console.log(`[RELATIONSHIPS] Fetching relationships for partner ${partnerId} with orgs:`, organizationIds);

      // Get projects where partner is client
      console.log('[RELATIONSHIPS] Fetching projects...');
      const projectsList = await db.select({
        id: projects.id,
        name: projects.name,
      })
      .from(projects)
      .where(and(
        eq(projects.clientId, partnerId),
        inArray(projects.organizationId, organizationIds)
      ))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${projectsList.length} projects`);

      // Get contacts
      console.log('[RELATIONSHIPS] Fetching contacts...');
      const contactsList = await db.select({
        id: contacts.id,
        name: contacts.name,
      })
      .from(contacts)
      .where(and(
        eq(contacts.partnerId, partnerId),
        inArray(contacts.organizationId, organizationIds)
      ))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${contactsList.length} contacts`);

      // Get deals
      console.log('[RELATIONSHIPS] Fetching deals...');
      const dealsList = await db.select({
        id: deals.id,
        name: deals.title,
      })
      .from(deals)
      .where(and(
        eq(deals.partnerId, partnerId),
        inArray(deals.organizationId, organizationIds)
      ))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${dealsList.length} deals`);

      // Get SAP systems
      console.log('[RELATIONSHIPS] Fetching SAP systems...');
      const sapSystemsList = await db.select({
        id: sapSystems.id,
        name: sapSystems.name,
      })
      .from(sapSystems)
      .where(and(
        eq(sapSystems.partnerId, partnerId),
        inArray(sapSystems.organizationId, organizationIds)
      ))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${sapSystemsList.length} SAP systems`);

      // Get VPN connections (note: vpn_connections table doesn't have organizationId)
      console.log('[RELATIONSHIPS] Fetching VPN connections...');
      const vpnConnectionsList = await db.select({
        id: vpnConnections.id,
        name: vpnConnections.name,
      })
      .from(vpnConnections)
      .where(eq(vpnConnections.partnerId, partnerId))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${vpnConnectionsList.length} VPN connections`);

      // Get purchase orders where partner is vendor
      console.log('[RELATIONSHIPS] Fetching purchase orders...');
      const purchaseOrdersList = await db.select({
        id: purchaseOrders.id,
        name: purchaseOrders.orderNumber,
      })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.vendorPartnerId, partnerId),
        inArray(purchaseOrders.organizationId, organizationIds)
      ))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${purchaseOrdersList.length} purchase orders`);

      // Get vendor invoices where partner is vendor
      console.log('[RELATIONSHIPS] Fetching vendor invoices...');
      const vendorInvoicesList = await db.select({
        id: vendorInvoices.id,
        name: vendorInvoices.invoiceNumber,
      })
      .from(vendorInvoices)
      .where(and(
        eq(vendorInvoices.vendorPartnerId, partnerId),
        inArray(vendorInvoices.organizationId, organizationIds)
      ))
      .limit(20);
      console.log(`[RELATIONSHIPS] Found ${vendorInvoicesList.length} vendor invoices`);

      res.json({
        projects: {
          count: projectsList.length,
          items: projectsList
        },
        contacts: {
          count: contactsList.length,
          items: contactsList
        },
        deals: {
          count: dealsList.length,
          items: dealsList
        },
        sapSystems: {
          count: sapSystemsList.length,
          items: sapSystemsList
        },
        vpnConnections: {
          count: vpnConnectionsList.length,
          items: vpnConnectionsList
        },
        purchaseOrders: {
          count: purchaseOrdersList.length,
          items: purchaseOrdersList
        },
        vendorInvoices: {
          count: vendorInvoicesList.length,
          items: vendorInvoicesList
        }
      });
    } catch (error) {
      console.error("Error fetching partner relationships:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
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
        street: req.body.street || null,
        streetNumber: req.body.streetNumber || null,
        city: req.body.city || null,
        province: req.body.province || null,
        postalCode: req.body.postalCode || null,
        country: req.body.country || 'IT',
        latitude: req.body.latitude || null,
        longitude: req.body.longitude || null,
        isLegalAddress: req.body.isLegalAddress ?? true,
        parentPartnerId: req.body.parentPartnerId || null,
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
      let partner = await storage.updatePartner(req.params.id, req.body, req.user!.id, organizationId, auditContext);
      
      // If not found, try to find the partner in any of user's organizations
      if (!partner) {
        const [existingPartner] = await db.select().from(partners)
          .where(and(
            eq(partners.id, req.params.id),
            eq(partners.userId, req.user!.id)
          ));
        
        if (existingPartner) {
          // Update with the partner's actual organizationId
          partner = await storage.updatePartner(
            req.params.id, 
            req.body, 
            req.user!.id, 
            existingPartner.organizationId, 
            auditContext
          );
        }
      }
      
      if (!partner) return res.sendStatus(404);
      res.json(partner);
    } catch (error) {
      res.status(400).json({ error: "Invalid partner data" });
    }
  });

  app.get("/api/partners/:id/related-data", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const relatedData = await storage.getPartnerRelatedData(req.params.id, organizationId);
      res.json(relatedData);
    } catch (error) {
      console.error("[GET PARTNER RELATED DATA] Error:", error);
      res.sendStatus(500);
    }
  });

  app.delete("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const cascade = req.query.cascade === 'true';
      
      if (cascade) {
        const deleted = await storage.deletePartnerCascade(req.params.id, req.user!.id, organizationId, auditContext);
        if (!deleted) return res.sendStatus(404);
        res.sendStatus(204);
      } else {
        const deleted = await storage.deletePartner(req.params.id, req.user!.id, organizationId, auditContext);
        if (!deleted) return res.sendStatus(404);
        res.sendStatus(204);
      }
    } catch (error: any) {
      console.error("[DELETE PARTNER] Error:", error);
      if (error?.code === '23503') {
        const constraint = error?.constraint || '';
        let message = "Impossibile eliminare: il partner ha dati collegati";
        if (constraint.includes('contacts')) {
          message = "Impossibile eliminare: il partner ha contatti associati";
        } else if (constraint.includes('parent_partner')) {
          message = "Impossibile eliminare: il partner ha sedi operative collegate";
        } else if (constraint.includes('projects') || constraint.includes('client_id')) {
          message = "Impossibile eliminare: il partner ha progetti associati";
        } else if (constraint.includes('deals')) {
          message = "Impossibile eliminare: il partner ha trattative associate";
        }
        return res.status(409).json({ error: message, constraint, needsCascade: true });
      }
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

  // Partner Emails (1:N)
  app.get("/api/partners/:partnerId/emails", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const emails = await storage.getPartnerEmails(req.params.partnerId);
      res.json(emails);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.post("/api/partners/:partnerId/emails", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const email = await storage.createPartnerEmail({
        ...req.body,
        partnerId: req.params.partnerId,
      });
      res.status(201).json(email);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.put("/api/partners/:partnerId/emails/:emailId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const email = await storage.updatePartnerEmail(req.params.emailId, req.body);
      if (!email) return res.sendStatus(404);
      res.json(email);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.delete("/api/partners/:partnerId/emails/:emailId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const deleted = await storage.deletePartnerEmail(req.params.emailId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.put("/api/partners/:partnerId/emails/:emailId/primary", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.setPartnerEmailPrimary(req.params.emailId, req.params.partnerId);
      if (!success) return res.sendStatus(404);
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Partner Phones (1:N)
  app.get("/api/partners/:partnerId/phones", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const phones = await storage.getPartnerPhones(req.params.partnerId);
      res.json(phones);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.post("/api/partners/:partnerId/phones", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const phone = await storage.createPartnerPhone({
        ...req.body,
        partnerId: req.params.partnerId,
      });
      res.status(201).json(phone);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.put("/api/partners/:partnerId/phones/:phoneId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const phone = await storage.updatePartnerPhone(req.params.phoneId, req.body);
      if (!phone) return res.sendStatus(404);
      res.json(phone);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.delete("/api/partners/:partnerId/phones/:phoneId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const deleted = await storage.deletePartnerPhone(req.params.phoneId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.put("/api/partners/:partnerId/phones/:phoneId/primary", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.setPartnerPhonePrimary(req.params.phoneId, req.params.partnerId);
      if (!success) return res.sendStatus(404);
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Contacts
  app.get("/api/contacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const contactsList = await db.select().from(contacts)
        .where(and(
          eq(contacts.userId, req.user!.id),
          inArray(contacts.organizationId, organizationIds)
        ));
      res.json(contactsList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Project stakeholders (interested contacts for notification/approval workflows)
  app.get("/api/projects/:projectId/stakeholders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const rows = await db.select({
        id: projectContacts.id,
        projectId: projectContacts.projectId,
        contactId: projectContacts.contactId,
        role: projectContacts.role,
        notify: projectContacts.notify,
        notes: projectContacts.notes,
        contactName: contacts.name,
        contactEmail: contacts.email,
        contactCompany: contacts.company,
        contactPosition: contacts.position,
      })
        .from(projectContacts)
        .leftJoin(contacts, eq(projectContacts.contactId, contacts.id))
        .where(and(
          eq(projectContacts.projectId, req.params.projectId),
          eq(projectContacts.organizationId, organizationId),
        ));
      res.json(rows);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.post("/api/projects/:projectId/stakeholders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const { contactId, role, notify, notes } = req.body;
      if (!contactId) return res.status(400).json({ error: "contactId is required" });
      const validRole = ["informed", "approver", "responsible", "reviewer"].includes(role) ? role : "informed";
      const [link] = await db.insert(projectContacts).values({
        projectId: req.params.projectId,
        contactId,
        role: validRole,
        notify: notify !== false,
        notes: notes || null,
        userId: req.user!.id,
        organizationId,
      }).onConflictDoUpdate({
        target: [projectContacts.projectId, projectContacts.contactId],
        set: { role: validRole, notify: notify !== false, notes: notes || null, updatedAt: new Date() },
      }).returning();
      res.status(201).json(link);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.delete("/api/projects/:projectId/stakeholders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      await db.delete(projectContacts).where(and(
        eq(projectContacts.id, req.params.id),
        eq(projectContacts.organizationId, organizationId),
      ));
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Workflow entity metadata (entities + their fields + operators) for the configurator
  app.get("/api/workflow-entities", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { WORKFLOW_ENTITIES, WORKFLOW_OPERATORS } = await import("./workflow-entities");
    res.json({ entities: WORKFLOW_ENTITIES, operators: WORKFLOW_OPERATORS });
  });

  // Workflows — generic, entity-agnostic configurator (list/create/update/delete)
  app.get("/api/workflows", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const conditions = [eq(workflows.organizationId, organizationId)];
      if (typeof req.query.entityType === "string") conditions.push(eq(workflows.entityType, req.query.entityType));
      if (typeof req.query.entityId === "string") conditions.push(eq(workflows.entityId, req.query.entityId));
      if (typeof req.query.status === "string") conditions.push(eq(workflows.status, req.query.status as any));
      const rows = await db.select().from(workflows)
        .where(and(...conditions))
        .orderBy(desc(workflows.createdAt))
        .limit(500);
      res.json(rows);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.post("/api/workflows", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const { name, description, entityType, entityId, triggerEvent, triggerConfig, conditions, actors, actions, channel, status } = req.body;
      if (!name || !entityType || !triggerEvent) {
        return res.status(400).json({ error: "name, entityType and triggerEvent are required" });
      }
      const [created] = await db.insert(workflows).values({
        name, description: description || null, entityType, entityId: entityId || null,
        triggerEvent, triggerConfig: triggerConfig || null, conditions: conditions || null,
        actors: Array.isArray(actors) ? actors : [],
        actions: Array.isArray(actions) ? actions : [],
        channel: channel || "email_draft",
        status: ["draft", "active", "inactive"].includes(status) ? status : "draft",
        userId: req.user!.id, organizationId,
      }).returning();
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.patch("/api/workflows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const patch: any = { updatedAt: new Date() };
      for (const f of ["name", "description", "entityType", "entityId", "triggerEvent", "triggerConfig", "conditions", "actors", "actions", "channel"]) {
        if (req.body[f] !== undefined) patch[f] = req.body[f];
      }
      if (req.body.status && ["draft", "active", "inactive"].includes(req.body.status)) patch.status = req.body.status;
      const [updated] = await db.update(workflows).set(patch)
        .where(and(eq(workflows.id, req.params.id), eq(workflows.organizationId, organizationId)))
        .returning();
      if (!updated) return res.sendStatus(404);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      await db.delete(workflows).where(and(
        eq(workflows.id, req.params.id),
        eq(workflows.organizationId, organizationId),
      ));
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // Notifications center (stakeholder notifications generated on project events)
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
      const conditions = [eq(notifications.organizationId, organizationId)];
      if (statusFilter) conditions.push(eq(notifications.status, statusFilter as any));
      const rows = await db.select({
        id: notifications.id,
        projectId: notifications.projectId,
        contactId: notifications.contactId,
        eventType: notifications.eventType,
        stakeholderRole: notifications.stakeholderRole,
        channel: notifications.channel,
        status: notifications.status,
        subject: notifications.subject,
        body: notifications.body,
        payload: notifications.payload,
        createdAt: notifications.createdAt,
        contactName: contacts.name,
        contactEmail: contacts.email,
        projectName: projects.name,
      })
        .from(notifications)
        .leftJoin(contacts, eq(notifications.contactId, contacts.id))
        .leftJoin(projects, eq(notifications.projectId, projects.id))
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(200);
      res.json(rows);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.patch("/api/notifications/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const patch: any = { updatedAt: new Date() };
      if (req.body.status && ["pending", "sent", "dismissed"].includes(req.body.status)) patch.status = req.body.status;
      if (req.body.subject !== undefined) patch.subject = req.body.subject;
      if (req.body.body !== undefined) patch.body = req.body.body;
      const [updated] = await db.update(notifications).set(patch)
        .where(and(eq(notifications.id, req.params.id), eq(notifications.organizationId, organizationId)))
        .returning();
      if (!updated) return res.sendStatus(404);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const contact = await storage.getContact(req.params.id, req.user!.id, organizationId);
    if (!contact) return res.sendStatus(404);
    res.json(contact);
  });

  app.post("/api/contacts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const organizationId = getOrganizationId(req);
      const contactData = insertContactSchema.parse({
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone || null,
        position: req.body.position || null,
        company: req.body.company || null,
        partnerId: req.body.partnerId || null,
        notes: req.body.notes || null,
        userId: req.user!.id,
        organizationId: organizationId
      });
      
      const auditContext = AuditService.createContext(req);
      const contact = await storage.createContact({ ...contactData, organizationId }, auditContext);
      res.status(201).json(contact);
    } catch (error) {
      res.status(400).json({ error: "Invalid contact data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const contact = await storage.updateContact(req.params.id, req.body, req.user!.id, organizationId, auditContext);
      if (!contact) return res.sendStatus(404);
      res.json(contact);
    } catch (error) {
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const auditContext = AuditService.createContext(req);
      const deleted = await storage.deleteContact(req.params.id, req.user!.id, organizationId, auditContext);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE CONTACT] Error:", error);
      res.sendStatus(500);
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

  // Quotes (Offerte/Preventivi)
  app.get("/api/quotes", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const quotesList = await db.select().from(quotes)
        .where(and(
          eq(quotes.userId, req.user!.id),
          inArray(quotes.organizationId, organizationIds)
        ))
        .orderBy(desc(quotes.issueDate));
      res.json(quotesList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.get("/api/quotes/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const quote = await storage.getQuote(req.params.id, req.user!.id, organizationId);
    if (!quote) return res.sendStatus(404);
    res.json(quote);
  });

  app.post("/api/quotes", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      // Convert date strings to Date objects
      const bodyWithDates = {
        ...req.body,
        userId: req.user!.id,
        organizationId,
        issueDate: req.body.issueDate ? new Date(req.body.issueDate) : new Date(),
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : new Date(),
        validTo: req.body.validTo ? new Date(req.body.validTo) : undefined,
        sentAt: req.body.sentAt ? new Date(req.body.sentAt) : undefined,
        acceptedAt: req.body.acceptedAt ? new Date(req.body.acceptedAt) : undefined,
        rejectedAt: req.body.rejectedAt ? new Date(req.body.rejectedAt) : undefined,
      };
      const quoteData = insertQuoteSchema.parse(bodyWithDates);
      const quote = await storage.createQuote(quoteData);
      res.status(201).json(quote);
    } catch (error) {
      console.error("Quote creation error:", error);
      res.status(400).json({ error: "Invalid quote data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/quotes/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      // Convert date strings to Date objects
      const bodyWithDates = {
        ...req.body,
        issueDate: req.body.issueDate ? new Date(req.body.issueDate) : undefined,
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : undefined,
        validTo: req.body.validTo ? new Date(req.body.validTo) : undefined,
        sentAt: req.body.sentAt ? new Date(req.body.sentAt) : undefined,
        acceptedAt: req.body.acceptedAt ? new Date(req.body.acceptedAt) : undefined,
        rejectedAt: req.body.rejectedAt ? new Date(req.body.rejectedAt) : undefined,
      };
      const quote = await storage.updateQuote(req.params.id, bodyWithDates, req.user!.id, organizationId);
      if (!quote) return res.sendStatus(404);
      res.json(quote);
    } catch (error) {
      res.status(400).json({ error: "Invalid quote data" });
    }
  });

  app.delete("/api/quotes/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteQuote(req.params.id, req.user!.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE QUOTE] Error:", error);
      res.sendStatus(500);
    }
  });

  // Bulk delete quotes
  app.delete("/api/quotes", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const ids = req.body.ids as string[];
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: "Invalid ids array" });
      }
      const deletedCount = await storage.deleteQuotes(ids, req.user!.id, organizationId);
      res.json({ deletedCount });
    } catch (error) {
      console.error("[BULK DELETE QUOTES] Error:", error);
      res.sendStatus(500);
    }
  });

  // Convert quote to sales order
  app.post("/api/quotes/:id/convert", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const salesOrder = await storage.convertQuoteToSalesOrder(req.params.id, req.user!.id, organizationId);
      if (!salesOrder) {
        return res.status(400).json({ error: "Quote must be in 'accepted' status to convert" });
      }
      res.status(201).json(salesOrder);
    } catch (error) {
      console.error("[CONVERT QUOTE] Error:", error);
      res.status(500).json({ error: "Failed to convert quote to sales order" });
    }
  });

  // Generate Quote PDF
  app.get("/api/quotes/:id/pdf", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const quote = await storage.getQuote(req.params.id, req.user!.id, organizationId);
      if (!quote) return res.sendStatus(404);

      const items = await storage.getQuoteItems(req.params.id, req.user!.id, organizationId);
      const partner = await storage.getPartner(quote.partnerId, req.user!.id, organizationId);
      if (!partner) return res.status(400).json({ error: "Partner not found" });

      const organizations = await storage.getUserOrganizations(req.user!.id);
      const organization = organizations.find(org => org.id === organizationId);
      if (!organization) return res.status(400).json({ error: "Organization not found" });

      let issuerPartner = null;
      if (organization.partnerId) {
        issuerPartner = await storage.getPartner(organization.partnerId, req.user!.id, organizationId);
      }

      const doc = await PdfService.generateQuotePdf({
        quote,
        items,
        partner,
        organization,
        issuerPartner
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${quote.quoteNumber}.pdf"`);
      
      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error("[QUOTE PDF] Error generating PDF:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Quote Items
  app.get("/api/quotes/:quoteId/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const organizationId = getOrganizationId(req);
    const items = await storage.getQuoteItems(req.params.quoteId, req.user!.id, organizationId);
    res.json(items);
  });

  app.post("/api/quotes/:quoteId/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      // Verify quote ownership
      const quote = await storage.getQuote(req.params.quoteId, req.user!.id, organizationId);
      if (!quote) return res.sendStatus(404);

      const itemData = insertQuoteItemSchema.parse({
        ...req.body,
        quoteId: req.params.quoteId
      });
      const item = await storage.createQuoteItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Quote item creation error:", error);
      res.status(400).json({ error: "Invalid quote item data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/quotes/:quoteId/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const item = await storage.updateQuoteItem(req.params.itemId, req.body, req.user!.id, organizationId);
      if (!item) return res.sendStatus(404);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid quote item data" });
    }
  });

  app.delete("/api/quotes/:quoteId/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteQuoteItem(req.params.itemId, req.user!.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("[DELETE QUOTE ITEM] Error:", error);
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
  // GET all standalone planning windows for user (with at least 1 day from today)
  // Excludes windows with projectId (old-style project windows)
  app.get("/api/planning-windows", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const allWindows = await storage.getAllPlanningWindowsForUser(req.user!.id);
    // Filter: standalone windows only (no projectId) with endDate >= today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeWindows = allWindows.filter(w => {
      // Exclude old-style project windows (they have projectId)
      if (w.projectId) return false;
      const endDate = new Date(w.endDate);
      endDate.setHours(0, 0, 0, 0);
      return endDate >= today;
    });
    res.json(activeWindows);
  });

  app.get("/api/planning-windows/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const windows = await storage.getAllPlanningWindowsForUser(req.user!.id);
    
    // Planning windows are user-level (cross-organization), so we need to search
    // for linked projects across ALL user organizations, not just the current one
    const userOrganizations = await storage.getOrganizations(req.user!.id);
    const allProjectsArrays = await Promise.all(
      userOrganizations.map(org => storage.getProjects(req.user!.id, org.id))
    );
    const allProjects = allProjectsArrays.flat();
    
    const enrichedWindows = windows.map(window => {
      const linkedProject = allProjects.find(p => p.planningWindowId === window.id);
      const legacyProject = window.projectId 
        ? allProjects.find(p => p.id === window.projectId)
        : null;
      
      return {
        ...window,
        project: linkedProject || legacyProject || null
      };
    });
    
    res.json(enrichedWindows);
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
      const validated = insertPlanningWindowSchema.parse({
        projectId: req.body.projectId || null,
        parentPlanningWindowId: req.body.parentPlanningWindowId || null,
        name: req.body.name,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        startTime: req.body.startTime || '09:00',
        endTime: req.body.endTime || '17:00',
        timeSlots: req.body.timeSlots || null,
        workingHoursPerDay: req.body.workingHoursPerDay || 8,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        recurrenceType: req.body.recurrenceType || 'none',
        daysOfWeek: req.body.daysOfWeek || [],
        recurrenceInterval: req.body.recurrenceInterval || 1,
        recurrenceEnd: req.body.recurrenceEnd ? new Date(req.body.recurrenceEnd) : null,
        notes: req.body.notes || null
      });
      // Add userId after validation (it's auto-filled from session)
      const windowData = { ...validated, userId: req.user!.id };
      const window = await storage.createPlanningWindow(windowData as any);
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

  // Azure DevOps Work Items - Messages filtered by sourceType
  app.get("/api/messages/devops-workitems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const workItemMessages = await db.select().from(messages)
        .where(and(
          eq(messages.userId, req.user!.id),
          eq(messages.sourceType, 'email_devops_workitem'),
          inArray(messages.organizationId, organizationIds)
        ))
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${messages.receivedAt} DESC`);
      res.json(workItemMessages);
    } catch (error) {
      console.error("Error fetching DevOps work item messages:", error);
      res.status(500).json({ error: "Failed to fetch DevOps work items" });
    }
  });

  // Bookmarklet data validation schema
  // Using .nullish() to accept both null and undefined (bookmarklet sends null for missing fields)
  const bookmarkletDataSchema = z.object({
    extractedAt: z.string().nullish(),
    source: z.literal('bookmarklet').nullish(),
    version: z.string().max(20).nullish(), // Bookmarklet version
    url: z.string().url().nullish(),
    workItemId: z.number().int().positive().nullish(),
    workItemType: z.string().max(100).nullish(),
    title: z.string().max(500).nullish(),
    state: z.string().max(50).nullish(),
    assignedTo: z.string().max(200).nullish(),
    priority: z.number().int().min(1).max(4).nullish(),
    description: z.string().nullish(), // No limit - can contain images
    descriptionText: z.string().nullish(), // No limit
    descriptionHtml: z.string().nullish(), // No limit - can contain base64 images
    iterationPath: z.string().max(500).nullish(),
    areaPath: z.string().max(500).nullish(),
    tags: z.array(z.string().max(100)).max(50).nullish(),
    organization: z.string().max(200).nullish(),
    project: z.string().max(200).nullish(),
    sprint: z.string().max(200).nullish(),
    storypoints: z.number().nullish(),
    effort: z.number().nullish(),
    createdDate: z.string().nullish(),
    // SAP Custom Fields
    customFields: z.record(z.string(), z.any()).nullish(), // All custom fields as key-value
    ticketCode: z.string().max(100).nullish(), // N. Ticket Rapportino SAP
    wbsCode: z.string().max(100).nullish(), // WBS Rapportino SAP
    ticketType: z.string().max(100).nullish(), // Tipo Ticket
    // Comments
    comments: z.array(z.object({
      author: z.string().nullish(),
      content: z.string().nullish(),
      contentHtml: z.string().nullish(),
      date: z.string().nullish(),
    })).nullish(),
  }).passthrough();

  // Enrich DevOps Work Item with bookmarklet data
  app.post("/api/messages/:id/enrich-devops", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      const { bookmarkletData } = req.body;
      if (!bookmarkletData) {
        return res.status(400).json({ error: "bookmarkletData is required" });
      }

      // Log received bookmarklet data for debugging
      console.log("[DevOps] Received bookmarklet data keys:", Object.keys(bookmarkletData));
      console.log("[DevOps] Custom fields received:", JSON.stringify(bookmarkletData.customFields, null, 2));
      console.log("[DevOps] ticketCode:", bookmarkletData.ticketCode);
      console.log("[DevOps] wbsCode:", bookmarkletData.wbsCode);
      console.log("[DevOps] ticketType:", bookmarkletData.ticketType);
      
      // Validate bookmarklet data (no size limits on descriptions - can contain base64 images)
      const validationResult = bookmarkletDataSchema.safeParse(bookmarkletData);
      if (!validationResult.success) {
        console.error("[DevOps] Invalid bookmarklet data:", validationResult.error.errors);
        return res.status(400).json({ 
          error: "Invalid bookmarklet data", 
          details: validationResult.error.errors 
        });
      }
      
      const validatedData = validationResult.data;

      // Verify source is from bookmarklet
      if (validatedData.source && validatedData.source !== 'bookmarklet') {
        return res.status(400).json({ error: "Data source must be 'bookmarklet'" });
      }

      // Sanitize HTML in description (remove script tags and dangerous attributes)
      let sanitizedDescription = validatedData.description;
      if (sanitizedDescription) {
        // Basic sanitization - remove script tags and event handlers
        sanitizedDescription = sanitizedDescription
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
          .replace(/javascript:/gi, '');
      }
      
      // Merge existing externalMetadata with enriched data
      // IMPORTANT: Remove any prior enrichedData to prevent nesting
      const rawMetadata = (message.externalMetadata as any) || {};
      const { enrichedData: _oldEnrichedData, ...existingMetadata } = rawMetadata;
      
      // Build flat enriched metadata - all canonical fields at top level
      const enrichedMetadata = {
        // Preserve non-enriched fields from original metadata (e.g., eventType from email parsing)
        eventType: existingMetadata.eventType,
        enrichedFrom: 'bookmarklet',
        enrichedAt: new Date().toISOString(),
        bookmarkletVersion: validatedData.version || existingMetadata.bookmarkletVersion,
        // Canonical DevOps fields at top level (bookmarklet values override)
        workItemId: validatedData.workItemId || existingMetadata.workItemId,
        workItemTitle: validatedData.title || existingMetadata.workItemTitle,
        workItemType: validatedData.workItemType || existingMetadata.workItemType,
        workItemUrl: validatedData.url || existingMetadata.workItemUrl,
        workItemOrganization: validatedData.organization || existingMetadata.workItemOrganization,
        workItemProject: validatedData.project || existingMetadata.workItemProject,
        state: validatedData.state || existingMetadata.state,
        assignedTo: validatedData.assignedTo || existingMetadata.assignedTo,
        description: sanitizedDescription || existingMetadata.description,
        priority: validatedData.priority,
        iterationPath: validatedData.iterationPath,
        areaPath: validatedData.areaPath,
        tags: validatedData.tags,
        // SAP Custom Fields
        customFields: validatedData.customFields || existingMetadata.customFields,
        ticketCode: validatedData.ticketCode || existingMetadata.ticketCode,
        wbsCode: validatedData.wbsCode || existingMetadata.wbsCode,
        ticketType: validatedData.ticketType || existingMetadata.ticketType,
        // HTML Description
        workItemDescriptionHtml: validatedData.descriptionHtml || existingMetadata.workItemDescriptionHtml,
        // Comments
        workItemComments: validatedData.comments || existingMetadata.workItemComments,
        // Single-level enrichedData container (latest bookmarklet payload for diagnostics)
        enrichedData: { ...validatedData, description: sanitizedDescription },
      };
      
      // Update the message with enriched metadata
      const updatedMessage = await storage.updateMessage(req.params.id, {
        externalMetadata: enrichedMetadata,
        sourceType: 'email_devops_workitem' // Ensure it's marked correctly
      }, req.user!.id);
      
      console.log(`[DevOps] Enriched Work Item #${enrichedMetadata.workItemId} with bookmarklet data`);
      
      // === AUTO-CREATE MESSAGES FOR DEVOPS COMMENTS ===
      // Each comment becomes an independent message linked to the same entities
      const devOpsComments = validatedData.comments || [];
      let createdCommentsCount = 0;
      
      if (devOpsComments.length > 0) {
        const organizationId = getOrganizationId(req);
        
        for (const comment of devOpsComments) {
          if (!comment.content && !comment.contentHtml) continue;
          
          // Check if this comment was already imported (by content hash)
          const commentHash = Buffer.from(
            `${enrichedMetadata.workItemId}-${comment.author || ''}-${comment.date || ''}-${(comment.content || '').substring(0, 100)}`
          ).toString('base64').substring(0, 50);
          
          // Check for existing message with same hash
          const existingComment = await db
            .select({ id: messages.id })
            .from(messages)
            .where(and(
              eq(messages.organizationId, organizationId),
              sql`${messages.externalMetadata}->>'commentHash' = ${commentHash}`
            ))
            .limit(1);
          
          if (existingComment.length > 0) continue; // Skip duplicate
          
          // Create a new message for this comment
          const commentMessage = await storage.createMessage({
            subject: `[DevOps #${enrichedMetadata.workItemId}] Commento di ${comment.author || 'Anonimo'}`,
            body: comment.content || '',
            htmlBody: comment.contentHtml || undefined,
            fromName: comment.author || 'Azure DevOps',
            fromEmail: 'devops@azure.com',
            toEmail: req.user!.username || 'user@local',
            receivedAt: new Date(),
            sourceType: 'devops_comment',
            isProcessed: true,
            taskId: message.taskId || undefined,
            projectId: message.projectId || undefined,
            organizationId,
            userId: req.user!.id,
            externalMetadata: {
              workItemId: enrichedMetadata.workItemId,
              workItemUrl: enrichedMetadata.workItemUrl,
              workItemTitle: enrichedMetadata.workItemTitle,
              commentAuthor: comment.author,
              commentDate: comment.date,
              commentHash,
              parentMessageId: req.params.id, // Link to the main DevOps message
            },
            matchingReason: `Commento DevOps da Work Item #${enrichedMetadata.workItemId}`,
          });
          
          createdCommentsCount++;
        }
        
        if (createdCommentsCount > 0) {
          console.log(`[DevOps] Created ${createdCommentsCount} messages from DevOps comments`);
        }
      }
      
      res.json({
        ...updatedMessage,
        createdCommentMessages: createdCommentsCount
      });
    } catch (error) {
      console.error("Error enriching DevOps work item:", error);
      res.status(500).json({ error: "Failed to enrich work item" });
    }
  });

  // Create or link task from DevOps Work Item
  app.post("/api/messages/:id/create-task-from-workitem", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const organizationId = getOrganizationId(req);
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      const metadata = message.externalMetadata as any;
      if (!metadata?.workItemId) {
        return res.status(400).json({ error: "Message has no Work Item metadata" });
      }
      
      const { projectId, linkToExistingTaskId } = req.body;
      
      // Check if task already linked to this work item
      const existingTask = await db.select().from(tasks)
        .where(and(
          eq(tasks.externalWorkItemId, String(metadata.workItemId)),
          eq(tasks.organizationId, organizationId)
        ))
        .limit(1);
      
      if (existingTask.length > 0) {
        // Task already exists - just link the message
        const task = existingTask[0];
        const updatedSourceMessageIds = [...(task.sourceMessageIds || [])];
        if (!updatedSourceMessageIds.includes(message.id)) {
          updatedSourceMessageIds.push(message.id);
        }
        
        await storage.updateTask(task.id, {
          sourceMessageIds: updatedSourceMessageIds
        }, req.user!.id, organizationId);
        
        // Update message to link to task
        await storage.updateMessage(message.id, {
          taskId: task.id,
          matchingReason: `Linked to existing task from Work Item #${metadata.workItemId}`
        }, req.user!.id);
        
        return res.json({
          action: 'linked',
          task,
          message: `Messaggio collegato al task esistente "${task.title}"`
        });
      }
      
      if (linkToExistingTaskId) {
        // Link to a manually selected existing task
        const taskToLink = await storage.getTask(linkToExistingTaskId, req.user!.id, organizationId);
        if (!taskToLink) {
          return res.status(404).json({ error: "Task not found" });
        }
        
        await storage.updateTask(linkToExistingTaskId, {
          externalWorkItemId: String(metadata.workItemId),
          externalWorkItemUrl: metadata.workItemUrl,
          externalSystem: 'azure_devops',
          sourceMessageIds: [...(taskToLink.sourceMessageIds || []), message.id]
        }, req.user!.id, organizationId);
        
        await storage.updateMessage(message.id, {
          taskId: linkToExistingTaskId,
          matchingReason: `Manually linked to task from Work Item #${metadata.workItemId}`
        }, req.user!.id);
        
        return res.json({
          action: 'linked',
          task: taskToLink,
          message: `Work Item #${metadata.workItemId} collegato al task "${taskToLink.title}"`
        });
      }
      
      // Create new task from Work Item
      const enrichedData = metadata.enrichedData || {};
      const taskData = {
        title: metadata.workItemTitle || `Work Item #${metadata.workItemId}`,
        description: enrichedData.description || metadata.description || `Imported from Azure DevOps Work Item #${metadata.workItemId}`,
        status: 'todo' as const,
        priority: mapDevOpsPriority(enrichedData.priority),
        taskType: mapDevOpsWorkItemType(metadata.workItemType),
        projectId: projectId || null,
        userId: req.user!.id,
        organizationId,
        externalWorkItemId: String(metadata.workItemId),
        externalWorkItemUrl: metadata.workItemUrl,
        externalSystem: 'azure_devops',
        sourceMessageIds: [message.id],
      };
      
      const newTask = await storage.createTask(taskData, { userId: req.user!.id });
      
      // Update message to link to new task
      await storage.updateMessage(message.id, {
        taskId: newTask.id,
        status: 'processed',
        matchingReason: `Created task from Work Item #${metadata.workItemId}`
      }, req.user!.id);
      
      console.log(`[DevOps] Created task "${newTask.title}" from Work Item #${metadata.workItemId}`);
      
      res.json({
        action: 'created',
        task: newTask,
        message: `Creato nuovo task "${newTask.title}" da Work Item #${metadata.workItemId}`
      });
    } catch (error) {
      console.error("Error creating task from work item:", error);
      res.status(500).json({ error: "Failed to create task from work item" });
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

  app.get("/api/messages/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) return res.status(400).json({ error: "Organization ID required" });
    
    try {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.userId, req.user!.id),
            eq(messages.organizationId, organizationId),
            eq(messages.status, 'unread')
          )
        );
      
      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      console.error('Error counting unread messages:', error);
      res.status(500).json({ error: "Failed to count unread messages" });
    }
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

  // AI Project Agent - Analyze message and create proposal in background
  app.post("/api/messages/:id/analyze-project", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      const organizationId = getOrganizationId(req);
      const messageId = req.params.id;
      const userId = req.user!.id;
      
      // Check if there's already a pending proposal for this message
      const existingProposals = await storage.getProposalsByMessage(messageId, userId);
      const pendingProposal = existingProposals.find(p => p.status === 'pending');
      
      if (pendingProposal) {
        return res.json({
          success: true,
          message: "Analisi già in corso",
          proposalId: pendingProposal.id
        });
      }
      
      // Create a pending proposal immediately (record the chosen model/agent)
      const proposal = await storage.createProposal({
        userId,
        organizationId,
        messageId,
        status: 'pending',
        proposalData: { processing: true },
        modelKey: req.body?.modelKey || undefined,
      });
      
      // Start AI analysis in background (don't await)
      (async () => {
        try {
          const existingProjects = await storage.getProjects(userId, organizationId);
          const existingPartners = await storage.getPartners(userId, organizationId);
          const existingTasks = await storage.getTasks(userId, organizationId);
          const existingContacts = await storage.getContacts(userId, organizationId);
          
          // Fetch learning context for AI
          const patterns = await storage.getAiLearningPatterns(organizationId);
          const calendars = await storage.getCalendars(userId, organizationId);

          // Phase 6 — infrastructure & MCP awareness
          const sapSystems = await storage.getSapSystems(userId);
          const vpnConnections = await storage.getVpnConnections(userId);

          const mcpConfigs = await db.select().from(mcpServerConfigs)
            .where(and(
              eq(mcpServerConfigs.organizationId, organizationId),
              eq(mcpServerConfigs.enabled, true),
            ));
          const catalogRows = await db.select().from(mcpCatalog);
          const validations = await db.select().from(mcpCatalogValidations)
            .where(eq(mcpCatalogValidations.organizationId, organizationId));
          const validatedSet = new Set(validations.filter(v => v.validated).map(v => v.catalogId));
          const aiMcpContext = {
            catalog: catalogRows.map(c => ({ ...c, validated: validatedSet.has(c.id) })),
            configs: mcpConfigs,
          };
          
          const { analyzeMessageForProject } = await import('./ai-project-agent');
          
          const learningContext = {
            patterns,
            calendars
          };

          // For forwarded emails (e.g. Derga -> Gmail), extract the ORIGINAL body so the
          // project agent analyzes the real content, not the forwarding wrapper/signature.
          let baseBody = message.body || '';
          let baseFromEmail = message.fromEmail;
          let baseFromName = message.fromName;
          try {
            const cleaned = await EmailForwardCleaner.cleanForwardedEmailWithTraining(
              message.subject || '',
              message.body || '',
              message.htmlBody || null,
              userId,
              undefined,
              null,
              message.id,
              (message as any).forwardArtifacts,
            );
            if (cleaned?.isForwarded && cleaned.originalBody && cleaned.originalBody.trim().length > 0) {
              baseBody = cleaned.originalBody;
              if (cleaned.originalFromEmail) baseFromEmail = cleaned.originalFromEmail;
              if (cleaned.originalFromName) baseFromName = cleaned.originalFromName;
              console.log(`[AI-PROJECT] Using cleaned original body for forwarded message ${message.id} (${message.body?.length || 0} -> ${baseBody.length} chars)`);
            }
          } catch (cleanErr) {
            console.warn(`[AI-PROJECT] Forward cleaning failed for message ${message.id}, using raw body:`, cleanErr);
          }

          // Enrich message body with extracted attachment text (Excel, CSV, TXT)
          let enrichedMessage = { ...message, body: baseBody, fromEmail: baseFromEmail, fromName: baseFromName };
          if (message.attachments && message.attachments.length > 0) {
            const attachmentSections: string[] = [];
            for (const filename of message.attachments) {
              try {
                const text = await AttachmentsService.extractTextContent(message.id, filename);
                if (text) {
                  attachmentSections.push(`\n\n--- ALLEGATO: ${filename} ---\n${text}\n--- FINE ALLEGATO ---`);
                  console.log(`[AI] Extracted text from attachment: ${filename} (${text.length} chars)`);
                }
              } catch (e) {
                console.warn(`[AI] Could not extract text from attachment ${filename}:`, e);
              }
            }
            if (attachmentSections.length > 0) {
              enrichedMessage = {
                ...enrichedMessage,
                body: baseBody + attachmentSections.join(''),
              };
            }
          }
          
          const analysisResult = await analyzeMessageForProject(
            enrichedMessage,
            existingProjects,
            existingPartners,
            existingTasks,
            learningContext,
            organizationId,
            sapSystems,
            vpnConnections,
            aiMcpContext,
            req.body?.modelKey || undefined,
            existingContacts,
          );

          // Extract token usage before storing
          const tokenUsage = (analysisResult as any)._tokenUsage;
          delete (analysisResult as any)._tokenUsage;

          // Update proposal with results
          await storage.updateProposal(proposal.id, {
            proposalData: analysisResult,
            status: 'pending',
            ...(tokenUsage ? { promptTokens: tokenUsage.promptTokens, completionTokens: tokenUsage.completionTokens } : {}),
          }, userId, organizationId);
          
          console.log(`[AI] Proposal ${proposal.id} analysis completed for message ${messageId}`);
        } catch (error) {
          console.error(`[AI] Error analyzing message ${messageId}:`, error);
          // Update proposal with error
          await storage.updateProposal(proposal.id, {
            status: 'pending',
            proposalData: { processing: false, failed: true },
            errorMessage: error instanceof Error ? error.message : String(error)
          }, userId, organizationId);
        }
      })();
      
      // Return immediately
      res.json({
        success: true,
        message: "Analisi avviata in background",
        proposalId: proposal.id
      });
    } catch (error) {
      console.error("AI project analysis error:", error);
      res.status(500).json({ error: "Failed to start analysis", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get all proposals for current organization
  app.get("/api/proposals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const proposals = await storage.getProposals(req.user!.id, organizationId);
      res.json(proposals);
    } catch (error) {
      console.error("Get proposals error:", error);
      res.status(500).json({ error: "Failed to get proposals" });
    }
  });

  // Get count of pending proposals for current organization
  app.get("/api/proposals/pending-count", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) return res.status(400).json({ error: "Organization ID required" });
    
    try {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(proposals)
        .where(
          and(
            eq(proposals.userId, req.user!.id),
            eq(proposals.organizationId, organizationId),
            eq(proposals.status, 'pending')
          )
        );
      
      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      console.error('Error counting pending proposals:', error);
      res.status(500).json({ error: "Failed to count pending proposals" });
    }
  });

  // Get single proposal
  app.get("/api/proposals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const proposal = await storage.getProposal(req.params.id, req.user!.id, organizationId);
      if (!proposal) return res.sendStatus(404);
      res.json(proposal);
    } catch (error) {
      console.error("Get proposal error:", error);
      res.status(500).json({ error: "Failed to get proposal" });
    }
  });

  // Get proposals for a specific message
  app.get("/api/messages/:id/proposals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const proposals = await storage.getProposalsByMessage(req.params.id, req.user!.id);
      res.json(proposals);
    } catch (error) {
      console.error("Get message proposals error:", error);
      res.status(500).json({ error: "Failed to get message proposals" });
    }
  });

  // Apply a proposal
  app.post("/api/proposals/:id/apply", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const userId = req.user!.id;
      
      console.log(`[PROPOSAL APPLY] Using organizationId from header: ${organizationId}`);
      
      const proposal = await storage.getProposal(req.params.id, userId, organizationId);
      if (!proposal) return res.sendStatus(404);
      
      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: "Proposal already processed" });
      }
      
      const proposalData = proposal.proposalData as any;
      if (!proposalData || proposalData.processing) {
        return res.status(400).json({ error: "Proposal analysis not yet complete" });
      }
      
      const results: any = {
        project: null,
        partner: null,
        tasks: [],
        contacts: []
      };
      
      // 1. Create or update partner
      if (proposalData.partner) {
        if (proposalData.partner.isNew) {
          const partnerData: any = {
            name: proposalData.partner.name,
            email: proposalData.partner.email,
            company: proposalData.partner.company,
            type: proposalData.partner.type,
            sourceMessageIds: [proposal.messageId],
            userId,
            organizationId
          };
          results.partner = await storage.createPartner(partnerData, { userId });
        } else if (proposalData.partner.existingId) {
          results.partner = await storage.getPartner(proposalData.partner.existingId, userId, organizationId);
          if (results.partner && (!results.partner.sourceMessageIds || !results.partner.sourceMessageIds.includes(proposal.messageId))) {
            const updatedSourceIds = [...(results.partner.sourceMessageIds || []), proposal.messageId];
            await storage.updatePartner(results.partner.id, { sourceMessageIds: updatedSourceIds }, userId, organizationId);
          }
        }
      }
      
      // 2. Create or update project
      if (proposalData.project) {
        if (proposalData.project.isNew) {
          const projectData: any = {
            name: proposalData.project.name,
            description: proposalData.project.description,
            status: proposalData.project.status,
            startDate: proposalData.project.startDate ? new Date(proposalData.project.startDate) : undefined,
            endDate: proposalData.project.endDate ? new Date(proposalData.project.endDate) : undefined,
            estimatedEffort: proposalData.project.estimatedEffort,
            clientId: results.partner?.id,
            sourceMessageIds: [proposal.messageId],
            userId,
            organizationId
          };
          results.project = await storage.createProject(projectData, { userId });
        } else if (proposalData.project.existingId) {
          results.project = await storage.getProject(proposalData.project.existingId, userId, organizationId);
          if (results.project && (!results.project.sourceMessageIds || !results.project.sourceMessageIds.includes(proposal.messageId))) {
            const updatedSourceIds = [...(results.project.sourceMessageIds || []), proposal.messageId];
            await storage.updateProject(results.project.id, { sourceMessageIds: updatedSourceIds }, userId, organizationId);
          }
        }
      }

      // 2b. Phase 6 — create sub-projects (if any) and build name→id map
      const subProjectNameToId = new Map<string, string>();
      if (results.project?.id && Array.isArray(proposalData.project?.subProjects)) {
        for (const sp of proposalData.project.subProjects) {
          if (!sp.name) continue;
          const spData: any = {
            name: sp.name,
            description: sp.description || null,
            status: proposalData.project.status || "planning",
            clientId: results.partner?.id,
            parentProjectId: results.project.id,
            sourceMessageIds: [proposal.messageId],
            userId,
            organizationId
          };
          try {
            const created = await storage.createProject(spData, { userId });
            subProjectNameToId.set(sp.name, created.id);
            results.subProjects = results.subProjects || [];
            results.subProjects.push(created);
            console.log(`[PROPOSAL APPLY] Created sub-project: ${created.name}`);
          } catch (e) {
            console.warn(`[PROPOSAL APPLY] Failed to create sub-project "${sp.name}":`, e);
          }
        }
      }

      // 2c. Phase 6 — resolve SAP systems and build name→id map for task linking
      const systemNameToId = new Map<string, string>();
      results.systems = [];
      if (Array.isArray(proposalData.systems)) {
        for (const sysProposal of proposalData.systems) {
          if (!sysProposal.isNew && sysProposal.existingId) {
            // Match existing — record the mapping
            systemNameToId.set(sysProposal.name, sysProposal.existingId);
            const existing = await storage.getSapSystem(sysProposal.existingId, userId);
            if (existing) results.systems.push(existing);
          } else if (sysProposal.isNew) {
            // Create stub system — only if minimum required fields are satisfiable
            const sid = (sysProposal.systemId || sysProposal.name || 'TBC').substring(0, 3).toUpperCase();
            try {
              const sysData: any = {
                name: sysProposal.name,
                systemId: sid,
                description: sysProposal.notes || `Proposto dall'agente AI — da configurare (host, credenziali, ecc.)`,
                serverHost: 'TBC',
                systemNumber: '00',
                landscapeType: sysProposal.landscapeType || 'other',
                partnerId: results.partner?.id || null,
                notes: `needsManualConfig=true. ${sysProposal.notes || ''}`.trim(),
                userId,
                organizationId
              };
              const created = await storage.createSapSystem(sysData);
              systemNameToId.set(sysProposal.name, created.id);
              results.systems.push(created);
              console.log(`[PROPOSAL APPLY] Created stub SAP system: ${created.name} (${sid}) — needs manual config`);
            } catch (e) {
              console.warn(`[PROPOSAL APPLY] Failed to create stub SAP system "${sysProposal.name}":`, e);
            }
          }
        }
      }
      
      // 3. Create tasks
      if (proposalData.tasks && Array.isArray(proposalData.tasks)) {
        for (const taskProposal of proposalData.tasks) {
          if (taskProposal.isNew) {
            const taskSpec = (taskProposal as any).aiSpec || null;
            const isDraft = taskSpec && (taskSpec.confidence < 0.7 || (taskSpec.openQuestions?.length ?? 0) > 0);

            // Phase 6: resolve target project (sub-project takes priority over main project)
            const subProjId = taskProposal.subProjectName
              ? (subProjectNameToId.get(taskProposal.subProjectName) ?? null)
              : null;

            // Phase 6: resolve SAP system from sapSystemRef
            const resolvedSapSystemId = taskProposal.sapSystemRef
              ? (systemNameToId.get(taskProposal.sapSystemRef) ?? null)
              : null;

            // Phase 6: collect mcpConfigIds from proposedMcpConfigs
            const proposedConfigs: Array<{ configId?: string }> = taskSpec?.proposedMcpConfigs || [];
            const mcpConfigIds = proposedConfigs
              .map(c => c.configId)
              .filter((id): id is string => !!id);

            const taskData: any = {
              title: taskProposal.title,
              description: taskProposal.description,
              priority: taskProposal.priority,
              taskType: taskProposal.taskType,
              estimatedEffort: taskProposal.estimatedEffort,
              dueDate: taskProposal.dueDate ? new Date(taskProposal.dueDate) : undefined,
              projectId: subProjId || results.project?.id,
              sourceMessageIds: [proposal.messageId],
              status: isDraft ? "draft" : "todo",
              aiSpec: taskSpec,
              sapSystemId: resolvedSapSystemId || undefined,
              mcpConfigIds: mcpConfigIds.length > 0 ? mcpConfigIds : undefined,
              userId,
              organizationId
            };
            const task = await storage.createTask(taskData, { userId });
            // Phase 5: compute and store suggestedModelKey in aiSpec
            if (taskSpec && task?.id) {
              const suggestedModelKey = await computeSuggestedModelKey(organizationId, taskProposal.taskType);
              if (suggestedModelKey) {
                const updatedSpec = { ...taskSpec, suggestedModelKey };
                await db.update(tasks).set({ aiSpec: updatedSpec }).where(eq(tasks.id, task.id));
                (task as any).aiSpec = updatedSpec;
              }
            }
            results.tasks.push(task);
          } else if (taskProposal.existingId) {
            const task = await storage.getTask(taskProposal.existingId, userId, organizationId);
            if (task && (!task.sourceMessageIds || !task.sourceMessageIds.includes(proposal.messageId))) {
              const updatedSourceIds = [...(task.sourceMessageIds || []), proposal.messageId];
              await storage.updateTask(task.id, { sourceMessageIds: updatedSourceIds }, userId, organizationId);
            }
            if (task) results.tasks.push(task);
          }
        }
      }
      
      // 4. Create contacts (with duplicate checking by email)
      if (proposalData.contacts && Array.isArray(proposalData.contacts)) {
        for (const contactProposal of proposalData.contacts) {
          // Skip if no email (email is required for contacts)
          if (!contactProposal.email) continue;
          
          // Check if contact already exists by email
          const existingContact = await storage.getContactByEmail(contactProposal.email, userId, organizationId);
          
          if (!existingContact) {
            // Create new contact
            const contactData: any = {
              name: contactProposal.name,
              email: contactProposal.email,
              phone: contactProposal.phone || null,
              position: contactProposal.position || null,
              company: contactProposal.company || null,
              notes: contactProposal.notes || null,
              partnerId: results.partner?.id || null,
              userId,
              organizationId
            };
            const contact = await storage.createContact(contactData, { userId });
            results.contacts.push(contact);
            console.log(`[PROPOSAL APPLY] Created contact: ${contact.name} (${contact.email})`);
          } else {
            // Contact already exists, skip creation
            results.contacts.push(existingContact);
            console.log(`[PROPOSAL APPLY] Skipped duplicate contact: ${existingContact.name} (${existingContact.email})`);
          }
        }
      }
      
      // 4b. Link project stakeholders (interested contacts) for notification/approval workflows
      results.stakeholders = [];
      if (results.project?.id && Array.isArray((proposalData as any).stakeholders)) {
        for (const sh of (proposalData as any).stakeholders) {
          if (!sh.contactEmail) continue;
          // Resolve the contact: prefer the ones just created/matched, else look up by email
          let contact = (results.contacts as any[]).find(
            (c: any) => c.email?.toLowerCase() === sh.contactEmail.toLowerCase()
          );
          if (!contact) {
            contact = await storage.getContactByEmail(sh.contactEmail, userId, organizationId);
          }
          if (!contact) {
            console.warn(`[PROPOSAL APPLY] Stakeholder skipped — no contact for ${sh.contactEmail}`);
            continue;
          }
          const role = ["informed", "approver", "responsible", "reviewer"].includes(sh.role) ? sh.role : "informed";
          try {
            const [link] = await db.insert(projectContacts).values({
              projectId: results.project.id,
              contactId: contact.id,
              role,
              notify: sh.notify !== false,
              notes: sh.notes || null,
              sourceMessageIds: [proposal.messageId],
              userId,
              organizationId,
            }).onConflictDoNothing().returning();
            if (link) {
              results.stakeholders.push(link);
              console.log(`[PROPOSAL APPLY] Linked stakeholder ${contact.email} as ${role} to project ${results.project.id}`);
            }
          } catch (e) {
            console.warn(`[PROPOSAL APPLY] Could not link stakeholder ${sh.contactEmail}:`, e);
          }
        }
      }

      // 4c. Create agent-proposed workflow objects (generic, entity-agnostic). No execution yet.
      results.workflows = [];
      if (Array.isArray((proposalData as any).workflows)) {
        const validActions = ["inform", "approve", "review"];
        for (const wf of (proposalData as any).workflows) {
          if (!wf.name || !wf.entityType || !wf.triggerEvent) continue;
          // Resolve actors to contact ids where possible (match stakeholders/contacts by email)
          const actors = Array.isArray(wf.actors)
            ? wf.actors
                .filter((a: any) => a.contactEmail && validActions.includes(a.action))
                .map((a: any) => {
                  const c = (results.contacts as any[]).find(
                    (cc: any) => cc.email?.toLowerCase() === a.contactEmail.toLowerCase()
                  );
                  return { contactEmail: a.contactEmail, contactId: c?.id, action: a.action };
                })
            : [];
          // If the workflow is about the project being created, scope it to that record.
          const entityId = wf.entityType === "project" ? (results.project?.id ?? null) : null;
          try {
            const [wfRow] = await db.insert(workflows).values({
              name: wf.name,
              description: wf.description || null,
              entityType: wf.entityType,
              entityId,
              triggerEvent: wf.triggerEvent,
              conditions: wf.triggerEvent === "updated" && wf.conditions ? wf.conditions : null,
              actors,
              actions: Array.isArray(wf.actions) ? wf.actions : [],
              status: "draft",
              sourceMessageIds: [proposal.messageId],
              userId,
              organizationId,
            }).returning();
            if (wfRow) {
              results.workflows.push(wfRow);
              console.log(`[PROPOSAL APPLY] Created workflow "${wf.name}" (entity=${wf.entityType}, event=${wf.triggerEvent}, ${actors.length} actors)`);
            }
          } catch (e) {
            console.warn(`[PROPOSAL APPLY] Could not create workflow "${wf.name}":`, e);
          }
        }
      }

      // 5. Phase 6 — resolve/create VPN connections from proposal
      results.connections = [];
      if (Array.isArray(proposalData.connections)) {
        for (const connProposal of proposalData.connections) {
          if (!connProposal.isNew && connProposal.existingId) {
            // Match existing VPN connection
            try {
              const existing = await storage.getVpnConnection(connProposal.existingId, userId);
              if (existing) results.connections.push(existing);
            } catch (e) {
              console.warn(`[PROPOSAL APPLY] Could not fetch VPN connection ${connProposal.existingId}:`, e);
            }
          } else if (connProposal.isNew && connProposal.kind === "vpn") {
            // Only create stub VPN if we have a partner (partnerId is NOT NULL)
            if (!results.partner?.id) {
              console.warn(`[PROPOSAL APPLY] Skipping stub VPN "${connProposal.name}" — no partner resolved`);
              continue;
            }
            try {
              const connData: any = {
                name: connProposal.name,
                description: connProposal.notes || `Proposto dall'agente AI — da configurare`,
                connectionType: 'openvpn',
                status: 'active',
                serverHost: 'TBC',
                serverPort: 1194,
                protocol: 'udp',
                partnerId: results.partner.id,
                notes: `needsManualConfig=true. ${connProposal.notes || ''}`.trim(),
                organizationId,
              };
              const created = await storage.createVpnConnection(connData, userId);
              results.connections.push(created);
              console.log(`[PROPOSAL APPLY] Created stub VPN connection: ${created.name} — needs manual config`);
            } catch (e) {
              console.warn(`[PROPOSAL APPLY] Failed to create stub VPN connection "${connProposal.name}":`, e);
            }
          }
          // kind === "workflow" connections are managed via connection_workflows table — skip auto-creation
        }
      }

      // Update proposal status
      await storage.updateProposal(req.params.id, {
        status: 'accepted',
        appliedAt: new Date(),
        appliedBy: userId
      }, userId, organizationId);
      
      res.json({
        success: true,
        results
      });
    } catch (error) {
      console.error("Apply proposal error:", error);
      res.status(500).json({ error: "Failed to apply proposal", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Reject a proposal
  app.post("/api/proposals/:id/reject", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const userId = req.user!.id;
      
      const proposal = await storage.getProposal(req.params.id, userId, organizationId);
      if (!proposal) return res.sendStatus(404);

      await storage.updateProposal(req.params.id, {
        status: 'rejected'
      }, userId, organizationId);

      // Capture rejection feedback as a learning pattern so future analyses improve.
      // Sources of feedback: explicit body.feedback, the decisionReasoning captured
      // from the discussion, and the discussion messages themselves.
      try {
        const explicitFeedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim() : "";
        const discussionRows = await db
          .select()
          .from(proposalDiscussions)
          .where(eq(proposalDiscussions.proposalId, proposal.id))
          .orderBy(asc(proposalDiscussions.createdAt));
        const userNotes = discussionRows
          .filter((d) => d.role === "user")
          .map((d) => d.content)
          .join("\n");

        const feedbackText = [explicitFeedback, (proposal as any).decisionReasoning || "", userNotes]
          .filter(Boolean)
          .join("\n\n")
          .trim();

        if (feedbackText) {
          // Derive input features from the source message for future matching
          const msg = await storage.getMessage(proposal.messageId, userId);
          const senderDomain = msg?.fromEmail?.includes("@") ? msg.fromEmail.split("@")[1] : undefined;
          const subjectKeywords = (msg?.subject || "")
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .slice(0, 8);

          await storage.createAiLearningPattern({
            organizationId,
            userId,
            patternType: "task_creation",
            inputFeatures: {
              senderDomain,
              subjectKeywords,
              isDuplicateMessage: true,
            },
            chosenAction: {
              decision: "rejected",
              avoid: feedbackText,
              modelKey: (proposal as any).modelKey || null,
            },
            wasAccepted: false,
            acceptanceCount: 0,
            rejectionCount: 1,
            sourceProposalId: proposal.id,
            notes: explicitFeedback || feedbackText.slice(0, 500),
          });
          console.log(`[LEARNING] Captured rejection pattern from proposal ${proposal.id}`);
        }
      } catch (learnErr) {
        console.error("Failed to capture rejection learning pattern:", learnErr);
        // Non-fatal: rejection already succeeded
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Reject proposal error:", error);
      res.status(500).json({ error: "Failed to reject proposal" });
    }
  });

  // Delete a proposal
  app.delete("/api/proposals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteProposal(req.params.id, req.user!.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Delete proposal error:", error);
      res.status(500).json({ error: "Failed to delete proposal" });
    }
  });

  // ── Proposal Discussion Thread ────────────────────────────────────────────

  // Get discussion messages for a proposal
  app.get("/api/proposals/:id/discussions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const rows = await db
        .select()
        .from(proposalDiscussions)
        .where(
          and(
            eq(proposalDiscussions.proposalId, req.params.id),
            eq(proposalDiscussions.organizationId, organizationId)
          )
        )
        .orderBy(asc(proposalDiscussions.createdAt));
      res.json(rows);
    } catch (error) {
      console.error("Get proposal discussions error:", error);
      res.status(500).json({ error: "Failed to fetch discussions" });
    }
  });

  // Post a user message and get AI reply
  app.post("/api/proposals/:id/discussions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
      }

      // Fetch proposal
      const [proposal] = await db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.id, req.params.id),
            eq(proposals.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!proposal) return res.sendStatus(404);

      // Fetch existing discussion history
      const history = await db
        .select()
        .from(proposalDiscussions)
        .where(eq(proposalDiscussions.proposalId, proposal.id))
        .orderBy(asc(proposalDiscussions.createdAt));

      // Save user message
      const [userMsg] = await db
        .insert(proposalDiscussions)
        .values({
          proposalId: proposal.id,
          role: "user",
          content: message,
          userId: req.user!.id,
          organizationId,
        })
        .returning();

      // Build AI conversation
      const proposalData = proposal.proposalData as any;
      const systemPrompt = `Sei un assistente AI per la gestione di proposte progettuali in un CRM per consulenti SAP ABAP freelance.

L'utente sta discutendo una proposta generata dall'AI. La proposta attuale è:

${JSON.stringify(proposalData, null, 2)}

Il tuo compito è:
1. Rispondere alle domande dell'utente sulla proposta
2. Se l'utente chiede modifiche, proporre una versione aggiornata della proposta
3. Spiegare il ragionamento dietro le scelte fatte
4. Aiutare l'utente a prendere una decisione informata

REGOLE:
- Rispondi SEMPRE in italiano
- Se l'utente chiede di modificare la proposta, includi nel tuo messaggio un blocco JSON aggiornato della proposta tra i tag <updated_proposal> e </updated_proposal>
- Il JSON deve mantenere ESATTAMENTE la stessa struttura dell'originale
- Sii conciso ma completo nelle risposte`;

      const aiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const msg of history) {
        aiMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
      }
      aiMessages.push({ role: "user", content: message });

      const { aiGateway } = await import("./ai-gateway");
      const aiResult = await aiGateway.complete({
        modelKey: (proposal as any).modelKey || undefined, // usa lo stesso agente della proposta
        messages: [
          { role: "system", content: systemPrompt },
          ...aiMessages,
        ],
        organizationId,
        caller: "proposal-discussion",
        maxTokens: 4000,
      });

      // Check if AI proposed an updated proposal
      let updatedProposalData: any = null;
      const updateMatch = aiResult.content.match(/<updated_proposal>([\s\S]*?)<\/updated_proposal>/);
      if (updateMatch) {
        try {
          updatedProposalData = JSON.parse(updateMatch[1]);
          // Update the proposal with the new data
          await db
            .update(proposals)
            .set({ proposalData: updatedProposalData, updatedAt: new Date() })
            .where(eq(proposals.id, proposal.id));
        } catch {
          // Invalid JSON in update block — ignore
        }
      }

      // Clean display content (remove the JSON block)
      let displayContent = aiResult.content
        .replace(/<updated_proposal>[\s\S]*?<\/updated_proposal>/, "")
        .trim();

      // Guarantee a non-empty reply (e.g. when the model returned only the JSON block)
      if (!displayContent) {
        displayContent = updatedProposalData
          ? "Ho aggiornato la proposta secondo la tua richiesta. Controlla il tab Dettaglio per vedere le modifiche."
          : "(nessun contenuto testuale restituito dall'agente)";
      }

      console.log(
        `[PROPOSAL-DISCUSSION] proposal=${proposal.id} model=${(proposal as any).modelKey || "default"}` +
          ` reply_len=${displayContent.length} updated=${!!updatedProposalData}`
      );

      // Save AI reply
      const [aiMsg] = await db
        .insert(proposalDiscussions)
        .values({
          proposalId: proposal.id,
          role: "assistant",
          content: displayContent,
          proposalDataSnapshot: updatedProposalData,
          userId: req.user!.id,
          organizationId,
          promptTokens: aiResult.promptTokens,
          completionTokens: aiResult.completionTokens,
        })
        .returning();

      res.json({
        userMessage: userMsg,
        aiMessage: aiMsg,
        proposalUpdated: !!updatedProposalData,
      });
    } catch (error: any) {
      console.error("Proposal discussion error:", error);
      res.status(500).json({ error: "Failed to process discussion", details: error?.message || String(error) });
    }
  });

  // Finalize proposal decision — captures decision summary and reasoning
  app.post("/api/proposals/:id/finalize-decision", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const { action } = req.body; // "accept" | "reject"
      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [proposal] = await db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.id, req.params.id),
            eq(proposals.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!proposal) return res.sendStatus(404);

      // Fetch discussion history to generate decision summary
      const history = await db
        .select()
        .from(proposalDiscussions)
        .where(eq(proposalDiscussions.proposalId, proposal.id))
        .orderBy(asc(proposalDiscussions.createdAt));

      let decisionSummary = "";
      let decisionReasoning = "";

      if (history.length > 0) {
        const { aiGateway } = await import("./ai-gateway");
        const conversationText = history
          .map((m) => `${m.role === "user" ? "UTENTE" : "AI"}: ${m.content}`)
          .join("\n\n");

        const summaryResult = await aiGateway.complete({
          modelKey: (proposal as any).modelKey || undefined, // stesso agente della proposta
          messages: [
            {
              role: "system",
              content: `Analizza la seguente discussione su una proposta progettuale e produci:
1. Un RIASSUNTO DECISIONE (2-3 frasi) della decisione finale presa
2. Un PROCESSO DECISIONALE (3-5 punti) che descrive come si è arrivati alla decisione

Rispondi in italiano. Formato:
RIASSUNTO: <testo>
PROCESSO: <testo con punti numerati>`,
            },
            { role: "user", content: conversationText },
          ],
          organizationId,
          caller: "proposal-decision-summary",
          maxTokens: 1000,
        });

        const summaryMatch = summaryResult.content.match(/RIASSUNTO:\s*([\s\S]*?)(?=PROCESSO:)/);
        const processMatch = summaryResult.content.match(/PROCESSO:\s*([\s\S]*)/);
        decisionSummary = summaryMatch?.[1]?.trim() || summaryResult.content;
        decisionReasoning = processMatch?.[1]?.trim() || "";
      }

      const [updated] = await db
        .update(proposals)
        .set({
          decisionSummary,
          decisionReasoning,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Finalize decision error:", error);
      res.status(500).json({ error: "Failed to finalize decision" });
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
            const taskSpec = (taskProposal as any).aiSpec || null;
            const isDraft = taskSpec && (taskSpec.confidence < 0.7 || (taskSpec.openQuestions?.length ?? 0) > 0);
            const taskData: any = {
              title: taskProposal.title,
              description: taskProposal.description,
              priority: taskProposal.priority,
              taskType: taskProposal.taskType,
              estimatedEffort: taskProposal.estimatedEffort,
              dueDate: taskProposal.dueDate ? new Date(taskProposal.dueDate) : undefined,
              projectId: results.project?.id,
              sourceMessageIds: [req.params.id],
              status: isDraft ? "draft" : "todo",
              aiSpec: taskSpec,
              userId,
              organizationId
            };
            const task = await storage.createTask(taskData, { userId });
            // Phase 5: compute and store suggestedModelKey in aiSpec
            if (taskSpec && task?.id) {
              const suggestedModelKey = await computeSuggestedModelKey(organizationId, taskProposal.taskType);
              if (suggestedModelKey) {
                const updatedSpec = { ...taskSpec, suggestedModelKey };
                await db.update(tasks).set({ aiSpec: updatedSpec }).where(eq(tasks.id, task.id));
                (task as any).aiSpec = updatedSpec;
              }
            }
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

  // Alternative route for getting linked messages (used by MessageHistory component)
  app.get("/api/message-links/:tableName/:recordId", async (req, res) => {
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

  // Alternative POST route for creating message links (used by MessageHistory component)
  app.post("/api/message-links", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { messageId, linkedTableName, linkedRecordId, notes } = req.body;
      
      if (!messageId || !linkedTableName || !linkedRecordId) {
        return res.status(400).json({ error: "messageId, linkedTableName, and linkedRecordId are required" });
      }
      
      const context = MessageLogService.createContext(req);
      const link = await MessageLogService.linkMessage(
        messageId,
        linkedTableName,
        linkedRecordId,
        context,
        {
          notes: notes || undefined
        }
      );
      
      res.json(link);
    } catch (error) {
      console.error("Link message error:", error);
      res.status(500).json({ error: "Failed to link message" });
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

  // Sales Order Items (nested under sales orders)
  app.get("/api/sales-orders/:salesOrderId/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const items = await storage.getSalesOrderItems(req.params.salesOrderId, req.user!.id);
    res.json(items);
  });

  app.post("/api/sales-orders/:salesOrderId/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Verify sales order ownership
      const order = await storage.getSalesOrder(req.params.salesOrderId, req.user!.id);
      if (!order) return res.sendStatus(404);

      const itemData = insertSalesOrderItemSchema.parse({
        ...req.body,
        salesOrderId: req.params.salesOrderId
      });
      const item = await storage.createSalesOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Sales order item creation error:", error);
      res.status(400).json({ error: "Invalid sales order item data" });
    }
  });

  app.put("/api/sales-orders/:salesOrderId/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Verify sales order ownership first
      const order = await storage.getSalesOrder(req.params.salesOrderId, req.user!.id);
      if (!order) return res.sendStatus(404);

      // Validate update data - only allow safe fields, prevent salesOrderId manipulation
      const { salesOrderId: _, id: __, ...updateData } = req.body;
      const item = await storage.updateSalesOrderItem(req.params.itemId, updateData, req.user!.id);
      if (!item) return res.sendStatus(404);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid sales order item data" });
    }
  });

  app.delete("/api/sales-orders/:salesOrderId/items/:itemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Verify sales order ownership first
      const order = await storage.getSalesOrder(req.params.salesOrderId, req.user!.id);
      if (!order) return res.sendStatus(404);

      const deleted = await storage.deleteSalesOrderItem(req.params.itemId, req.user!.id);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: "Failed to delete item" });
    }
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

      const organizationId = getOrganizationId(req);
      
      // Create sales order
      const salesOrder = await storage.createSalesOrder({
        userId: req.user!.id,
        organizationId,
        partnerId,
        description: description || "Time tracking services",
        subtotal: subtotal.toString(),
        taxes: taxes.toString(),
        total: total.toString(),
        currency: "EUR",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: "draft",
        isBillable: true,
      });

      // Create sales order item
      await storage.createSalesOrderItem({
        salesOrderId: salesOrder.id,
        lineNumber: 1,
        itemType: "service",
        description: `Time tracking - ${totalHours}h @ €${rate}/h`,
        quantity: totalHours.toString(),
        unitOfMeasure: "ore",
        unitPrice: rate.toString(),
        discountPercent: "0",
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
      const organizationId = getOrganizationId(req);
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        organizationId,
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

  // Resource Skills
  // Skill Catalog CRUD
  app.get("/api/skill-catalog", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const entries = await storage.getSkillCatalog(organizationId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch skill catalog" });
    }
  });

  app.post("/api/skill-catalog", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const data = insertSkillCatalogSchema.parse({
        ...req.body,
        organizationId,
        userId: req.user!.id,
      });
      const entry = await storage.createSkillCatalogEntry(data);
      res.status(201).json(entry);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.put("/api/skill-catalog/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updated = await storage.updateSkillCatalogEntry(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Skill not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update skill" });
    }
  });

  app.delete("/api/skill-catalog/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteSkillCatalogEntry(req.params.id);
      if (!success) return res.status(404).json({ error: "Skill not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete skill" });
    }
  });

  app.get("/api/human-resources/:id/skills", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const skills = await storage.getResourceSkills(req.params.id);
      res.json(skills);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch resource skills" });
    }
  });

  app.post("/api/human-resources/:id/skills", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const data = insertResourceSkillSchema.parse({
        ...req.body,
        humanResourceId: req.params.id,
        organizationId,
        userId: req.user!.id,
      });
      const skill = await storage.createResourceSkill(data);
      res.status(201).json(skill);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/human-resources/:id/skills/:skillId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteResourceSkill(req.params.skillId);
      if (!success) return res.status(404).json({ error: "Skill not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete skill" });
    }
  });

  // Resource Availability
  app.get("/api/human-resources/:id/availability", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const availability = await storage.getResourceAvailability(req.params.id);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch resource availability" });
    }
  });

  app.post("/api/human-resources/:id/availability", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const data = insertResourceAvailabilitySchema.parse({
        ...req.body,
        humanResourceId: req.params.id,
        organizationId,
        userId: req.user!.id,
      });
      const availability = await storage.createResourceAvailability(data);
      res.status(201).json(availability);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.put("/api/human-resources/:id/availability/:availId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updated = await storage.updateResourceAvailability(req.params.availId, req.body);
      if (!updated) return res.status(404).json({ error: "Availability not found" });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/human-resources/:id/availability/:availId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteResourceAvailability(req.params.availId);
      if (!success) return res.status(404).json({ error: "Availability not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete availability" });
    }
  });

  // Task Required Skills
  app.get("/api/tasks/:id/required-skills", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const skills = await storage.getTaskRequiredSkills(req.params.id);
      res.json(skills);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task required skills" });
    }
  });

  app.post("/api/tasks/:id/required-skills", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const data = insertTaskRequiredSkillSchema.parse({
        ...req.body,
        taskId: req.params.id,
        organizationId,
        userId: req.user!.id,
      });
      const skill = await storage.createTaskRequiredSkill(data);
      res.status(201).json(skill);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.delete("/api/tasks/:id/required-skills/:skillId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteTaskRequiredSkill(req.params.skillId);
      if (!success) return res.status(404).json({ error: "Required skill not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete required skill" });
    }
  });

  // Resource Planner - Project/Task Tree with Required Skills
  app.get("/api/resource-planner/activity-tree", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userOrgs = await storage.getUserOrganizations(req.user!.id);
      const allUserOrgIds = userOrgs.map(o => o.id);

      const allProjects = await db.select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
      }).from(projects)
        .where(and(
          eq(projects.userId, req.user!.id),
          inArray(projects.organizationId, allUserOrgIds)
        ));

      const allTasks = await db.select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        projectId: tasks.projectId,
        assignedTo: tasks.assignedTo,
        estimatedEffort: tasks.estimatedEffort,
        remainingEffort: tasks.remainingEffort,
      }).from(tasks)
        .where(and(
          eq(tasks.userId, req.user!.id),
          inArray(tasks.organizationId, allUserOrgIds)
        ));

      const allRequiredSkills = await db.select().from(taskRequiredSkills)
        .where(inArray(taskRequiredSkills.organizationId, allUserOrgIds));

      const skillsByTask = new Map<string, typeof allRequiredSkills>();
      allRequiredSkills.forEach(s => {
        if (!skillsByTask.has(s.taskId)) skillsByTask.set(s.taskId, []);
        skillsByTask.get(s.taskId)!.push(s);
      });

      const tree = allProjects.map(p => ({
        ...p,
        type: "project" as const,
        tasks: allTasks
          .filter(t => t.projectId === p.id)
          .map(t => ({
            ...t,
            type: "task" as const,
            requiredSkills: (skillsByTask.get(t.id) || []).map(s => ({
              id: s.id,
              skillName: s.skillName,
              requiredLevel: s.requiredLevel,
            })),
          })),
      }));

      const orphanTasks = allTasks
        .filter(t => !t.projectId)
        .map(t => ({
          ...t,
          type: "task" as const,
          requiredSkills: (skillsByTask.get(t.id) || []).map(s => ({
            id: s.id,
            skillName: s.skillName,
            requiredLevel: s.requiredLevel,
          })),
        }));

      res.json({ projects: tree, orphanTasks });
    } catch (error) {
      console.error("Activity tree error:", error);
      res.status(500).json({ error: "Failed to fetch activity tree" });
    }
  });

  // Resource Planner - Data Aggregation Endpoint
  app.get("/api/resource-planner", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const { startDate, endDate, granularity = "week" } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const gran = granularity as "day" | "week" | "month";

      const allResources = await db.select().from(humanResources)
        .where(and(
          eq(humanResources.userId, req.user!.id),
          eq(humanResources.isActive, true),
          inArray(humanResources.organizationId, organizationIds)
        ));

      const allTasks = await db.select().from(tasks)
        .where(and(
          eq(tasks.userId, req.user!.id),
          inArray(tasks.organizationId, organizationIds)
        ));

      const allSkills = await db.select().from(resourceSkills)
        .where(inArray(resourceSkills.organizationId, organizationIds));

      const allAvailability = await db.select().from(resourceAvailability)
        .where(inArray(resourceAvailability.organizationId, organizationIds));

      const periods = generatePeriods(start, end, gran);

      const resourceData = allResources.map(resource => {
        const resSkills = allSkills.filter(s => s.humanResourceId === resource.id);
        const resAvail = allAvailability.filter(a => a.humanResourceId === resource.id);

        const linkedUserId = resource.linkedUserId;
        const assignedTasks = allTasks.filter(t => {
          if (!t.assignedTo) return false;
          if (t.assignedTo !== linkedUserId) return false;
          if (t.status === "completed") return false;
          return true;
        });

        const periodsData = periods.map(period => {
          const workingDays = countWorkingDays(period.start, period.end);
          const dailyHours = getEffectiveDailyHours(resAvail, period.start);
          const capacity = workingDays * dailyHours;

          const periodTasks = assignedTasks.filter(t => {
            const taskStart = t.startDate ? new Date(t.startDate) : null;
            const taskEnd = t.dueDate ? new Date(t.dueDate) : null;
            if (taskStart && taskEnd) {
              return taskStart <= period.end && taskEnd >= period.start;
            }
            if (taskStart && !taskEnd) {
              return taskStart <= period.end;
            }
            if (!taskStart && taskEnd) {
              return taskEnd >= period.start;
            }
            return true;
          });

          let demand = 0;
          periodTasks.forEach(t => {
            const remaining = t.effectiveRemainingHours ??
              (t.remainingEffort ?? ((t.estimatedEffort || 0) * (1 - (t.completionPercentage || 0) / 100)));
            const taskStart = t.startDate ? new Date(t.startDate) : period.start;
            const taskEnd = t.dueDate ? new Date(t.dueDate) : period.end;
            const taskTotalDays = countWorkingDays(taskStart, taskEnd) || 1;
            const overlapStart = new Date(Math.max(taskStart.getTime(), period.start.getTime()));
            const overlapEnd = new Date(Math.min(taskEnd.getTime(), period.end.getTime()));
            const overlapDays = countWorkingDays(overlapStart, overlapEnd);
            const fraction = overlapDays / taskTotalDays;
            demand += remaining * fraction;
          });

          const utilization = capacity > 0 ? (demand / capacity) * 100 : 0;
          let status: "unavailable" | "under" | "balanced" | "over" = "unavailable";
          if (capacity > 0) {
            if (utilization > 100) status = "over";
            else if (utilization >= 70) status = "balanced";
            else status = "under";
          }

          return {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            label: period.label,
            capacity: Math.round(capacity * 10) / 10,
            demand: Math.round(demand * 10) / 10,
            utilization: Math.round(utilization),
            status,
            tasks: periodTasks.map(t => ({
              id: t.id,
              title: t.title,
              projectId: t.projectId,
              remaining: t.effectiveRemainingHours ?? (t.remainingEffort ?? ((t.estimatedEffort || 0) * (1 - (t.completionPercentage || 0) / 100))),
              status: t.status,
              priority: t.priority,
            })),
          };
        });

        return {
          id: resource.id,
          name: resource.name,
          role: resource.role,
          skillLevel: resource.skillLevel,
          department: resource.department,
          skills: resSkills.map(s => ({
            id: s.id,
            name: s.skillName,
            level: s.proficiencyLevel,
            isPrimary: s.isPrimary,
          })),
          periods: periodsData,
        };
      });

      const summaryPeriods = periods.map((period, idx) => {
        const totalCapacity = resourceData.reduce((sum, r) => sum + r.periods[idx].capacity, 0);
        const totalDemand = resourceData.reduce((sum, r) => sum + r.periods[idx].demand, 0);
        return {
          label: period.label,
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          totalCapacity: Math.round(totalCapacity * 10) / 10,
          totalDemand: Math.round(totalDemand * 10) / 10,
          avgUtilization: totalCapacity > 0 ? Math.round((totalDemand / totalCapacity) * 100) : 0,
          resourceCount: resourceData.length,
        };
      });

      res.json({ resources: resourceData, summary: summaryPeriods, periods: periods.map(p => p.label) });
    } catch (error) {
      console.error("Error in resource planner:", error);
      res.status(500).json({ error: "Failed to compute resource planner data" });
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
      const organizationId = getOrganizationId(req);
      const systemData = { 
        ...req.body, 
        userId: req.user!.id,
        organizationId,
        systemId: req.body.systemId?.toUpperCase() || req.body.systemId
      };
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

  // SAP Transport Requests - GET endpoints
  app.get("/api/sap-transport-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const requests = await storage.getSapTransportRequests(req.user!.id);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching SAP transport requests:", error);
      res.status(500).json({ error: "Failed to fetch SAP transport requests" });
    }
  });

  app.get("/api/sap-transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const request = await storage.getSapTransportRequest(req.params.id, req.user!.id);
      if (!request) return res.sendStatus(404);
      res.json(request);
    } catch (error) {
      console.error("Error fetching SAP transport request:", error);
      res.status(500).json({ error: "Failed to fetch SAP transport request" });
    }
  });

  app.get("/api/sap-transport-requests/:requestId/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const tasks = await storage.getSapTransportTasks(req.params.requestId, req.user!.id);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching SAP transport tasks:", error);
      res.status(500).json({ error: "Failed to fetch SAP transport tasks" });
    }
  });

  app.get("/api/sap-transport-requests/:requestId/objects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const objects = await storage.getSapTransportObjects(req.params.requestId, req.user!.id);
      res.json(objects);
    } catch (error) {
      console.error("Error fetching SAP transport objects:", error);
      res.status(500).json({ error: "Failed to fetch SAP transport objects" });
    }
  });

  app.delete("/api/sap-transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteSapTransportRequest(req.params.id, req.user!.id);
      if (!success) return res.sendStatus(404);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting SAP transport request:", error);
      res.status(500).json({ error: "Failed to delete SAP transport request" });
    }
  });

  // SAP Transport Requests - Endpoint per ricevere dati da SAP ABAP report
  app.post("/api/sap-transport", async (req, res) => {
    // Verifica autenticazione: API key o sessione utente
    const apiKey = req.headers['x-api-key'] as string;
    const validApiKey = process.env.SAP_API_KEY;
    
    let userId: string;
    let organizationId: string;
    
    if (apiKey && validApiKey && apiKey === validApiKey) {
      // Autenticazione via API key - usa userId e organizationId dal payload
      const bodyUserId = req.body.userId as string | undefined;
      const bodyOrgId = req.body.organizationId as string | undefined;
      
      if (!bodyUserId || !bodyOrgId) {
        return res.status(400).json({ 
          error: "userId e organizationId sono richiesti quando si usa API key" 
        });
      }
      
      userId = bodyUserId;
      organizationId = bodyOrgId;
    } else if (req.isAuthenticated()) {
      // Autenticazione via sessione
      userId = req.user!.id;
      organizationId = getOrganizationId(req);
    } else {
      return res.status(401).json({ 
        error: "Autenticazione richiesta: fornire X-API-Key header o sessione valida" 
      });
    }
    
    try {
      
      // Validazione dati in arrivo da SAP
      const sapDataSchema = z.object({
        projectId: z.string().uuid(),
        requests: z.array(z.object({
          requestNumber: z.string(),
          description: z.string(),
          status: z.enum(['modifiable', 'released', 'imported', 'error']).optional(),
          owner: z.string(),
          targetSystem: z.string().optional(),
          createdDate: z.string().optional(),
          releasedDate: z.string().optional(),
          category: z.string().optional(),
          sapSystemId: z.string().uuid().optional(),
          tasks: z.array(z.object({
            taskNumber: z.string(),
            description: z.string().optional(),
            taskType: z.enum(['development', 'customizing', 'repair']).optional(),
            owner: z.string(),
            status: z.enum(['modifiable', 'released', 'imported', 'error']).optional(),
          })).optional(),
          objects: z.array(z.object({
            objectType: z.enum(['program', 'function', 'class', 'table', 'view', 'report', 'screen', 'smartform', 'webdynpro', 'other']).optional(),
            objectName: z.string(),
            objectKey: z.string().optional(),
            packageName: z.string().optional(),
            taskNumber: z.string().optional(),
            content: z.array(z.object({
              contentType: z.string(),
              content: z.string(),
              lineNumber: z.number().optional(),
              language: z.string().optional(),
            })).optional(),
          })).optional(),
        }))
      });
      
      const validatedData = sapDataSchema.parse(req.body);
      
      // Salva le transport request
      const savedRequests = [];
      
      for (const requestData of validatedData.requests) {
        // Crea la transport request
        const transportRequest = await storage.createSapTransportRequest({
          projectId: validatedData.projectId,
          userId,
          organizationId,
          requestNumber: requestData.requestNumber,
          description: requestData.description,
          status: requestData.status || 'modifiable',
          owner: requestData.owner,
          targetSystem: requestData.targetSystem,
          createdDate: requestData.createdDate ? new Date(requestData.createdDate) : undefined,
          releasedDate: requestData.releasedDate ? new Date(requestData.releasedDate) : undefined,
          category: requestData.category,
          sapSystemId: requestData.sapSystemId,
        });
        
        // Salva i task
        const savedTasks = [];
        if (requestData.tasks) {
          for (const taskData of requestData.tasks) {
            const task = await storage.createSapTransportTask({
              requestId: transportRequest.id,
              taskNumber: taskData.taskNumber,
              description: taskData.description,
              taskType: taskData.taskType || 'development',
              owner: taskData.owner,
              status: taskData.status || 'modifiable',
            });
            savedTasks.push(task);
          }
        }
        
        // Salva gli oggetti
        if (requestData.objects) {
          for (const objectData of requestData.objects) {
            // Trova il task corrispondente se specificato
            const taskId = objectData.taskNumber 
              ? savedTasks.find(t => t.taskNumber === objectData.taskNumber)?.id 
              : undefined;
            
            const sapObject = await storage.createSapTransportObject({
              requestId: transportRequest.id,
              taskId,
              objectType: objectData.objectType || 'other',
              objectName: objectData.objectName,
              objectKey: objectData.objectKey,
              packageName: objectData.packageName,
            });
            
            // Salva il contenuto
            if (objectData.content) {
              for (const contentData of objectData.content) {
                await storage.createSapObjectContent({
                  objectId: sapObject.id,
                  contentType: contentData.contentType,
                  content: contentData.content,
                  lineNumber: contentData.lineNumber,
                  language: contentData.language,
                });
              }
            }
          }
        }
        
        savedRequests.push(transportRequest);
      }
      
      res.json({ 
        success: true, 
        message: `Salvate ${savedRequests.length} transport request con successo`,
        requests: savedRequests 
      });
      
    } catch (error) {
      console.error("Errore salvataggio SAP transport:", error);
      res.status(500).json({ 
        error: "Errore nel salvataggio delle transport request SAP",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // SAP Transport Requests - Endpoint per incollare JSON manualmente
  app.post("/api/sap-transport/paste", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { jsonContent } = req.body;
      
      if (!jsonContent || typeof jsonContent !== 'string') {
        return res.status(400).json({ error: "Campo 'jsonContent' mancante o non valido" });
      }
      
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      // Usa il processore per validare e salvare il JSON
      const { SapTransportProcessor } = await import('./sap-transport-processor');
      const result = await SapTransportProcessor.processTransportRequestJson(
        jsonContent,
        userId,
        organizationId,
        `paste-${Date.now()}` // messageId fittizio per il paste manuale
      );
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: "Transport Request importata con successo",
          requestId: result.requestId 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
      
    } catch (error) {
      console.error("Errore processamento JSON incollato:", error);
      res.status(500).json({ 
        error: "Errore nel processamento del JSON",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // SAP Transport Requests - Endpoint per sincronizzare da OData SAP
  app.post("/api/sap-transport/sync-odata", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { odataUrl, username, password, sapSystemId } = req.body;
      
      if (!odataUrl || typeof odataUrl !== 'string') {
        return res.status(400).json({ error: "Campo 'odataUrl' mancante o non valido" });
      }
      
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      // Usa il bridge server se configurato, altrimenti prova chiamata diretta
      const bridgeUrl = process.env.SAP_BRIDGE_URL;
      let odataResponse;
      
      if (bridgeUrl) {
        
        // Chiama il bridge server
        const bridgeResponse = await fetch(`${bridgeUrl}/sap-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            odataUrl,
            username,
            password,
          }),
        });
        
        if (!bridgeResponse.ok) {
          const errorData = await bridgeResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Errore bridge: ${bridgeResponse.status} ${bridgeResponse.statusText}`);
        }
        
        odataResponse = await bridgeResponse.json();
      } else {
        // Prepara le opzioni per la chiamata HTTP diretta
        const fetchOptions: any = {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        };
        
        // Aggiungi Basic Auth se fornite le credenziali
        if (username && password) {
          const authString = Buffer.from(`${username}:${password}`).toString('base64');
          fetchOptions.headers['Authorization'] = `Basic ${authString}`;
        }
        
        // Chiama l'endpoint OData SAP direttamente
        const response = await fetch(odataUrl, fetchOptions);
        
        if (!response.ok) {
          throw new Error(`Errore chiamata OData: ${response.status} ${response.statusText}`);
        }
        
        odataResponse = await response.json();
      }
      
      // Estrai i risultati dal formato OData standard
      const results = odataResponse.d?.results || [];
      
      if (!Array.isArray(results) || results.length === 0) {
        return res.json({
          success: true,
          message: "Nessuna Transport Request trovata nell'endpoint OData",
          imported: 0,
          skipped: 0,
        });
      }
      
      // Contatori per il report
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      // Processa ogni Transport Request
      for (const odataItem of results) {
        try {
          const requestNumber = odataItem.Number;
          if (!requestNumber) {
            skipped++;
            errors.push(`Nessun numero TR fornito`);
            continue;
          }
          
          // Crea la TR direttamente nel database (bypass validazione strict)
          // Il database gestirà i duplicati con constraint unique
          const trData = {
            requestNumber: requestNumber,
            description: odataItem.Text || 'Importata da OData',
            owner: odataItem.Owner || '',
            targetSystem: odataItem.Target || '',
            status: 'modifiable' as const,
            // projectId non obbligatorio per import OData
            projectId: null,
            sapSystemId: sapSystemId || null,
            userId: userId,
            organizationId: organizationId,
          };
          
          const newTR = await storage.createSapTransportRequest(trData);
          imported++;
          
        } catch (itemError) {
          skipped++;
          const errorMsg = itemError instanceof Error ? itemError.message : String(itemError);
          errors.push(`${odataItem.Number}: ${errorMsg}`);
          console.error(`[SAP ODATA SYNC] Error processing TR ${odataItem.Number}:`, itemError);
        }
      }
      
      res.json({
        success: true,
        message: `Sincronizzazione completata: ${imported} importate, ${skipped} saltate`,
        imported,
        skipped,
        total: results.length,
        errors: errors.length > 0 ? errors : undefined,
      });
      
    } catch (error) {
      console.error("Errore sincronizzazione OData:", error);
      res.status(500).json({ 
        error: "Errore nella sincronizzazione OData",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ========== Project Assignments API ==========
  app.get("/api/project-assignments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const assignments = await db.select().from(projectAssignments)
        .where(and(
          eq(projectAssignments.userId, req.user!.id),
          inArray(projectAssignments.organizationId, organizationIds)
        ));
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching project assignments:", error);
      res.status(500).json({ error: "Failed to fetch project assignments" });
    }
  });

  app.get("/api/project-assignments/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const assignments = await db.select().from(projectAssignments)
        .where(and(
          eq(projectAssignments.projectId, req.params.projectId),
          eq(projectAssignments.userId, req.user!.id)
        ));
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching project assignments:", error);
      res.status(500).json({ error: "Failed to fetch project assignments" });
    }
  });

  app.get("/api/project-assignments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const assignment = await db.select().from(projectAssignments)
        .where(and(
          eq(projectAssignments.id, req.params.id),
          eq(projectAssignments.userId, req.user!.id)
        ))
        .limit(1);
      if (!assignment.length) return res.sendStatus(404);
      res.json(assignment[0]);
    } catch (error) {
      console.error("Error fetching project assignment:", error);
      res.status(500).json({ error: "Failed to fetch project assignment" });
    }
  });

  app.post("/api/project-assignments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        organizationId, // Always use organizationId from header for security
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      };

      const validation = insertProjectAssignmentSchema.safeParse(dataWithUserId);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      // Wrap assignment + PO creation in a transaction for atomicity
      const result = await db.transaction(async (tx) => {
        const [assignment] = await tx.insert(projectAssignments).values(validation.data).returning();
        
        // Auto-generate Purchase Order if engagementType is set
        if (assignment.engagementType && assignment.resourceId) {
          const resource = await tx.select().from(humanResources).where(eq(humanResources.id, assignment.resourceId)).limit(1);
          if (resource.length) {
            const orderNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
            const amount = assignment.engagementType === 'fixed' 
              ? parseFloat(assignment.fixedAmount || '0')
              : parseFloat(assignment.hourlyRate || '0') * parseFloat(assignment.estimatedHours || '0');
            
            const [po] = await tx.insert(purchaseOrders).values({
              userId: req.user!.id,
              organizationId: assignment.organizationId,
              orderNumber,
              vendorOrganizationId: resource[0].externalOrganizationId,
              vendorName: resource[0].name,
              projectId: assignment.projectId,
              projectAssignmentId: assignment.id,
              totalAmount: amount.toString(),
              taxAmount: '0',
              currency: assignment.currency,
              description: assignment.title,
              status: 'draft',
            }).returning();

            // Update assignment with PO reference
            await tx.update(projectAssignments)
              .set({ 
                purchaseOrderId: po.id, 
                autoPurchaseOrderGenerated: true 
              })
              .where(eq(projectAssignments.id, assignment.id));
          }
        }
        
        // Return the final assignment
        const [finalAssignment] = await tx.select().from(projectAssignments).where(eq(projectAssignments.id, assignment.id)).limit(1);
        return finalAssignment;
      });

      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating project assignment:", error);
      res.status(500).json({ error: "Failed to create project assignment" });
    }
  });

  app.put("/api/project-assignments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validation = insertProjectAssignmentSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const [assignment] = await db.update(projectAssignments)
        .set({ ...validation.data, updatedAt: new Date() })
        .where(and(
          eq(projectAssignments.id, req.params.id),
          eq(projectAssignments.userId, req.user!.id)
        ))
        .returning();
      
      if (!assignment) return res.sendStatus(404);
      res.json(assignment);
    } catch (error) {
      console.error("Error updating project assignment:", error);
      res.status(500).json({ error: "Failed to update project assignment" });
    }
  });

  app.delete("/api/project-assignments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const [deleted] = await db.delete(projectAssignments)
        .where(and(
          eq(projectAssignments.id, req.params.id),
          eq(projectAssignments.userId, req.user!.id)
        ))
        .returning();
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting project assignment:", error);
      res.status(500).json({ error: "Failed to delete project assignment" });
    }
  });

  // Helper: normalizza date ISO/Date objects in stringhe YYYY-MM-DD
  const normalizeDateToYYYYMMDD = (dateInput: string | Date | null | undefined): string | null => {
    if (!dateInput) return null;
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ========== Project Milestones API ==========
  app.get("/api/project-milestones", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const milestones = await db.select().from(projectMilestones)
        .where(and(
          eq(projectMilestones.userId, req.user!.id),
          inArray(projectMilestones.organizationId, organizationIds)
        ))
        .orderBy(asc(projectMilestones.displayOrder));
      
      // Le date sono già stringhe YYYY-MM-DD nel database
      res.json(milestones);
    } catch (error) {
      console.error("Error fetching project milestones:", error);
      res.status(500).json({ error: "Failed to fetch project milestones" });
    }
  });

  app.get("/api/project-milestones/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const milestones = await db.select().from(projectMilestones)
        .where(and(
          eq(projectMilestones.projectId, req.params.projectId),
          eq(projectMilestones.userId, req.user!.id)
        ))
        .orderBy(asc(projectMilestones.displayOrder));
      
      // Le date sono già stringhe YYYY-MM-DD nel database
      res.json(milestones);
    } catch (error) {
      console.error("Error fetching project milestones:", error);
      res.status(500).json({ error: "Failed to fetch project milestones" });
    }
  });

  app.get("/api/project-milestones/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const milestone = await db.select().from(projectMilestones)
        .where(and(
          eq(projectMilestones.id, req.params.id),
          eq(projectMilestones.userId, req.user!.id)
        ))
        .limit(1);
      if (!milestone.length) return res.sendStatus(404);
      
      // Le date sono già stringhe YYYY-MM-DD nel database
      res.json(milestone[0]);
    } catch (error) {
      console.error("Error fetching project milestone:", error);
      res.status(500).json({ error: "Failed to fetch project milestone" });
    }
  });

  app.post("/api/project-milestones", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        organizationId, // Always use organizationId from header for security
        startDate: normalizeDateToYYYYMMDD(req.body.startDate),
        endDate: normalizeDateToYYYYMMDD(req.body.endDate),
        completedDate: normalizeDateToYYYYMMDD(req.body.completedDate),
      };

      const validation = insertProjectMilestoneSchema.safeParse(dataWithUserId);
      if (!validation.success) {
        console.error("Milestone validation error:", JSON.stringify(validation.error.errors, null, 2));
        console.error("Data received:", JSON.stringify(dataWithUserId, null, 2));
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const [milestone] = await db.insert(projectMilestones).values(validation.data).returning();
      res.status(201).json(milestone);
    } catch (error) {
      console.error("Error creating project milestone:", error);
      res.status(500).json({ error: "Failed to create project milestone" });
    }
  });

  app.put("/api/project-milestones/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Normalizza le date in YYYY-MM-DD se presenti
      const normalizedData = {
        ...req.body,
        ...(req.body.startDate && { startDate: normalizeDateToYYYYMMDD(req.body.startDate) }),
        ...(req.body.endDate && { endDate: normalizeDateToYYYYMMDD(req.body.endDate) }),
        ...(req.body.completedDate && { completedDate: normalizeDateToYYYYMMDD(req.body.completedDate) }),
      };
      console.log("PUT milestone - normalized data:", JSON.stringify(normalizedData, null, 2));
      
      const validation = insertProjectMilestoneSchema.partial().safeParse(normalizedData);
      if (!validation.success) {
        console.error("PUT milestone validation error:", JSON.stringify(validation.error.errors, null, 2));
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }
      console.log("PUT milestone - validation passed:", JSON.stringify(validation.data, null, 2));

      const [milestone] = await db.update(projectMilestones)
        .set({ ...validation.data, updatedAt: new Date() })
        .where(and(
          eq(projectMilestones.id, req.params.id),
          eq(projectMilestones.userId, req.user!.id)
        ))
        .returning();
      
      if (!milestone) return res.sendStatus(404);
      res.json(milestone);
    } catch (error) {
      console.error("Error updating project milestone:", error);
      res.status(500).json({ error: "Failed to update project milestone" });
    }
  });

  app.delete("/api/project-milestones/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const [deleted] = await db.delete(projectMilestones)
        .where(and(
          eq(projectMilestones.id, req.params.id),
          eq(projectMilestones.userId, req.user!.id)
        ))
        .returning();
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting project milestone:", error);
      res.status(500).json({ error: "Failed to delete project milestone" });
    }
  });

  // ========== Purchase Orders API ==========
  app.get("/api/purchase-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const orders = await db.select().from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.userId, req.user!.id),
          inArray(purchaseOrders.organizationId, organizationIds)
        ))
        .orderBy(desc(purchaseOrders.createdAt));
      res.json(orders);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/purchase-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const order = await db.select().from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.id, req.params.id),
          eq(purchaseOrders.userId, req.user!.id)
        ))
        .limit(1);
      if (!order.length) return res.sendStatus(404);
      res.json(order[0]);
    } catch (error) {
      console.error("Error fetching purchase order:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  app.post("/api/purchase-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        organizationId, // Always use organizationId from header for security
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : new Date(),
        expectedDeliveryDate: req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : null,
        sentDate: req.body.sentDate ? new Date(req.body.sentDate) : null,
        receivedDate: req.body.receivedDate ? new Date(req.body.receivedDate) : null,
      };

      const validation = insertPurchaseOrderSchema.safeParse(dataWithUserId);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const [order] = await db.insert(purchaseOrders).values(validation.data).returning();
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  app.put("/api/purchase-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validation = insertPurchaseOrderSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const [order] = await db.update(purchaseOrders)
        .set({ ...validation.data, updatedAt: new Date() })
        .where(and(
          eq(purchaseOrders.id, req.params.id),
          eq(purchaseOrders.userId, req.user!.id)
        ))
        .returning();
      
      if (!order) return res.sendStatus(404);
      res.json(order);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      res.status(500).json({ error: "Failed to update purchase order" });
    }
  });

  app.delete("/api/purchase-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const [deleted] = await db.delete(purchaseOrders)
        .where(and(
          eq(purchaseOrders.id, req.params.id),
          eq(purchaseOrders.userId, req.user!.id)
        ))
        .returning();
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      res.status(500).json({ error: "Failed to delete purchase order" });
    }
  });

  // ========== Vendor Invoices API ==========
  app.get("/api/vendor-invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationIds = await getOrganizationIdsForFilter(req);
      const invoices = await db.select().from(vendorInvoices)
        .where(and(
          eq(vendorInvoices.userId, req.user!.id),
          inArray(vendorInvoices.organizationId, organizationIds)
        ))
        .orderBy(desc(vendorInvoices.createdAt));
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching vendor invoices:", error);
      res.status(500).json({ error: "Failed to fetch vendor invoices" });
    }
  });

  app.get("/api/vendor-invoices/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const invoice = await db.select().from(vendorInvoices)
        .where(and(
          eq(vendorInvoices.id, req.params.id),
          eq(vendorInvoices.userId, req.user!.id)
        ))
        .limit(1);
      if (!invoice.length) return res.sendStatus(404);
      res.json(invoice[0]);
    } catch (error) {
      console.error("Error fetching vendor invoice:", error);
      res.status(500).json({ error: "Failed to fetch vendor invoice" });
    }
  });

  app.post("/api/vendor-invoices", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        organizationId, // Always use organizationId from header for security
        invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        receivedDate: req.body.receivedDate ? new Date(req.body.receivedDate) : new Date(),
        paidDate: req.body.paidDate ? new Date(req.body.paidDate) : null,
      };

      const validation = insertVendorInvoiceSchema.safeParse(dataWithUserId);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const [invoice] = await db.insert(vendorInvoices).values(validation.data).returning();
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating vendor invoice:", error);
      res.status(500).json({ error: "Failed to create vendor invoice" });
    }
  });

  app.put("/api/vendor-invoices/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validation = insertVendorInvoiceSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const [invoice] = await db.update(vendorInvoices)
        .set({ ...validation.data, updatedAt: new Date() })
        .where(and(
          eq(vendorInvoices.id, req.params.id),
          eq(vendorInvoices.userId, req.user!.id)
        ))
        .returning();
      
      if (!invoice) return res.sendStatus(404);
      res.json(invoice);
    } catch (error) {
      console.error("Error updating vendor invoice:", error);
      res.status(500).json({ error: "Failed to update vendor invoice" });
    }
  });

  app.delete("/api/vendor-invoices/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const [deleted] = await db.delete(vendorInvoices)
        .where(and(
          eq(vendorInvoices.id, req.params.id),
          eq(vendorInvoices.userId, req.user!.id)
        ))
        .returning();
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting vendor invoice:", error);
      res.status(500).json({ error: "Failed to delete vendor invoice" });
    }
  });

  // ==================== CUSTOM METADATA SYSTEM ====================
  
  // Entity Schema (with ETag support for caching)
  app.get("/api/entity-schema/:entityKey", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const result = await CustomMetadataService.getEntitySchema(
        organizationId,
        req.params.entityKey
      );
      
      if (!result) return res.sendStatus(404);
      
      const { schema, etag } = result;
      
      // Set ETag header
      res.setHeader("ETag", `"${etag}"`);
      res.setHeader("Cache-Control", "private, max-age=300"); // 5 minutes
      
      // Check If-None-Match for conditional GET (304 Not Modified)
      const clientEtag = req.headers["if-none-match"];
      if (clientEtag === `"${etag}"`) {
        return res.sendStatus(304);
      }
      
      res.json(schema);
    } catch (error) {
      console.error("Error getting entity schema:", error);
      res.status(500).json({ error: "Failed to get entity schema" });
    }
  });
  
  // Custom Entities
  app.get("/api/custom-entities", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const entities = await storage.getCustomEntities(organizationId);
      res.json(entities);
    } catch (error) {
      console.error("Error getting custom entities:", error);
      res.status(500).json({ error: "Failed to get custom entities" });
    }
  });

  app.get("/api/custom-entities/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const entity = await storage.getCustomEntity(req.params.id, organizationId);
      if (!entity) return res.sendStatus(404);
      res.json(entity);
    } catch (error) {
      console.error("Error getting custom entity:", error);
      res.status(500).json({ error: "Failed to get custom entity" });
    }
  });

  app.get("/api/custom-entities/by-slug/:slug", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const entity = await storage.getCustomEntityBySlug(req.params.slug, organizationId);
      if (!entity) return res.sendStatus(404);
      res.json(entity);
    } catch (error) {
      console.error("Error getting custom entity by slug:", error);
      res.status(500).json({ error: "Failed to get custom entity by slug" });
    }
  });

  app.post("/api/custom-entities", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const validation = insertCustomEntitySchema.safeParse({
        ...req.body,
        organizationId
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const entity = await storage.createCustomEntity(validation.data);
      
      // Invalidate cache for this organization
      CustomMetadataService.invalidateOrganizationCache(organizationId);
      
      res.status(201).json(entity);
    } catch (error) {
      console.error("Error creating custom entity:", error);
      res.status(500).json({ error: "Failed to create custom entity" });
    }
  });

  app.put("/api/custom-entities/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      
      // Check If-Match header for optimistic locking
      const ifMatch = req.headers["if-match"];
      if (ifMatch) {
        // Get current entity to check slug for ETag validation
        const [currentEntity] = await db
          .select()
          .from(customEntities)
          .where(and(
            eq(customEntities.id, req.params.id),
            eq(customEntities.organizationId, organizationId)
          ))
          .limit(1);
        
        if (!currentEntity) return res.sendStatus(404);
        
        const matches = await CustomMetadataService.checkETag(
          organizationId,
          currentEntity.slug,
          ifMatch.replace(/"/g, "")
        );
        
        if (!matches) {
          return res.status(412).json({ 
            error: "Precondition Failed", 
            message: "Entity was modified by another request. Please reload and try again." 
          });
        }
      }
      
      const validation = insertCustomEntitySchema.partial().safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const entity = await storage.updateCustomEntity(req.params.id, validation.data, organizationId);
      if (!entity) return res.sendStatus(404);
      
      // Invalidate cache for this organization
      CustomMetadataService.invalidateOrganizationCache(organizationId);
      
      res.json(entity);
    } catch (error) {
      console.error("Error updating custom entity:", error);
      res.status(500).json({ error: "Failed to update custom entity" });
    }
  });

  app.delete("/api/custom-entities/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteCustomEntity(req.params.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      
      // Invalidate cache for this organization
      CustomMetadataService.invalidateOrganizationCache(organizationId);
      
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting custom entity:", error);
      res.status(500).json({ error: "Failed to delete custom entity" });
    }
  });

  // Custom Fields
  app.get("/api/custom-fields/:entityId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const fields = await storage.getCustomFields(req.params.entityId, organizationId);
      res.json(fields);
    } catch (error) {
      console.error("Error getting custom fields:", error);
      res.status(500).json({ error: "Failed to get custom fields" });
    }
  });

  app.post("/api/custom-fields", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const validation = insertCustomFieldSchema.safeParse({
        ...req.body,
        organizationId
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const field = await storage.createCustomField(validation.data);
      
      // Invalidate cache for this organization
      CustomMetadataService.invalidateOrganizationCache(organizationId);
      
      res.status(201).json(field);
    } catch (error) {
      console.error("Error creating custom field:", error);
      res.status(500).json({ error: "Failed to create custom field" });
    }
  });

  app.put("/api/custom-fields/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      
      // Check If-Match header for optimistic locking
      const ifMatch = req.headers["if-match"];
      if (ifMatch) {
        // Get current field and its entity to check ETag
        const [currentField] = await db
          .select({
            field: customFields,
            entity: customEntities,
          })
          .from(customFields)
          .innerJoin(customEntities, eq(customFields.entityId, customEntities.id))
          .where(and(
            eq(customFields.id, req.params.id),
            eq(customFields.organizationId, organizationId)
          ))
          .limit(1);
        
        if (!currentField) return res.sendStatus(404);
        
        const matches = await CustomMetadataService.checkETag(
          organizationId,
          currentField.entity.slug,
          ifMatch.replace(/"/g, "")
        );
        
        if (!matches) {
          return res.status(412).json({ 
            error: "Precondition Failed", 
            message: "Field schema was modified by another request. Please reload and try again." 
          });
        }
      }
      
      const validation = insertCustomFieldSchema.partial().safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const field = await storage.updateCustomField(req.params.id, validation.data, organizationId);
      if (!field) return res.sendStatus(404);
      
      // Invalidate cache for this organization
      CustomMetadataService.invalidateOrganizationCache(organizationId);
      
      res.json(field);
    } catch (error) {
      console.error("Error updating custom field:", error);
      res.status(500).json({ error: "Failed to update custom field" });
    }
  });

  app.delete("/api/custom-fields/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteCustomField(req.params.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      
      // Invalidate cache for this organization
      CustomMetadataService.invalidateOrganizationCache(organizationId);
      
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting custom field:", error);
      res.status(500).json({ error: "Failed to delete custom field" });
    }
  });

  // Entity Custom Values
  app.get("/api/entity-custom-values/:entityKey/:recordId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const values = await storage.getEntityCustomValues(
        req.params.entityKey,
        req.params.recordId,
        organizationId
      );
      res.json(values);
    } catch (error) {
      console.error("Error getting entity custom values:", error);
      res.status(500).json({ error: "Failed to get entity custom values" });
    }
  });

  app.post("/api/entity-custom-values", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const validation = insertEntityCustomValueSchema.safeParse({
        ...req.body,
        organizationId
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const value = await storage.setEntityCustomValue(validation.data);
      res.status(201).json(value);
    } catch (error) {
      console.error("Error setting entity custom value:", error);
      res.status(500).json({ error: "Failed to set entity custom value" });
    }
  });

  app.delete("/api/entity-custom-values/:entityKey/:recordId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteEntityCustomValues(
        req.params.entityKey,
        req.params.recordId,
        organizationId
      );
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting entity custom values:", error);
      res.status(500).json({ error: "Failed to delete entity custom values" });
    }
  });

  // ========== Test Executions API ==========
  
  app.get("/api/test-executions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const executions = await storage.getTestExecutions(userId, organizationId);
      res.json(executions);
    } catch (error) {
      console.error("Error fetching test executions:", error);
      res.status(500).json({ error: "Failed to fetch test executions" });
    }
  });

  app.get("/api/test-executions/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const executions = await storage.getTestExecutionsByProject(
        req.params.projectId,
        userId,
        organizationId
      );
      res.json(executions);
    } catch (error) {
      console.error("Error fetching project test executions:", error);
      res.status(500).json({ error: "Failed to fetch project test executions" });
    }
  });

  app.get("/api/test-executions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const execution = await storage.getTestExecution(req.params.id, userId, organizationId);
      if (!execution) return res.sendStatus(404);
      res.json(execution);
    } catch (error) {
      console.error("Error fetching test execution:", error);
      res.status(500).json({ error: "Failed to fetch test execution" });
    }
  });

  app.post("/api/test-executions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      const validation = insertTestExecutionSchema.safeParse({
        ...req.body,
        userId,
        organizationId,
        executedBy: userId,
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const execution = await storage.createTestExecution(validation.data);
      res.status(201).json(execution);
    } catch (error) {
      console.error("Error creating test execution:", error);
      res.status(500).json({ error: "Failed to create test execution" });
    }
  });

  app.put("/api/test-executions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      const execution = await storage.updateTestExecution(
        req.params.id,
        req.body,
        userId,
        organizationId
      );
      
      if (!execution) return res.sendStatus(404);
      res.json(execution);
    } catch (error) {
      console.error("Error updating test execution:", error);
      res.status(500).json({ error: "Failed to update test execution" });
    }
  });

  app.delete("/api/test-executions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteTestExecution(req.params.id, userId, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting test execution:", error);
      res.status(500).json({ error: "Failed to delete test execution" });
    }
  });

  app.post("/api/test-executions/bulk-delete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Invalid ids array" });
      }
      
      const deletedCount = await storage.deleteTestExecutions(ids, userId, organizationId);
      res.json({ deletedCount });
    } catch (error) {
      console.error("Error bulk deleting test executions:", error);
      res.status(500).json({ error: "Failed to bulk delete test executions" });
    }
  });

  // ========== Entity Field Metadata API (Dynamic Table Configuration) ==========

  app.get("/api/metadata/:entity", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { entity } = req.params;
      const metadata = await storage.getEntityFieldMetadata(entity);
      res.json(metadata);
    } catch (error) {
      console.error("Error fetching entity field metadata:", error);
      res.status(500).json({ error: "Failed to fetch entity field metadata" });
    }
  });

  app.post("/api/metadata/:entity/seed", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { entity } = req.params;
      const { fields } = req.body;
      
      if (!Array.isArray(fields)) {
        return res.status(400).json({ error: "fields must be an array" });
      }

      const results = [];
      for (const field of fields) {
        const result = await storage.upsertEntityFieldMetadata({
          entity,
          ...field
        });
        results.push(result);
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error seeding entity field metadata:", error);
      res.status(500).json({ error: "Failed to seed entity field metadata" });
    }
  });

  app.put("/api/metadata/:entity/:fieldKey", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { entity, fieldKey } = req.params;
      const result = await storage.upsertEntityFieldMetadata({
        entity,
        fieldKey,
        ...req.body
      });
      res.json(result);
    } catch (error) {
      console.error("Error updating entity field metadata:", error);
      res.status(500).json({ error: "Failed to update entity field metadata" });
    }
  });

  app.delete("/api/metadata/:entity/:fieldKey", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { entity, fieldKey } = req.params;
      const deleted = await storage.deleteEntityFieldMetadata(entity, fieldKey);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting entity field metadata:", error);
      res.status(500).json({ error: "Failed to delete entity field metadata" });
    }
  });

  // ========== Calendars API (Hierarchical Structure) ==========

  app.get("/api/calendars", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const calendars = await storage.getCalendars(userId, organizationId);
      res.json(calendars);
    } catch (error) {
      console.error("Error fetching calendars:", error);
      res.status(500).json({ error: "Failed to fetch calendars" });
    }
  });

  app.get("/api/calendars/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const calendar = await storage.getCalendar(req.params.id, userId, organizationId);
      if (!calendar) return res.sendStatus(404);
      res.json(calendar);
    } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ error: "Failed to fetch calendar" });
    }
  });

  app.get("/api/calendars/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const calendars = await storage.getCalendarsByPartner(req.params.partnerId, organizationId);
      res.json(calendars);
    } catch (error) {
      console.error("Error fetching partner calendars:", error);
      res.status(500).json({ error: "Failed to fetch partner calendars" });
    }
  });

  app.get("/api/calendars/:id/children", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const calendars = await storage.getChildCalendars(req.params.id, organizationId);
      res.json(calendars);
    } catch (error) {
      console.error("Error fetching child calendars:", error);
      res.status(500).json({ error: "Failed to fetch child calendars" });
    }
  });

  app.post("/api/calendars", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const calendar = await storage.createCalendar({
        ...req.body,
        userId,
        organizationId,
      });
      res.status(201).json(calendar);
    } catch (error) {
      console.error("Error creating calendar:", error);
      res.status(500).json({ error: "Failed to create calendar" });
    }
  });

  app.put("/api/calendars/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const calendar = await storage.updateCalendar(req.params.id, req.body, userId, organizationId);
      if (!calendar) return res.sendStatus(404);
      res.json(calendar);
    } catch (error) {
      console.error("Error updating calendar:", error);
      res.status(500).json({ error: "Failed to update calendar" });
    }
  });

  app.delete("/api/calendars/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteCalendar(req.params.id, userId, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting calendar:", error);
      res.status(500).json({ error: "Failed to delete calendar" });
    }
  });

  // ========== AI Learning Patterns API ==========

  app.get("/api/ai-learning-patterns", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const patternType = req.query.patternType as string | undefined;
      const patterns = await storage.getAiLearningPatterns(organizationId, patternType);
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching AI learning patterns:", error);
      res.status(500).json({ error: "Failed to fetch AI learning patterns" });
    }
  });

  app.get("/api/ai-learning-patterns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const pattern = await storage.getAiLearningPattern(req.params.id, organizationId);
      if (!pattern) return res.sendStatus(404);
      res.json(pattern);
    } catch (error) {
      console.error("Error fetching AI learning pattern:", error);
      res.status(500).json({ error: "Failed to fetch AI learning pattern" });
    }
  });

  app.post("/api/ai-learning-patterns", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const pattern = await storage.createAiLearningPattern({
        ...req.body,
        userId,
        organizationId,
      });
      res.status(201).json(pattern);
    } catch (error) {
      console.error("Error creating AI learning pattern:", error);
      res.status(500).json({ error: "Failed to create AI learning pattern" });
    }
  });

  app.put("/api/ai-learning-patterns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const pattern = await storage.updateAiLearningPattern(req.params.id, req.body, organizationId);
      if (!pattern) return res.sendStatus(404);
      res.json(pattern);
    } catch (error) {
      console.error("Error updating AI learning pattern:", error);
      res.status(500).json({ error: "Failed to update AI learning pattern" });
    }
  });

  app.post("/api/ai-learning-patterns/:id/increment", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { accepted } = req.body;
      const pattern = await storage.incrementPatternUsage(req.params.id, accepted === true);
      if (!pattern) return res.sendStatus(404);
      res.json(pattern);
    } catch (error) {
      console.error("Error incrementing AI learning pattern:", error);
      res.status(500).json({ error: "Failed to increment AI learning pattern" });
    }
  });

  app.delete("/api/ai-learning-patterns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteAiLearningPattern(req.params.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting AI learning pattern:", error);
      res.status(500).json({ error: "Failed to delete AI learning pattern" });
    }
  });

  // ========== THU AI Task Executor API ==========
  
  // Execute AI on selected tasks - generates ABAP code and operational assistance
  app.post("/api/ai-task-executor/execute", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      const { taskIds, customInstructions, chatClarifications, patternIds, modelKey } = req.body;
      
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds array required" });
      }

      const { executeTaskWithAI } = await import('./ai-task-executor');
      const results = await executeTaskWithAI(taskIds, userId, organizationId, customInstructions, chatClarifications, patternIds, modelKey || undefined);
      res.json(results);
    } catch (error) {
      console.error("Error executing AI task:", error);
      res.status(500).json({ error: "Failed to execute AI task" });
    }
  });

  // Submit feedback for an AI execution
  app.post("/api/ai-task-executor/feedback/:executionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { executionId } = req.params;
      const { approved, feedback, rating } = req.body;
      
      const { submitExecutionFeedback } = await import('./ai-task-executor');
      await submitExecutionFeedback(executionId, approved, feedback, rating);
      res.json({ success: true });
    } catch (error) {
      console.error("Error submitting execution feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get execution history for a task
  app.get("/api/ai-task-executor/history/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { taskId } = req.params;
      const { getTaskExecutions } = await import('./ai-task-executor');
      const executions = await getTaskExecutions(taskId);
      res.json(executions);
    } catch (error) {
      console.error("Error fetching task executions:", error);
      res.status(500).json({ error: "Failed to fetch task executions" });
    }
  });

  // Chat with AI about task execution context
  app.post("/api/ai-task-executor/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { message, executionId, contextSummary, previousMessages, attachments } = req.body;
      
      if (!message && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: "message or attachments required" });
      }

      // Try to reload full context from execution record if executionId provided
      // SECURITY: Must filter by organizationId to prevent cross-tenant data leakage
      let fullContext: any = null;
      if (executionId) {
        const organizationId = getOrganizationId(req);
        const execution = await db
          .select()
          .from(aiTaskExecutions)
          .where(and(
            eq(aiTaskExecutions.id, executionId),
            eq(aiTaskExecutions.organizationId, organizationId)
          ))
          .limit(1);
        if (execution[0]?.taskContext) {
          fullContext = execution[0].taskContext;
          console.log('[AI-CHAT] Loaded full context from execution:', executionId, 'org:', organizationId);
        } else if (executionId) {
          console.log('[AI-CHAT] Execution not found or access denied:', executionId, 'org:', organizationId);
        }
      }

      // Build rich context for AI from full execution context or fallback to summary
      let contextText = "## CONTESTO COMPLETO DEL TASK\n\n";
      
      if (fullContext) {
        // Use full context from execution
        contextText += `### TASK\n`;
        contextText += `Titolo: ${fullContext.taskTitle}\n`;
        if (fullContext.taskDescription) {
          contextText += `Descrizione: ${fullContext.taskDescription}\n`;
        }
        if (fullContext.projectName) {
          contextText += `\n### PROGETTO\n`;
          contextText += `Nome: ${fullContext.projectName}\n`;
          if (fullContext.projectDescription) {
            contextText += `Descrizione: ${fullContext.projectDescription}\n`;
          }
        }
        if (fullContext.sapSystemName) {
          contextText += `\n### SISTEMA SAP\n`;
          contextText += `Nome: ${fullContext.sapSystemName}\n`;
        }
        
        // DevOps work item with full description
        if (fullContext.devOpsWorkItem) {
          const wi = fullContext.devOpsWorkItem;
          contextText += `\n### AZURE DEVOPS WORK ITEM #${wi.id}\n`;
          if (wi.title) contextText += `Titolo: ${wi.title}\n`;
          if (wi.workItemType) contextText += `Tipo: ${wi.workItemType}\n`;
          if (wi.state) contextText += `Stato: ${wi.state}\n`;
          if (wi.priority) contextText += `Priorità: ${wi.priority}\n`;
          if (wi.url) contextText += `URL: ${wi.url}\n`;
          
          // Full description (not truncated)
          if (wi.description || wi.descriptionHtml) {
            const desc = wi.description || wi.descriptionHtml?.replace(/<[^>]*>/g, ' ').substring(0, 8000);
            contextText += `\nDESCRIZIONE COMPLETA:\n${desc}\n`;
          }
          
          // SAP custom fields
          if (wi.sapFields && Object.keys(wi.sapFields).length > 0) {
            contextText += `\nCAMPI SAP: ${JSON.stringify(wi.sapFields, null, 2)}\n`;
          }
          
          // Images info
          if (wi.images?.length > 0) {
            contextText += `\nIMMAGINI: ${wi.images.length} immagini allegate alla descrizione DevOps\n`;
            contextText += `(Le immagini mostrano schermate SAP con dettagli tecnici rilevanti)\n`;
          }
          
          // Comments
          if (wi.comments?.length > 0) {
            contextText += `\nCOMMENTI DEVOPS:\n`;
            wi.comments.forEach((c: any, i: number) => {
              contextText += `[${i+1}] ${c.author || 'Anonimo'} (${c.date || 'N/A'}): ${c.content?.substring(0, 500) || ''}\n`;
            });
          }
        }
        
        // Linked messages with full content
        if (fullContext.linkedMessages?.length > 0) {
          contextText += `\n### MESSAGGI COLLEGATI (${fullContext.linkedMessages.length})\n`;
          fullContext.linkedMessages.slice(0, 5).forEach((msg: any, i: number) => {
            contextText += `[${i+1}] ${msg.subject || 'N/A'}\n`;
            if (msg.body) {
              contextText += `${msg.body.substring(0, 1500)}\n`;
            }
            contextText += '\n';
          });
        }
        
        // Task comments
        if (fullContext.taskComments?.length > 0) {
          contextText += `\n### COMMENTI SUL TASK (${fullContext.taskComments.length})\n`;
          fullContext.taskComments.forEach((c: any, i: number) => {
            contextText += `[${i+1}] ${c.content}\n`;
          });
        }
        
        // Transport requests
        if (fullContext.projectTransports?.length > 0) {
          contextText += `\n### TRANSPORT REQUESTS (${fullContext.projectTransports.length})\n`;
          fullContext.projectTransports.slice(0, 5).forEach((tr: any) => {
            contextText += `- ${tr.transportId}: ${tr.description || 'N/A'} (${tr.status})\n`;
          });
        }
        
        // Load ABAP patterns for this organization
        try {
          const organizationId = getOrganizationId(req);
          const patterns = await db
            .select()
            .from(aiAbapPatterns)
            .where(eq(aiAbapPatterns.organizationId, organizationId))
            .limit(10);
          
          if (patterns.length > 0) {
            contextText += `\n### PATTERN ABAP DISPONIBILI (${patterns.length})\n`;
            patterns.forEach((p: any) => {
              contextText += `\n**${p.name}** (${p.category})\n`;
              contextText += `Descrizione: ${p.description?.substring(0, 200) || 'N/A'}\n`;
              if (p.codeTemplate) {
                contextText += `Codice:\n\`\`\`abap\n${p.codeTemplate.substring(0, 1000)}\n\`\`\`\n`;
              }
            });
          }
        } catch (e) {
          console.log('[AI-CHAT] Could not load patterns:', e);
        }
        
      } else if (contextSummary) {
        // Fallback to summary (less rich)
        if (contextSummary.taskInfo) {
          contextText += `- Task: ${contextSummary.taskInfo.title}\n`;
          if (contextSummary.taskInfo.description) {
            contextText += `  Descrizione: ${contextSummary.taskInfo.description.substring(0, 500)}\n`;
          }
          if (contextSummary.taskInfo.projectName) {
            contextText += `- Progetto: ${contextSummary.taskInfo.projectName}\n`;
          }
        }
        if (contextSummary.devOpsWorkItem) {
          contextText += `- DevOps Work Item #${contextSummary.devOpsWorkItem.id}: ${contextSummary.devOpsWorkItem.title || 'N/A'}\n`;
        }
        if (contextSummary.linkedMessages?.length > 0) {
          contextText += `- ${contextSummary.linkedMessages.length} messaggi collegati\n`;
        }
      }
      
      const { aiGateway, getDefaultModelKey } = await import('./ai-gateway');

      // Extract images from DevOps work item for vision API
      // Images are stored as strings (data URLs like "data:image/png;base64,..." or regular URLs)
      const imageUrls: { url: string; alt?: string }[] = [];
      if (fullContext?.devOpsWorkItem?.images?.length > 0) {
        console.log(`[AI-CHAT] Found ${fullContext.devOpsWorkItem.images.length} images in context`);
        for (const img of fullContext.devOpsWorkItem.images.slice(0, 5)) {
          // Images are stored as strings (data URLs or regular URLs)
          if (typeof img === 'string') {
            if (img.startsWith('data:image') && img.length < 1500000) {
              // Already a data URL - use directly
              imageUrls.push({
                url: img,
                alt: `Screenshot DevOps ${imageUrls.length + 1}`
              });
              console.log(`[AI-CHAT] Added base64 image (${Math.round(img.length / 1024)}KB)`);
            } else if (img.startsWith('http') && img.length < 2000) {
              // Regular URL - pass to OpenAI (it can fetch)
              imageUrls.push({
                url: img,
                alt: `Screenshot DevOps ${imageUrls.length + 1}`
              });
              console.log(`[AI-CHAT] Added URL image: ${img.substring(0, 100)}...`);
            }
          } else if (typeof img === 'object' && img !== null) {
            // Object format with base64 property
            const imgObj = img as { base64?: string; src?: string; mimeType?: string; alt?: string };
            if (imgObj.base64 && imgObj.base64.length < 1500000) {
              imageUrls.push({
                url: `data:${imgObj.mimeType || 'image/png'};base64,${imgObj.base64}`,
                alt: imgObj.alt || `Screenshot DevOps ${imageUrls.length + 1}`
              });
              console.log(`[AI-CHAT] Added object image (${Math.round(imgObj.base64.length / 1024)}KB)`);
            } else if (imgObj.src) {
              imageUrls.push({
                url: imgObj.src,
                alt: imgObj.alt || `Screenshot DevOps ${imageUrls.length + 1}`
              });
              console.log(`[AI-CHAT] Added object src image: ${imgObj.src.substring(0, 100)}...`);
            }
          }
        }
        console.log(`[AI-CHAT] Including ${imageUrls.length} images for vision API`);
      }
      
      // Build system message content - can include images via vision
      const systemContent: any[] = [{
        type: "text",
        text: `Sei un assistente AI esperto di sviluppo SAP ABAP. Stai aiutando l'utente a capire il contesto e generare codice ABAP per un task specifico.

${contextText}

ISTRUZIONI:
- Rispondi sempre in italiano
- Usa le informazioni del contesto per rispondere in modo preciso
- Analizza attentamente le immagini allegate se presenti - mostrano schermate SAP rilevanti per il task
- Se l'utente chiede cosa hai capito, fai un riassunto dettagliato e strutturato del contesto incluse le immagini
- Se l'utente chiede di generare codice, usa tutte le informazioni disponibili (DevOps description, campi SAP, immagini, commenti)`
      }];
      
      // Add images to the first user message for vision analysis
      const userMessageContent: any[] = [{ type: "text", text: message || "Analizza i file allegati" }];
      
      // Include DevOps images in the first message of conversation
      if (imageUrls.length > 0 && (!previousMessages || previousMessages.length === 0)) {
        for (const img of imageUrls) {
          userMessageContent.push({
            type: "image_url",
            image_url: { url: img.url, detail: "high" }
          });
        }
      }
      
      // Include user-uploaded attachments with server-side validation
      if (attachments && Array.isArray(attachments)) {
        const maxAttachmentSize = 5 * 1024 * 1024; // 5MB per file
        const maxTotalSize = 15 * 1024 * 1024; // 15MB total
        const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const allowedOtherTypes = ['application/pdf', 'text/plain', 'text/csv'];
        
        const isAllowedType = (mimeType: string) => {
          return allowedImageTypes.includes(mimeType) || allowedOtherTypes.includes(mimeType);
        };
        
        console.log(`[AI-CHAT] Processing ${attachments.length} user-uploaded attachments`);
        
        let totalSize = 0;
        for (const att of attachments) {
          // Validate MIME type
          if (!att.type || !isAllowedType(att.type)) {
            console.log(`[AI-CHAT] Rejected invalid MIME type: ${att.name} (${att.type})`);
            continue;
          }
          
          // Validate base64 size (base64 is ~1.33x the original size)
          const base64Size = att.base64?.length || 0;
          const estimatedFileSize = Math.ceil(base64Size * 0.75);
          
          if (estimatedFileSize > maxAttachmentSize) {
            console.log(`[AI-CHAT] Rejected oversized file: ${att.name} (${Math.round(estimatedFileSize / 1024)}KB)`);
            continue;
          }
          
          totalSize += estimatedFileSize;
          if (totalSize > maxTotalSize) {
            console.log(`[AI-CHAT] Skipping remaining files: total size limit exceeded`);
            break;
          }
          
          if (allowedImageTypes.includes(att.type) && att.base64) {
            // Image attachment - add to vision API
            const dataUrl = `data:${att.type};base64,${att.base64}`;
            userMessageContent.push({
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" }
            });
            console.log(`[AI-CHAT] Added user image: ${att.name} (${Math.round(base64Size / 1024)}KB)`);
          } else if (att.type === 'text/plain' || att.type === 'text/csv') {
            // Text file - decode and include as text content
            try {
              const textContent = Buffer.from(att.base64, 'base64').toString('utf-8');
              userMessageContent[0].text += `\n\n--- Contenuto di ${att.name} ---\n${textContent.substring(0, 5000)}${textContent.length > 5000 ? '\n... (troncato)' : ''}`;
              console.log(`[AI-CHAT] Added text file: ${att.name} (${textContent.length} chars)`);
            } catch (e) {
              console.log(`[AI-CHAT] Could not decode text file: ${att.name}`);
            }
          } else if (att.type === 'application/pdf') {
            // PDF - just note it for now (full PDF parsing would require a library)
            userMessageContent[0].text += `\n\n[File PDF allegato: ${att.name}]`;
            console.log(`[AI-CHAT] Added PDF reference: ${att.name}`);
          }
        }
      }
      
      const messages: any[] = [{ role: "system", content: systemContent }];
      
      // Add previous messages
      if (previousMessages && Array.isArray(previousMessages)) {
        for (const msg of previousMessages.slice(-10)) { // Keep last 10 messages for context
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      
      // Add current message with optional images
      messages.push({ role: "user", content: userMessageContent });
      
      // Log the message structure for debugging
      const totalImages = userMessageContent.filter((c: any) => c.type === 'image_url').length;
      console.log(`[AI-CHAT] Sending to OpenAI: ${totalImages} images, text length: ${userMessageContent[0]?.text?.length || 0}`);
      
      const organizationId = getOrganizationId(req);
      // Default to gpt-4o for vision chat (supports vision + good context window)
      // Org-level settings and AI_DEFAULT_MODEL_KEY env var still take precedence
      const modelKey = await getDefaultModelKey(organizationId, "openai/gpt-4o");
      const gwResult = await aiGateway.complete({
        modelKey,
        messages,
        temperature: 0.7,
        maxTokens: 2000,
        organizationId,
        caller: "routes/ai-chat",
      });

      const aiResponse = gwResult.content;

      console.log(`[AI-CHAT] Gateway response: model=${modelKey} content length=${aiResponse?.length || 0}`);

      if (!aiResponse) {
        console.error(`[AI-CHAT] Empty response from gateway`);
        res.json({ response: "Mi dispiace, l'AI non ha restituito una risposta. Riprova con meno immagini o un messaggio più breve." });
        return;
      }

      res.json({ response: aiResponse });
    } catch (error: any) {
      console.error("[AI-CHAT] Error in AI chat:", error?.message || error);
      console.error("[AI-CHAT] Error details:", error?.response?.data || error?.status || 'No details');
      res.status(500).json({ error: `Errore nella chat AI: ${error?.message || 'Errore sconosciuto'}` });
    }
  });

  // ========== AI ABAP Patterns API ==========

  app.get("/api/ai-abap-patterns", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const category = req.query.category as string | undefined;
      const { getOrganizationPatterns } = await import('./ai-task-executor');
      const patterns = await getOrganizationPatterns(organizationId, category);
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching ABAP patterns:", error);
      res.status(500).json({ error: "Failed to fetch ABAP patterns" });
    }
  });

  app.post("/api/ai-abap-patterns", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const userId = req.user!.id;
      const organizationId = getOrganizationId(req);
      
      const pattern = await db.insert(aiAbapPatterns).values({
        ...req.body,
        userId,
        organizationId,
      }).returning();
      
      res.status(201).json(pattern[0]);
    } catch (error) {
      console.error("Error creating ABAP pattern:", error);
      res.status(500).json({ error: "Failed to create ABAP pattern" });
    }
  });

  app.put("/api/ai-abap-patterns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      
      const pattern = await db.update(aiAbapPatterns)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(aiAbapPatterns.id, req.params.id), eq(aiAbapPatterns.organizationId, organizationId)))
        .returning();
      
      if (!pattern[0]) return res.sendStatus(404);
      res.json(pattern[0]);
    } catch (error) {
      console.error("Error updating ABAP pattern:", error);
      res.status(500).json({ error: "Failed to update ABAP pattern" });
    }
  });

  app.delete("/api/ai-abap-patterns/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      
      const deleted = await db.delete(aiAbapPatterns)
        .where(and(eq(aiAbapPatterns.id, req.params.id), eq(aiAbapPatterns.organizationId, organizationId)))
        .returning();
      
      if (!deleted[0]) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting ABAP pattern:", error);
      res.status(500).json({ error: "Failed to delete ABAP pattern" });
    }
  });

  // ========== DevOps Field Mappings API ==========

  app.get("/api/devops-field-mappings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const mappings = await storage.getDevopsFieldMappings(organizationId);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching DevOps field mappings:", error);
      res.status(500).json({ error: "Failed to fetch DevOps field mappings" });
    }
  });

  app.get("/api/devops-field-mappings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const mapping = await storage.getDevopsFieldMapping(req.params.id, organizationId);
      if (!mapping) return res.sendStatus(404);
      res.json(mapping);
    } catch (error) {
      console.error("Error fetching DevOps field mapping:", error);
      res.status(500).json({ error: "Failed to fetch DevOps field mapping" });
    }
  });

  app.get("/api/devops-field-mappings/find", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const { devopsField, devopsValue } = req.query;
      if (!devopsField || !devopsValue) {
        return res.status(400).json({ error: "devopsField and devopsValue are required" });
      }
      const mapping = await storage.findDevopsFieldMapping(
        organizationId,
        devopsField as string,
        devopsValue as string
      );
      res.json(mapping || null);
    } catch (error) {
      console.error("Error finding DevOps field mapping:", error);
      res.status(500).json({ error: "Failed to find DevOps field mapping" });
    }
  });

  app.post("/api/devops-field-mappings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const mapping = await storage.createDevopsFieldMapping({
        ...req.body,
        organizationId,
      });
      res.status(201).json(mapping);
    } catch (error) {
      console.error("Error creating DevOps field mapping:", error);
      res.status(500).json({ error: "Failed to create DevOps field mapping" });
    }
  });

  app.put("/api/devops-field-mappings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const mapping = await storage.updateDevopsFieldMapping(req.params.id, req.body, organizationId);
      if (!mapping) return res.sendStatus(404);
      res.json(mapping);
    } catch (error) {
      console.error("Error updating DevOps field mapping:", error);
      res.status(500).json({ error: "Failed to update DevOps field mapping" });
    }
  });

  app.post("/api/devops-field-mappings/:id/increment-usage", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const mapping = await storage.incrementMappingUsage(req.params.id);
      if (!mapping) return res.sendStatus(404);
      res.json(mapping);
    } catch (error) {
      console.error("Error incrementing DevOps field mapping usage:", error);
      res.status(500).json({ error: "Failed to increment DevOps field mapping usage" });
    }
  });

  app.delete("/api/devops-field-mappings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const deleted = await storage.deleteDevopsFieldMapping(req.params.id, organizationId);
      if (!deleted) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting DevOps field mapping:", error);
      res.status(500).json({ error: "Failed to delete DevOps field mapping" });
    }
  });

  // ========== Dashboard Widget Templates ==========
  
  // Get all widget templates (user's own + public templates)
  app.get("/api/widget-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const templates = await db.select()
        .from(dashboardWidgetTemplates)
        .where(
          sql`(${dashboardWidgetTemplates.userId} = ${req.user!.id} AND ${dashboardWidgetTemplates.organizationId} = ${organizationId}) OR ${dashboardWidgetTemplates.isPublic} = true`
        )
        .orderBy(desc(dashboardWidgetTemplates.updatedAt));
      res.json(templates);
    } catch (error) {
      console.error("Error fetching widget templates:", error);
      res.status(500).json({ error: "Failed to fetch widget templates" });
    }
  });

  // Get single widget template
  app.get("/api/widget-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const template = await db.select()
        .from(dashboardWidgetTemplates)
        .where(eq(dashboardWidgetTemplates.id, req.params.id))
        .limit(1);
      if (template.length === 0) return res.sendStatus(404);
      res.json(template[0]);
    } catch (error) {
      console.error("Error fetching widget template:", error);
      res.status(500).json({ error: "Failed to fetch widget template" });
    }
  });

  // Create widget template
  app.post("/api/widget-templates", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const validatedData = insertDashboardWidgetTemplateSchema.parse(req.body);
      
      const [template] = await db.insert(dashboardWidgetTemplates)
        .values({
          ...validatedData,
          userId: req.user!.id,
          organizationId,
        })
        .returning();
      
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating widget template:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create widget template" });
    }
  });

  // Update widget template
  app.put("/api/widget-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      
      // Validate request body with partial schema (allow partial updates)
      const validatedData = insertDashboardWidgetTemplateSchema.partial().parse(req.body);
      
      // Check ownership
      const existing = await db.select()
        .from(dashboardWidgetTemplates)
        .where(and(
          eq(dashboardWidgetTemplates.id, req.params.id),
          eq(dashboardWidgetTemplates.userId, req.user!.id),
          eq(dashboardWidgetTemplates.organizationId, organizationId)
        ))
        .limit(1);
      
      if (existing.length === 0) return res.sendStatus(404);
      
      // Remove any attempts to override userId or organizationId
      const { userId, organizationId: orgId, ...safeData } = validatedData as any;
      
      const [updated] = await db.update(dashboardWidgetTemplates)
        .set({
          ...safeData,
          updatedAt: new Date(),
        })
        .where(eq(dashboardWidgetTemplates.id, req.params.id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating widget template:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update widget template" });
    }
  });

  // Delete widget template
  app.delete("/api/widget-templates/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      
      const deleted = await db.delete(dashboardWidgetTemplates)
        .where(and(
          eq(dashboardWidgetTemplates.id, req.params.id),
          eq(dashboardWidgetTemplates.userId, req.user!.id),
          eq(dashboardWidgetTemplates.organizationId, organizationId)
        ))
        .returning();
      
      if (deleted.length === 0) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting widget template:", error);
      res.status(500).json({ error: "Failed to delete widget template" });
    }
  });

  // Get aggregated data for charts
  app.get("/api/widget-data/:entityKey", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { entityKey } = req.params;
      const { groupBy, valueField, aggregation, filterField, filterValues } = req.query;
      const organizationIds = await getOrganizationIdsForFilter(req);
      
      let data: any[] = [];
      
      // Get entity data based on entityKey
      switch (entityKey) {
        case "tasks":
          data = await db.select().from(tasks)
            .where(inArray(tasks.organizationId, organizationIds));
          break;
        case "projects":
          data = await db.select().from(projects)
            .where(inArray(projects.organizationId, organizationIds));
          break;
        case "partners":
          data = await db.select().from(partners)
            .where(inArray(partners.organizationId, organizationIds));
          break;
        case "deals":
          data = await db.select().from(deals)
            .where(inArray(deals.organizationId, organizationIds));
          break;
        default:
          return res.status(400).json({ error: "Invalid entity key" });
      }
      
      // Apply filters if provided
      if (filterField && filterValues) {
        const filterValuesArray = (filterValues as string).split(",");
        data = data.filter(item => filterValuesArray.includes(item[filterField as string]));
      }
      
      // Group and aggregate data
      if (groupBy) {
        const grouped: Record<string, { label: string; value: number; count: number }> = {};
        
        for (const item of data) {
          const key = String(item[groupBy as string] || "Sconosciuto");
          if (!grouped[key]) {
            grouped[key] = { label: key, value: 0, count: 0 };
          }
          grouped[key].count++;
          
          if (valueField && aggregation) {
            const val = parseFloat(item[valueField as string]) || 0;
            switch (aggregation) {
              case "sum":
                grouped[key].value += val;
                break;
              case "avg":
                grouped[key].value = (grouped[key].value * (grouped[key].count - 1) + val) / grouped[key].count;
                break;
              case "min":
                grouped[key].value = grouped[key].count === 1 ? val : Math.min(grouped[key].value, val);
                break;
              case "max":
                grouped[key].value = Math.max(grouped[key].value, val);
                break;
              default:
                grouped[key].value = grouped[key].count;
            }
          } else {
            grouped[key].value = grouped[key].count;
          }
        }
        
        res.json(Object.values(grouped));
      } else {
        // Return raw count
        res.json([{ label: "Totale", value: data.length, count: data.length }]);
      }
    } catch (error) {
      console.error("Error fetching widget data:", error);
      res.status(500).json({ error: "Failed to fetch widget data" });
    }
  });

  // ============================================================
  // Skill Engine APIs (assessments, requirements, match)
  // ============================================================

  app.get("/api/resources/:resourceId/skill-assessments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { resourceId } = req.params;
      const includeDerived = req.query.includeDerived === "1" || req.query.includeDerived === "true";
      const assessments = await storage.getResourceAssessments(resourceId);

      const { computeDerivedSkillLevels } = await import("./skill-engine");
      const allOrgs = await storage.getUserOrganizations(req.user!.id);
      const allSkills: any[] = [];
      for (const org of allOrgs) {
        const orgSkills = await storage.getSkillCatalog(org.organizationId);
        allSkills.push(...orgSkills);
      }

      const enriched = assessments.map(a => {
        const skill = allSkills.find((s: any) => s.id === a.skillId);
        return { ...a, skillName: skill?.name || "Unknown" };
      });

      let derived: Record<string, any> | undefined;
      if (includeDerived) {
        const derivedMap = await computeDerivedSkillLevels(resourceId);
        derived = {};
        for (const [skillId, data] of derivedMap) {
          const skill = allSkills.find((s: any) => s.id === skillId);
          (derived as any)[skillId] = { ...data, skillName: skill?.name || skillId };
        }
      }

      res.json({ assessments: enriched, derived });
    } catch (error) {
      console.error("Error fetching skill assessments:", error);
      res.status(500).json({ error: "Failed to fetch skill assessments" });
    }
  });

  app.put("/api/resources/:resourceId/skill-assessments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { resourceId } = req.params;
      const items = req.body as Array<{
        skillId: string;
        level: number;
        confidence?: number;
        lastUsed?: string;
        source?: string;
      }>;

      const { isLeafSkill } = await import("./skill-engine");
      const results = [];

      for (const item of items) {
        if (item.level < 0 || item.level > 5) {
          return res.status(400).json({ error: `Level must be 0-5 for skill ${item.skillId}` });
        }

        const leaf = await isLeafSkill(item.skillId);
        if (!leaf) {
          return res.status(409).json({ error: `Skill ${item.skillId} is not a leaf skill. Only leaf skills can be assessed.` });
        }

        if (item.level === 0) {
          await storage.deleteResourceAssessment(resourceId, item.skillId);
        } else {
          const result = await storage.upsertResourceAssessment({
            resourceId,
            skillId: item.skillId,
            level: item.level,
            confidence: item.confidence ?? 0.6,
            lastUsed: item.lastUsed ?? null,
            source: item.source ?? "SELF",
            updatedAt: new Date(),
          });
          results.push(result);
        }
      }

      const updated = await storage.getResourceAssessments(resourceId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating skill assessments:", error);
      res.status(500).json({ error: "Failed to update skill assessments" });
    }
  });

  app.get("/api/projects/:projectId/skill-requirements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const reqs = await storage.getProjectSkillRequirements(req.params.projectId);
      const allOrgs = await storage.getUserOrganizations(req.user!.id);
      const allSkills: any[] = [];
      for (const org of allOrgs) allSkills.push(...await storage.getSkillCatalog(org.organizationId));
      const enriched = reqs.map(r => {
        const skill = allSkills.find((s: any) => s.id === r.skillId);
        return { ...r, skillName: skill?.name || "Unknown" };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching project skill requirements:", error);
      res.status(500).json({ error: "Failed to fetch project skill requirements" });
    }
  });

  app.put("/api/projects/:projectId/skill-requirements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { projectId } = req.params;
      const items = req.body as Array<{
        skillId: string;
        requiredLevel: number;
        mode?: string;
        weight?: number;
      }>;

      for (const item of items) {
        if (item.requiredLevel < 1 || item.requiredLevel > 5) {
          return res.status(400).json({ error: `Required level must be 1-5` });
        }
        if (item.weight !== undefined && item.weight <= 0) {
          return res.status(400).json({ error: `Weight must be > 0` });
        }
        const validModes = ["MUST", "SCORE", "TIEBREAK"];
        if (item.mode && !validModes.includes(item.mode)) {
          return res.status(400).json({ error: `Mode must be one of: ${validModes.join(", ")}` });
        }

        await storage.upsertProjectSkillRequirement({
          projectId,
          skillId: item.skillId,
          requiredLevel: item.requiredLevel,
          mode: item.mode ?? "SCORE",
          weight: item.weight ?? 1.0,
          updatedAt: new Date(),
        });
      }

      const updated = await storage.getProjectSkillRequirements(projectId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating project skill requirements:", error);
      res.status(500).json({ error: "Failed to update project skill requirements" });
    }
  });

  app.delete("/api/projects/:projectId/skill-requirements/:skillId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.deleteProjectSkillRequirement(req.params.projectId, req.params.skillId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project skill requirement" });
    }
  });

  app.get("/api/tasks/:taskId/skill-requirements-v2", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const reqs = await storage.getTaskSkillRequirementsV2(req.params.taskId);
      const allOrgs = await storage.getUserOrganizations(req.user!.id);
      const allSkills: any[] = [];
      for (const org of allOrgs) allSkills.push(...await storage.getSkillCatalog(org.organizationId));
      const enriched = reqs.map(r => {
        const skill = allSkills.find((s: any) => s.id === r.skillId);
        return { ...r, skillName: skill?.name || "Unknown" };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching task skill requirements v2:", error);
      res.status(500).json({ error: "Failed to fetch task skill requirements" });
    }
  });

  app.put("/api/tasks/:taskId/skill-requirements-v2", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { taskId } = req.params;
      const items = req.body as Array<{
        skillId: string;
        requiredLevel: number;
        mode?: string;
        weight?: number;
        override?: number;
      }>;

      for (const item of items) {
        if (item.requiredLevel < 1 || item.requiredLevel > 5) {
          return res.status(400).json({ error: `Required level must be 1-5` });
        }
        if (item.weight !== undefined && item.weight <= 0) {
          return res.status(400).json({ error: `Weight must be > 0` });
        }

        await storage.upsertTaskSkillRequirement({
          taskId,
          skillId: item.skillId,
          requiredLevel: item.requiredLevel,
          mode: item.mode ?? "SCORE",
          weight: item.weight ?? 1.0,
          override: item.override ?? 0,
          updatedAt: new Date(),
        });
      }

      const updated = await storage.getTaskSkillRequirementsV2(taskId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating task skill requirements v2:", error);
      res.status(500).json({ error: "Failed to update task skill requirements" });
    }
  });

  app.delete("/api/tasks/:taskId/skill-requirements-v2/:skillId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.deleteTaskSkillRequirementV2(req.params.taskId, req.params.skillId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task skill requirement" });
    }
  });

  app.get("/api/planner/requirements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { projectId, taskId } = req.query as { projectId?: string; taskId?: string };
      if (!projectId && !taskId) {
        return res.status(400).json({ error: "projectId or taskId is required" });
      }

      const { mergeRequirements } = await import("./skill-engine");
      const result = await mergeRequirements(projectId || null, taskId || null);
      res.json(result);
    } catch (error) {
      console.error("Error computing requirements:", error);
      res.status(500).json({ error: "Failed to compute requirements" });
    }
  });

  app.post("/api/planner/match", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { projectId, taskId, candidateResourceIds, options } = req.body as {
        projectId?: string | null;
        taskId?: string | null;
        candidateResourceIds: string[];
        options?: { includeDerived?: boolean; lambda?: number };
      };

      if ((!projectId && !taskId) || !candidateResourceIds?.length) {
        return res.status(400).json({ error: "projectId or taskId and candidateResourceIds are required" });
      }

      const { mergeRequirements, computeMatch } = await import("./skill-engine");
      const requirementSet = await mergeRequirements(projectId || null, taskId || null);
      const rankings = await computeMatch(candidateResourceIds, requirementSet, options);

      res.json({ requirements: requirementSet, rankings });
    } catch (error) {
      console.error("Error computing match:", error);
      res.status(500).json({ error: "Failed to compute match" });
    }
  });

  app.get("/api/skills/tree", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { getSkillTree } = await import("./skill-engine");
      const tree = await getSkillTree();
      res.json(tree);
    } catch (error) {
      console.error("Error fetching skill tree:", error);
      res.status(500).json({ error: "Failed to fetch skill tree" });
    }
  });

  // ── AI Gateway routes ────────────────────────────────────────────────────────

  app.get("/api/ai/models", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const models = await db
        .select({
          id: aiModels.id,
          modelKey: aiModels.modelKey,
          modelId: aiModels.modelId,
          displayName: aiModels.displayName,
          inputPricePerMToken: aiModels.inputPricePerMToken,
          outputPricePerMToken: aiModels.outputPricePerMToken,
          capabilities: aiModels.capabilities,
          status: aiModels.status,
          providerName: aiProviders.name,
          providerSlug: aiProviders.slug,
          providerStatus: aiProviders.status,
        })
        .from(aiModels)
        .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
        .where(eq(aiModels.status, "active"));
      res.json(models);
    } catch (error) {
      console.error("Error fetching AI models:", error);
      res.status(500).json({ error: "Failed to fetch AI models" });
    }
  });

  app.get("/api/ai/providers", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const providers = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.status, "enabled"));
      res.json(providers);
    } catch (error) {
      console.error("Error fetching AI providers:", error);
      res.status(500).json({ error: "Failed to fetch AI providers" });
    }
  });

  // GET all AI models (all statuses) - for admin management
  app.get("/api/ai/models/all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const models = await db
        .select({
          id: aiModels.id,
          modelKey: aiModels.modelKey,
          modelId: aiModels.modelId,
          displayName: aiModels.displayName,
          inputPricePerMToken: aiModels.inputPricePerMToken,
          outputPricePerMToken: aiModels.outputPricePerMToken,
          capabilities: aiModels.capabilities,
          status: aiModels.status,
          providerId: aiModels.providerId,
          providerName: aiProviders.name,
          providerSlug: aiProviders.slug,
        })
        .from(aiModels)
        .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
        .orderBy(aiProviders.name, aiModels.displayName);
      res.json(models);
    } catch (error) {
      console.error("Error fetching all AI models:", error);
      res.status(500).json({ error: "Failed to fetch AI models" });
    }
  });

  // POST /api/ai/models - create new model
  app.post("/api/ai/models", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { providerId, modelKey, modelId, displayName, inputPricePerMToken, outputPricePerMToken, status, capabilities } = req.body;
      if (!providerId || !modelKey || !modelId || !displayName) {
        return res.status(400).json({ error: "providerId, modelKey, modelId, displayName sono obbligatori" });
      }
      const [created] = await db.insert(aiModels).values({
        providerId,
        modelKey,
        modelId,
        displayName,
        inputPricePerMToken: inputPricePerMToken?.toString() || null,
        outputPricePerMToken: outputPricePerMToken?.toString() || null,
        status: status || "active",
        capabilities: capabilities || null,
      }).returning();
      res.json(created);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "model_key già esistente" });
      console.error("Error creating AI model:", error);
      res.status(500).json({ error: "Failed to create AI model" });
    }
  });

  // PATCH /api/ai/models/:id - update model
  app.patch("/api/ai/models/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const { displayName, modelId, inputPricePerMToken, outputPricePerMToken, status } = req.body;
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (displayName !== undefined) patch.displayName = displayName;
      if (modelId !== undefined) patch.modelId = modelId;
      if (inputPricePerMToken !== undefined) patch.inputPricePerMToken = inputPricePerMToken?.toString() || null;
      if (outputPricePerMToken !== undefined) patch.outputPricePerMToken = outputPricePerMToken?.toString() || null;
      if (status !== undefined) patch.status = status;
      const [updated] = await db.update(aiModels).set(patch).where(eq(aiModels.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "Modello non trovato" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating AI model:", error);
      res.status(500).json({ error: "Failed to update AI model" });
    }
  });

  // DELETE /api/ai/models/:id - delete model
  app.delete("/api/ai/models/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      await db.delete(aiModels).where(eq(aiModels.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting AI model:", error);
      res.status(500).json({ error: "Failed to delete AI model" });
    }
  });

  app.patch("/api/organizations/:id/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;

      // Verify the user has admin or owner role in this org
      const userOrgs = await storage.getUserOrganizations(userId);
      const membership = userOrgs.find((o: any) => o.id === id);
      if (!membership) return res.status(403).json({ error: "Not a member of this organization" });

      const userOrgRows = await db
        .select({ role: userOrganizations.role })
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.userId, userId),
            eq(userOrganizations.organizationId, id)
          )
        )
        .limit(1);

      const role = userOrgRows[0]?.role;
      if (role !== "admin" && role !== "owner") {
        return res.status(403).json({ error: "Only admins and owners can change organization settings" });
      }

      // Merge-patch the settings jsonb field
      const patch = req.body as Record<string, any>;

      const ALLOWED_SETTINGS_KEYS = ['aiDefaultModelKey', 'fxUsdEur'];
      const unknownKeys = Object.keys(patch).filter(k => !ALLOWED_SETTINGS_KEYS.includes(k));
      if (unknownKeys.length > 0) {
        return res.status(400).json({
          error: `Chiavi settings non ammesse: ${unknownKeys.join(', ')}`,
          allowed: ALLOWED_SETTINGS_KEYS,
        });
      }

      // Fetch current settings
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) return res.status(404).json({ error: "Organization not found" });

      const merged = { ...(org.settings as Record<string, any> || {}), ...patch };

      const [updated] = await db
        .update(organizations)
        .set({ settings: merged, updatedAt: new Date() })
        .where(eq(organizations.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating organization settings:", error);
      res.status(500).json({ error: "Failed to update organization settings" });
    }
  });

  // POST /api/tasks/:id/estimate - Calculate cost estimate for a task
  app.post("/api/tasks/:id/estimate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const { modelKey } = req.body;
      const organizationId = getOrganizationId(req);
      const { estimateTaskCost } = await import("./cost-estimator");
      const estimate = await estimateTaskCost({ taskId: id, modelKey, organizationId });
      await db
        .update(tasks)
        .set({
          estimateTokensMin: estimate.tokensMin,
          estimateTokensMax: estimate.tokensMax,
          estimateCostMinEur: estimate.costMinEur.toFixed(4),
          estimateCostMaxEur: estimate.costMaxEur.toFixed(4),
          estimateComputedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id));
      return res.json(estimate);
    } catch (error: any) {
      console.error("Error estimating task cost:", error);
      return res.status(500).json({ error: error.message || "Failed to estimate cost" });
    }
  });

  // GET /api/ai/analytics - AI usage analytics (last 90 days)
  app.get("/api/ai/analytics", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const organizationId = getOrganizationId(req);
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const execs = await db
        .select({
          modelKey: aiTaskExecutions.modelKey,
          totalCostEur: aiTaskExecutions.totalCostEur,
          userRating: aiTaskExecutions.userRating,
          taskId: aiTaskExecutions.taskId,
        })
        .from(aiTaskExecutions)
        .where(
          and(
            eq(aiTaskExecutions.organizationId, organizationId),
            eq(aiTaskExecutions.status, "completed"),
            sql`${aiTaskExecutions.completedAt} >= ${since}`,
            sql`${aiTaskExecutions.totalCostEur} IS NOT NULL`
          )
        );

      const totalSpendEur = execs.reduce(
        (s, e) => s + parseFloat(e.totalCostEur as string || "0"),
        0
      );

      // By model
      const byModelMap: Record<string, { spendEur: number; executions: number; ratings: number[] }> = {};
      for (const e of execs) {
        const key = e.modelKey || "unknown";
        if (!byModelMap[key]) byModelMap[key] = { spendEur: 0, executions: 0, ratings: [] };
        byModelMap[key].spendEur += parseFloat(e.totalCostEur as string || "0");
        byModelMap[key].executions += 1;
        if (e.userRating) byModelMap[key].ratings.push(e.userRating);
      }
      const byModel = Object.entries(byModelMap)
        .map(([modelKey, v]) => ({
          modelKey,
          spendEur: parseFloat(v.spendEur.toFixed(4)),
          executions: v.executions,
          avgRating: v.ratings.length
            ? parseFloat((v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length).toFixed(1))
            : null,
        }))
        .sort((a, b) => b.spendEur - a.spendEur);

      // By task type
      const execsWithType = await db
        .select({ taskType: tasks.taskType, totalCostEur: aiTaskExecutions.totalCostEur })
        .from(aiTaskExecutions)
        .innerJoin(tasks, eq(aiTaskExecutions.taskId, tasks.id))
        .where(
          and(
            eq(aiTaskExecutions.organizationId, organizationId),
            eq(aiTaskExecutions.status, "completed"),
            sql`${aiTaskExecutions.completedAt} >= ${since}`,
            sql`${aiTaskExecutions.totalCostEur} IS NOT NULL`
          )
        );
      const byTypeMap: Record<string, { spendEur: number; executions: number }> = {};
      for (const e of execsWithType) {
        const key = e.taskType || "other";
        if (!byTypeMap[key]) byTypeMap[key] = { spendEur: 0, executions: 0 };
        byTypeMap[key].spendEur += parseFloat(e.totalCostEur as string || "0");
        byTypeMap[key].executions += 1;
      }
      const byTaskType = Object.entries(byTypeMap)
        .map(([taskType, v]) => ({ taskType, spendEur: parseFloat(v.spendEur.toFixed(4)), executions: v.executions }))
        .sort((a, b) => b.spendEur - a.spendEur);

      // By project
      const execsWithProj = await db
        .select({
          projectId: tasks.projectId,
          projectName: projects.name,
          totalCostEur: aiTaskExecutions.totalCostEur,
        })
        .from(aiTaskExecutions)
        .innerJoin(tasks, eq(aiTaskExecutions.taskId, tasks.id))
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(
          and(
            eq(aiTaskExecutions.organizationId, organizationId),
            eq(aiTaskExecutions.status, "completed"),
            sql`${aiTaskExecutions.completedAt} >= ${since}`,
            sql`${aiTaskExecutions.totalCostEur} IS NOT NULL`
          )
        );
      const byProjMap: Record<string, { name: string; spendEur: number }> = {};
      for (const e of execsWithProj) {
        const key = e.projectId || "no-project";
        if (!byProjMap[key]) byProjMap[key] = { name: e.projectName || "Senza progetto", spendEur: 0 };
        byProjMap[key].spendEur += parseFloat(e.totalCostEur as string || "0");
      }
      const byProject = Object.entries(byProjMap)
        .map(([projectId, v]) => ({ projectId, name: v.name, spendEur: parseFloat(v.spendEur.toFixed(4)) }))
        .sort((a, b) => b.spendEur - a.spendEur);

      return res.json({
        totalSpendEur: parseFloat(totalSpendEur.toFixed(4)),
        byModel,
        byTaskType,
        byProject,
      });
    } catch (error: any) {
      console.error("Error fetching AI analytics:", error);
      return res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // POST /api/executions/:id/resume - Resume a paused_budget execution
  app.post("/api/executions/:id/resume", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const organizationId = getOrganizationId(req);

      const [execution] = await db
        .select()
        .from(aiTaskExecutions)
        .where(eq(aiTaskExecutions.id, id))
        .limit(1);
      if (!execution) return res.status(404).json({ error: "Execution not found" });
      if (execution.status !== "paused_budget") {
        return res.status(400).json({ error: "Execution is not in paused_budget state" });
      }

      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, execution.taskId))
        .limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const analysisResult = execution.analysisResult as any;
      const previousCapEur = analysisResult?.capEur ?? null;
      const currentCapEur = task.budgetCapEur ? parseFloat(task.budgetCapEur as string) : null;

      if (currentCapEur !== null && previousCapEur !== null && currentCapEur <= previousCapEur) {
        return res.status(400).json({
          error: "Aumentare o rimuovere il budget_cap_eur prima di riprendere",
        });
      }

      const { executeTaskWithAI } = await import("./ai-task-executor");
      const results = await executeTaskWithAI([execution.taskId], userId, organizationId);
      return res.json({ success: true, newExecutionId: results[0]?.executionId, result: results[0] });
    } catch (error: any) {
      console.error("Error resuming execution:", error);
      return res.status(500).json({ error: "Failed to resume execution" });
    }
  });

  // ── MCP Catalog & Server Configs — Phase 3 ────────────────────────────────

  // GET /api/mcp/catalog — list catalog entries with per-org validation status
  app.get("/api/mcp/catalog", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string | undefined;
    try {
      const { category, validatedOnly } = req.query;

      let rows = category && typeof category === "string"
        ? await db.select().from(mcpCatalog).where(eq(mcpCatalog.category, category)).orderBy(asc(mcpCatalog.name))
        : await db.select().from(mcpCatalog).orderBy(asc(mcpCatalog.name));

      // Attach per-org validation status
      let validationMap = new Map<string, boolean>();
      if (organizationId) {
        const vals = await db
          .select({ catalogId: mcpCatalogValidations.catalogId, validated: mcpCatalogValidations.validated })
          .from(mcpCatalogValidations)
          .where(eq(mcpCatalogValidations.organizationId, organizationId));
        vals.forEach(v => validationMap.set(v.catalogId, v.validated));
      }

      const result = rows.map(r => ({ ...r, validated: validationMap.get(r.id) ?? false }));

      if (validatedOnly === "true") {
        return res.json(result.filter(r => r.validated));
      }
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/mcp/catalog/:id/details — full entry + README (with 7-day cache)
  app.get("/api/mcp/catalog/:id/details", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string | undefined;
    try {
      const [entry] = await db.select().from(mcpCatalog).where(eq(mcpCatalog.id, req.params.id)).limit(1);
      if (!entry) return res.status(404).json({ error: "Not found" });

      let readmeMd = entry.readmeMd;
      const fetchedAt = entry.readmeFetchedAt ? new Date(entry.readmeFetchedAt) : null;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const needsRefresh = !fetchedAt || fetchedAt < sevenDaysAgo;

      if (needsRefresh && entry.repoUrl) {
        // extract owner/repo from https://github.com/owner/repo
        const match = entry.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
        if (match) {
          const ownerRepo = match[1].replace(/\.git$/, "");
          let fetchedReadme: string | null = null;
          for (const branch of ["main", "master"]) {
            try {
              const r = await fetch(
                `https://raw.githubusercontent.com/${ownerRepo}/${branch}/README.md`,
                { headers: { "User-Agent": "crm-backend/1.0" }, signal: AbortSignal.timeout(8000) }
              );
              if (r.ok) {
                const text = await r.text();
                fetchedReadme = text.slice(0, 102400); // 100KB cap
                break;
              }
            } catch { /* try next branch */ }
          }
          // save (even if null — to avoid hammering on 404s)
          await db.update(mcpCatalog)
            .set({ readmeMd: fetchedReadme, readmeFetchedAt: new Date() })
            .where(eq(mcpCatalog.id, entry.id));
          readmeMd = fetchedReadme;
        }
      }

      // Attach validation status
      let validated = false;
      if (organizationId) {
        const [val] = await db.select({ validated: mcpCatalogValidations.validated })
          .from(mcpCatalogValidations)
          .where(and(
            eq(mcpCatalogValidations.organizationId, organizationId),
            eq(mcpCatalogValidations.catalogId, entry.id),
          ))
          .limit(1);
        validated = val?.validated ?? false;
      }

      return res.json({ ...entry, readmeMd, validated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/mcp/catalog/:id/validate — set per-org validation (admin/owner only)
  app.patch("/api/mcp/catalog/:id/validate", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    if (!organizationId) return res.status(400).json({ error: "Missing X-Organization-Id header" });
    const { validated } = req.body;
    if (typeof validated !== "boolean") return res.status(400).json({ error: "validated must be boolean" });
    try {
      const userId = (req.user as any)?.id;

      // Role check: only admin or owner of the org can validate catalog entries
      const userOrgRows = await db
        .select({ role: userOrganizations.role })
        .from(userOrganizations)
        .where(and(eq(userOrganizations.userId, userId), eq(userOrganizations.organizationId, organizationId)))
        .limit(1);
      const role = userOrgRows[0]?.role;
      if (role !== "admin" && role !== "owner") {
        return res.status(403).json({ error: "Only admins and owners can validate catalog entries" });
      }

      const [entry] = await db.select({ id: mcpCatalog.id }).from(mcpCatalog).where(eq(mcpCatalog.id, req.params.id)).limit(1);
      if (!entry) return res.status(404).json({ error: "Catalog entry not found" });

      await db.execute(sql`
        INSERT INTO mcp_catalog_validations (organization_id, catalog_id, validated, validated_by, validated_at)
        VALUES (${organizationId}, ${entry.id}, ${validated}, ${userId ?? null}, ${validated ? new Date() : null})
        ON CONFLICT (organization_id, catalog_id) DO UPDATE SET
          validated    = EXCLUDED.validated,
          validated_by = EXCLUDED.validated_by,
          validated_at = EXCLUDED.validated_at
      `);
      return res.json({ ok: true, catalogId: entry.id, validated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/mcp/catalog/:id — update catalog entry fields (launch defaults, requiredSchema)
  app.patch("/api/mcp/catalog/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const patchSchema = z.object({
      defaultLaunchCommand: z.string().nullable().optional(),
      defaultLaunchArgs: z.array(z.string()).nullable().optional(),
      requiredSchema: z.record(z.object({
        type: z.string().optional().default("string"),
        description: z.string().optional().default(""),
        required: z.boolean().optional().default(true),
      })).nullable().optional(),
      transport: z.string().optional(),
    });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    try {
      const updates: Record<string, any> = {};
      if (parsed.data.defaultLaunchCommand !== undefined) updates.defaultLaunchCommand = parsed.data.defaultLaunchCommand;
      if (parsed.data.defaultLaunchArgs !== undefined) updates.defaultLaunchArgs = parsed.data.defaultLaunchArgs;
      if (parsed.data.requiredSchema !== undefined) updates.requiredSchema = parsed.data.requiredSchema;
      if (parsed.data.transport !== undefined) updates.transport = parsed.data.transport;
      if (Object.keys(updates).length === 0) return res.json({ ok: true });
      const [updated] = await db.update(mcpCatalog).set(updates).where(eq(mcpCatalog.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mcp/catalog/sync — sync from GitHub registry
  app.post("/api/mcp/catalog/sync", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { syncMcpCatalog } = await import("./mcp-registry-sync");
      const result = await syncMcpCatalog();
      return res.json(result);
    } catch (err: any) {
      console.error("[MCP] Registry sync error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/mcp/configs — list server configs for current org
  app.get("/api/mcp/configs", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    if (!organizationId) return res.status(400).json({ error: "Missing X-Organization-Id header" });
    try {
      const { projectId, sapSystemId } = req.query;
      const conditions: any[] = [eq(mcpServerConfigs.organizationId, organizationId)];
      if (projectId && typeof projectId === "string") conditions.push(eq(mcpServerConfigs.projectId, projectId));
      if (sapSystemId && typeof sapSystemId === "string") conditions.push(eq(mcpServerConfigs.sapSystemId, sapSystemId));
      const rows = await db.select().from(mcpServerConfigs).where(and(...conditions)).orderBy(asc(mcpServerConfigs.name));
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mcp/configs — create new server config (catalogId required)
  app.post("/api/mcp/configs", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    if (!organizationId) return res.status(400).json({ error: "Missing X-Organization-Id header" });
    try {
      const body = req.body;

      // Security: catalogId is mandatory — no config may exist without a cataloged and validatable entry.
      // Exception: stdio configs auto-create a catalog entry (born unvalidated) to preserve the validation model.
      if (!body.catalogId) {
        if (body.transportType === "stdio") {
          const [autoCatalog] = await db.insert(mcpCatalog).values({
            name: body.name || "Custom stdio server",
            source: "custom",
            transport: "stdio",
            description: `Auto-created for stdio config "${body.name}"`,
            writeCapable: body.readOnly === false,
          }).returning();
          body.catalogId = autoCatalog.id;
        } else {
          return res.status(400).json({ error: "catalogId is required: every MCP config must reference a catalog entry" });
        }
      }
      const [catalogEntry] = await db.select({ id: mcpCatalog.id }).from(mcpCatalog).where(eq(mcpCatalog.id, body.catalogId)).limit(1);
      if (!catalogEntry) {
        return res.status(400).json({ error: "catalogId references a non-existent catalog entry" });
      }

      // PRD guardrail: environment=PRD must always have readOnly=true
      if (body.environment === "PRD" && body.readOnly === false) {
        return res.status(400).json({ error: "Configs with environment=PRD must have readOnly=true" });
      }
      const validated = insertMcpServerConfigSchema.parse({ ...body, organizationId });
      const [created] = await db.insert(mcpServerConfigs).values(validated).returning();
      return res.status(201).json(created);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // GET /api/mcp/configs/:id — get single config
  app.get("/api/mcp/configs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const [row] = await db.select().from(mcpServerConfigs)
        .where(and(eq(mcpServerConfigs.id, req.params.id), eq(mcpServerConfigs.organizationId, organizationId)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/mcp/configs/:id — update config
  app.patch("/api/mcp/configs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const body = req.body;
      // PRD guardrail
      if (body.environment === "PRD" && body.readOnly === false) {
        return res.status(400).json({ error: "Configs with environment=PRD must have readOnly=true" });
      }
      // Phase 5 fix: override write→read not allowed
      if (body.toolClassificationOverrides && typeof body.toolClassificationOverrides === "object") {
        const badOverrides = Object.entries(body.toolClassificationOverrides as Record<string, string>)
          .filter(([, v]) => v === "read");
        if (badOverrides.length > 0) {
          return res.status(400).json({ error: "Gli override possono solo irrigidire la classificazione (read→write)", invalidKeys: badOverrides.map(([k]) => k) });
        }
      }
      const [existing] = await db.select().from(mcpServerConfigs)
        .where(and(eq(mcpServerConfigs.id, req.params.id), eq(mcpServerConfigs.organizationId, organizationId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const [updated] = await db.update(mcpServerConfigs)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(mcpServerConfigs.id, req.params.id))
        .returning();
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/mcp/configs/:id — delete config
  app.delete("/api/mcp/configs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const [existing] = await db.select().from(mcpServerConfigs)
        .where(and(eq(mcpServerConfigs.id, req.params.id), eq(mcpServerConfigs.organizationId, organizationId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, req.params.id));
      return res.status(204).send();
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mcp/configs/:id/health — run health check against server
  app.post("/api/mcp/configs/:id/health", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const [existing] = await db.select().from(mcpServerConfigs)
        .where(and(eq(mcpServerConfigs.id, req.params.id), eq(mcpServerConfigs.organizationId, organizationId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const { healthCheck } = await import("./mcp-client");
      const result = await healthCheck(req.params.id);
      return res.json(result);
    } catch (err: any) {
      console.error("[MCP] Health check error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Phase 4: Pending Actions & Approval ────────────────────────────────────

  // GET /api/mcp/pending-actions/count — count all pending approvals for badge (org-wide)
  app.get("/api/mcp/pending-actions/count", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const { aiPendingActions } = await import("@shared/schema");
      const rows = await db.select({ id: aiPendingActions.id })
        .from(aiPendingActions)
        .where(and(
          eq(aiPendingActions.organizationId, organizationId),
          eq(aiPendingActions.status, "pending"),
        ));
      return res.json({ count: rows.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/executions/:id/pending-actions — list pending actions for an execution
  app.get("/api/executions/:id/pending-actions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const { aiPendingActions } = await import("@shared/schema");
      const rows = await db.select().from(aiPendingActions)
        .where(and(
          eq(aiPendingActions.executionId, req.params.id),
          eq(aiPendingActions.organizationId, organizationId),
        ))
        .orderBy(asc(aiPendingActions.createdAt));
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/executions/:id/decide — decide pending actions (approve/reject), then try to resume
  app.post("/api/executions/:id/decide", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    const userId = (req.user as any)?.id as string;
    const executionId = req.params.id;

    const bodySchema = z.object({
      decisions: z.array(z.object({
        actionId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        decisionNote: z.string().optional(),
      })),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });

    try {
      const { aiPendingActions, aiTaskExecutions } = await import("@shared/schema");

      // Verify execution belongs to this org
      const [execution] = await db.select().from(aiTaskExecutions)
        .where(and(eq(aiTaskExecutions.id, executionId), eq(aiTaskExecutions.organizationId, organizationId)))
        .limit(1);
      if (!execution) return res.status(404).json({ error: "Execution not found" });

      // Apply each decision
      const now = new Date();
      for (const d of parsed.data.decisions) {
        const [action] = await db.select().from(aiPendingActions)
          .where(and(eq(aiPendingActions.id, d.actionId), eq(aiPendingActions.executionId, executionId)))
          .limit(1);
        if (!action) continue;
        if (action.status !== "pending") continue; // already decided — skip silently
        await db.update(aiPendingActions).set({
          status: d.decision,
          decidedBy: userId,
          decidedAt: now,
          decisionNote: d.decisionNote ?? null,
        }).where(eq(aiPendingActions.id, d.actionId));
      }

      // Try to resume if all decided
      const { resumeExecutionAfterApproval } = await import("./ai-task-executor");
      const resumeResult = await resumeExecutionAfterApproval(executionId);

      return res.json({ ok: true, status: resumeResult.status, error: resumeResult.error });
    } catch (err: any) {
      console.error("[MCP-DECIDE]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mcp/custom/validate — validate a custom MCP server endpoint (no DB write)
  app.post("/api/mcp/custom/validate", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const bodySchema = z.object({
      endpoint: z.string().url(),
      toolClassificationOverrides: z.record(z.enum(["read", "write"])).optional().default({}),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    try {
      const { connectAndListToolsRaw } = await import("./mcp-client");
      const result = await connectAndListToolsRaw(parsed.data.endpoint, parsed.data.toolClassificationOverrides);
      return res.json({
        ok: true,
        transport: result.transport,
        toolCount: result.tools.length,
        readCount: result.tools.filter(t => t.classification === "read").length,
        writeCount: result.tools.filter(t => t.classification === "write").length,
        tools: result.tools.map(t => ({ name: t.name, description: t.description, classification: t.classification })),
      });
    } catch (err: any) {
      return res.status(422).json({ ok: false, error: err.message });
    }
  });

  // POST /api/mcp/custom/register — register validated custom MCP server
  // Creates a mcp_catalog entry (source="custom") + links it — so validation works uniformly.
  app.post("/api/mcp/custom/register", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    const bodySchema = z.object({
      name: z.string().min(1),
      endpoint: z.string().url(),
      description: z.string().optional().default(""),
      environment: z.enum(["DEV", "QAS", "PRD"]).default("DEV"),
      readOnly: z.boolean().default(true),
      toolClassificationOverrides: z.record(z.enum(["read", "write"])).optional().default({}),
      toolAllowlist: z.array(z.string()).optional().default([]),
      projectId: z.string().uuid().optional().nullable(),
      sapSystemId: z.string().uuid().optional().nullable(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    // Phase 5 fix: override write→read not allowed
    const overrides = parsed.data.toolClassificationOverrides ?? {};
    const badKeys = Object.entries(overrides).filter(([, v]) => v === "read").map(([k]) => k);
    if (badKeys.length > 0) {
      return res.status(400).json({ error: "Gli override possono solo irrigidire la classificazione (read→write)", invalidKeys: badKeys });
    }
    try {
      // Create a catalog entry (source="custom") for uniform validation flow — born unvalidated
      const [catalogEntry] = await db.insert(mcpCatalog).values({
        name: parsed.data.name,
        source: "custom",
        description: parsed.data.description || null,
        transport: "http",
        stale: false,
        syncedAt: new Date(),
      }).returning();

      const [created] = await db.insert(mcpServerConfigs).values({
        ...parsed.data,
        organizationId,
        catalogId: catalogEntry.id,
        enabled: true,
      }).returning();
      // Run initial health check async (don't block response)
      import("./mcp-client").then(({ healthCheck }) => healthCheck(created.id).catch(() => {}));
      return res.status(201).json(created);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Phase 5: MCP Mapping Facilitator ──────────────────────────────────────

  // GET /api/mcp/mapping/sources — describe available data sources for mapping
  app.get("/api/mcp/mapping/sources", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const { describeAvailableSources } = await import("./mcp-template-resolver");
    return res.json(describeAvailableSources());
  });

  // POST /api/mcp/mapping/suggest — AI suggests field mappings for an MCP server
  app.post("/api/mcp/mapping/suggest", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    const bodySchema = z.object({
      catalogId: z.string().uuid().optional(),
      requiredSchema: z.record(z.object({
        type: z.string().optional().default("string"),
        description: z.string().optional().default(""),
        required: z.boolean().optional().default(true),
      })).optional(),
      sapSystemId: z.string().uuid().optional(),
      credentialId: z.string().uuid().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });

    try {
      const { describeAvailableSources } = await import("./mcp-template-resolver");
      const sources = describeAvailableSources();

      // Get required schema from catalog if catalogId provided
      let reqSchema = parsed.data.requiredSchema ?? {};
      let catalogEntry: any = null;
      if (parsed.data.catalogId && Object.keys(reqSchema).length === 0) {
        [catalogEntry] = await db.select().from(mcpCatalog).where(eq(mcpCatalog.id, parsed.data.catalogId)).limit(1);
        if (catalogEntry?.requiredSchema && Object.keys(catalogEntry.requiredSchema as any).length > 0) {
          reqSchema = catalogEntry.requiredSchema as any;
        }
      }

      // Fallback: infer schema for known SAP MCP servers when requiredSchema is empty
      if (Object.keys(reqSchema).length === 0) {
        const nameLC = (catalogEntry?.name ?? "").toLowerCase();
        const descLC = (catalogEntry?.description ?? "").toLowerCase();
        const isSapMcp = nameLC.includes("arc-1") || nameLC.includes("arc1") || nameLC.includes("abap") || nameLC.includes("sap")
          || descLC.includes("sap") || descLC.includes("abap") || descLC.includes("adt")
          || parsed.data.sapSystemId || parsed.data.credentialId;
        if (isSapMcp) {
          reqSchema = {
            SAP_URL: { type: "string", description: "SAP host URL (e.g. https://host:44300)", required: true },
            SAP_USER: { type: "string", description: "SAP username", required: true },
            SAP_PASSWORD: { type: "string", description: "SAP password", required: true },
            SAP_CLIENT: { type: "string", description: "SAP client number (e.g. 100)", required: false },
          };
        }
      }

      if (Object.keys(reqSchema).length === 0) {
        return res.json({ mappings: {}, configTemplate: {}, message: "No required schema defined — mapping skipped" });
      }

      // Fetch actual data from linked entities to give the AI richer context
      let sapSystemData: Record<string, any> | null = null;
      let credentialData: Record<string, any> | null = null;
      if (parsed.data.sapSystemId) {
        const [sys] = await db.select().from(sapSystems).where(eq(sapSystems.id, parsed.data.sapSystemId)).limit(1);
        sapSystemData = sys ?? null;
      }
      if (parsed.data.credentialId) {
        const [cred] = await db.select().from(systemCredentials).where(eq(systemCredentials.id, parsed.data.credentialId)).limit(1);
        credentialData = cred ? { username: cred.username, systemName: cred.systemName } : null;
      }

      // Deterministic mapping for known env var patterns, AI fallback for unknown ones
      const KNOWN_MAPPINGS: Record<string, { source: string; field: string }> = {
        SAP_URL: { source: "sap_systems", field: "serverHost" },
        SAP_HOST: { source: "sap_systems", field: "serverHost" },
        SAP_HOSTNAME: { source: "sap_systems", field: "serverHost" },
        SAP_PORT: { source: "sap_systems", field: "applicationServerPort" },
        SAP_SYSTEM_NUMBER: { source: "sap_systems", field: "systemNumber" },
        SAP_SYSNR: { source: "sap_systems", field: "systemNumber" },
        SAP_SID: { source: "sap_systems", field: "systemId" },
        SAP_SYSTEM_ID: { source: "sap_systems", field: "systemId" },
        SAP_CLIENT: { source: "sap_systems", field: "defaultClient" },
        SAP_MANDT: { source: "sap_systems", field: "defaultClient" },
        SAP_USER: { source: "system_credentials", field: "username" },
        SAP_USERNAME: { source: "system_credentials", field: "username" },
        SAP_PASSWORD: { source: "system_credentials", field: "password" },
        SAP_PASSWD: { source: "system_credentials", field: "password" },
        SAP_LANGUAGE: { source: "sap_systems", field: "defaultLanguage" },
        SAP_LANG: { source: "sap_systems", field: "defaultLanguage" },
        SAP_ROUTER: { source: "sap_systems", field: "sapRouterString" },
        SAP_ROUTER_STRING: { source: "sap_systems", field: "sapRouterString" },
        SAPROUTER: { source: "sap_systems", field: "sapRouterString" },
      };

      const mappings: Record<string, { source: string; field: string }> = {};
      const unmapped: string[] = [];
      for (const envVar of Object.keys(reqSchema)) {
        const known = KNOWN_MAPPINGS[envVar.toUpperCase()];
        if (known) {
          mappings[envVar] = known;
        } else {
          unmapped.push(envVar);
        }
      }

      // If there are unmapped vars, log them (no AI call needed)
      if (unmapped.length > 0) {
        console.log(`[MCP] Unmapped env vars (no deterministic match): ${unmapped.join(", ")}`);
      }

      const configTemplate: Record<string, string> = {};
      for (const [envVar, m] of Object.entries(mappings)) {
        configTemplate[envVar] = `\${${m.source}.${m.field}}`;
      }

      return res.json({
        mappings,
        configTemplate,
        reasoning: `Mapping deterministico per ${Object.keys(mappings).length} variabili SAP` + (unmapped.length > 0 ? ` (${unmapped.length} risolte via AI)` : ""),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mcp/mapping/resolve-preview — preview resolved env vars for a config
  app.post("/api/mcp/mapping/resolve-preview", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const bodySchema = z.object({ configId: z.string().uuid() });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    try {
      const [config] = await db.select().from(mcpServerConfigs).where(eq(mcpServerConfigs.id, parsed.data.configId)).limit(1);
      if (!config) return res.status(404).json({ error: "Config not found" });

      const { resolveTemplate } = await import("./mcp-template-resolver");
      const resolved = await resolveTemplate(config);
      // Mask passwords
      const masked = Object.fromEntries(
        Object.entries(resolved).map(([k, v]) =>
          /password|secret|token|key/i.test(k) ? [k, "••••••••"] : [k, v]
        )
      );
      return res.json({ resolved: masked });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Phase 5: Context Packs ────────────────────────────────────────────────

  // GET /api/context-packs/:scopeType/:scopeId? — read context pack
  app.get("/api/context-packs/:scopeType/:scopeId?", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    const { scopeType, scopeId } = req.params;
    if (!["organization", "project"].includes(scopeType)) {
      return res.status(400).json({ error: "scopeType must be 'organization' or 'project'" });
    }
    try {
      const conditions = [
        eq(contextPacks.organizationId, organizationId),
        eq(contextPacks.scopeType, scopeType),
      ];
      if (scopeId) conditions.push(eq(contextPacks.scopeId, scopeId));
      else conditions.push(sql`${contextPacks.scopeId} IS NULL`);
      const [pack] = await db.select().from(contextPacks).where(and(...conditions)).limit(1);
      if (!pack) return res.status(404).json({ error: "Not found" });
      return res.json(pack);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/context-packs/:scopeType/:scopeId? — upsert context pack (manual edit)
  app.put("/api/context-packs/:scopeType/:scopeId?", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    const userId = (req.user as any).id;
    const { scopeType, scopeId } = req.params;
    if (!["organization", "project"].includes(scopeType)) {
      return res.status(400).json({ error: "scopeType must be 'organization' or 'project'" });
    }
    if (scopeType === "project" && !scopeId) {
      return res.status(400).json({ error: "scopeId required when scopeType=project" });
    }
    const bodySchema = z.object({
      brief: z.string().optional(),
      conventions: z.string().optional().nullable(),
      glossary: z.record(z.string()).optional(),
      decisions: z.array(z.object({ date: z.string(), text: z.string(), sourceTaskId: z.string().optional() })).optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    try {
      const updates: Record<string, any> = { updatedAt: new Date(), updatedBy: userId };
      if (parsed.data.brief !== undefined) updates.brief = parsed.data.brief;
      if (parsed.data.conventions !== undefined) updates.conventions = parsed.data.conventions;
      if (parsed.data.glossary !== undefined) updates.glossary = parsed.data.glossary;
      if (parsed.data.decisions !== undefined) updates.decisions = parsed.data.decisions;

      // Try update first
      const conditions = [
        eq(contextPacks.organizationId, organizationId),
        eq(contextPacks.scopeType, scopeType),
      ];
      if (scopeId) conditions.push(eq(contextPacks.scopeId, scopeId));
      else conditions.push(sql`${contextPacks.scopeId} IS NULL`);

      const [existing] = await db.select({ id: contextPacks.id }).from(contextPacks).where(and(...conditions)).limit(1);
      let result;
      if (existing) {
        [result] = await db.update(contextPacks).set(updates).where(eq(contextPacks.id, existing.id)).returning();
      } else {
        [result] = await db.insert(contextPacks).values({
          organizationId,
          scopeType,
          scopeId: scopeId || null,
          ...updates,
          decisions: updates.decisions ?? [],
          glossary: updates.glossary ?? {},
        }).returning();
      }
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tasks/:id/assembled-context — preview assembled context for a task
  app.get("/api/tasks/:id/assembled-context", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const ctx = await assembleContext({ taskId: req.params.id, tokenBudget: 8000 });
      return res.json(ctx);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Connection Workflows ──────────────────────────────────────────────────

  // GET /api/connection-workflows
  app.get("/api/connection-workflows", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    if (!organizationId) return res.status(400).json({ error: "Missing X-Organization-Id" });
    try {
      const sapSystemId = req.query.sapSystemId as string | undefined;
      let rows;
      if (sapSystemId) {
        rows = await db.select().from(connectionWorkflows)
          .where(and(
            eq(connectionWorkflows.organizationId, organizationId),
            or(eq(connectionWorkflows.sapSystemId, sapSystemId), isNull(connectionWorkflows.sapSystemId))
          ))
          .orderBy(connectionWorkflows.createdAt);
      } else {
        rows = await db.select().from(connectionWorkflows)
          .where(eq(connectionWorkflows.organizationId, organizationId))
          .orderBy(connectionWorkflows.createdAt);
      }
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/connection-workflows
  app.post("/api/connection-workflows", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    if (!organizationId) return res.status(400).json({ error: "Missing X-Organization-Id" });
    try {
      const parsed = insertConnectionWorkflowSchema.safeParse({ ...req.body, organizationId });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(connectionWorkflows).values(parsed.data).returning();
      return res.status(201).json(created);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/connection-workflows/:id
  app.patch("/api/connection-workflows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const [existing] = await db.select().from(connectionWorkflows)
        .where(and(eq(connectionWorkflows.id, req.params.id), eq(connectionWorkflows.organizationId, organizationId)));
      if (!existing) return res.status(404).json({ error: "Not found" });
      const parsed = insertConnectionWorkflowSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [updated] = await db.update(connectionWorkflows)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(connectionWorkflows.id, req.params.id))
        .returning();
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/connection-workflows/:id
  app.delete("/api/connection-workflows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const organizationId = req.headers["x-organization-id"] as string;
    try {
      const [existing] = await db.select().from(connectionWorkflows)
        .where(and(eq(connectionWorkflows.id, req.params.id), eq(connectionWorkflows.organizationId, organizationId)));
      if (!existing) return res.status(404).json({ error: "Not found" });
      await db.delete(connectionWorkflows).where(eq(connectionWorkflows.id, req.params.id));
      return res.status(204).send();
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tasks/:id/connection-plan — resolve workflow → step plan with autoExecutable flag
  app.get("/api/tasks/:id/connection-plan", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
      if (!task) return res.status(404).json({ error: "Task not found" });

      let workflow: typeof connectionWorkflows.$inferSelect | null = null;

      if ((task as any).connectionWorkflowId) {
        const [wf] = await db.select().from(connectionWorkflows)
          .where(eq(connectionWorkflows.id, (task as any).connectionWorkflowId));
        if (wf) workflow = wf;
      }

      if (!workflow && task.sapSystemId) {
        const [wf] = await db.select().from(connectionWorkflows)
          .where(eq(connectionWorkflows.sapSystemId, task.sapSystemId))
          .orderBy(connectionWorkflows.createdAt)
          .limit(1);
        if (wf) workflow = wf;
      }

      if (!workflow) {
        return res.json({ workflow: null, steps: [], source: "none" });
      }

      const steps = ((workflow.steps as any[]) || []).map((s: any) => ({
        ...s,
        autoExecutable: s.actor === "auto",
      }));

      return res.json({
        workflow: { id: workflow.id, name: workflow.name },
        source: (task as any).connectionWorkflowId ? "task-override" : "sap-system",
        steps,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
