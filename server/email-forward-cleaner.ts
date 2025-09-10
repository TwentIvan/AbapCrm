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
  
  static cleanForwardedEmail(
    subject: string, 
    textBody: string, 
    htmlBody: string | null,
    forceCleanForwarded?: boolean,  // From database isForwarder flag
    customSignature?: string | null // From database customSignature field
  ): ForwardedEmailData {
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

    // Usa il flag dal database se fornito, altrimenti usa la detection automatica
    const shouldCleanForwarded = forceCleanForwarded || isSubjectForwarded || isBodyForwarded;

    if (shouldCleanForwarded) {
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

    // Rimuove la firma personalizzata se configurata nel database
    if (customSignature && customSignature.trim()) {
      result.originalBody = this.removeCustomSignature(result.originalBody, customSignature);
      if (result.originalHtmlBody) {
        result.originalHtmlBody = this.removeCustomSignature(result.originalHtmlBody, customSignature);
      }
    }

    return result;
  }

  // Divide il contenuto dell'email in body principale e resto del thread
  static splitEmailContent(
    subject: string,
    body: string,
    htmlBody?: string | null
  ): {
    bodyText: string;
    bodyHtml: string | null;
    remainderText: string | null;
    remainderHtml: string | null;
    headerSummary: string | null;
    isForwarded: boolean;
  } {
    // Prima pulisci l'email per ottenere le parti separate
    const cleaned = this.cleanForwardedEmail(subject, body, htmlBody || null);
    
    if (!cleaned.isForwarded) {
      // Se non è inoltrata, non c'è separazione da fare
      // FIX: Usa htmlBody originale invece di preservedHtmlFormatting che è null
      return {
        bodyText: cleaned.originalBody,
        bodyHtml: htmlBody ? this.sanitizeHtml(htmlBody) : null,
        remainderText: null,
        remainderHtml: null,
        headerSummary: null,
        isForwarded: false
      };
    }

    // Per email inoltrate, calcola il remainder
    const remainder = this.extractRemainder(body, cleaned.originalBody, htmlBody, cleaned.originalHtmlBody);
    const headerSummary = this.extractHeaderSummary(body);

    // FIX: Usa originalHtmlBody invece di preservedHtmlFormatting
    const cleanedHtmlBody = cleaned.originalHtmlBody || cleaned.preservedHtmlFormatting;

    return {
      bodyText: cleaned.originalBody,
      bodyHtml: cleanedHtmlBody ? this.sanitizeHtml(cleanedHtmlBody) : null,
      remainderText: remainder.text,
      remainderHtml: remainder.html ? this.sanitizeHtml(remainder.html) : null,
      headerSummary,
      isForwarded: true
    };
  }

  // Estrae la parte rimanente del thread (quello che non è body principale)
  private static extractRemainder(
    originalBody: string,
    cleanedBody: string,
    originalHtml?: string | null,
    cleanedHtml?: string | null
  ): { text: string | null; html: string | null } {
    let remainderText: string | null = null;
    let remainderHtml: string | null = null;

    // Trova la parte del testo originale che non è stata inclusa nel body pulito
    if (originalBody.length > cleanedBody.length * 1.2) {
      // Se l'originale è significativamente più lungo, cerca la parte mancante
      const bodyIndex = originalBody.indexOf(cleanedBody.substring(0, 100));
      // FIX: Controlla che indexOf abbia trovato la stringa prima di usarla
      if (bodyIndex >= 0) {
        if (bodyIndex > 100) {
          // C'è contenuto significativo prima del body
          remainderText = originalBody.substring(0, bodyIndex).trim();
        } else {
          // Cerca contenuto dopo il body
          const afterIndex = bodyIndex + cleanedBody.length;
          if (afterIndex < originalBody.length - 50) {
            remainderText = originalBody.substring(afterIndex).trim();
          }
        }
      }
    }

    // Stessa logica per HTML se disponibile
    if (originalHtml && cleanedHtml && originalHtml.length > cleanedHtml.length * 1.2) {
      const htmlBodyIndex = originalHtml.indexOf(cleanedHtml.substring(0, 200));
      // FIX: Controlla che indexOf abbia trovato la stringa prima di usarla
      if (htmlBodyIndex >= 0) {
        if (htmlBodyIndex > 200) {
          remainderHtml = originalHtml.substring(0, htmlBodyIndex).trim();
        } else {
          const afterIndex = htmlBodyIndex + cleanedHtml.length;
          if (afterIndex < originalHtml.length - 100) {
            remainderHtml = originalHtml.substring(afterIndex).trim();
          }
        }
      }
    }

    return { text: remainderText, html: remainderHtml };
  }

  // Estrae un riassunto degli header del thread quotato
  private static extractHeaderSummary(body: string): string | null {
    const lines = body.split('\n').slice(0, 20); // Primi 20 righe
    const headerInfo: { [key: string]: string } = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Cerca pattern di header
      if (trimmed.startsWith('Da:') || trimmed.startsWith('From:')) {
        headerInfo.from = trimmed.split(':', 2)[1]?.trim() || '';
      } else if (trimmed.startsWith('Inviato:') || trimmed.startsWith('Sent:')) {
        headerInfo.date = trimmed.split(':', 2)[1]?.trim() || '';
      } else if (trimmed.startsWith('A:') || trimmed.startsWith('To:')) {
        headerInfo.to = trimmed.split(':', 2)[1]?.trim() || '';
      } else if (trimmed.startsWith('Oggetto:') || trimmed.startsWith('Subject:')) {
        headerInfo.subject = trimmed.split(':', 2)[1]?.trim() || '';
      }
    }

    // Costruisce un riassunto conciso
    if (headerInfo.from && headerInfo.subject) {
      const fromShort = headerInfo.from.includes('<') 
        ? headerInfo.from.split('<')[0].trim() 
        : headerInfo.from.split('@')[0];
      const subjectShort = headerInfo.subject.length > 50 
        ? headerInfo.subject.substring(0, 50) + '...' 
        : headerInfo.subject;
      
      return `${fromShort}: ${subjectShort}`;
    }

    return null;
  }

  /**
   * Rimuove una firma personalizzata configurata nel database dal contenuto email
   */
  private static removeCustomSignature(content: string, signature: string): string {
    if (!content || !signature) return content;
    
    // Normalizza la firma per la ricerca (rimuove spazi extra e newline)
    const normalizedSignature = signature.trim().replace(/\s+/g, ' ');
    
    // Prova diversi pattern per trovare e rimuovere la firma
    const signaturePatterns = [
      // Firma esatta
      new RegExp(this.escapeRegExp(signature), 'gi'),
      // Firma normalizzata (spazi flessibili)
      new RegExp(this.escapeRegExp(normalizedSignature).replace(/\s+/g, '\\s+'), 'gi'),
      // Firma in HTML (con tag HTML)
      new RegExp(`<[^>]*>${this.escapeRegExp(signature)}<[^>]*>`, 'gi'),
      // Firma preceduta da separatori comuni
      new RegExp(`(?:--|—|\\n\\n|<br\\s*/?><br\\s*/?>)\\s*${this.escapeRegExp(signature)}`, 'gi'),
      // Firma alla fine del messaggio
      new RegExp(`\\n\\s*${this.escapeRegExp(signature)}\\s*$`, 'gi')
    ];
    
    let cleanedContent = content;
    
    // Applica tutti i pattern di rimozione
    signaturePatterns.forEach(pattern => {
      cleanedContent = cleanedContent.replace(pattern, '');
    });
    
    // Pulisce spazi e newline in eccesso
    cleanedContent = cleanedContent
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines consecutive
      .replace(/\s+$/g, '')        // Rimuove whitespace finale
      .trim();
    
    console.log(`[EMAIL-CLEANER] Custom signature removal: ${content.length} -> ${cleanedContent.length} chars`);
    return cleanedContent;
  }

  /**
   * Escape special regex characters in a string
   */
  private static escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    // Pre-filter: NON trattare come forwarded email brevi (< 800 chars) 
    // a meno che non ci siano marker espliciti di forwarding
    if (body.length < 800) {
      const explicitForwardMarkers = [
        /---------- Forwarded message ---------/i,
        /---------- Messaggio inoltrato ----------/i,
        /Begin forwarded message:/i,
        /---------- Original Message ----------/i,
        /---------- Messaggio originale ----------/i,
        /====== Forwarded Message ======/i,
        /-{5,}.*Original.*Message.*-{5,}/i,
        /_{5,}.*Forwarded.*_{5,}/i,
        /_{20,}/,  // Outlook underscore separator
        /^(Il giorno|In data|On .* wrote:|Le .* a écrit|Am .* schrieb)/i
      ];
      
      // Per email brevi, richiede marker espliciti
      const hasExplicitMarkers = explicitForwardMarkers.some(pattern => pattern.test(body));
      
      if (!hasExplicitMarkers) {
        // Ultima verifica: conta header anchored nelle prime 10 righe
        const lines = body.split('\n').slice(0, 10);
        const headerRegex = /^[>\s\u00A0]*?(Da|From|Inviato|Sent|A|To|Cc|Oggetto|Subject|Data|Date)\s*:\s*/i;
        const headerCount = lines.filter(line => headerRegex.test(line)).length;
        
        if (headerCount < 3) {
          console.log(`[EMAIL-CLEANER] Pre-filter: skipping short email (${body.length} chars, ${headerCount} headers) - no explicit markers`);
          return false;
        }
      }
    }

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

    const originalBody = body;

    // Usa il nuovo algoritmo bounded per separare main body dal remainder
    const splitResult = this.splitTextByHeaderClusters(body);
    
    if (splitResult.confidence === 'high' && splitResult.mainText) {
      console.log(`[EMAIL-CLEANER] Using bounded split (${splitResult.method}): ${splitResult.mainText.length} chars main body`);
      return splitResult.mainText;
    }
    
    if (splitResult.confidence === 'medium' && splitResult.mainText && splitResult.mainText.length > 50) {
      console.log(`[EMAIL-CLEANER] Using medium confidence split (${splitResult.method}): ${splitResult.mainText.length} chars main body`);
      return splitResult.mainText;
    }

    console.log(`[EMAIL-CLEANER] Bounded split not confident enough (${splitResult.confidence}), using classic fallback`);
    
    // Fallback: prova a estrarre il contenuto originale con il metodo classico
    const classicExtracted = this.extractOriginalBody(body);
    if (classicExtracted && classicExtracted !== body && classicExtracted.length > 20) {
      console.log(`[EMAIL-CLEANER] Using classic extraction: ${classicExtracted.length} chars`);
      return classicExtracted;
    }

    console.log(`[EMAIL-CLEANER] Using traditional pattern-based cleaning as final fallback`);
    let cleanBody = originalBody;

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

  // Estrae il contenuto che segue i cluster di header nel testo
  private static extractContentAfterHeadersText(textBody: string): string | null {
    console.log(`[EMAIL-CLEANER] Looking for content after header clusters in text (${textBody.length} chars)`);
    
    const lines = textBody.split('\n');
    const headerKeywords = ['Da:', 'From:', 'Inviato:', 'Sent:', 'A:', 'To:', 'Cc:', 'Oggetto:', 'Subject:', 'Data:', 'Date:'];
    
    // Trova il cluster di header usando startsWith per maggiore precisione
    let headerClusterEnd = -1;
    let consecutiveHeaders = 0;
    let firstHeaderIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Verifica se la linea INIZIA con un header (più preciso di contains)
      const isHeaderLine = headerKeywords.some(keyword => line.startsWith(keyword));
      
      if (isHeaderLine) {
        if (firstHeaderIndex === -1) {
          firstHeaderIndex = i;
        }
        consecutiveHeaders++;
        
        if (consecutiveHeaders >= 3) { // Cluster identificato con almeno 3 header
          // Trova la fine del cluster (prima riga con contenuto vero)
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            
            // Salta righe vuote
            if (nextLine.length === 0) continue;
            
            // Verifica se è ancora un header
            const isStillHeader = headerKeywords.some(keyword => nextLine.startsWith(keyword));
            
            if (!isStillHeader && nextLine.length > 10) {
              headerClusterEnd = j;
              break;
            }
          }
          break;
        }
      } else if (line.length > 0) {
        // Reset se troviamo contenuto non-header ma solo se non abbiamo ancora iniziato
        if (firstHeaderIndex === -1) {
          consecutiveHeaders = 0;
        }
      }
    }
    
    if (headerClusterEnd > 0 && headerClusterEnd < lines.length - 1) {
      // Estrae il contenuto dopo il cluster
      const contentAfterHeaders = lines.slice(headerClusterEnd).join('\n').trim();
      console.log(`[EMAIL-CLEANER] Found content after header cluster at line ${headerClusterEnd}: ${contentAfterHeaders.length} chars`);
      
      // Guard: verifica che il contenuto estratto sia sufficientemente lungo rispetto all'originale
      const originalWords = textBody.split(/\s+/).length;
      const extractedWords = contentAfterHeaders.split(/\s+/).length;
      
      if (contentAfterHeaders.length > 50 && 
          !this.isOnlySignature(contentAfterHeaders) &&
          (extractedWords >= originalWords * 0.4 || contentAfterHeaders.length >= textBody.length * 0.3)) {
        
        // Rimuove eventuali header residui all'inizio
        const cleanedContent = this.stripLeadingTextHeaders(contentAfterHeaders);
        return cleanedContent;
      } else {
        console.log(`[EMAIL-CLEANER] Extracted content too short compared to original (${extractedWords}/${originalWords} words), rejecting`);
      }
    }
    
    return null;
  }

  // Rimuove header residui all'inizio del contenuto testuale
  private static stripLeadingTextHeaders(content: string): string {
    const lines = content.split('\n');
    const headerKeywords = ['Da:', 'From:', 'Inviato:', 'Sent:', 'A:', 'To:', 'Cc:', 'Oggetto:', 'Subject:', 'Data:', 'Date:'];
    
    let startIndex = 0;
    
    // Rimuove fino a 3 righe di header all'inizio
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      
      if (line.length === 0) {
        startIndex = i + 1; // Salta righe vuote
      } else if (headerKeywords.some(keyword => line.startsWith(keyword))) {
        startIndex = i + 1; // Salta header
      } else {
        break; // Trovato contenuto vero
      }
    }
    
    const cleaned = lines.slice(startIndex).join('\n').trim();
    
    if (startIndex > 0) {
      console.log(`[EMAIL-CLEANER] Stripped ${startIndex} leading text header lines`);
    }
    
    return cleaned;
  }

  private static cleanForwardedHtmlBody(htmlBody: string): string | null {
    if (!htmlBody) return htmlBody;

    const originalHtml = htmlBody;

    // Se l'HTML contiene solo una signature/firma, restituisce null per usare il text body
    if (this.isOnlySignatureHtml(htmlBody)) {
      console.log('[EMAIL-CLEANER] HTML contains only signature, preferring text body');
      return null;
    }

    // Usa il nuovo algoritmo bounded per separare main HTML dal remainder
    const splitResult = this.splitHtmlByHeaderContainers(htmlBody);
    
    if (splitResult.confidence === 'high' && splitResult.mainHtml) {
      const cleanedHtml = this.closeOpenHtmlTags(splitResult.mainHtml.trim());
      if (!this.isOnlySignatureHtml(cleanedHtml)) {
        console.log(`[EMAIL-CLEANER] Using bounded HTML split (${splitResult.method}): ${cleanedHtml.length} chars main body`);
        return cleanedHtml;
      }
    }
    
    if (splitResult.confidence === 'medium' && splitResult.mainHtml) {
      const cleanedHtml = this.closeOpenHtmlTags(splitResult.mainHtml.trim());
      if (cleanedHtml.length > 100 && !this.isOnlySignatureHtml(cleanedHtml)) {
        console.log(`[EMAIL-CLEANER] Using medium confidence HTML split (${splitResult.method}): ${cleanedHtml.length} chars main body`);
        return cleanedHtml;
      }
    }

    console.log(`[EMAIL-CLEANER] Bounded HTML split not confident enough (${splitResult.confidence}), using pattern-based fallback`);
    let cleanHtml = originalHtml;

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

  // Rimuove le intestazioni del messaggio inoltrato dall'HTML
  private static removeEmailHeaders(html: string): string {
    console.log('[EMAIL-CLEANER] Removing email headers from HTML...');
    
    // Pattern per rimuovere le intestazioni HTML di Outlook
    const headerPatterns = [
      // NUOVI pattern specifici per Outlook formato italiano dentro <font>
      /<div[^>]*id\s*=\s*["']?divRplyFwdMsg["']?[^>]*>[\s\S]*?<\/div>/gi,
      /<font[^>]*>[\s\S]*?<b>\s*(?:Da|Inviato|A|Cc|Oggetto)\s*:<\/b>[\s\S]*?<\/font>/gi,
      
      // Pattern specifici per linee di header in italiano
      /<b>\s*Da\s*:<\/b>[^<]*(?:<[^>]*>[^<]*)*<br\s*\/?>/gi,
      /<b>\s*Inviato\s*:<\/b>[^<]*<br\s*\/?>/gi,
      /<b>\s*A\s*:<\/b>[^<]*(?:<[^>]*>[^<]*)*<br\s*\/?>/gi,
      /<b>\s*Cc\s*:<\/b>[^<]*(?:<[^>]*>[^<]*)*<br\s*\/?>/gi,
      /<b>\s*Oggetto\s*:<\/b>[^<]*<br\s*\/?>/gi,
      
      // Pattern originali per altri formati
      /<div[^>]*>\s*<b>\s*From:\s*<\/b>[^<]*<[^>]*>[^<]*<\/[^>]*>[\s\S]*?<\/div>/gi,
      /<div[^>]*>\s*<b>\s*To:\s*<\/b>[^<]*<[^>]*>[^<]*<\/[^>]*>[\s\S]*?<\/div>/gi,
      /<div[^>]*>\s*<b>\s*Subject:\s*<\/b>[^<]*<\/div>/gi,
      /<div[^>]*>\s*<b>\s*Date:\s*<\/b>[^<]*<\/div>/gi,
      
      // Pattern più generici per headers in div/p/span
      /<(?:div|p|span)[^>]*>\s*(?:From|To|Subject|Date|Sent|Da|A|Oggetto|Data):\s*[^<]*<\/(?:div|p|span)>/gi,
      
      // Rimuove tabelle con headers email
      /<table[^>]*>[\s\S]*?(?:From|To|Subject|Date|Da|A|Oggetto|Data)[\s\S]*?<\/table>/gi,
      
      // Rimuove HR separators
      /<hr[^>]*>/gi,
      
      // Rimuove div con stili border-top (separatori Outlook)
      /<div[^>]*style="[^"]*border-top[^"]*"[^>]*>[\s\S]*?<\/div>/gi
    ];
    
    let cleanedHtml = html;
    
    // Applica tutti i pattern di rimozione
    headerPatterns.forEach((pattern, index) => {
      const before = cleanedHtml.length;
      cleanedHtml = cleanedHtml.replace(pattern, '');
      const after = cleanedHtml.length;
      if (before !== after) {
        console.log(`[EMAIL-CLEANER] Pattern ${index + 1} removed ${before - after} chars`);
      }
    });
    
    // Pulisci spazi vuoti e righe vuote in eccesso
    cleanedHtml = cleanedHtml.replace(/^\s+/gm, '').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    
    console.log(`[EMAIL-CLEANER] Headers removed, final HTML: ${cleanedHtml.length} chars`);
    console.log(`[EMAIL-CLEANER] FINAL HTML PREVIEW (first 500 chars):\n${cleanedHtml.substring(0, 500)}`);
    return cleanedHtml;
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

  // Per le email inoltrate, estrae il contenuto DOPO i cluster di header
  private static preserveHtmlFormatting(htmlBody: string): string | null {
    try {
      console.log(`[EMAIL-CLEANER] Attempting to extract forwarded content from HTML (${htmlBody.length} chars)`);
      
      // Nuovo approccio: trova il contenuto dopo i cluster di header
      const extractedContent = this.extractContentAfterHeaders(htmlBody);
      
      if (extractedContent && extractedContent.length > 100) {
        console.log(`[EMAIL-CLEANER] ✓ Extracted content after headers: ${extractedContent.length} chars`);
        return extractedContent;
      } else {
        console.log(`[EMAIL-CLEANER] ✗ No content found after headers, trying header removal fallback`);
        // Fallback: rimuovi solo le intestazioni ma mantieni tutto il resto
        const fallbackHtml = this.removeEmailHeaders(htmlBody);
        if (fallbackHtml && fallbackHtml.length > 100) {
          console.log(`[EMAIL-CLEANER] ✓ Using header removal fallback: ${fallbackHtml.length} chars`);
          return fallbackHtml;
        } else {
          console.log(`[EMAIL-CLEANER] ✗ Header removal fallback too short, falling back to text body`);
        }
      }
      
      // Se non riesce a estrarre contenuto utile, usa il text body
      return null;

    } catch (error) {
      console.log('[EMAIL-CLEANER] Error preserving HTML formatting:', error);
    }

    return null;
  }

  // Estrae il contenuto che segue i cluster di header nelle email inoltrate
  private static extractContentAfterHeaders(htmlBody: string): string | null {
    console.log(`[EMAIL-CLEANER] Looking for content after header clusters in HTML (${htmlBody.length} chars)`);
    
    // Pattern per identificare i cluster di header di Outlook - CERCHIAMO I CONTAINER, NON IL CONTENUTO
    const headerPatterns = [
      // Outlook divRplyFwdMsg - trova tutto quello che viene DOPO questo div
      /<div[^>]*id[\s]*=[\s]*["']?divRplyFwdMsg["']?[^>]*>[\s\S]*?<\/div>/i,
      // Sequenza di header bold consecutivi - trova quello che viene DOPO
      /<b>\s*(?:Da|From|Inviato|Sent):\s*<\/b>[\s\S]*?<b>\s*(?:A|To|Oggetto|Subject):\s*<\/b>[\s\S]*?<br[^>]*>/i,
      // Tabelle con header - trova quello che viene DOPO la tabella
      /<table[^>]*>[\s\S]*?(?:Da|From|Inviato|Sent|A|To|Oggetto|Subject)[\s\S]*?<\/table>/i
    ];
    
    for (const pattern of headerPatterns) {
      const match = htmlBody.match(pattern);
      if (match && match.index !== undefined) {
        // Estrae tutto quello che viene DOPO il match
        const afterIndex = match.index + match[0].length;
        const remainder = htmlBody.slice(afterIndex).trim();
        
        console.log(`[EMAIL-CLEANER] Found header container ending at ${afterIndex}, remainder: ${remainder.length} chars`);
        
        if (remainder.length > 100) {
          // Rimuove eventuali header residui all'inizio
          const cleanedContent = this.stripLeadingHtmlHeaders(remainder);
          
          if (cleanedContent.length > 50 && !this.isOnlyHeaders(cleanedContent)) {
            console.log(`[EMAIL-CLEANER] Extracted content after headers: ${cleanedContent.length} chars`);
            return cleanedContent;
          }
        }
      }
    }
    
    // Fallback: cerca contenuto dopo HR separators
    const hrMatch = htmlBody.match(/<hr[^>]*>/i);
    if (hrMatch && hrMatch.index !== undefined) {
      const afterIndex = hrMatch.index + hrMatch[0].length;
      const remainder = htmlBody.slice(afterIndex).trim();
      
      if (remainder.length > 100) {
        console.log(`[EMAIL-CLEANER] Found content after HR separator: ${remainder.length} chars`);
        return this.stripLeadingHtmlHeaders(remainder);
      }
    }
    
    return null;
  }

  // Rimuove header residui all'inizio del contenuto HTML
  private static stripLeadingHtmlHeaders(content: string): string {
    let cleaned = content;
    
    // Rimuove eventuali tag <br> iniziali
    cleaned = cleaned.replace(/^(\s*<br[^>]*>\s*)*/i, '');
    
    // Rimuove eventuali header residui all'inizio (solo le prime 5 righe)
    const headerKeywords = ['Da:', 'From:', 'Inviato:', 'Sent:', 'A:', 'To:', 'Oggetto:', 'Subject:'];
    const lines = cleaned.split('\n');
    let startIndex = 0;
    
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (headerKeywords.some(keyword => line.includes(keyword))) {
        startIndex = i + 1;
      } else if (line.trim().length > 20) {
        // Trovato contenuto vero, fermiamo la pulizia
        break;
      }
    }
    
    if (startIndex > 0) {
      cleaned = lines.slice(startIndex).join('\n').trim();
      console.log(`[EMAIL-CLEANER] Stripped ${startIndex} leading header lines`);
    }
    
    return cleaned;
  }
  
  // Verifica se il contenuto contiene solo header
  private static isOnlyHeaders(content: string): boolean {
    const headerKeywords = ['Da:', 'From:', 'Inviato:', 'Sent:', 'A:', 'To:', 'Oggetto:', 'Subject:', 'Data:', 'Date:'];
    const lines = content.split(/\n/).filter(line => line.trim().length > 0);
    
    if (lines.length < 3) return true; // Troppo corto
    
    let headerCount = 0;
    for (const line of lines.slice(0, 10)) { // Controlla le prime 10 righe
      if (headerKeywords.some(keyword => line.includes(keyword))) {
        headerCount++;
      }
    }
    
    return headerCount > lines.length * 0.5; // Se più del 50% sono header
  }

  // Trova il punto ottimale dove tagliare l'HTML per rimuovere la sezione di inoltro (METODO DEPRECATED)
  private static findForwardCutPoint(htmlBody: string): number {
    console.log(`[EMAIL-CLEANER] DEBUG: Looking for cut point in HTML (${htmlBody.length} chars)`);
    
    // APPROCCIO OUTLOOK: Cerca la fine della firma per identificare dove inizia il contenuto inoltrato
    // Preserviamo tutto quello che viene PRIMA di questo punto (thread originale)
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
        return cutPoint; // Qui inizia il contenuto inoltrato da rimuovere
      }
    }
    
    // Fallback: pattern tradizionali di inoltro
    const forwardMarkers = [
      // Outlook divRplyFwdMsg (il più specifico)
      /<div[^>]*id[\s]*=[\s]*["']?divRplyFwdMsg["']?[^>]*>/i,
      /<div[^>]*class[\s]*=[\s]*["']?[^"']*BodyFragment[^"']*["']?[^>]*>/i,
      
      // Headers HTML bold di Outlook (inglese e italiano)
      /<b>\s*From:\s*<\/b>/i,
      /<b>\s*Da:\s*<\/b>/i,
      /<b>\s*Sent:\s*<\/b>/i,
      /<b>\s*Inviato:\s*<\/b>/i,
      /<b>\s*To:\s*<\/b>/i,
      /<b>\s*A:\s*<\/b>/i,
      /<b>\s*Subject:\s*<\/b>/i,
      /<b>\s*Oggetto:\s*<\/b>/i,
      
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

  /**
   * Sanitizza l'HTML per prevenire attacchi XSS
   * Implementa una sanitizzazione di base rimuovendo tag e attributi pericolosi
   */
  private static sanitizeHtml(html: string): string {
    if (!html) return html;

    // Lista di tag pericolosi da rimuovere completamente
    const dangerousTags = ['script', 'iframe', 'embed', 'object', 'applet', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'style'];
    
    // Lista di attributi pericolosi da rimuovere
    const dangerousAttributes = ['onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onkeydown', 'onkeyup', 'onkeypress', 'javascript:'];

    let sanitized = html;

    // Rimuove tag pericolosi (apertura e chiusura)
    dangerousTags.forEach(tag => {
      const openTagRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
      const closeTagRegex = new RegExp(`</${tag}>`, 'gi');
      const selfClosingRegex = new RegExp(`<${tag}[^>]*/>`, 'gi');
      
      sanitized = sanitized.replace(openTagRegex, '');
      sanitized = sanitized.replace(closeTagRegex, '');
      sanitized = sanitized.replace(selfClosingRegex, '');
    });

    // Rimuove attributi pericolosi
    dangerousAttributes.forEach(attr => {
      const attrRegex = new RegExp(`\\s+${attr}=["']?[^"'\\s>]*["']?`, 'gi');
      sanitized = sanitized.replace(attrRegex, '');
    });

    // Rimuove javascript: URLs
    sanitized = sanitized.replace(/javascript:[^"'>\\s]*/gi, '');
    
    // Rimuove data: URLs tranne immagini sicure
    sanitized = sanitized.replace(/data:(?!image\/(png|jpg|jpeg|gif|webp|svg))[^"'>\\s]*/gi, '');

    console.log(`[EMAIL-CLEANER] HTML sanitized: ${html.length} -> ${sanitized.length} chars`);
    return sanitized;
  }

  /**
   * Nuovo algoritmo bounded per dividere il testo in main body e remainder
   * Gestisce sia i top-posted replies che i forwarded messages
   */
  private static splitTextByHeaderClusters(textBody: string): {
    mainText: string | null;
    remainderText: string | null;
    confidence: 'high' | 'medium' | 'low';
    method: 'top-prelude' | 'after-cluster' | 'no-split';
  } {
    console.log(`[EMAIL-CLEANER] Starting bounded split analysis for text (${textBody.length} chars)`);
    
    // Normalizza il testo: sostituisce NBSP con spazi, rimuove quote leader per header detection
    const normalizedBody = textBody.replace(/\u00A0/g, ' ');
    const lines = normalizedBody.split('\n');
    
    // Regex più tollerante per identificare header - include spazi e caratteri di quotazione
    const headerRegex = /^[>\s\u00A0]*?(Da|From|Inviato|Sent|A|To|Cc|Oggetto|Subject|Data|Date)\s*:\s*/i;
    // Single-line markers - solo per email lunghe >1200 chars o con FW/Fwd nel subject
    const singleLineMarkers = [
      /Il giorno .* ha scritto:/i,
      /On .* wrote:/i,
      /Le .* a écrit:/i,
      /Am .* schrieb:/i,
      /In data .* ha scritto:/i
    ];
    
    const quotedMarkers = [
      /^[-_]{5,}.*(Original|Forwarded|Messaggio|Message).*/i,
      /^>{1,}/,  // Quoted text markers
      /^---------- Forwarded message ----------/i,
      /^---------- Messaggio inoltrato ----------/i
    ];

    let firstHeaderClusterStart = -1;
    let firstHeaderClusterEnd = -1;
    let headerCount = 0;

    // Step 1: Prima cerca single-line markers per email lunghe
    if (textBody.length >= 1200) {
      for (let i = 0; i < Math.min(lines.length, 40); i++) {
        const line = lines[i].trim();
        if (singleLineMarkers.some(marker => marker.test(line))) {
          console.log(`[EMAIL-CLEANER] Found single-line marker at line ${i}: "${line.substring(0, 50)}..."`);
          firstHeaderClusterStart = i;
          firstHeaderClusterEnd = i + 1;
          headerCount = 1;
          break;
        }
      }
    }

    // Step 2: Se non trovato, cerca header cluster con rolling window di 6 righe (≥2 header)
    if (firstHeaderClusterStart === -1) {
      for (let i = 0; i < Math.min(lines.length, 60); i++) { // Prime 60 righe
        const line = lines[i].trim();
        
        if (line.length === 0) continue;

        const isHeader = headerRegex.test(line);
        const isQuotedMarker = quotedMarkers.some(pattern => pattern.test(line));
        
        if (isHeader || isQuotedMarker) {
          if (firstHeaderClusterStart === -1) {
            firstHeaderClusterStart = i;
          }
          headerCount++;
          
          // Controlla se abbiamo almeno 2 header in una finestra rolling di 6 righe
          if (headerCount >= 2 && i - firstHeaderClusterStart <= 6) {
            // Trova la fine del cluster
            for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
              const nextLine = lines[j].trim();
              if (nextLine.length === 0) continue;
              
              const stillHeader = headerRegex.test(nextLine);
              const stillMarker = quotedMarkers.some(pattern => pattern.test(nextLine));
              
              if (!stillHeader && !stillMarker && nextLine.length > 5) {
                firstHeaderClusterEnd = j;
                break;
              }
            }
            if (firstHeaderClusterEnd === -1) firstHeaderClusterEnd = i + 1;
            break;
          }
        } else if (line.length > 10) {
          // Reset rolling window se troppo lontano dal primo header
          if (firstHeaderClusterStart !== -1 && i - firstHeaderClusterStart > 6) {
            firstHeaderClusterStart = -1;
            headerCount = 0;
          }
        }
      }
    }

    console.log(`[EMAIL-CLEANER] Header cluster analysis: start=${firstHeaderClusterStart}, end=${firstHeaderClusterEnd}, headers=${headerCount}`);

    // Step 2: Analizza il contenuto prima del cluster (top-posted reply detection)
    let topPreludeText = '';
    if (firstHeaderClusterStart > 0) {
      const preludeLines = lines.slice(0, firstHeaderClusterStart);
      let meaningfulLines = 0;
      let signatureLines = 0;
      let quotedLines = 0;

      for (const line of preludeLines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        
        if (trimmed.startsWith('>')) {
          quotedLines++;
        } else if (this.isSignatureLine(trimmed)) {
          signatureLines++;
        } else if (trimmed.length > 10) {
          meaningfulLines++;
        }
      }
      
      topPreludeText = preludeLines.join('\n').trim();
      
      // Se c'è contenuto significativo prima del cluster, potrebbe essere un top-posted reply
      // Soglie abbassate come suggerito dall'architect
      if (meaningfulLines > 0 && 
          topPreludeText.length > 100 && 
          quotedLines < meaningfulLines && 
          signatureLines < meaningfulLines) {
        
        const remainderText = lines.slice(firstHeaderClusterStart).join('\n').trim();
        console.log(`[EMAIL-CLEANER] Found top-posted reply: ${topPreludeText.length} chars main, ${remainderText.length} chars remainder`);
        
        return {
          mainText: topPreludeText,
          remainderText: remainderText,
          confidence: 'high',
          method: 'top-prelude'
        };
      }
    }

    // Step 3: Estrazione dopo il cluster con boundary detection
    if (firstHeaderClusterEnd > 0 && firstHeaderClusterEnd < lines.length - 1) {
      // Trova il prossimo boundary (header cluster, marker, o inizio citazione)
      let nextBoundaryIndex = -1;
      
      for (let i = firstHeaderClusterEnd + 5; i < lines.length; i++) { // Skip almeno 5 righe per evitare false positive
        const line = lines[i].trim();
        if (line.length === 0) continue;

        // Controlla se è un nuovo cluster header o marker
        const isNewHeader = headerRegex.test(line);
        const isNewMarker = quotedMarkers.some(pattern => pattern.test(line));
        const isQuoteStart = line.startsWith('>') || line.startsWith('|');

        if (isNewHeader || isNewMarker || isQuoteStart) {
          // Verifica che sia veramente un nuovo boundary controllando le righe successive
          let boundaryConfidence = 0;
          for (let j = i; j < Math.min(lines.length, i + 3); j++) {
            const checkLine = lines[j].trim();
            if (headerRegex.test(checkLine) ||
                quotedMarkers.some(pattern => pattern.test(checkLine)) ||
                checkLine.startsWith('>')) {
              boundaryConfidence++;
            }
          }
          
          if (boundaryConfidence >= 2) {
            nextBoundaryIndex = i;
            break;
          }
        }
      }

      const extractEndIndex = nextBoundaryIndex > 0 ? nextBoundaryIndex : lines.length;
      const mainText = lines.slice(firstHeaderClusterEnd, extractEndIndex).join('\n').trim();
      const remainderText = nextBoundaryIndex > 0 ? lines.slice(nextBoundaryIndex).join('\n').trim() : null;

      // Guard abbassato: accetta main se >100 chars o >20 words e non solo signature
      const originalLength = textBody.length;
      const mainLength = mainText.length;
      const wordCount = mainText.split(/\s+/).length;
      
      if ((mainText.length > 100 || wordCount > 20) && 
          !this.isOnlySignature(mainText) && 
          (mainLength <= originalLength * 0.85 || nextBoundaryIndex === -1)) {
        
        console.log(`[EMAIL-CLEANER] Extracted after cluster with boundary: ${mainText.length} chars main, ${remainderText?.length || 0} chars remainder`);
        
        return {
          mainText: mainText,
          remainderText: remainderText,
          confidence: nextBoundaryIndex > 0 ? 'high' : 'medium',
          method: 'after-cluster'
        };
      } else {
        console.log(`[EMAIL-CLEANER] After-cluster extraction rejected: too large (${mainLength}/${originalLength}) or poor quality`);
      }
    }

    // Step 4: Fallback - nessuna separazione affidabile
    console.log(`[EMAIL-CLEANER] No reliable split found, returning no-split`);
    return {
      mainText: null,
      remainderText: null,
      confidence: 'low',
      method: 'no-split'
    };
  }

  /**
   * Algoritmo bounded per dividere l'HTML in main body e remainder
   */
  private static splitHtmlByHeaderContainers(htmlBody: string): {
    mainHtml: string | null;
    remainderHtml: string | null;
    confidence: 'high' | 'medium' | 'low';
    method: 'top-prelude' | 'after-container' | 'no-split';
  } {
    console.log(`[EMAIL-CLEANER] Starting bounded split analysis for HTML (${htmlBody.length} chars)`);
    
    // Pattern più restrittivi per identificare VERI container di header
    const headerContainerPatterns = [
      // Known Outlook/Gmail containers
      /<div[^>]*id[\s]*=[\s]*["']?divRplyFwdMsg["']?[^>]*>[\s\S]*?<\/div>/i,
      /<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/blockquote>/i,
      /<div[^>]*class="[^"]*OutlookMessageHeader[^"]*"[^>]*>[\s\S]*?<\/div>/i,
      // Tables/blocks with ≥3 bold header labels
      /<(?:table|div)[^>]*>[\s\S]*?<b>\s*(?:Da|From|Inviato|Sent):\s*<\/b>[\s\S]*?<b>\s*(?:A|To):\s*<\/b>[\s\S]*?<b>\s*(?:Oggetto|Subject):\s*<\/b>[\s\S]*?<\/(?:table|div)>/i,
      // HR followed by ≥2 header labels
      /<hr[^>]*>[\s\S]*?(?:Da|From|Inviato|Sent)[^<]*[\s\S]*?(?:A|To|Oggetto|Subject)/i
    ];

    const boundaryPatterns = [
      /<hr[^>]*>/i,
      /<blockquote[^>]*>/i,
      /<div[^>]*style="[^"]*border-left[^"]*"[^>]*>/i, // Citazioni
      /<div[^>]*class="[^"]*quote[^"]*"[^>]*>/i
    ];

    const explicitForwardMarkers = [
      /---------- Forwarded message ---------/i,
      /---------- Messaggio inoltrato ----------/i,
      /Begin forwarded message:/i,
      /---------- Original Message ----------/i,
      /====== Forwarded Message ======/i
    ];

    let firstContainerMatch: RegExpMatchArray | null = null;

    // Trova il primo container di header reale
    for (const pattern of headerContainerPatterns) {
      const match = htmlBody.match(pattern);
      if (match && match.index !== undefined) {
        // Rifiuta container all'indice 0 a meno che non ci siano marker espliciti
        if (match.index === 0 && !explicitForwardMarkers.some(marker => marker.test(htmlBody))) {
          console.log(`[EMAIL-CLEANER] Rejecting container at index 0 - likely false positive wrapper`);
          continue;
        }
        
        if (!firstContainerMatch || match.index < firstContainerMatch.index!) {
          firstContainerMatch = match;
        }
      }
    }

    if (!firstContainerMatch || firstContainerMatch.index === undefined) {
      console.log(`[EMAIL-CLEANER] No valid header container found in HTML`);
      return {
        mainHtml: null,
        remainderHtml: null,
        confidence: 'low',
        method: 'no-split'
      };
    }

    const containerStart = firstContainerMatch.index;
    const containerEnd = containerStart + firstContainerMatch[0].length;

    console.log(`[EMAIL-CLEANER] Found header container at ${containerStart}-${containerEnd}`);

    // Step 1: Preferisci contenuto prima del container (top-posted reply)
    const preludeHtml = htmlBody.substring(0, containerStart).trim();
    if (preludeHtml.length > 100) {
      const textContent = preludeHtml.replace(/<[^>]+>/g, ' ').trim();
      
      if (textContent.length > 40 && 
          !this.isOnlySignatureHtml(preludeHtml) &&
          !preludeHtml.includes('<blockquote')) {
        
        const remainderHtml = htmlBody.substring(containerStart).trim();
        console.log(`[EMAIL-CLEANER] Found HTML top-posted content: ${preludeHtml.length} chars main, ${remainderHtml.length} chars remainder`);
        
        return {
          mainHtml: preludeHtml,
          remainderHtml: remainderHtml,
          confidence: 'high',
          method: 'top-prelude'
        };
      }
    }

    // Step 2: Estrazione dopo il container con boundary detection
    let nextBoundaryIndex = -1;
    
    for (const pattern of boundaryPatterns) {
      const match = htmlBody.substring(containerEnd + 50).match(pattern); // Skip almeno 50 char dopo il container
      if (match && match.index !== undefined) {
        const actualIndex = containerEnd + 50 + match.index;
        if (nextBoundaryIndex === -1 || actualIndex < nextBoundaryIndex) {
          nextBoundaryIndex = actualIndex;
        }
      }
    }

    // Cerca anche ulteriori header container come boundary
    for (const pattern of headerContainerPatterns) {
      const match = htmlBody.substring(containerEnd + 100).match(pattern);
      if (match && match.index !== undefined) {
        const actualIndex = containerEnd + 100 + match.index;
        if (nextBoundaryIndex === -1 || actualIndex < nextBoundaryIndex) {
          nextBoundaryIndex = actualIndex;
        }
      }
    }

    const extractEndIndex = nextBoundaryIndex > 0 ? nextBoundaryIndex : htmlBody.length;
    const mainHtml = htmlBody.substring(containerEnd, extractEndIndex).trim();
    const remainderHtml = nextBoundaryIndex > 0 ? htmlBody.substring(nextBoundaryIndex).trim() : null;

    // Guard con ratio check: accetta postHtml solo se rappresenta ≥85% del contenuto originale
    const mainTextContent = mainHtml.replace(/<[^>]+>/g, ' ').trim();
    const originalTextContent = htmlBody.replace(/<[^>]+>/g, ' ').trim();
    const postHtmlRatio = mainTextContent.length / Math.max(originalTextContent.length, 1);
    
    if (mainTextContent.length > 100 && 
        !this.isOnlySignatureHtml(mainHtml) &&
        postHtmlRatio >= 0.85) {
      
      console.log(`[EMAIL-CLEANER] Extracted HTML after container: ${mainHtml.length} chars main (ratio: ${postHtmlRatio.toFixed(2)}), ${remainderHtml?.length || 0} chars remainder`);
      
      return {
        mainHtml: mainHtml,
        remainderHtml: remainderHtml,
        confidence: nextBoundaryIndex > 0 ? 'high' : 'medium',
        method: 'after-container'
      };
    } else {
      console.log(`[EMAIL-CLEANER] HTML after-container extraction rejected: main too short (${mainTextContent.length} chars), ratio too low (${postHtmlRatio.toFixed(2)}), or signature-only`);
    }

    console.log(`[EMAIL-CLEANER] No reliable HTML split found`);
    return {
      mainHtml: null,
      remainderHtml: null,
      confidence: 'low',
      method: 'no-split'
    };
  }

  /**
   * Helper per identificare righe di firma
   */
  private static isSignatureLine(line: string): boolean {
    const signaturePatterns = [
      /^--$/,
      /^[-_]{2,}$/,
      /^(Best regards?|Kind regards?|Sincerely|Cordially|Thanks?)/i,
      /^(Cordiali saluti|Distinti saluti|Grazie|Saluti)/i,
      /^(Mit freundlichen Grüßen|Freundliche Grüße|Danke)/i,
      /^(Cordialement|Bien à vous|Merci)/i,
      /^\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/, // Phone numbers
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ // Email addresses
    ];
    
    return signaturePatterns.some(pattern => pattern.test(line.trim()));
  }
}