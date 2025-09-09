// Sistema per pulire le email inoltrate rimuovendo i metadati di inoltro

interface ForwardedEmailData {
  originalSubject: string;
  originalBody: string;
  originalHtmlBody: string | null;
  originalFromEmail: string | null;
  originalFromName: string | null;
  isForwarded: boolean;
  fullThreadContent: string | null;
  originalToEmails: string[];
  originalCcEmails: string[];
  originalBccEmails: string[];
  preservedHtmlFormatting: string | null;
}

export class EmailForwardCleaner {
  
  static cleanForwardedEmail(subject: string, textBody: string, htmlBody: string | null): ForwardedEmailData {
    const result: ForwardedEmailData = {
      originalSubject: subject,
      originalBody: textBody,
      originalHtmlBody: htmlBody,
      originalFromEmail: null,
      originalFromName: null,
      isForwarded: false,
      fullThreadContent: null,
      originalToEmails: [],
      originalCcEmails: [],
      originalBccEmails: [],
      preservedHtmlFormatting: null
    };

    // Rileva se è un inoltro dal subject
    const isSubjectForwarded = this.isForwardedSubject(subject);
    
    // Rileva se è un inoltro dal body
    const isBodyForwarded = this.isForwardedBody(textBody);

    if (isSubjectForwarded || isBodyForwarded) {
      result.isForwarded = true;
      result.originalSubject = this.cleanForwardedSubject(subject);
      result.originalBody = this.cleanForwardedBody(textBody);
      
      // Extract original sender from forwarded content
      const originalSender = this.extractOriginalSender(textBody);
      if (originalSender) {
        result.originalFromEmail = originalSender.email;
        result.originalFromName = originalSender.name;
      }
      
      // Extract original recipients
      const originalRecipients = this.extractOriginalRecipients(textBody);
      result.originalToEmails = originalRecipients.to;
      result.originalCcEmails = originalRecipients.cc;
      result.originalBccEmails = originalRecipients.bcc;
      
      // Extract full thread content
      result.fullThreadContent = this.extractFullThread(textBody);
      
      if (htmlBody) {
        result.originalHtmlBody = this.cleanForwardedHtmlBody(htmlBody);
        result.preservedHtmlFormatting = this.preserveHtmlFormatting(htmlBody);
      }
    }

    return result;
  }

  private static isForwardedSubject(subject: string): boolean {
    if (!subject) return false;
    
    const forwardPrefixes = [
      /^Fwd?:\s*/i,
      /^FW:\s*/i,
      /^Inoltro:\s*/i,
      /^I:\s*/i,
      /^TR:\s*/i,
      /^WG:\s*/i,
      /^\[EXT\]/i,
      /^Re:.*\[EXT\]/i
    ];

    return forwardPrefixes.some(prefix => prefix.test(subject));
  }

  private static isForwardedBody(body: string): boolean {
    if (!body) return false;

    const forwardPatterns = [
      /---------- Forwarded message ---------/i,
      /---------- Messaggio inoltrato ----------/i,
      /Begin forwarded message:/i,
      /---------- Original Message ----------/i,
      /---------- Messaggio originale ----------/i,
      /====== Forwarded Message ======/i,
      /From:[\s\S]*?\nDate:[\s\S]*?\nSubject:[\s\S]*?\nTo:/,
      /Da:[\s\S]*?\nData:[\s\S]*?\nOggetto:[\s\S]*?\nA:/,
      /_{20,}/,  // Outlook separator
      /Von:[\s\S]*?\nGesendet:[\s\S]*?\nAn:/,  // German Outlook
      /De:[\s\S]*?\nEnvoyé:[\s\S]*?\nÀ:/,     // French Outlook
      /Inviato:[\s\S]*?\nA:/,                 // Italian Outlook short form
      /-{5,}.*Original.*Message.*-{5,}/i,
      /_{5,}.*Forwarded.*_{5,}/i
    ];

    return forwardPatterns.some(pattern => pattern.test(body));
  }

  private static cleanForwardedSubject(subject: string): string {
    if (!subject) return subject;

    // Rimuove tutti i prefissi di inoltro
    let cleanSubject = subject;
    const forwardPrefixes = [
      /^Fwd?:\s*/i,
      /^FW:\s*/i,
      /^Inoltro:\s*/i,
      /^I:\s*/i,
      /^TR:\s*/i,
      /^WG:\s*/i,
      /^\[EXT\]\s*/i,
      /^Re:\s*\[EXT\]\s*/i
    ];

    forwardPrefixes.forEach(prefix => {
      cleanSubject = cleanSubject.replace(prefix, '');
    });

    return cleanSubject.trim();
  }

  private static cleanForwardedBody(body: string): string {
    if (!body) return body;

    let cleanBody = body;
    const originalBody = body;

    // Prima prova a estrarre il contenuto originale
    const extractedContent = this.extractOriginalBody(body);
    if (extractedContent && extractedContent !== body && extractedContent.length > 20) {
      return extractedContent;
    }

    // Pattern per identificare l'inizio della sezione di inoltro
    const forwardSeparators = [
      /---------- Forwarded message ---------[\s\S]*/i,
      /---------- Messaggio inoltrato ----------[\s\S]*/i,
      /Begin forwarded message:[\s\S]*/i,
      /---------- Original Message ----------[\s\S]*/i,
      /---------- Messaggio originale ----------[\s\S]*/i,
      /====== Forwarded Message ======[\s\S]*/i,
      /-{5,}.*Original.*Message.*-{5,}[\s\S]*/i,
      /_{5,}.*Forwarded.*_{5,}[\s\S]*/i,
      /_{20,}[\s\S]*/,  // Outlook separator
      /From:[\s\S]*?\nDate:[\s\S]*?\nSubject:[\s\S]*?\nTo:[\s\S]*/,
      /Da:[\s\S]*?\nData:[\s\S]*?\nOggetto:[\s\S]*?\nA:[\s\S]*/,
      /Von:[\s\S]*?\nGesendet:[\s\S]*?\nAn:[\s\S]*/,  // German
      /De:[\s\S]*?\nEnvoyé:[\s\S]*?\nÀ:[\s\S]*/,     // French
      /Il giorno.*ha scritto:[\s\S]*/i,
      /On.*wrote:[\s\S]*/i,
      /Le.*a écrit[\s\S]*/i,
      /Am.*schrieb[\s\S]*/i
    ];

    // Rimuove la sezione di inoltro
    forwardSeparators.forEach(separator => {
      const match = cleanBody.match(separator);
      if (match) {
        cleanBody = cleanBody.substring(0, match.index || 0);
      }
    });

    // Pulisce whitespace extra e linee vuote multiple
    cleanBody = cleanBody
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines consecutive
      .replace(/\s+$/g, '')         // Rimuove whitespace finale
      .trim();

    // Se il risultato è troppo corto o solo una firma, restituisce il body originale
    if (cleanBody.length < 20 || this.isOnlySignature(cleanBody)) {
      console.log('[EMAIL-CLEANER] Content too short after cleaning, keeping original');
      return originalBody;
    }

    return cleanBody;
  }

  private static cleanForwardedHtmlBody(htmlBody: string): string | null {
    if (!htmlBody) return htmlBody;

    let cleanHtml = htmlBody;
    const originalHtml = htmlBody;

    // Se l'HTML contiene solo una signature/firma, restituisce null per usare il text body
    if (this.isOnlySignatureHtml(cleanHtml)) {
      console.log('[EMAIL-CLEANER] HTML contains only signature, preferring text body');
      return null;
    }

    // Pattern HTML per sezioni di inoltro
    const htmlForwardPatterns = [
      /<div[^>]*>---------- Forwarded message ---------[\s\S]*$/i,
      /<div[^>]*>---------- Messaggio inoltrato ----------[\s\S]*$/i,
      /<div[^>]*>Begin forwarded message:[\s\S]*$/i,
      /<div[^>]*>---------- Original Message ----------[\s\S]*$/i,
      /<blockquote[^>]*>[\s\S]*<\/blockquote>/i,
      /<div[^>]*class="[^"]*forward[^"]*"[\s\S]*$/i,
      /<div[^>]*class="[^"]*quoted[^"]*"[\s\S]*$/i,
      /<hr[^>]*>[\s\S]*$/i,
      /<div[^>]*>From:.*Date:.*Subject:.*To:[\s\S]*$/i,
      /<div[^>]*>Da:.*Data:.*Oggetto:.*A:[\s\S]*$/i
    ];

    // Rimuove le sezioni HTML di inoltro
    htmlForwardPatterns.forEach(pattern => {
      const match = cleanHtml.match(pattern);
      if (match) {
        cleanHtml = cleanHtml.substring(0, match.index || 0);
      }
    });

    // Chiude eventuali tag aperti dopo la rimozione
    cleanHtml = this.closeOpenHtmlTags(cleanHtml);

    // Se dopo la pulizia contiene solo signature, restituisce null
    if (this.isOnlySignatureHtml(cleanHtml)) {
      console.log('[EMAIL-CLEANER] After cleaning, HTML contains only signature, using text body');
      return null;
    }

    return cleanHtml.trim();
  }

  private static closeOpenHtmlTags(html: string): string {
    // Lista dei tag che devono essere chiusi
    const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
    const containerTags = ['div', 'p', 'span', 'a', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th'];
    
    const openTags: string[] = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      if (selfClosingTags.includes(tagName)) {
        continue; // Skip self-closing tags
      }

      if (fullTag.startsWith('</')) {
        // Closing tag - remove from open tags
        const index = openTags.lastIndexOf(tagName);
        if (index !== -1) {
          openTags.splice(index, 1);
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag
        openTags.push(tagName);
      }
    }

    // Chiude i tag rimasti aperti in ordine inverso
    for (let i = openTags.length - 1; i >= 0; i--) {
      html += `</${openTags[i]}>`;
    }

    return html;
  }

  private static extractOriginalSender(body: string): { email: string; name: string } | null {
    if (!body) return null;

    // Pattern per estrarre il mittente originale da diversi formati
    const senderPatterns = [
      // Outlook italiano: "Da: Nome Cognome <email@domain.com>"
      /Da:\s*([^<\n]*?)\s*<([^>\n]+)>/i,
      // Outlook inglese: "From: Name Surname <email@domain.com>"
      /From:\s*([^<\n]*?)\s*<([^>\n]+)>/i,
      // Outlook tedesco: "Von: Name Surname <email@domain.com>"
      /Von:\s*([^<\n]*?)\s*<([^>\n]+)>/i,
      // Outlook francese: "De: Name Surname <email@domain.com>"
      /De:\s*([^<\n]*?)\s*<([^>\n]+)>/i,
      // Solo email senza nome: "Da: email@domain.com"
      /Da:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /From:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /Von:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /De:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
    ];

    for (const pattern of senderPatterns) {
      const match = body.match(pattern);
      if (match) {
        if (match[2]) {
          // Pattern con nome e email
          return {
            name: match[1].trim(),
            email: match[2].trim()
          };
        } else {
          // Pattern solo email
          return {
            name: match[1].trim(),
            email: match[1].trim()
          };
        }
      }
    }

    return null;
  }

  private static extractOriginalBody(body: string): string {
    if (!body) return body;

    // Cerca il contenuto del messaggio originale dopo i metadati
    const contentPatterns = [
      // Dopo "Oggetto:" cerca la prossima riga non vuota
      /Oggetto:[^\n]*\n\s*([\s\S]*?)(?=_{20,}|Da:|From:|Von:|De:|$)/i,
      // Dopo "Subject:" cerca la prossima riga non vuota  
      /Subject:[^\n]*\n\s*([\s\S]*?)(?=_{20,}|Da:|From:|Von:|De:|$)/i,
      // Dopo "Betreff:" (tedesco)
      /Betreff:[^\n]*\n\s*([\s\S]*?)(?=_{20,}|Da:|From:|Von:|De:|$)/i,
      // Contenuto dopo le intestazioni Outlook
      /(?:Da|From|Von|De):[^\n]*\n(?:[^\n]*\n)*?\s*([\s\S]*?)(?=_{20,}|Da:|From:|Von:|De:|$)/i
    ];

    for (const pattern of contentPatterns) {
      const match = body.match(pattern);
      if (match && match[1] && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }

    return body;
  }

  private static isOnlySignature(text: string): boolean {
    if (!text) return true;
    
    const signatureIndicators = [
      /technical analyst/i,
      /team head/i,
      /www\./i,
      /\+39\s*\d/i,
      /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      /p\.iva/i,
      /great place to work/i,
      /via\s+[a-z]/i
    ];
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length < 10) {
      const indicatorMatches = signatureIndicators.filter(pattern => pattern.test(text)).length;
      return indicatorMatches >= 3; // Se ha almeno 3 indicatori di firma e poche righe
    }
    
    return false;
  }

  private static isOnlySignatureHtml(html: string): boolean {
    if (!html) return true;
    
    // Se l'HTML è molto lungo (> 10KB), sicuramente non è solo una firma
    if (html.length > 10000) {
      console.log(`[EMAIL-CLEANER] HTML is ${html.length} chars, too long to be only signature`);
      return false;
    }
    
    // Rimuove tutti i tag HTML per analizzare solo il testo
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Se il contenuto è molto corto, probabilmente è solo una firma
    if (textContent.length < 50) return true;
    
    // Conta gli indicatori di firma nel testo
    const signatureIndicators = [
      /technical analyst/i,
      /team head/i,
      /www\./i,
      /\+39\s*\d/i,
      /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      /p\.iva/i,
      /great place to work/i,
      /via\s+[a-z]/i,
      /spa/i,
      /lutech/i
    ];
    
    const indicatorMatches = signatureIndicators.filter(pattern => pattern.test(textContent)).length;
    const lines = textContent.split(/[\n\r]/).filter(line => line.trim().length > 3);
    
    // Se ha molti indicatori di firma e poche righe di contenuto significativo
    return indicatorMatches >= 4 && lines.length < 8;
  }

  // Estrae tutti i destinatari originali dalle email inoltrate
  private static extractOriginalRecipients(textBody: string): { to: string[], cc: string[], bcc: string[] } {
    const result: { to: string[], cc: string[], bcc: string[] } = { to: [], cc: [], bcc: [] };
    
    try {
      console.log('[EMAIL-CLEANER] Extracting recipients from body...');
      
      // Pattern semplificati per cercare destinatari nei metadati degli inoltri
      const toPatterns = [
        /(?:^|\n)\s*A:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
        /(?:^|\n)\s*To:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
        /(?:^|\n)\s*An:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
      ];
      
      const ccPatterns = [
        /(?:^|\n)\s*CC:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
        /(?:^|\n)\s*Cc:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
        /(?:^|\n)\s*CCN:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
      ];
      
      const bccPatterns = [
        /(?:^|\n)\s*BCC:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
        /(?:^|\n)\s*Bcc:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
        /(?:^|\n)\s*Nascosta:\s*(.+?)(?=\n[A-Za-z]+:|$)/gim,
      ];

      // Estrai TO
      toPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(textBody)) !== null) {
          const emailLine = match[1].trim();
          const emails = this.extractEmailsFromLine(emailLine);
          result.to.push(...emails);
          console.log('[EMAIL-CLEANER] Found TO recipients:', emails);
        }
      });

      // Estrai CC
      ccPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(textBody)) !== null) {
          const emailLine = match[1].trim();
          const emails = this.extractEmailsFromLine(emailLine);
          result.cc.push(...emails);
          console.log('[EMAIL-CLEANER] Found CC recipients:', emails);
        }
      });

      // Estrai BCC
      bccPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(textBody)) !== null) {
          const emailLine = match[1].trim();
          const emails = this.extractEmailsFromLine(emailLine);
          result.bcc.push(...emails);
          console.log('[EMAIL-CLEANER] Found BCC recipients:', emails);
        }
      });

      // Rimuove duplicati
      result.to = Array.from(new Set(result.to));
      result.cc = Array.from(new Set(result.cc));
      result.bcc = Array.from(new Set(result.bcc));

    } catch (error) {
      console.log('[EMAIL-CLEANER] Error extracting recipients:', error);
    }

    return result;
  }

  // Estrae thread completo dalle email inoltrate mantenendo l'ordine cronologico
  private static extractFullThread(textBody: string): string | null {
    try {
      // Cerca pattern che indicano l'inizio di messaggi precedenti nel thread
      const threadPatterns = [
        /(?:Il .*?ha scritto:|On .*? wrote:|From:.*?Sent:.*?To:.*?Subject:)/i,
        /(?:---------- Forwarded message ----------|---------- Messaggio inoltrato ----------)/i,
        /(?:Begin forwarded message:|---------- Original Message ----------)/i
      ];

      let fullThread = textBody;
      
      // Trova il punto dove inizia il thread completo
      for (const pattern of threadPatterns) {
        const match = textBody.match(pattern);
        if (match && match.index !== undefined) {
          // Estrae tutto dal punto del thread in poi
          const threadStart = match.index;
          const threadPortion = textBody.substring(threadStart);
          
          // Pulisce leggermente mantenendo la struttura del thread
          fullThread = threadPortion
            .replace(/^-+\s*(?:Forwarded message|Messaggio inoltrato)\s*-+/gm, '')
            .replace(/^-+\s*Original Message\s*-+/gm, '')
            .replace(/^Begin forwarded message:\s*/gm, '')
            .trim();

          if (fullThread.length > 50) {
            console.log('[EMAIL-CLEANER] Extracted thread content:', fullThread.length, 'characters');
            return fullThread;
          }
        }
      }

      // Se non trova pattern specifici ma il contenuto è lungo, lo considera un thread
      if (textBody.length > 500) {
        return textBody;
      }

    } catch (error) {
      console.log('[EMAIL-CLEANER] Error extracting thread:', error);
    }

    return null;
  }

  // Per le email inoltrate, cerca di tagliare solo la parte di inoltro
  private static preserveHtmlFormatting(htmlBody: string): string | null {
    try {
      console.log(`[EMAIL-CLEANER] Attempting to cut forwarded content from HTML (${htmlBody.length} chars)`);
      
      // Trova il punto dove inizia la sezione di inoltro
      const cutPoint = this.findForwardCutPoint(htmlBody);
      
      if (cutPoint > 0) {
        // Taglia l'HTML al punto trovato, preservando solo la parte originale
        const cleanedHtml = htmlBody.substring(0, cutPoint).trim();
        console.log(`[EMAIL-CLEANER] ✓ Cut HTML at position ${cutPoint}, result: ${cleanedHtml.length} chars`);
        
        // Verifica che il risultato abbia contenuto utile
        if (cleanedHtml.length > 50) {
          return cleanedHtml;
        } else {
          console.log(`[EMAIL-CLEANER] ✗ Cut HTML too short, falling back to text body`);
        }
      } else {
        console.log(`[EMAIL-CLEANER] ✗ No cut point found, falling back to text body`);
      }
      
      // Se non riesce a tagliare l'HTML in modo efficace, usa il text body
      return null;

    } catch (error) {
      console.log('[EMAIL-CLEANER] Error preserving HTML formatting:', error);
    }

    return null;
  }

  // Trova il punto ottimale dove tagliare l'HTML per rimuovere la sezione di inoltro
  private static findForwardCutPoint(htmlBody: string): number {
    console.log(`[EMAIL-CLEANER] DEBUG: Looking for cut point in HTML (${htmlBody.length} chars)`);
    
    // APPROCCIO OUTLOOK: Cerca la fine della firma e mantieni tutto il resto
    // La firma di Outlook ha id="Signature" o class="signature"
    const signatureEndPatterns = [
      // Fine div con id="Signature"
      /<\/div>[\s]*<\/div>[\s]*(?=<div[^>]*(?:id="divRplyFwdMsg"|class="[^"]*BodyFragment))/i,
      // Fine div generale prima del contenuto inoltrato
      /<\/div>[\s]*(?=<div[^>]*(?:dir=|style="[^"]*border-top))/i,
      // Fine sezione firma prima di HR separator
      /<\/div>[\s]*(?=<hr)/i,
      // Fine elementi firma prima di contenuto principale
      /<\/p>[\s]*<\/div>[\s]*(?=<div[^>]*(?!id="Signature"))/i
    ];
    
    console.log('[EMAIL-CLEANER] Searching for signature end patterns...');
    
    // Prima prova con i pattern di fine firma (approccio Outlook)
    for (const pattern of signatureEndPatterns) {
      const match = htmlBody.match(pattern);
      if (match && match.index !== undefined) {
        const cutPoint = match.index + match[0].length;
        console.log(`[EMAIL-CLEANER] ✓ Found signature end at position ${cutPoint}`);
        return cutPoint; // Mantieni tutto DOPO la firma
      }
    }
    
    // Fallback: pattern tradizionali di inoltro
    const forwardMarkers = [
      // Outlook divRplyFwdMsg (il più specifico)
      /<div[^>]*id[\s]*=[\s]*["']?divRplyFwdMsg["']?[^>]*>/i,
      /<div[^>]*class[\s]*=[\s]*["']?[^"']*BodyFragment[^"']*["']?[^>]*>/i,
      
      // Headers HTML bold di Outlook
      /<b>\s*From:\s*<\/b>/i,
      /<b>\s*Da:\s*<\/b>/i,
      
      // Headers di forwarded message tradizionali
      /[-]{8,}\s*Forwarded message\s*[-]{8,}/gi,
      /[-]{8,}\s*Original Message\s*[-]{8,}/gi,
      
      // HR separator
      /<hr[^>]*>/i,
      
      // Gmail style quotes
      /<div[^>]*class="[^"]*gmail_quote/gi,
      /<blockquote[^>]*>/gi
    ];

    let earliestPosition = -1;
    let foundPattern = '';
    
    for (let i = 0; i < forwardMarkers.length; i++) {
      const pattern = forwardMarkers[i];
      const match = htmlBody.match(pattern);
      if (match && match.index !== undefined) {
        console.log(`[EMAIL-CLEANER] DEBUG: Found marker "${pattern}" at position ${match.index}`);
        if (earliestPosition === -1 || match.index < earliestPosition) {
          earliestPosition = match.index;
          foundPattern = pattern.toString();
        }
      }
    }
    
    if (earliestPosition > 0) {
      console.log(`[EMAIL-CLEANER] DEBUG: Will cut at position ${earliestPosition} using pattern ${foundPattern}`);
    } else {
      console.log(`[EMAIL-CLEANER] DEBUG: No cut point found, will try header removal only`);
    }

    return earliestPosition;
  }

  // Rimuove solo gli header di forwarding ma mantiene tutto il contenuto
  private static removeForwardingHeaders(htmlBody: string): string {
    let processed = htmlBody;
    
    // Rimuove solo header specifici di forwarding
    const headerPatterns = [
      /<div[^>]*>[\s]*---------- Forwarded message ---------[\s]*<\/div>/gi,
      /<div[^>]*>[\s]*---------- Messaggio inoltrato ----------[\s]*<\/div>/gi,
      /<div[^>]*>[\s]*Begin forwarded message:[\s]*<\/div>/gi,
      /<div[^>]*>[\s]*---------- Original Message ----------[\s]*<\/div>/gi,
    ];

    headerPatterns.forEach(pattern => {
      processed = processed.replace(pattern, '');
    });
    
    // Pulizia leggera
    processed = processed
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 newlines
      .replace(/>\s+</g, '><')          // Rimuove spazi tra tag
      .trim();

    return processed;
  }

  // Compatta gli header email lunghi in versioni più brevi
  private static compactEmailHeaders(htmlBody: string): string {
    let processed = htmlBody;
    
    // Pattern per header email completi
    const emailHeaderPattern = /<div[^>]*>\s*From:\s*([^<]+)<\/div>\s*<div[^>]*>\s*Date:\s*([^<]+)<\/div>\s*<div[^>]*>\s*Subject:\s*([^<]+)<\/div>\s*<div[^>]*>\s*To:\s*([^<]+)<\/div>/gi;
    
    processed = processed.replace(emailHeaderPattern, (match, from, date, subject, to) => {
      // Compatta in una singola linea stile "thread collapsed"
      const fromShort = from.trim().split('<')[0].trim(); // Solo il nome, non l'email
      const subjectShort = subject.trim().length > 30 ? subject.trim().substring(0, 30) + '...' : subject.trim();
      return `<div style="background:#f5f5f5;padding:8px;margin:10px 0;border-left:3px solid #ccc;font-size:0.9em;color:#666;">
        <strong>📧 ${fromShort}</strong> - ${subjectShort} <em style="float:right;">[thread compatto]</em>
      </div>`;
    });

    return processed;
  }

  // Compatta le citazioni lunghe in versioni collassate
  private static compactLongQuotes(htmlBody: string): string {
    let processed = htmlBody;
    
    // Pattern per blockquote lunghi
    const longQuotePattern = /<blockquote[^>]*>([\s\S]{200,}?)<\/blockquote>/gi;
    
    processed = processed.replace(longQuotePattern, (match, content) => {
      // Estrae le prime parole del contenuto quotato
      const textContent = content.replace(/<[^>]+>/g, ' ').trim();
      const preview = textContent.substring(0, 80) + (textContent.length > 80 ? '...' : '');
      
      return `<div style="background:#f9f9f9;border:1px dashed #ccc;padding:8px;margin:8px 0;font-style:italic;color:#777;">
        <span style="font-size:0.9em;">💬 "${preview}" </span>
        <em style="font-size:0.8em;">[citazione compressa]</em>
      </div>`;
    });

    return processed;
  }

  // Helper per estrarre emails da una linea di testo
  private static extractEmailsFromLine(line: string): string[] {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = line.match(emailRegex);
    return matches || [];
  }
}