import nodemailer from 'nodemailer';
import { storage } from './storage';
import type { EmailConfig } from '@shared/schema';

interface GmailSendOptions {
  from?: string;           // Email mittente (può essere account inoltrante)
  to: string | string[];   // Destinatari
  subject: string;         // Oggetto
  text?: string;          // Testo semplice
  html?: string;          // HTML
  replyTo?: string;       // Reply-to address
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
}

export class GmailService {
  private transporter: nodemailer.Transporter | null = null;
  private senderConfig: EmailConfig | null = null;

  /**
   * Inizializza il servizio Gmail con un account configurato per l'invio
   */
  async initialize(userId: string): Promise<boolean> {
    try {
      // Trova un account Gmail configurato per l'utente (non inoltrante)
      const emailConfigs = await storage.getEmailConfigs(userId);
      const gmailConfig = emailConfigs.find((config: EmailConfig) => 
        config.isActive && 
        !config.isForwarder && 
        config.host.includes('gmail')
      );

      if (!gmailConfig) {
        console.log('[GMAIL-SERVICE] No active Gmail account found for sending');
        return false;
      }

      this.senderConfig = gmailConfig;

      // Crea transporter nodemailer per Gmail
      this.transporter = nodemailer.createTransport({
        host: gmailConfig.host,
        port: gmailConfig.port,
        secure: gmailConfig.tls, // true for 465, false for other ports
        auth: {
          user: gmailConfig.email,
          pass: gmailConfig.password,
        },
        // Opzioni specifiche per Gmail
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      });

      // Verifica la connessione
      await this.transporter.verify();
      console.log('[GMAIL-SERVICE] Gmail SMTP service initialized successfully');
      return true;

    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to initialize:', error);
      this.transporter = null;
      this.senderConfig = null;
      return false;
    }
  }

  /**
   * Invia email tramite Gmail con possibilità di specificare il mittente
   */
  async sendEmail(options: GmailSendOptions): Promise<boolean> {
    if (!this.transporter || !this.senderConfig) {
      console.error('[GMAIL-SERVICE] Service not initialized');
      return false;
    }

    try {
      const mailOptions = {
        from: options.from || this.senderConfig.email, // Usa il from specificato o account principale
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo || options.from,
        attachments: options.attachments,
        // Header per Gmail "Send as"
        headers: options.from && options.from !== this.senderConfig.email ? {
          'X-Google-Send-As': options.from
        } : undefined
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('[GMAIL-SERVICE] Email sent successfully:', {
        messageId: result.messageId,
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      return true;

    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to send email:', error);
      return false;
    }
  }

  /**
   * Ottiene la lista degli account email disponibili come mittenti
   */
  async getAvailableSenders(userId: string): Promise<{ email: string; name: string; isMain: boolean; isForwarder: boolean }[]> {
    try {
      const emailConfigs = await storage.getEmailConfigs(userId);
      
      return emailConfigs
        .filter((config: EmailConfig) => config.isActive)
        .map((config: EmailConfig) => ({
          email: config.email,
          name: config.email.split('@')[0],
          isMain: !config.isForwarder,
          isForwarder: config.isForwarder || false
        }));

    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to get available senders:', error);
      return [];
    }
  }

  /**
   * Verifica se un indirizzo email è configurato come mittente valido
   */
  async isValidSender(userId: string, email: string): Promise<boolean> {
    try {
      const senders = await this.getAvailableSenders(userId);
      return senders.some(sender => sender.email === email);
    } catch (error) {
      console.error('[GMAIL-SERVICE] Failed to validate sender:', error);
      return false;
    }
  }

  /**
   * Disconnette il servizio
   */
  disconnect(): void {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.senderConfig = null;
      console.log('[GMAIL-SERVICE] Disconnected');
    }
  }
}

// Istanza singola del servizio
const gmailService = new GmailService();

export { gmailService };