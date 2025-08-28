// Sistema per pulire le email inoltrate rimuovendo i metadati di inoltro

interface ForwardedEmailData {
  originalSubject: string;
  originalBody: string;
  originalHtmlBody: string | null;
  isForwarded: boolean;
}

export class EmailForwardCleaner {
  
  static cleanForwardedEmail(subject: string, textBody: string, htmlBody: string | null): ForwardedEmailData {
    const result: ForwardedEmailData = {
      originalSubject: subject,
      originalBody: textBody,
      originalHtmlBody: htmlBody,
      isForwarded: false
    };

    // Rileva se è un inoltro dal subject
    const isSubjectForwarded = this.isForwardedSubject(subject);
    
    // Rileva se è un inoltro dal body
    const isBodyForwarded = this.isForwardedBody(textBody);

    if (isSubjectForwarded || isBodyForwarded) {
      result.isForwarded = true;
      result.originalSubject = this.cleanForwardedSubject(subject);
      result.originalBody = this.cleanForwardedBody(textBody);
      
      if (htmlBody) {
        result.originalHtmlBody = this.cleanForwardedHtmlBody(htmlBody);
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
      /^WG:\s*/i
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
      /^WG:\s*/i
    ];

    forwardPrefixes.forEach(prefix => {
      cleanSubject = cleanSubject.replace(prefix, '');
    });

    return cleanSubject.trim();
  }

  private static cleanForwardedBody(body: string): string {
    if (!body) return body;

    let cleanBody = body;

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
      /From:[\s\S]*?\nDate:[\s\S]*?\nSubject:[\s\S]*?\nTo:[\s\S]*/,
      /Da:[\s\S]*?\nData:[\s\S]*?\nOggetto:[\s\S]*?\nA:[\s\S]*/,
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

    return cleanBody;
  }

  private static cleanForwardedHtmlBody(htmlBody: string): string {
    if (!htmlBody) return htmlBody;

    let cleanHtml = htmlBody;

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
}