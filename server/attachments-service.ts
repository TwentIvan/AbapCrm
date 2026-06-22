import fs from 'fs';
import path from 'path';
import { storage } from './storage';
import * as XLSX from 'xlsx';

export class AttachmentsService {
  private static attachmentsDir = path.join(process.cwd(), 'stored_attachments');

  static async initialize() {
    // Crea directory degli allegati se non esiste
    if (!fs.existsSync(this.attachmentsDir)) {
      fs.mkdirSync(this.attachmentsDir, { recursive: true });
      console.log('[ATTACHMENTS] Created attachments directory');
    }
  }

  static async saveAttachment(attachment: any, messageId: string): Promise<string> {
    await this.initialize();
    
    const filename = attachment.filename || 'unnamed_attachment';
    const safeFilename = this.sanitizeFilename(filename);
    const uniqueFilename = `${messageId}_${safeFilename}`;
    const filePath = path.join(this.attachmentsDir, uniqueFilename);
    
    try {
      fs.writeFileSync(filePath, attachment.content);
      console.log(`[ATTACHMENTS] Saved attachment: ${uniqueFilename}`);
      return uniqueFilename;
    } catch (error) {
      console.error('[ATTACHMENTS] Error saving attachment:', error);
      throw error;
    }
  }

  static async getAttachment(messageId: string, filename: string): Promise<{ data: Buffer, originalName: string } | null> {
    await this.initialize();
    
    // Se il filename include già un messageId (contiene < e >), usalo direttamente
    let uniqueFilename;
    let originalName;
    
    if (filename.includes('<') && filename.includes('>')) {
      // Il filename è già completo con messageId originale
      uniqueFilename = filename;
      originalName = filename.replace(/^[^_]+_/, ''); // Rimuove il prefixo messageId_
    } else {
      // Il filename è solo il nome, aggiungi il messageId
      uniqueFilename = `${messageId}_${filename}`;
      originalName = filename;
    }
    
    const filePath = path.join(this.attachmentsDir, uniqueFilename);
    
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`[ATTACHMENTS] File not found: ${uniqueFilename}`);
        return null;
      }
      
      const data = fs.readFileSync(filePath);
      
      return { data, originalName };
    } catch (error) {
      console.error('[ATTACHMENTS] Error reading attachment:', error);
      return null;
    }
  }

  static async listAttachments(messageId: string): Promise<string[]> {
    await this.initialize();
    
    try {
      const files = fs.readdirSync(this.attachmentsDir);
      const messageAttachments = files.filter(file => file.startsWith(`${messageId}_`));
      
      return messageAttachments.map(file => file.replace(`${messageId}_`, ''));
    } catch (error) {
      console.error('[ATTACHMENTS] Error listing attachments:', error);
      return [];
    }
  }

  /**
   * Extracts readable text from an attachment file.
   * Supports .xlsx, .xls (Excel) and .txt/.csv files.
   * Returns null if the file doesn't exist or is not extractable.
   */
  static async extractTextContent(messageId: string, filename: string): Promise<string | null> {
    try {
      const result = await this.getAttachment(messageId, filename);
      if (!result) return null;

      const ext = path.extname(filename).toLowerCase();

      if (ext === '.xlsx' || ext === '.xls') {
        const workbook = XLSX.read(result.data, { type: 'buffer' });
        const lines: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          if (csv.trim()) {
            lines.push(`=== Sheet: ${sheetName} ===`);
            lines.push(csv.trim());
          }
        }
        return lines.length > 0 ? lines.join('\n') : null;
      }

      if (ext === '.csv' || ext === '.txt') {
        return result.data.toString('utf-8');
      }

      return null;
    } catch (err) {
      console.error(`[ATTACHMENTS] extractTextContent failed for ${filename}:`, err);
      return null;
    }
  }

  private static sanitizeFilename(filename: string): string {
    // Rimuove caratteri pericolosi dal nome file
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // Determina il tipo MIME dal nome file
  static getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    const mimeTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
}