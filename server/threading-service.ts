// Email Threading Service
// Handles email thread identification and grouping using RFC 5256 threading algorithms

import crypto from 'crypto';

export interface ThreadingInfo {
  threadId: string;
  inReplyTo: string | null;
  references: string[];
}

export interface EmailHeaders {
  messageId?: string;
  inReplyTo?: string | string[];
  references?: string | string[];
  subject?: string;
}

export class ThreadingService {
  
  /**
   * Extract threading information from email headers
   */
  static extractThreadingInfo(headers: EmailHeaders): ThreadingInfo {
    const messageId = this.normalizeMsgId(headers.messageId);
    const inReplyTo = this.parseReplyTo(headers.inReplyTo);
    const references = this.parseReferences(headers.references);
    
    // Add inReplyTo to references if not already present
    if (inReplyTo && !references.includes(inReplyTo)) {
      references.push(inReplyTo);
    }
    
    // Generate thread ID based on conversation chain
    const threadId = this.generateThreadId(messageId, inReplyTo, references, headers.subject);
    
    console.log(`[THREADING] Extracted: threadId=${threadId}, inReplyTo=${inReplyTo}, references=[${references.join(', ')}]`);
    
    return {
      threadId,
      inReplyTo,
      references
    };
  }

  /**
   * Normalize Message-ID by removing angle brackets and trimming
   */
  private static normalizeMsgId(messageId?: string): string | null {
    if (!messageId) return null;
    
    // Remove angle brackets if present and trim
    const match = messageId.match(/^<(.+)>$/);
    return match ? match[1].trim() : messageId.trim();
  }
  
  /**
   * Parse In-Reply-To header (can be string or array)
   */
  private static parseReplyTo(inReplyTo?: string | string[]): string | null {
    if (!inReplyTo) return null;
    
    // Handle array case - take first element
    const inReplyToStr = Array.isArray(inReplyTo) ? inReplyTo[0] : inReplyTo;
    if (!inReplyToStr) return null;
    
    // Extract first Message-ID from In-Reply-To header
    // Handle both <id@domain.com> and id@domain.com formats
    const match = inReplyToStr.match(/<([^>]+)>/);
    if (match) {
      return match[1];
    }
    
    // Fallback: use the string as-is if no brackets (but trim whitespace)
    const trimmed = inReplyToStr.trim();
    return trimmed || null;
  }
  
  /**
   * Parse References header into array of Message-IDs (can be string or array)
   */
  private static parseReferences(references?: string | string[]): string[] {
    if (!references) return [];
    
    // Handle array case - join all elements
    const referencesStr = Array.isArray(references) ? references.join(' ') : references;
    if (!referencesStr) return [];
    
    // Extract all Message-IDs from References header
    // First try to extract bracketed Message-IDs
    const bracketedMatches = referencesStr.match(/<[^>]+>/g);
    if (bracketedMatches && bracketedMatches.length > 0) {
      return bracketedMatches.map(ref => ref.slice(1, -1)); // Remove < and >
    }
    
    // Fallback: split by whitespace and filter for email-like strings
    const tokens = referencesStr.trim().split(/\s+/);
    return tokens
      .filter(token => token && token.includes('@') && token.length > 3)
      .map(token => token.trim())
      .filter(token => token.length > 0);
  }
  
  /**
   * Generate thread ID using conversation chain and subject
   */
  private static generateThreadId(
    messageId: string | null, 
    inReplyTo: string | null, 
    references: string[], 
    subject?: string
  ): string {
    // Detect References ordering using inReplyTo as anchor and pick correct root
    let baseId: string | null = null;
    
    if (references.length > 0) {
      if (inReplyTo && references.includes(inReplyTo)) {
        // Use inReplyTo as anchor to detect ordering
        if (references[0] === inReplyTo) {
          // Newest-first ordering (Outlook style) → root is last
          baseId = references[references.length - 1];
        } else if (references[references.length - 1] === inReplyTo) {
          // Oldest-first ordering (traditional) → root is first
          baseId = references[0];
        } else {
          // inReplyTo is somewhere in middle → use last reference as root (newest-first fallback)
          baseId = references[references.length - 1];
        }
      } else {
        // No reliable anchor → assume newest-first (covers common Outlook clients)
        baseId = references[references.length - 1];
      }
    }
    
    // Fallback chain: references → inReplyTo → messageId
    if (!baseId) {
      baseId = inReplyTo || messageId;
    }
    
    // If no threading headers, use normalized subject
    if (!baseId && subject) {
      const normalizedSubject = this.normalizeSubject(subject);
      baseId = `subject:${normalizedSubject}`;
    }
    
    // Fallback to a generated ID
    if (!baseId) {
      baseId = `thread:${Date.now()}`;
    }
    
    // Create a stable thread ID hash
    return crypto.createHash('md5').update(baseId).digest('hex').substring(0, 16);
  }
  
  /**
   * Normalize subject for threading (remove Re:, Fwd:, etc.)
   */
  private static normalizeSubject(subject: string): string {
    return subject
      .replace(/^(Re|RE|re|Fwd|FWD|fwd|R|R\d+|I):\s*/gi, '')
      .replace(/^\[[^\]]+\]\s*/, '') // Remove [tags]
      .trim()
      .toLowerCase();
  }
  
  /**
   * Check if an email is likely a reply based on subject
   */
  static isReplyBySubject(subject?: string): boolean {
    if (!subject) return false;
    return /^(Re|RE|re|R|R\d+):\s+/i.test(subject);
  }
  
  /**
   * Check if an email is likely a forward based on subject
   */
  static isForwardBySubject(subject?: string): boolean {
    if (!subject) return false;
    return /^(Fwd|FWD|fwd|I):\s+/i.test(subject);
  }
  
  /**
   * Determine if messages belong to the same conversation
   */
  static belongsToSameThread(thread1: ThreadingInfo, thread2: ThreadingInfo): boolean {
    // Same thread ID
    if (thread1.threadId === thread2.threadId) return true;
    
    // One's inReplyTo is in the other's references (proper threading)
    if (thread1.inReplyTo && thread2.references.includes(thread1.inReplyTo)) return true;
    if (thread2.inReplyTo && thread1.references.includes(thread2.inReplyTo)) return true;
    
    // Same inReplyTo (both replying to the same message)
    if (thread1.inReplyTo && thread2.inReplyTo && thread1.inReplyTo === thread2.inReplyTo) return true;
    
    // Cross-references (common Message-IDs in reference chains)
    const hasCommonReference = thread1.references.some(ref => 
      thread2.references.includes(ref)
    );
    
    return hasCommonReference;
  }
}