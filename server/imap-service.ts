import Imap from "imap";
import { simpleParser } from "mailparser";
import { storage } from "./storage";
import { aiService } from "./ai-service";
import { EmailForwardCleaner } from "./email-forward-cleaner";
import { AttachmentsService } from "./attachments-service";
import { ThreadingService } from "./threading-service";
import { DevOpsEmailParser } from "./devops-email-parser";
import { CalendarEmailParser } from "./calendar-email-parser";
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

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  private openFolder() {
    this.imap.openBox(this.config.folder, false, (err: Error | null, box: any) => {
      if (err) {
        console.error('[IMAP] Error opening folder:', err.message);
        this.isConnected = false;
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error(`[IMAP] Folder "${this.config.folder}" failed ${this.maxReconnectAttempts} times, stopping polling`);
          this.stopPolling();
        }
        return;
      }
      this.reconnectAttempts = 0;
      console.log(`[IMAP] Opened folder: ${this.config.folder}`);
      // First check for existing emails from the last 90 days
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
    
    try {
      if (!this.imap || this.imap.state !== 'authenticated') {
        console.warn('[IMAP] Connection not in authenticated state, skipping check');
        this.isConnected = false;
        return;
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const searchDate = ninetyDaysAgo.toISOString().split('T')[0];
      
      this.imap.search([['SINCE', searchDate]], (err: Error | null, results: number[]) => {
        if (err) {
          console.error('[IMAP] Search error:', err.message);
          if (err.message?.includes('No mailbox') || err.message?.includes('Not authenticated')) {
            this.isConnected = false;
          }
          return;
        }

        if (results.length === 0) {
          console.log('[IMAP] No new emails');
          return;
        }

        console.log(`[IMAP] Found ${results.length} new emails`);
        this.processEmails(results, false);
      });
    } catch (error: any) {
      console.error('[IMAP] checkForNewEmails error:', error?.message);
      this.isConnected = false;
    }
  }

  private async processEmails(uids: number[], markSeen: boolean = true) {
    // Process emails one at a time to limit memory usage
    for (const uid of uids) {
      try {
        await this.fetchSingleEmail(uid, markSeen);
      } catch (err) {
        console.error(`[IMAP] Error processing email uid ${uid}:`, err);
      }
    }
    console.log(`[IMAP] Done processing ${uids.length} emails`);
  }

  private fetchSingleEmail(uid: number, markSeen: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.imap || this.imap.state !== 'authenticated') {
        resolve();
        return;
      }
      const fetch = this.imap.fetch([uid], { bodies: '', markSeen });
      let resolved = false;

      fetch.on('message', (msg) => {
        let body = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk: Buffer) => {
            body += chunk.toString('utf8');
          });

          stream.once('end', () => {
            this.parseAndSaveEmail(body, uid, this.config.folder)
              .then(() => { if (!resolved) { resolved = true; resolve(); } })
              .catch((e) => { if (!resolved) { resolved = true; reject(e); } });
          });
        });
      });

      fetch.once('error', (err) => {
        if (!resolved) { resolved = true; reject(err); }
      });

      fetch.once('end', () => {
        setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 500);
      });
    });
  }

  private async parseAndSaveEmail(rawEmail: string, seqno: number, folderName: string) {
    try {
      const userId = this.config.userId;

      // Extract Message-ID from raw headers BEFORE expensive parsing
      const headerMatch = rawEmail.match(/^Message-ID:\s*(.+)$/mi);
      const quickMessageId = headerMatch ? headerMatch[1].trim() : null;

      if (quickMessageId) {
        const existingMessage = await storage.getMessageByMessageId(quickMessageId, userId);
        if (existingMessage) {
          console.log(`[IMAP] Email already exists, skipping: ${quickMessageId}`);
          return;
        }
      }

      const parsed = await simpleParser(rawEmail);
      
      const messageId = parsed.messageId || `imap-${Date.now()}-${seqno}`;
      
      // Double-check with parsed messageId if quick check used a different format
      if (!quickMessageId || quickMessageId !== messageId) {
        const existingMessage = await storage.getMessageByMessageId(messageId, userId);
        if (existingMessage) {
          console.log(`[IMAP] Email already exists, skipping: ${messageId}`);
          return;
        }
      }

      const attachments: string[] = [];
      const attachmentHashes = new Map<string, string>();
      
      if (parsed.attachments && parsed.attachments.length > 0) {
        console.log(`[IMAP] Processing ${parsed.attachments.length} attachments...`);
        
        for (const attachment of parsed.attachments) {
          if (attachment.content && attachment.content.length > 0) {
            const hash = crypto.createHash('md5').update(attachment.content).digest('hex');
            
            if (attachmentHashes.has(hash)) {
              const existingSavedFilename = attachmentHashes.get(hash)!;
              if (!attachments.includes(existingSavedFilename)) {
                attachments.push(existingSavedFilename);
              }
            } else {
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
          }
        }
        
        console.log(`[IMAP] Saved ${attachments.length} unique attachments (${parsed.attachments.length} total, ${parsed.attachments.length - attachments.length} duplicates removed)`);
        
        const isSapTransportFolder = folderName.toLowerCase().includes('sap') || 
                                      folderName.toLowerCase().includes('transport');
        
        if (isSapTransportFolder && parsed.attachments && parsed.attachments.length > 0) {
          const { SapTransportProcessor } = await import('./sap-transport-processor');
          
          for (const attachment of parsed.attachments) {
            if (attachment.content && 
                SapTransportProcessor.isTransportRequestJson(attachment.filename || '', attachment.content)) {
              console.log(`[SAP-TR] Trovato JSON Transport Request: ${attachment.filename}`);
              
              const result = await SapTransportProcessor.processTransportRequestJson(
                attachment.content.toString('utf-8'),
                this.config.userId,
                this.config.organizationId,
                messageId
              );
              
              if (result.success) {
                console.log(`[SAP-TR] Transport Request processata: ${result.requestId}`);
              } else {
                console.error(`[SAP-TR] Errore processamento TR: ${result.error}`);
              }
            }
          }
        }
      }

      const getFirstAddress = (addressObj: any) => {
        if (!addressObj) return null;
        if (Array.isArray(addressObj)) return addressObj[0] || null;
        if (addressObj.value && Array.isArray(addressObj.value)) return addressObj.value[0] || null;
        return addressObj;
      };

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

      // 🔧 Azure DevOps Work Item Detection
      const devOpsResult = DevOpsEmailParser.parseDevOpsEmail(
        fromAddr?.address || '',
        cleanedEmail.originalSubject || parsed.subject || '',
        cleanedEmail.originalBody || parsed.text || '',
        cleanedEmail.originalHtmlBody || parsed.html || null
      );
      
      let sourceType: 'email_standard' | 'email_devops_workitem' | 'email_transport_request' | 'email_calendar_event' = 'email_standard';
      let externalMetadata: any = null;
      
      if (devOpsResult.isDevOpsEmail && devOpsResult.metadata) {
        sourceType = 'email_devops_workitem';
        externalMetadata = devOpsResult.metadata;
        console.log(`[IMAP] 🔵 Azure DevOps Work Item detected: #${devOpsResult.metadata.workItemId} - ${devOpsResult.metadata.workItemTitle}`);
      } else {
        // 📅 Calendar/Meeting Event Detection
        const calendarResult = CalendarEmailParser.parse(
          cleanedEmail.originalSubject || parsed.subject || '',
          cleanedEmail.originalBody || parsed.text || '',
          cleanedEmail.originalHtmlBody || parsed.html || '',
          fromAddr?.address || ''
        );
        
        if (calendarResult.isCalendarEmail && calendarResult.metadata) {
          sourceType = 'email_calendar_event';
          externalMetadata = calendarResult.metadata;
          console.log(`[IMAP] 📅 Calendar Event detected: ${calendarResult.metadata.eventTitle} - ${calendarResult.metadata.eventDateTime || 'No date'}`);
        }
      }

      const messageData: InsertMessage = {
        messageId,
        type: 'email',
        sourceType,
        status: 'unread',
        // Use original sender if it's a forwarded email, otherwise use parsed sender
        fromEmail: cleanedEmail.originalFromEmail || fromAddr?.address || 'unknown@unknown.com',
        fromName: cleanedEmail.originalFromName || fromAddr?.name || null,
        toEmail: toAddr?.address || this.config.user,
        toName: toAddr?.name || null,
        subject: cleanedEmail.originalSubject || null,
        body: cleanedEmail.originalBody || null,
        htmlBody: cleanedEmail.originalHtmlBody || cleanedEmail.preservedHtmlFormatting || null,
        externalMetadata,
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
      
      let savedMessage;
      try {
        savedMessage = await storage.createMessage(messageData);
      } catch (createError: any) {
        // Handle race condition: if another process already created this message
        if (createError.code === '23505' || createError.message?.includes('duplicate key') || createError.message?.includes('unique constraint')) {
          console.log(`[IMAP] Email already exists (race condition), skipping: ${messageId}`);
          return;
        }
        throw createError; // Re-throw other errors
      }

      // Run AI analysis in background - with error handling for quota limits
      if (process.env.OPENAI_API_KEY) {
        try {
          // Use the email account's organization (consistent with how the message
          // was saved), not the user's first org. getUserOrganizations returns `.id`.
          const organizationId = this.config.organizationId
            || (await storage.getUserOrganizations(messageData.userId))[0]?.id;

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

  public stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[IMAP] Polling stopped');
    }
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