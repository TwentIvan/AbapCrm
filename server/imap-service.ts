import Imap from "imap";
import { simpleParser } from "mailparser";
import { storage } from "./storage";
import { aiService } from "./ai-service";
import { EmailForwardCleaner } from "./email-forward-cleaner";
import type { InsertMessage } from "@shared/schema";

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  folder: string;
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
    });

    this.imap.once('end', () => {
      console.log('[IMAP] Connection ended');
      this.isConnected = false;
    });
  }

  private openFolder() {
    this.imap.openBox(this.config.folder, false, (err: Error | null, box: any) => {
      if (err) {
        console.error('[IMAP] Error opening folder:', err.message);
        return;
      }
      console.log(`[IMAP] Opened folder: ${this.config.folder}`);
      // First check for existing emails from the last 30 days
      this.checkForExistingEmails();
      // Then check for new unread emails
      this.checkForNewEmails();
    });
  }

  private checkForExistingEmails() {
    // Search for emails from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const searchDate = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    this.imap.search([['SINCE', searchDate]], (err: Error | null, results: number[]) => {
      if (err) {
        console.error('[IMAP] Search error for existing emails:', err);
        return;
      }

      if (results.length === 0) {
        console.log('[IMAP] No existing emails found in the last 30 days');
        return;
      }

      console.log(`[IMAP] Found ${results.length} existing emails from the last 30 days`);
      this.processEmails(results, false); // Don't mark as seen for existing emails
    });
  }

  private checkForNewEmails() {
    // Search for unread emails
    this.imap.search(['UNSEEN'], (err: Error | null, results: number[]) => {
      if (err) {
        console.error('[IMAP] Search error:', err);
        return;
      }

      if (results.length === 0) {
        console.log('[IMAP] No new emails');
        return;
      }

      console.log(`[IMAP] Found ${results.length} new emails`);
      this.processEmails(results, true); // Mark new emails as seen
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
      
      // Extract attachments names
      const attachments = parsed.attachments?.map((att: any) => att.filename || 'unnamed') || [];

      // Helper to get first email address
      const getFirstAddress = (addressObj: any) => {
        if (!addressObj) return null;
        if (Array.isArray(addressObj)) return addressObj[0] || null;
        if (addressObj.value && Array.isArray(addressObj.value)) return addressObj.value[0] || null;
        return addressObj;
      };

      const fromAddr = getFirstAddress(parsed.from);
      const toAddr = getFirstAddress(parsed.to);

      const messageId = parsed.messageId || `imap-${Date.now()}-${seqno}`;
      const userId = '811b4ad2-6882-4a7d-afcd-57dfb7f0af51'; // TODO: Get from context

      // Check if message already exists to avoid duplicates
      const existingMessage = await storage.getMessageByMessageId(messageId, userId);
      if (existingMessage) {
        console.log(`[IMAP] Email already exists, skipping: ${messageId}`);
        return;
      }

      // Clean forwarded email content
      const cleanedEmail = EmailForwardCleaner.cleanForwardedEmail(
        parsed.subject || '',
        parsed.text || '',
        parsed.html || null
      );

      if (cleanedEmail.isForwarded) {
        console.log(`[IMAP] Cleaned forwarded email from: ${fromAddr?.address} - Original subject: "${cleanedEmail.originalSubject}"`);
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
        htmlBody: cleanedEmail.originalHtmlBody || null,
        originalToEmails: cleanedEmail.originalToEmails || [],
        originalCcEmails: cleanedEmail.originalCcEmails || [],
        originalBccEmails: cleanedEmail.originalBccEmails || [],
        attachments: attachments,
        receivedAt: parsed.date || new Date(),
        userId,
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
          const analysis = await aiService.analyzeMessage(savedMessage, messageData.userId);
          if (analysis.bestMatch) {
            await aiService.updateMessageWithSuggestion(
              savedMessage.id, 
              analysis.bestMatch, 
              messageData.userId
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
      this.imap.connect();
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
  if (emailService) {
    emailService.disconnect();
  }
  
  emailService = new ImapEmailService(config);
  emailService.connect();
  emailService.startPolling(2); // Check every 2 minutes
  
  return emailService;
};

export const getEmailService = () => emailService;