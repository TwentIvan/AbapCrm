import Imap from "imap";
import { simpleParser } from "mailparser";
import { storage } from "./storage";
import { aiService } from "./ai-service";
import { EmailForwardCleaner } from "./email-forward-cleaner";
import { AttachmentsService } from "./attachments-service";
import { ThreadingService } from "./threading-service";
import crypto from "crypto";
import type { InsertMessage } from "@shared/schema";

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  folder: string;
  userId: string; // ID dell'utente che ha configurato questo account email
  organizationId: string; // ID dell'organizzazione a cui appartiene questa configurazione email
}

export class ImapEmailService {
  private imap: Imap;
  private config: ImapConfig;
  private isConnected = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(config: ImapConfig) {
    this.config = config;
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: {
        rejectUnauthorized: false
      },
      authTimeout: 10000,
      connTimeout: 60000
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.imap.once('ready', () => {
      console.log('[IMAP] Connected to Gmail');
      this.isConnected = true;
      this.openFolder();
    });

    this.imap.once('error', (err: Error) => {
      console.error('[IMAP] Connection error:', err.message);
      this.isConnected = false;
      // Don't let IMAP errors crash the server
      this.handleConnectionError(err);
    });

    this.imap.once('end', () => {
      console.log('[IMAP] Connection ended');
      this.isConnected = false;
    });
  }

  private handleConnectionError(err: Error) {
    // Log the error but don't let it propagate
    console.error('[IMAP] Handling connection error gracefully:', err.message);
    
    // Clean up polling if it exists
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    // Set a flag to prevent automatic reconnection attempts
    this.isConnected = false;
  }

  private openFolder() {
    this.imap.openBox(this.config.folder, false, (err: Error | null, box: any) => {
      if (err) {
        console.error('[IMAP] Error opening folder:', err.message);
        return;
      }
      console.log(`[IMAP] Opened folder: ${this.config.folder}`);
      // First check for existing emails from the last 90 days
      this.checkForExistingEmails();
      // Then check for new unread emails
      this.checkForNewEmails();
    });
  }

  private checkForExistingEmails() {
    if (!this.isConnected) {
      console.warn('[IMAP] Cannot check existing emails: not connected');
      return;
    }
    
    // Search for emails from the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const searchDate = ninetyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    this.imap.search([['SINCE', searchDate]], (err: Error | null, results: number[]) => {
      if (err) {
        console.error('[IMAP] Search error for existing emails:', err);
        return;
      }

      if (results.length === 0) {
        console.log('[IMAP] No existing emails found in the last 90 days');
        return;
      }

      console.log(`[IMAP] Found ${results.length} existing emails from the last 90 days`);
      this.processEmails(results, false); // Don't mark as seen for existing emails
    });
  }

  private checkForNewEmails() {
    if (!this.isConnected) {
      console.warn('[IMAP] Cannot check new emails: not connected');
      return;
    }
    
    // 🔧 TEMPORARY: Full fetch for testing Plan B (normally uses UNSEEN)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const searchDate = ninetyDaysAgo.toISOString().split('T')[0];
    
    this.imap.search([['SINCE', searchDate]], (err: Error | null, results: number[]) => {
      if (err) {
        console.error('[IMAP] Search error:', err);
        return;
      }

      if (results.length === 0) {
        console.log('[IMAP] No new emails');
        return;
      }

      console.log(`[IMAP] Found ${results.length} new emails`);
      this.processEmails(results, false); // Don't mark as seen for testing
    });
  }

  private processEmails(uids: number[], markSeen: boolean = true) {
    const fetch = this.imap.fetch(uids, { bodies: '', markSeen });

    fetch.on('message', (msg, seqno) => {
      let body = '';
      let headers: any = {};

      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          body += chunk.toString('utf8');
        });

        stream.once('end', () => {
          this.parseAndSaveEmail(body, seqno);
        });
      });

      msg.once('attributes', (attrs) => {
        console.log(`[IMAP] Email ${seqno} attributes:`, attrs.uid);
      });
    });

    fetch.once('error', (err) => {
      console.error('[IMAP] Fetch error:', err);
    });

    fetch.once('end', () => {
      console.log('[IMAP] Done fetching emails');
    });
  }

  private async parseAndSaveEmail(rawEmail: string, seqno: number) {
    try {
      const parsed = await simpleParser(rawEmail);
      
      // Generate messageId first
      const messageId = parsed.messageId || `imap-${Date.now()}-${seqno}`;
      
      // Process attachments with deduplication and save content
      const attachments: string[] = [];
      const attachmentHashes = new Map<string, string>(); // hash -> filename
      
      if (parsed.attachments && parsed.attachments.length > 0) {
        console.log(`[IMAP] Processing ${parsed.attachments.length} attachments...`);
        
        for (const attachment of parsed.attachments) {
          if (attachment.content && attachment.content.length > 0) {
            // Calculate hash for deduplication
            const hash = crypto.createHash('md5').update(attachment.content).digest('hex');
            
            // Check if we already have this attachment (by content hash)
            if (attachmentHashes.has(hash)) {
              const existingSavedFilename = attachmentHashes.get(hash)!;
              console.log(`[IMAP] Duplicate attachment detected: ${attachment.filename} -> using ${existingSavedFilename}`);
              // Use existing filename instead of saving duplicate
              if (!attachments.includes(existingSavedFilename)) {
                attachments.push(existingSavedFilename);
              }
            } else {
              // New unique attachment - save it
              const filename = attachment.filename || `attachment_${Date.now()}`;
              try {
                const savedFilename = await AttachmentsService.saveAttachment(attachment, messageId);
                attachments.push(savedFilename);
                attachmentHashes.set(hash, savedFilename);
                console.log(`[IMAP] Saved unique attachment: ${filename} (${attachment.content.length} bytes)`);
              } catch (error) {
                console.error(`[IMAP] Failed to save attachment ${filename}:`, error);
              }
            }
          } else {
            console.log(`[IMAP] Skipping attachment ${attachment.filename} - no content`);
          }
        }
        
        console.log(`[IMAP] Saved ${attachments.length} unique attachments (${parsed.attachments.length} total, ${parsed.attachments.length - attachments.length} duplicates removed)`);
      }

      // Helper to get first email address
      const getFirstAddress = (addressObj: any) => {
        if (!addressObj) return null;
        if (Array.isArray(addressObj)) return addressObj[0] || null;
        if (addressObj.value && Array.isArray(addressObj.value)) return addressObj.value[0] || null;
        return addressObj;
      };

      // Helper to get all email addresses from header field
      const getAllAddresses = (addressObj: any): string[] => {
        if (!addressObj) return [];
        
        let addresses = [];
        if (Array.isArray(addressObj)) {
          addresses = addressObj;
        } else if (addressObj.value && Array.isArray(addressObj.value)) {
          addresses = addressObj.value;
        } else {
          addresses = [addressObj];
        }
        
        return addresses
          .filter((addr: any) => addr && addr.address)
          .map((addr: any) => addr.address)
          .filter((email: any) => email && email.trim() !== '');
      };

      const fromAddr = getFirstAddress(parsed.from);
      const toAddr = getFirstAddress(parsed.to);

      const userId = this.config.userId; // Usa l'ID dell'utente che ha configurato questo account

      // Check if message already exists to avoid duplicates
      const existingMessage = await storage.getMessageByMessageId(messageId, userId);
      if (existingMessage) {
        console.log(`[IMAP] Email already exists, skipping: ${messageId}`);
        return;
      }

      // 🔧 FIX: Nuove email usano ALGORITMO BASE (no training)
      // Training viene applicato SOLO con "Riprocessa" manuale
      const cleanedEmail = EmailForwardCleaner.cleanForwardedEmail(
        parsed.subject || '',
        parsed.text || '',
        parsed.html || null
      );

      if (cleanedEmail.isForwarded) {
        console.log(`[IMAP] Cleaned forwarded email from: ${fromAddr?.address} - Original subject: "${cleanedEmail.originalSubject}"`);
      }

      // Extract threading information from email headers
      const threadingInfo = ThreadingService.extractThreadingInfo({
        messageId: messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        subject: parsed.subject
      });

      console.log(`[IMAP] Threading info extracted for ${messageId}: thread=${threadingInfo.threadId}`);

      // 🔧 FIX: Use organization from email config instead of first user org
      const organizationId = this.config.organizationId;
      console.log(`[IMAP] Using organizationId: ${organizationId} for user: ${userId}`);

      // 🔧 PLAN B: Extract forward detection artifacts for cascade pipeline
      const forwardArtifacts: any = {
        hasRfc822: false,
        hasResent: false,
        rfc822Payload: null,
        resentHeaders: null
      };

      // Check for RFC822 (message/rfc822) attachments
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const attachment of parsed.attachments) {
          if (attachment.contentType === 'message/rfc822' || 
              attachment.contentType?.startsWith('message/')) {
            forwardArtifacts.hasRfc822 = true;
            forwardArtifacts.rfc822Payload = {
              filename: attachment.filename,
              contentType: attachment.contentType,
              size: attachment.size,
              // Store raw content as base64 for later parsing
              content: attachment.content ? attachment.content.toString('base64') : null
            };
            console.log(`[IMAP] 🔧 RFC822 attachment detected: ${attachment.filename} (${attachment.size} bytes)`);
            break; // Use first RFC822 attachment
          }
        }
      }

      // Check for Resent-* headers
      const headers = parsed.headers as Map<string, any>;
      if (headers) {
        const resentHeaders: any = {};
        let hasAnyResent = false;
        
        // Extract common Resent-* headers
        const resentKeys = ['resent-from', 'resent-to', 'resent-date', 'resent-message-id', 'resent-subject'];
        for (const key of resentKeys) {
          const value = headers.get(key);
          if (value) {
            hasAnyResent = true;
            resentHeaders[key] = value;
          }
        }
        
        if (hasAnyResent) {
          forwardArtifacts.hasResent = true;
          forwardArtifacts.resentHeaders = resentHeaders;
          console.log(`[IMAP] 🔧 Resent-* headers detected:`, Object.keys(resentHeaders));
        }
      }

      const messageData: InsertMessage = {
        messageId,
        type: 'email',
        status: 'unread',
        // Use original sender if it's a forwarded email, otherwise use parsed sender
        fromEmail: cleanedEmail.originalFromEmail || fromAddr?.address || 'unknown@unknown.com',
        fromName: cleanedEmail.originalFromName || fromAddr?.name || null,
        toEmail: toAddr?.address || this.config.user,
        toName: toAddr?.name || null,
        subject: cleanedEmail.originalSubject || null,
        body: cleanedEmail.originalBody || null,
        htmlBody: cleanedEmail.originalHtmlBody || cleanedEmail.preservedHtmlFormatting || null,
        // Per email inoltrate usa i destinatari estratti dal contenuto,
        // per email non inoltrate usa gli header originali della mail
        originalToEmails: cleanedEmail.isForwarded 
          ? (cleanedEmail.originalToEmails || [])
          : getAllAddresses(parsed.to),
        originalCcEmails: cleanedEmail.isForwarded 
          ? (cleanedEmail.originalCcEmails || [])
          : getAllAddresses(parsed.cc),
        originalBccEmails: cleanedEmail.isForwarded 
          ? (cleanedEmail.originalBccEmails || [])
          : getAllAddresses(parsed.bcc),
        attachments: attachments,
        receivedAt: parsed.date || new Date(),
        // 🔧 PLAN B: Forward artifacts for cascade detection
        forwardArtifacts: (forwardArtifacts.hasRfc822 || forwardArtifacts.hasResent) ? forwardArtifacts : null,
        // Threading information
        threadId: threadingInfo.threadId,
        inReplyTo: threadingInfo.inReplyTo,
        references: threadingInfo.references,
        userId,
        organizationId, // 🔧 FIX: Now includes organizationId!
        projectId: null,
        taskId: null,
        partnerId: null,
        confidenceScore: null,
        matchingReason: null,
        isManuallyVerified: false
      };

      console.log(`[IMAP] Saving email from: ${messageData.fromEmail}`);
      const savedMessage = await storage.createMessage(messageData);

      // Run AI analysis in background - with error handling for quota limits
      if (process.env.OPENAI_API_KEY) {
        try {
          // Get user's first organization for AI context
          const userOrganizations = await storage.getUserOrganizations(messageData.userId);
          const organizationId = userOrganizations.length > 0 ? userOrganizations[0].organizationId : undefined;
          
          const analysis = await aiService.analyzeMessage(savedMessage, messageData.userId, organizationId);
          if (analysis.bestMatch) {
            await aiService.updateMessageWithSuggestion(
              savedMessage.id, 
              analysis.bestMatch, 
              messageData.userId,
              organizationId
            );
            console.log(`[IMAP] AI analysis completed for email ${savedMessage.id}`);
          }
        } catch (aiError) {
          console.error('[IMAP] AI analysis failed:', aiError);
        }
      }

    } catch (error) {
      console.error('[IMAP] Email parsing error:', error);
    }
  }

  public connect() {
    if (!this.isConnected) {
      console.log('[IMAP] Connecting to Gmail...');
      try {
        this.imap.connect();
      } catch (error) {
        console.error('[IMAP] Failed to initiate connection:', error);
        this.handleConnectionError(error as Error);
      }
    }
  }

  public disconnect() {
    if (this.isConnected) {
      this.imap.end();
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public isServiceConnected(): boolean {
    return this.isConnected;
  }

  public getConnectionStatus(): { connected: boolean; error?: string } {
    return {
      connected: this.isConnected,
      error: !this.isConnected ? 'Service not connected or credentials invalid' : undefined
    };
  }

  public startPolling(intervalMinutes: number = 2) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(() => {
      if (this.isConnected) {
        console.log('[IMAP] Polling for new emails...');
        this.checkForNewEmails();
      } else {
        console.log('[IMAP] Not connected, attempting to reconnect...');
        this.connect();
      }
    }, intervalMinutes * 60 * 1000);

    console.log(`[IMAP] Started polling every ${intervalMinutes} minutes`);
  }
}

// Service instance - will be initialized when credentials are provided
let emailService: ImapEmailService | null = null;

export const initializeEmailService = (config: ImapConfig) => {
  try {
    if (emailService) {
      emailService.disconnect();
    }
    
    emailService = new ImapEmailService(config);
    emailService.connect();
    emailService.startPolling(2); // Check every 2 minutes
    
    return emailService;
  } catch (error) {
    console.error('[IMAP] Failed to initialize email service:', error);
    throw error; // Re-throw to be caught by caller
  }
};

export const getEmailService = () => emailService;