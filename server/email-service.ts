import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';

// Initialize SendGrid with API key from environment
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export class EmailService {
  private readonly fromEmail: string;
  private readonly baseUrl: string;

  constructor() {
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com';
    this.baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  }

  /**
   * Generate a secure random token for email verification
   */
  generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Send email verification email to user
   */
  async sendVerificationEmail(email: string, firstName: string, token: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('[EMAIL] SendGrid not configured, skipping email send');
      console.log(`[EMAIL] Verification link would be: ${this.baseUrl}/verify-email?token=${token}`);
      return true; // Return true in development to not block registration
    }

    const verificationLink = `${this.baseUrl}/verify-email?token=${token}`;
    
    const msg = {
      to: email,
      from: this.fromEmail,
      subject: 'Conferma la tua email - CRM SAP Freelancer',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">Benvenuto/a ${firstName}!</h2>
          
          <p style="color: #666; font-size: 16px;">
            Grazie per aver creato un account. Per completare la registrazione, devi confermare il tuo indirizzo email.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Conferma Email
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Se il pulsante non funziona, copia e incolla questo link nel tuo browser:
          </p>
          <p style="color: #007bff; word-break: break-all; font-size: 14px;">
            ${verificationLink}
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            Questo link scade tra 24 ore. Se non hai richiesto questa registrazione, ignora questa email.
          </p>
        </div>
      `,
      text: `
        Benvenuto/a ${firstName}!
        
        Grazie per aver creato un account. Per completare la registrazione, devi confermare il tuo indirizzo email.
        
        Clicca su questo link per confermare: ${verificationLink}
        
        Questo link scade tra 24 ore. Se non hai richiesto questa registrazione, ignora questa email.
      `
    };

    try {
      await sgMail.send(msg);
      console.log(`[EMAIL] Verification email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send verification email:', error);
      return false;
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('[EMAIL] SendGrid not configured, skipping welcome email');
      return true;
    }

    const msg = {
      to: email,
      from: this.fromEmail,
      subject: 'Benvenuto/a nel CRM SAP Freelancer!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #28a745; text-align: center;">Email confermata con successo!</h2>
          
          <p style="color: #666; font-size: 16px;">
            Ciao ${firstName},
          </p>
          
          <p style="color: #666; font-size: 16px;">
            La tua email è stata confermata con successo. Ora puoi accedere a tutte le funzionalità del tuo CRM per freelancer SAP:
          </p>
          
          <ul style="color: #666; font-size: 16px;">
            <li>Gestione progetti e task</li>
            <li>Amministrazione partner (clienti/fornitori)</li>
            <li>Pipeline delle opportunità commerciali</li>
            <li>Calendario eventi e scadenze</li>
            <li>Timesheet e fatturazione</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${this.baseUrl}" 
               style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Accedi al CRM
            </a>
          </div>
          
          <p style="color: #666; font-size: 16px;">
            Buon lavoro!
          </p>
        </div>
      `,
      text: `
        Email confermata con successo!
        
        Ciao ${firstName},
        
        La tua email è stata confermata con successo. Ora puoi accedere a tutte le funzionalità del tuo CRM per freelancer SAP.
        
        Accedi al CRM: ${this.baseUrl}
        
        Buon lavoro!
      `
    };

    try {
      await sgMail.send(msg);
      console.log(`[EMAIL] Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send welcome email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();