// Sistema per pulire le email inoltrate rimuovendo i metadati di inoltro
import { storage } from './storage';

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
  /**
   * Central mapping from training label tokens to concrete regex patterns
   * This ensures consistency between pre-filter gate and cleaning functions
   */
  private static readonly TRAINING_PATTERN_MAP = {
    threadMarkers: {
      'reply-marker': /wrote:/i,
      'forward-marker': /Original Message/i,
      'italian-forward-marker': /Inoltrato da:/i,
      'separator-marker': /^[-\s]{3,}$/m,
      'email-header-block': /Da:\s+.*\n.*Oggetto:/i
    },
    commonHeaders: {
      'italian-email-header-block': /Da:\s+[^\n]+\nInviato:\s+[^\n]+\nA:\s+[^\n]+\nOggetto:\s+[^\n]+/gi,
      'lutech-internal-header': /Da:\s+[^@]+@lutech\.it[^\n]*/gi,
      'css-inline-paragraph': /P\s*\{\s*margin-top:\s*0\s*;\s*margin-bottom:\s*0\s*;\s*\}/gi,
      'lutech-signature-duplicate': /Lutech S\.p\.A\./gi,
      'duplicate-signature-ivan': /Ivan\s+(Lo\s*)?Torto[^\n]*/gi
    }
  } as const;

  /**
   * Check if training patterns match email content using concrete regex
   */
  private static checkTrainingPatternsMatch(
    emailContent: string, 
    trainingData: { commonHeaders: string[], commonBodyPatterns: string[], threadMarkers: string[] }
  ): boolean {
    // Check thread markers with concrete regex
    for (const marker of trainingData.threadMarkers) {
      const regex = this.TRAINING_PATTERN_MAP.threadMarkers[marker as keyof typeof this.TRAINING_PATTERN_MAP.threadMarkers];
      if (regex && regex.test(emailContent)) {
        return true;
      }
    }
    
    // Check common headers with concrete regex  
    for (const header of trainingData.commonHeaders) {
      const regex = this.TRAINING_PATTERN_MAP.commonHeaders[header as keyof typeof this.TRAINING_PATTERN_MAP.commonHeaders];
      if (regex && regex.test(emailContent)) {
        return true;
      }
    }
    
    // Check body patterns (these are actual content, not tokens)
    for (const pattern of trainingData.commonBodyPatterns) {
      if (pattern.length > 10 && emailContent.toLowerCase().includes(pattern.toLowerCase().substring(0, 50))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Analyzes user training data to improve pattern recognition
   */
  static async analyzeTrainingData(userId: string): Promise<{
    commonHeaders: string[];
    commonBodyPatterns: string[];
    threadMarkers: string[];
    // 🔧 NEW: Exact user selections for precise removal
    exactSelections: {
      toRemove: { selectionType: string; selectedText: string; }[];
      toPreserve: { selectionType: string; selectedText: string; }[];
    };
  }> {
    try {
      // Get all training selections for this user
      const rawSelections = await storage.getEmailTrainingSelections(userId);
      const trainingSelections = Array.isArray(rawSelections) ? rawSelections : [];
      
      const commonHeaders = new Set<string>();
      const commonBodyPatterns = new Set<string>();
      const threadMarkers = new Set<string>();
      
      // 🔧 NEW: Separate exact selections by remove/preserve intent
      const exactToRemove: { selectionType: string; selectedText: string; }[] = [];
      const exactToPreserve: { selectionType: string; selectedText: string; }[] = [];
      
      // ✅ MODULAR: Group selections by type
      const selectionsByType = new Map<string, string[]>();
      for (const selection of trainingSelections) {
        if (!selectionsByType.has(selection.selectionType)) {
          selectionsByType.set(selection.selectionType, []);
        }
        selectionsByType.get(selection.selectionType)!.push(selection.selectedText);
        
        // 🔧 NEW: Categorize by removal intent
        if (selection.selectionType === 'body' || selection.selectionType === 'signatureBody') {
          // These should be PRESERVED (not removed)
          exactToPreserve.push({ selectionType: selection.selectionType, selectedText: selection.selectedText });
        } else {
          // header, signatureHeader, thread, mailThread should be REMOVED
          exactToRemove.push({ selectionType: selection.selectionType, selectedText: selection.selectedText });
        }
      }
      
      // Process header selections
      const headerSelections = selectionsByType.get('header') || [];
      headerSelections.forEach((header: string) => {
          // Training data showed specific forward/reply patterns
          if (header.includes('Da:') && header.includes('Inviato:') && header.includes('Oggetto:')) {
            commonHeaders.add('italian-email-header-block');
          }
          if (header.includes('Da:') && header.includes('@lutech.it')) {
            commonHeaders.add('lutech-internal-header');
          }
          if (header.includes('c.crespiatico@virgilio.it')) {
            commonHeaders.add('external-email-header');
          }
          
          // Generic patterns
          if (header.includes('From:') || header.includes('Da:')) {
            commonHeaders.add('header-from');
          }
          if (header.includes('Date:') || header.includes('Data:') || header.includes('Inviato:')) {
            commonHeaders.add('header-date');
          }
          if (header.includes('Subject:') || header.includes('Oggetto:')) {
            commonHeaders.add('header-subject');
          }
        });
        
        // Process body selections
        const bodySelections = selectionsByType.get('body') || [];
        bodySelections.forEach((body: string) => {
          if (body.length > 50) {
            // Extract meaningful patterns from body selections
            commonBodyPatterns.add(body.substring(0, 100));
          }
        });
        
        // Process signature body selections (content to preserve)
        const signatureBodySelections = selectionsByType.get('signatureBody') || [];
        signatureBodySelections.forEach((signature: string) => {
          if (signature.length > 20) {
            // Extract signature patterns from body selections
            commonBodyPatterns.add(`signature-body:${signature.substring(0, 80)}`);
          }
        });
        
        // Process signature header selections (content to eliminate)
        const signatureHeaderSelections = selectionsByType.get('signatureHeader') || [];
        signatureHeaderSelections.forEach((sigHeader: string) => {
          // Training data showed common CSS patterns to eliminate
          if (sigHeader.includes('P {margin-top:0;margin-bottom:0;}')) {
            commonHeaders.add('css-inline-paragraph');
          }
          if (sigHeader.includes('margin-top:0') || sigHeader.includes('margin-bottom:0')) {
            commonHeaders.add('css-inline-margins');
          }
          
          // Common signature patterns from training data
          if (sigHeader.includes('Ivan Lo Torto') && sigHeader.includes('Technical analyst')) {
            commonHeaders.add('duplicate-signature-ivan');
          }
          if (sigHeader.includes('WWW.LUTECH.GROUP') && sigHeader.includes('Lutech SpA')) {
            commonHeaders.add('lutech-signature-duplicate');
          }
          
          // Generic signature patterns
          if (sigHeader.includes('Best regards') || sigHeader.includes('Cordiali saluti')) {
            commonHeaders.add('signature-closing');
          }
          if (sigHeader.includes('@') && sigHeader.includes('Tel:') || sigHeader.includes('Phone:')) {
            commonHeaders.add('signature-contact');
          }
          if (sigHeader.includes('Confidentiality') || sigHeader.includes('Confidenzialità')) {
            commonHeaders.add('signature-legal');
          }
        });
        
        // Process thread selections
        const threadSelections = selectionsByType.get('thread') || [];
        threadSelections.forEach((threadText: string) => {
          if (threadText.includes('wrote:')) {
            threadMarkers.add('reply-marker');
          }
          if (threadText.includes('Original Message')) {
            threadMarkers.add('forward-marker');
          }
        });
        
        // Process mail thread selections
        const mailThreadSelections = selectionsByType.get('mailThread') || [];
        mailThreadSelections.forEach((mailThreadText: string) => {
          if (mailThreadText.includes('Inoltrato da:')) {
            threadMarkers.add('italian-forward-marker');
          }
          if (mailThreadText.includes('-----')) {
            threadMarkers.add('separator-marker');
          }
          if (mailThreadText.includes('Da:') && mailThreadText.includes('Oggetto:')) {
            threadMarkers.add('email-header-block');
          }
        });
      
      console.log(`[EMAIL-CLEANER] Training data analysis: ${exactToRemove.length} selections to remove, ${exactToPreserve.length} to preserve`);
      
      return {
        commonHeaders: Array.from(commonHeaders),
        commonBodyPatterns: Array.from(commonBodyPatterns),
        threadMarkers: Array.from(threadMarkers),
        // 🔧 NEW: Return exact user selections for precise HTML removal
        exactSelections: {
          toRemove: exactToRemove,
          toPreserve: exactToPreserve
        }
      };
    } catch (error) {
      console.error('[EMAIL-CLEANER] Training data analysis failed:', error);
      return {
        commonHeaders: [],
        commonBodyPatterns: [],
        threadMarkers: [],
        exactSelections: {
          toRemove: [],
          toPreserve: []
        }
      };
    }
  }

  /**
   * 🔧 NEW: Apply exact user selections to HTML for precise removal
   * This is the core fix - removes exactly what the user selected instead of generic patterns
   */
  private static async applyExactSelectionsToHtml(
    htmlContent: string,
    exactSelections: {
      toRemove: { selectionType: string; selectedText: string; }[];
      toPreserve: { selectionType: string; selectedText: string; }[];
    }
  ): Promise<string> {
    let cleanedHtml = htmlContent;
    let totalRemoved = 0;
    
    // 🛡️ PRESERVE: Mark content that should NOT be removed (using direct search)
    const preserveMarkers: Array<{ marker: string; originalText: string; }> = [];
    
    for (const preserve of exactSelections.toPreserve) {
      const marker = `__PRESERVE_${Math.random().toString(36).substr(2, 9)}__`;
      
      // Try direct text match first
      if (cleanedHtml.includes(preserve.selectedText)) {
        preserveMarkers.push({ marker, originalText: preserve.selectedText });
        cleanedHtml = cleanedHtml.replace(preserve.selectedText, marker);
        console.log(`[EMAIL-CLEANER] Preserved ${preserve.selectionType}: "${preserve.selectedText.substring(0, 50)}..."`);
      }
    }
    
    // 🗑️ REMOVE: Apply exact removal selections with DIRECT string search (no regex)
    for (const removal of exactSelections.toRemove) {
      const originalLength = cleanedHtml.length;
      
      // Try multiple approaches to find and remove the text
      let found = false;
      
      // Approach 1: Direct text match
      if (cleanedHtml.includes(removal.selectedText)) {
        cleanedHtml = cleanedHtml.replace(removal.selectedText, '');
        found = true;
      }
      // Approach 2: Normalized text match (remove HTML tags and extra spaces)
      else {
        const normalizedSelection = this.normalizeTextForMatching(removal.selectedText);
        const normalizedHtml = this.normalizeTextForMatching(cleanedHtml);
        
        if (normalizedHtml.includes(normalizedSelection) && normalizedSelection.length > 10) {
          // Find approximate position in original HTML and remove a section around it
          const pos = normalizedHtml.indexOf(normalizedSelection);
          if (pos >= 0) {
            // Find corresponding position in original HTML (rough estimate)
            const startPos = Math.max(0, pos - 100);
            const endPos = Math.min(cleanedHtml.length, pos + normalizedSelection.length + 100);
            
            // Remove the section (this is rough but safer than complex regex)
            cleanedHtml = cleanedHtml.substring(0, startPos) + cleanedHtml.substring(endPos);
            found = true;
          }
        }
      }
      
      if (found) {
        const removedChars = originalLength - cleanedHtml.length;
        totalRemoved += removedChars;
        console.log(`[EMAIL-CLEANER] Removed ${removal.selectionType}: ${removedChars} chars - "${removal.selectedText.substring(0, 50)}..."`);
      } else {
        console.log(`[EMAIL-CLEANER] No match for ${removal.selectionType}: "${removal.selectedText.substring(0, 50)}..."`);
      }
    }
    
    // 🔄 RESTORE: Put back preserved content
    for (const preserve of preserveMarkers) {
      cleanedHtml = cleanedHtml.replace(preserve.marker, preserve.originalText);
    }
    
    console.log(`[EMAIL-CLEANER] ✅ Exact selections applied: ${totalRemoved} chars removed total`);
    return cleanedHtml;
  }

  /**
   * 🔧 SIMPLIFIED: Create simple search patterns to avoid regex complexity
   */
  private static createFlexibleHtmlRegex(normalizedText: string): RegExp {
    // For short selections, use exact matching
    if (normalizedText.length < 100) {
      const escaped = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(escaped, 'gi');
    }
    
    // For longer selections, use the first 50 chars as a simpler pattern
    const shortPattern = normalizedText.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(shortPattern, 'gi');
  }

  /**
   * Normalize text for more flexible matching
   */
  private static normalizeTextForMatching(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')           // Convert &nbsp; to spaces
      .replace(/&[a-zA-Z0-9]+;/g, ' ')   // Convert other HTML entities to spaces  
      .replace(/<[^>]*>/g, ' ')          // Remove HTML tags
      .replace(/\s+/g, ' ')              // Normalize whitespace
      .trim();
  }

  /**
   * Apply training patterns specifically to HTML content
   */
  private static async applyAdvancedTrainingPatternsHtml(
    cleanedHtml: string,
    originalHtml: string,
    userId: string,
    trainingData: { commonHeaders: string[], commonBodyPatterns: string[], threadMarkers: string[] }
  ): Promise<string> {
    // 🚫 TEMPORARILY DISABLED: This function uses complex regex that causes stack overflow
    // Return original HTML for now until we implement a non-regex solution
    console.log('[EMAIL-CLEANER] HTML advanced patterns DISABLED (stack overflow prevention)');
    return cleanedHtml;
  }

  /**
   * Enhanced cleaning with training data integration
   */
  static async cleanForwardedEmailWithTraining(
    subject: string,
    textBody: string,
    htmlBody: string | null,
    userId: string,
    forceCleanForwarded?: boolean,
    customSignature?: string | null
  ): Promise<ForwardedEmailData> {
    // Get training data for this user
    const trainingData = await this.analyzeTrainingData(userId);
    
    // 🔍 DETAILED LOGGING: Training data summary
    console.log(`[EMAIL-CLEANER] === REPROCESS START ===`);
    console.log(`[EMAIL-CLEANER] exactSelections toRemove: ${trainingData.exactSelections.toRemove.length}`);
    console.log(`[EMAIL-CLEANER] exactSelections toPreserve: ${trainingData.exactSelections.toPreserve.length}`);
    console.log(`[EMAIL-CLEANER] forceCleanForwarded input: ${forceCleanForwarded}`);
    console.log(`[EMAIL-CLEANER] textBody length: ${textBody.length}, htmlBody length: ${htmlBody?.length || 0}`);
    
    // Check if we should override forceCleanForwarded based on training data
    let shouldForceCleanForwarded = forceCleanForwarded;
    
    // 🔧 GATE BYPASS: If we have exact user selections, always force cleaning
    if (!shouldForceCleanForwarded && trainingData.exactSelections.toRemove.length > 0) {
      shouldForceCleanForwarded = true;
      console.log(`[EMAIL-CLEANER] Gate bypassed: forcing clean based on ${trainingData.exactSelections.toRemove.length} exact user selections`);
    }
    
    // If training data suggests this should be processed (has learned patterns), don't let pre-filter skip
    if (!shouldForceCleanForwarded && 
        (trainingData.threadMarkers.length > 0 || 
         trainingData.commonHeaders.length > 0 || 
         trainingData.commonBodyPatterns.length > 0)) {
      
      // Check if any training patterns match this email using concrete regex
      const hasTrainingPatterns = this.checkTrainingPatternsMatch(textBody, trainingData);
      
      if (hasTrainingPatterns) {
        shouldForceCleanForwarded = true;
        console.log(`[EMAIL-CLEANER] Training data override: forcing clean based on learned patterns`);
      } else {
        console.log(`[EMAIL-CLEANER] Gate failed: no training patterns match this email content`);
      }
    }
    
    // Use training data to enhance pattern recognition
    const result = this.cleanForwardedEmail(
      subject, 
      textBody, 
      htmlBody, 
      shouldForceCleanForwarded, 
      customSignature,
      trainingData
    );
    
    // 🔧 NEW: Apply exact user selections to HTML for precise removal
    if (htmlBody && trainingData.exactSelections.toRemove.length > 0) {
      console.log(`[EMAIL-CLEANER] Applying ${trainingData.exactSelections.toRemove.length} exact selections for precise HTML cleaning`);
      result.originalHtmlBody = await this.applyExactSelectionsToHtml(
        result.originalHtmlBody || htmlBody,
        trainingData.exactSelections
      );
    }
    
    // Apply advanced training-based improvements
    console.log(`[EMAIL-CLEANER] Training data check: commonBodyPatterns=${trainingData.commonBodyPatterns.length}, commonHeaders=${trainingData.commonHeaders.length}, threadMarkers=${trainingData.threadMarkers.length}`);
    if (trainingData.commonBodyPatterns.length > 0 || trainingData.commonHeaders.length > 0 || trainingData.threadMarkers.length > 0) {
      console.log(`[EMAIL-CLEANER] Applying advanced training patterns to text content...`);
      result.originalBody = await this.applyAdvancedTrainingPatternsText(
        result.originalBody, 
        textBody,
        userId,
        trainingData
      );
      console.log(`[EMAIL-CLEANER] Advanced training patterns applied to text content`);
      
      // Also apply to HTML body
      if (result.originalHtmlBody) {
        result.originalHtmlBody = await this.applyAdvancedTrainingPatternsHtml(
          result.originalHtmlBody,
          htmlBody || '',
          userId,
          trainingData
        );
      }
    }
    
    // 🔍 DETAILED LOGGING: Final result summary
    console.log(`[EMAIL-CLEANER] === REPROCESS END ===`);
    console.log(`[EMAIL-CLEANER] shouldForceCleanForwarded final: ${shouldForceCleanForwarded}`);
    console.log(`[EMAIL-CLEANER] result.originalBody length: ${result.originalBody?.length || 0}`);
    console.log(`[EMAIL-CLEANER] result.originalHtmlBody length: ${result.originalHtmlBody?.length || 0}`);
    console.log(`[EMAIL-CLEANER] original htmlBody length: ${htmlBody?.length || 0}`);
    
    return result;
  }

  /**
   * Apply advanced training patterns specifically to text content
   */
  private static async applyAdvancedTrainingPatternsText(
    cleanedBody: string,
    originalBody: string, 
    userId: string,
    trainingData: { commonHeaders: string[], commonBodyPatterns: string[], threadMarkers: string[] }
  ): Promise<string> {
    // 🚫 TEMPORARILY DISABLED: This function uses complex regex that causes stack overflow
    // Return original text for now until we implement a non-regex solution
    console.log('[EMAIL-CLEANER] TEXT advanced patterns DISABLED (stack overflow prevention)');
    return cleanedBody;
  }

  /**
   * ✅ CONFLICT RESOLUTION: Determines if a signature appears in HTML/header context vs message body context
   */
  private static isSignatureInHtmlContext(content: string, signaturePattern: string): boolean {
    try {
      // Find where the signature appears in the content
      const signatureIndex = content.toLowerCase().indexOf(signaturePattern.toLowerCase().substring(0, 100));
      if (signatureIndex === -1) return false;

      // Extract context around the signature (500 chars before and after)
      const contextStart = Math.max(0, signatureIndex - 500);
      const contextEnd = Math.min(content.length, signatureIndex + signaturePattern.length + 500);
      const context = content.substring(contextStart, contextEnd);
      
      // HTML context indicators - signature is in HTML header/metadata
      const htmlContextIndicators = [
        'P {margin-top:0;margin-bottom:0;}',  // CSS inline styles
        '<p style=',                          // HTML paragraph styling
        '<div style=',                        // HTML div styling  
        'margin-top:0',                       // CSS margin properties
        'margin-bottom:0',                    // CSS margin properties
        '<table',                             // HTML table structures
        'font-family:',                       // Font styling
        'text-align:',                        // Text alignment
      ];
      
      // Message body context indicators - signature is in actual message content
      const bodyContextIndicators = [
        'Cordiali saluti',                    // Italian greeting
        'Best regards',                       // English greeting  
        'Kind regards',                       // English greeting
        'Grazie',                             // Italian thanks
        'Thank you',                          // English thanks
        '\n\n',                               // Natural paragraph breaks
        'Ciao',                               // Casual greeting
      ];
      
      let htmlScore = 0;
      let bodyScore = 0;
      
      // Score HTML context indicators
      for (const indicator of htmlContextIndicators) {
        if (context.toLowerCase().includes(indicator.toLowerCase())) {
          htmlScore += 1;
        }
      }
      
      // Score body context indicators
      for (const indicator of bodyContextIndicators) {
        if (context.toLowerCase().includes(indicator.toLowerCase())) {
          bodyScore += 1;
        }
      }
      
      // Log the decision process
      console.log('[EMAIL-CLEANER] Context analysis:', {
        htmlScore,
        bodyScore,
        // ✅ PRIVACY: No content preview - use anonymized pattern instead  
        contextLength: context.length,
        patternLocation: signatureIndex,
        decision: htmlScore > bodyScore ? 'HTML context' : 'Body context'
      });
      
      // If HTML score is higher, it's likely in HTML/header context
      return htmlScore > bodyScore;
      
    } catch (error) {
      console.error('[EMAIL-CLEANER] Context analysis failed:', error);
      // Default to false (preserve signature) on error
      return false;
    }
  }
  
  /**
   * Calculate similarity between two text strings (enhanced for signature matching)
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    // ✅ ENHANCED NORMALIZATION: More aggressive cleaning for signature matching
    const normalize = (str: string) => str
      .toLowerCase()
      .replace(/\s+/g, ' ')           // Multiple whitespace → single space  
      .replace(/\s*@\s*/g, '@')       // Fix email spacing: "ivan.lotorto @c.lutech.it" → "ivan.lotorto@c.lutech.it"
      .replace(/\s*\.\s*/g, '.')      // Fix domain spacing
      .replace(/[^\w@.-]/g, ' ')      // Keep only alphanumeric, email chars, and dots
      .replace(/\s+/g, ' ')           // Clean up again
      .trim();
    
    const str1 = normalize(text1);
    const str2 = normalize(text2);
    
    console.log(`[EMAIL-CLEANER] Similarity debug: "${str1.substring(0, 60)}" vs "${str2.substring(0, 60)}"`);
    
    // Direct inclusion check
    if (str1.includes(str2) || str2.includes(str1)) {
      console.log(`[EMAIL-CLEANER] Direct match found: similarity = 1.0`);
      return 1;
    }
    
    // Word-based similarity with improved threshold
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set(Array.from(words1).filter(w => words2.has(w)));
    const similarity = intersection.size / Math.max(words1.size, words2.size);
    
    console.log(`[EMAIL-CLEANER] Word-based similarity: ${similarity.toFixed(3)} (${intersection.size} common words out of ${Math.max(words1.size, words2.size)})`);
    return similarity;
  }
  
  /**
   * Remove pattern from text if similarity exceeds threshold
   * ✅ FIXED: Handle multi-line patterns from training data
   */
  private static removePattern(text: string, pattern: string, threshold: number): string {
    // Handle multi-line patterns properly
    if (pattern.length > 100) {
      // Large pattern - try substring matching with fuzzy logic
      const patternLines = pattern.split('\n').filter(line => line.trim().length > 5);
      const textLines = text.split('\n');
      
      // Find consecutive matching lines
      let bestMatch = { start: -1, end: -1, score: 0 };
      
      for (let i = 0; i <= textLines.length - patternLines.length; i++) {
        const textSegment = textLines.slice(i, i + patternLines.length).join('\n');
        const similarity = this.calculateSimilarity(textSegment, pattern);
        
        if (similarity > threshold && similarity > bestMatch.score) {
          bestMatch = { start: i, end: i + patternLines.length, score: similarity };
        }
      }
      
      // Remove the best matching segment
      if (bestMatch.start >= 0) {
        console.log(`[EMAIL-CLEANER] Removing training pattern: lines ${bestMatch.start}-${bestMatch.end}, similarity ${bestMatch.score.toFixed(3)}`);
        const filteredLines = [...textLines.slice(0, bestMatch.start), ...textLines.slice(bestMatch.end)];
        return filteredLines.join('\n');
      }
      
      // Fallback: try direct substring removal for exact matches
      if (text.includes(pattern.substring(0, 100))) {
        console.log(`[EMAIL-CLEANER] Removing exact substring match from training pattern`);
        return text.replace(pattern, '');
      }
    }
    
    // Original logic for single-line patterns
    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
      const similarity = this.calculateSimilarity(line, pattern);
      return similarity <= threshold;
    });
    
    return filteredLines.join('\n');
  }
  
  /**
   * Extract important section around a pattern
   */
  private static extractImportantSection(originalText: string, pattern: string): string | null {
    const lines = originalText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (this.calculateSimilarity(lines[i], pattern) > 0.6) {
        // Extract a few lines around the important pattern
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 2);
        return lines.slice(start, end).join('\n').trim();
      }
    }
    return null;
  }
  
  static cleanForwardedEmail(
    subject: string, 
    textBody: string, 
    htmlBody: string | null,
    forceCleanForwarded?: boolean,  // From database isForwarder flag
    customSignature?: string | null, // From database customSignature field
    trainingData?: { commonHeaders: string[], commonBodyPatterns: string[], threadMarkers: string[] } // User training patterns
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
    
    // Rileva se è un inoltro dal body (enhanced with training data if available)
    const isBodyForwarded = this.isForwardedBody(textBody, trainingData);

    // Usa il flag dal database se fornito, altrimenti usa la detection automatica
    const shouldCleanForwarded = forceCleanForwarded || isSubjectForwarded || isBodyForwarded;

    if (shouldCleanForwarded) {
      result.isForwarded = true;
      result.originalSubject = this.cleanForwardedSubject(subject);
      
      // Check text analysis result to coordinate with HTML processing
      const textSplitResult = htmlBody ? this.splitTextByHeaderClusters(textBody, htmlBody) : { method: 'no-split', confidence: 'low' };
      const skipHtmlProcessing = textSplitResult.method === 'html-fallback' && 
                                (textSplitResult.confidence === 'medium' || textSplitResult.confidence === 'high');
      
      result.originalBody = this.cleanForwardedBody(textBody, htmlBody);
      
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
        // Only clean HTML if we have explicit forward markers to avoid false positives
        const hasExplicitMarkers = this.hasExplicitForwardMarkers(subject, textBody, htmlBody);
        
        if (hasExplicitMarkers || forceCleanForwarded) {
          const cleanedHtml = this.cleanForwardedHtmlBody(htmlBody);
          
          // Safety fallback: revert to original if cleaning removed too much content
          const originalLength = htmlBody.length;
          const cleanedLength = cleanedHtml ? cleanedHtml.length : 0;
          const lengthRatio = cleanedLength / Math.max(originalLength, 1);
          
          if (cleanedLength > 0 && lengthRatio >= 0.6) {
            // Cleaning preserved sufficient content
            result.originalHtmlBody = cleanedHtml;
            console.log(`[EMAIL-CLEANER] HTML cleaning successful: ${originalLength} -> ${cleanedLength} chars`);
          } else {
            // Cleaning removed too much - revert to sanitized original
            result.originalHtmlBody = this.sanitizeHtml(htmlBody);
            console.log(`[EMAIL-CLEANER] Reverted to original HTML due to low confidence/size delta: ${originalLength} -> ${cleanedLength} chars (ratio: ${lengthRatio.toFixed(2)})`);
          }
        } else {
          // No explicit markers - try reply splitting before preserving everything
          console.log(`[EMAIL-CLEANER] 🔧 FORWARD-PATH: No explicit markers found - attempting reply split before preserving (${htmlBody.length} chars)`);
          const replySplit = this.splitReplyContent(textBody, htmlBody);
          
          if (replySplit.found) {
            result.originalHtmlBody = replySplit.bodyHtml;
            console.log(`[EMAIL-CLEANER] ✅ FORWARD-PATH: Reply split successful! ${replySplit.bodyHtml?.length || 0} chars body, ${replySplit.remainderHtml?.length || 0} chars remainder`);
          } else {
            result.originalHtmlBody = this.sanitizeHtml(htmlBody);
            console.log(`[EMAIL-CLEANER] ❌ FORWARD-PATH: Reply split failed - preserving original HTML (${htmlBody.length} chars)`);
          }
        }
        
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

  // Divide il contenuto dell'email in body principale e resto del thread con training data
  static async splitEmailContentWithTraining(
    subject: string,
    body: string,
    htmlBody: string | null,
    userId: string
  ): Promise<{
    bodyText: string;
    bodyHtml: string | null;
    remainderText: string | null;
    remainderHtml: string | null;
    headerSummary: string | null;
    isForwarded: boolean;
  }> {
    console.log(`[EMAIL-CLEANER] Using training-aware email cleaning for user ${userId}`);
    
    // Prima pulisci l'email per ottenere le parti separate usando training data
    const cleaned = await this.cleanForwardedEmailWithTraining(subject, body, htmlBody || null, userId);
    
    // Trasforma ForwardedEmailData nella struttura richiesta dalla route
    return this.splitEmailContentFromCleaned(subject, body, htmlBody, cleaned);
  }

  // Divide il contenuto dell'email in body principale e resto del thread (versione senza training per retrocompatibilità)
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
    
    return this.splitEmailContentFromCleaned(subject, body, htmlBody, cleaned);
  }

  // Logica comune per dividere il contenuto da email pulita
  private static splitEmailContentFromCleaned(
    subject: string,
    body: string,
    htmlBody: string | null | undefined,
    cleaned: ForwardedEmailData
  ): {
    bodyText: string;
    bodyHtml: string | null;
    remainderText: string | null;
    remainderHtml: string | null;
    headerSummary: string | null;
    isForwarded: boolean;
  } {
    
    if (!cleaned.isForwarded) {
      // Anche se non è marcata come inoltrata, potrebbe essere una reply con contenuto quotato
      // Tenta di dividere il contenuto usando pattern di reply comuni
      const replySplit = this.splitReplyContent(body, htmlBody);
      
      if (replySplit.found) {
        console.log(`[EMAIL-CLEANER] REPLY remainder: ${replySplit.remainderHtml?.length || replySplit.remainderText?.length || 0} chars`);
        
        // 🔧 BUGFIX: Remove signatures from the "cleaned" bodyHtml part!
        let cleanedBodyHtml = replySplit.bodyHtml;
        if (cleanedBodyHtml && cleanedBodyHtml.includes('Ivan Lo Torto')) {
          console.log(`[EMAIL-CLEANER] ⚠️  BUG DETECTED: "Cleaned" bodyHtml still contains signature! Length: ${cleanedBodyHtml.length}`);
          
          // Apply signature removal patterns to the supposedly "clean" part
          cleanedBodyHtml = cleanedBodyHtml
            // Remove signature blocks
            .replace(/<div[^>]*id="Signature"[^>]*>[\s\S]*?<\/div>/gi, '')
            // Remove Ivan Lo Torto signatures specifically  
            .replace(/Ivan Lo Torto[\s\S]*?(?=<\/p>|<p|$)/gi, '')
            // Remove technical analyst signatures
            .replace(/Technical analyst[\s\S]*?(?=<\/p>|<p|$)/gi, '')
            // Clean up empty divs and paragraphs
            .replace(/<div[^>]*>\s*<\/div>/gi, '')
            .replace(/<p[^>]*>\s*<\/p>/gi, '')
            .trim();
            
          console.log(`[EMAIL-CLEANER] ✅ Signatures removed from bodyHtml: ${replySplit.bodyHtml?.length} -> ${cleanedBodyHtml.length} chars`);
        }
        
        return {
          bodyText: replySplit.bodyText,
          bodyHtml: cleanedBodyHtml,
          remainderText: replySplit.remainderText,
          remainderHtml: replySplit.remainderHtml,
          headerSummary: null,
          isForwarded: false
        };
      }
      
      // Se non è stata trovata nessuna divisione, usa il contenuto originale
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

    // SAFETY FALLBACK: Se l'HTML pulito è null o molto corto, usa l'HTML originale
    let cleanedHtmlBody = cleaned.originalHtmlBody;
    
    // DISABILITO il fallback distruttivo che annulla gli split intenzionali
    // Il fallback precedente ripristinava l'HTML originale quando il body era <40% 
    // Ma questo distrugge gli split riusciti di thread (es. 1.6MB -> 9KB body è intenzionale!)
    console.log(`[EMAIL-CLEANER] Skipping destructive fallback - using cleaned HTML: ${cleanedHtmlBody?.length || 0} chars (original: ${htmlBody?.length || 0} chars)`);

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
    console.log(`[EMAIL-CLEANER] Starting remainder extraction: original=${originalBody.length}, cleaned=${cleanedBody.length}`);
    
    let remainderText: string | null = null;
    let remainderHtml: string | null = null;

    // Thresholds più intelligenti - considera il rapporto tra le lunghezze
    const lengthRatio = originalBody.length / Math.max(cleanedBody.length, 1);
    const minDifference = Math.max(100, cleanedBody.length * 0.3); // Almeno 30% o 100 chars
    
    console.log(`[EMAIL-CLEANER] Length analysis: ratio=${lengthRatio.toFixed(2)}, minDiff=${minDifference}`);
    
    // Trova la parte del testo originale che non è stata inclusa nel body pulito
    if (originalBody.length > cleanedBody.length + minDifference && lengthRatio > 1.1) {
      // Strategia 1: Cerca usando multiple substring sizes per robustezza
      let bodyIndex = -1;
      const searchSizes = [200, 150, 100, 75, 50];
      
      for (const size of searchSizes) {
        if (cleanedBody.length >= size) {
          const searchString = cleanedBody.substring(0, size);
          bodyIndex = originalBody.indexOf(searchString);
          if (bodyIndex >= 0) {
            console.log(`[EMAIL-CLEANER] Found match with search size ${size} at index ${bodyIndex}`);
            break;
          }
        }
      }
      
      // Strategia 2: Se indexOf fallisce, prova con la parte finale del cleanedBody
      if (bodyIndex < 0 && cleanedBody.length >= 100) {
        const endSearch = cleanedBody.substring(cleanedBody.length - 100);
        const endIndex = originalBody.indexOf(endSearch);
        if (endIndex >= 0) {
          bodyIndex = endIndex - (cleanedBody.length - 100);
          console.log(`[EMAIL-CLEANER] Found match using end-search at calculated index ${bodyIndex}`);
        }
      }
      
      // Strategia 3: Se ancora fallisce, usa pattern-based fallback per thread headers
      if (bodyIndex < 0) {
        console.log(`[EMAIL-CLEANER] Exact match failed, trying pattern-based remainder detection`);
        remainderText = this.extractRemainderByPatterns(originalBody, cleanedBody);
      } else {
        // Usa l'indice trovato per estrarre remainder
        const contentThreshold = Math.max(50, cleanedBody.length * 0.1);
        
        if (bodyIndex > contentThreshold) {
          // C'è contenuto significativo prima del body
          remainderText = originalBody.substring(0, bodyIndex).trim();
          console.log(`[EMAIL-CLEANER] Extracted remainder BEFORE body: ${remainderText.length} chars`);
        } else {
          // Cerca contenuto dopo il body
          const afterIndex = bodyIndex + cleanedBody.length;
          const remainingContent = originalBody.length - afterIndex;
          
          if (remainingContent > contentThreshold) {
            remainderText = originalBody.substring(afterIndex).trim();
            console.log(`[EMAIL-CLEANER] Extracted remainder AFTER body: ${remainderText.length} chars`);
          }
        }
      }
    } else {
      console.log(`[EMAIL-CLEANER] No remainder extraction needed: insufficient length difference`);
    }

    // Stessa logica migliorata per HTML se disponibile
    if (originalHtml && cleanedHtml) {
      const htmlLengthRatio = originalHtml.length / Math.max(cleanedHtml.length, 1);
      const htmlMinDifference = Math.max(200, cleanedHtml.length * 0.3);
      
      if (originalHtml.length > cleanedHtml.length + htmlMinDifference && htmlLengthRatio > 1.1) {
        console.log(`[EMAIL-CLEANER] Attempting HTML remainder extraction: ratio=${htmlLengthRatio.toFixed(2)}`);
        
        // Multiple search strategies per HTML
        let htmlBodyIndex = -1;
        const htmlSearchSizes = [300, 250, 200, 150, 100];
        
        for (const size of htmlSearchSizes) {
          if (cleanedHtml.length >= size) {
            const searchString = cleanedHtml.substring(0, size);
            htmlBodyIndex = originalHtml.indexOf(searchString);
            if (htmlBodyIndex >= 0) {
              console.log(`[EMAIL-CLEANER] Found HTML match with search size ${size}`);
              break;
            }
          }
        }
        
        if (htmlBodyIndex >= 0) {
          const htmlContentThreshold = Math.max(100, cleanedHtml.length * 0.1);
          
          if (htmlBodyIndex > htmlContentThreshold) {
            remainderHtml = originalHtml.substring(0, htmlBodyIndex).trim();
            console.log(`[EMAIL-CLEANER] Extracted HTML remainder BEFORE: ${remainderHtml.length} chars`);
          } else {
            const afterIndex = htmlBodyIndex + cleanedHtml.length;
            const remainingHtmlContent = originalHtml.length - afterIndex;
            
            if (remainingHtmlContent > htmlContentThreshold) {
              remainderHtml = originalHtml.substring(afterIndex).trim();
              console.log(`[EMAIL-CLEANER] Extracted HTML remainder AFTER: ${remainderHtml.length} chars`);
            }
          }
        } else {
          console.log(`[EMAIL-CLEANER] HTML exact match failed, remainder extraction skipped`);
        }
      }
    }

    console.log(`[EMAIL-CLEANER] Remainder extraction complete: text=${remainderText?.length || 0}, html=${remainderHtml?.length || 0}`);
    return { text: remainderText, html: remainderHtml };
  }

  /**
   * Fallback pattern-based remainder extraction quando indexOf fallisce
   */
  private static extractRemainderByPatterns(
    originalBody: string,
    cleanedBody: string
  ): string | null {
    console.log(`[EMAIL-CLEANER] Attempting pattern-based remainder extraction`);

    const lines = originalBody.split('\n');

    const forwardPatterns = [
      /^[-_]{5,}.*(Original|Forwarded|Messaggio|Message).*/i,
      /^---------- Forwarded message ----------/i,
      /^---------- Messaggio inoltrato ----------/i,
      /Il giorno .* ha scritto:/i,
      /On .* wrote:/i,
      /Le .* a écrit:/i,
      /Am .* schrieb:/i,
      /In data .* ha scritto:/i,
      /\d{1,2}\/\d{1,2}\/\d{2,4}.*wrote:/i,
      /\d{1,2}-\d{1,2}-\d{2,4}.*ha scritto:/i,
      /.* ha scritto il \d{1,2}\/\d{1,2}\/\d{2,4}/i,
      /^[>\s]*?(Da|From|Inviato|Sent|A|To|Cc|Oggetto|Subject|Data|Date)\s*[:\-=]\s*/i
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (forwardPatterns.some(p => p.test(line))) {
        const textUpToHere = lines.slice(0, i).join('\n');
        const remainderFromHere = lines.slice(i).join('\n').trim();
        if (remainderFromHere.length > 100 &&
            (textUpToHere.length < cleanedBody.length * 1.5 ||
             textUpToHere.includes(cleanedBody.substring(0, Math.min(50, cleanedBody.length))))) {
          console.log(`[EMAIL-CLEANER] Pattern-based match found at line ${i}: [pattern detected]`);
          console.log(`[EMAIL-CLEANER] Remainder extracted: ${remainderFromHere.length} chars`);
          return remainderFromHere;
        }
      }
    }

    const cleanedWords = new Set(cleanedBody.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let bestSplitIndex = -1;
    let lowestOverlap = 1;

    for (let i = Math.max(0, cleanedBody.length - 200); i < originalBody.length - 200; i += 100) {
      const chunk = originalBody.substring(i, i + 500).toLowerCase();
      const chunkWords = chunk.split(/\s+/).filter(w => w.length > 3);
      const overlap = chunkWords.filter(w => cleanedWords.has(w)).length / Math.max(chunkWords.length, 1);
      if (overlap < lowestOverlap && overlap < 0.3) {
        lowestOverlap = overlap;
        bestSplitIndex = i;
      }
    }

    if (bestSplitIndex > 0) {
      const heuristicRemainder = originalBody.substring(bestSplitIndex).trim();
      if (heuristicRemainder.length > 150) {
        console.log(`[EMAIL-CLEANER] Heuristic split found at index ${bestSplitIndex}, overlap=${lowestOverlap.toFixed(2)}`);
        return heuristicRemainder;
      }
    }

    console.log(`[EMAIL-CLEANER] Pattern-based remainder extraction failed`);
    return null;
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

  private static splitReplyContent(
    body: string,
    htmlBody?: string | null
  ): {
    found: boolean;
    bodyText: string;
    bodyHtml: string | null;
    remainderText: string | null;
    remainderHtml: string | null;
  } {
    console.log(`[EMAIL-CLEANER] Attempting reply split for text (${body.length} chars)`);
    
    // Pattern di reply comuni nel testo (espansi)
    const textReplyPatterns = [
      /^On .+ wrote:$/im,
      /^Il .+ ha scritto:$/im,
      /^Le .+ a écrit:$/im, // Francese
      /^Am .+ schrieb:$/im, // Tedesco
      /^(From|Da|De): .+\n(Sent|Inviato|Envoyé):/im,
      /^[-_—–]{3,}.*Original Message.*[-_—–]*$/im,
      /^[-_—–]{5,}$/im, // Linee di trattini
      /^> .+/im, // Quote standard
      /^\s*From:\s*.*\nDate:\s*/im // Header cluster common
    ];
    
    // Cerca nel testo
    let textSplitPoint = -1;
    for (const pattern of textReplyPatterns) {
      const match = body.match(pattern);
      if (match && match.index !== undefined) {
        textSplitPoint = match.index;
        console.log(`[EMAIL-CLEANER] Found text reply pattern at ${textSplitPoint}`);
        break;
      }
    }
    
    // Se c'è HTML, cerca pattern HTML
    let htmlSplitPoint = -1;
    if (htmlBody) {
      const htmlReplyPatterns = [
        /<blockquote[^>]*>/i,
        /<div[^>]*class="[^"]*gmail_quote[^"]*"/i,
        /<hr[^>]*class="[^"]*gmail_extra[^"]*"/i,
        /<div[^>]*class="[^"]*yahoo_quoted[^"]*"/i,
        /<table[^>]*border[^>]*>/i, // Outlook table quotes
        /<div[^>]*style="[^"]*border-left[^"]*"/i, // CSS quote borders
        /<!-- original message -->/i,
        /<div[^>]*id="[^"]*divRplyFwdMsg[^"]*"/i // Outlook web
      ];
      
      for (const pattern of htmlReplyPatterns) {
        const match = htmlBody.match(pattern);
        if (match && match.index !== undefined) {
          htmlSplitPoint = match.index;
          console.log(`[EMAIL-CLEANER] Found HTML reply pattern at ${htmlSplitPoint}`);
          break;
        }
      }
    }
    
    // Determina se c'è una divisione valida
    const useSplit = textSplitPoint > 0 || htmlSplitPoint > 0;
    
    if (useSplit) {
      const textSplit = textSplitPoint > 0 ? textSplitPoint : body.length;
      const htmlSplit = htmlSplitPoint > 0 ? htmlSplitPoint : (htmlBody?.length || 0);
      
      const bodyText = body.substring(0, textSplit).trim();
      const remainderText = textSplitPoint > 0 ? body.substring(textSplit).trim() : null;
      
      const bodyHtml = htmlBody && htmlSplit > 0 ? 
        this.sanitizeHtml(htmlBody.substring(0, htmlSplit)) : 
        (htmlBody ? this.sanitizeHtml(htmlBody) : null);
      const remainderHtml = htmlBody && htmlSplit > 0 ? 
        this.sanitizeHtml(htmlBody.substring(htmlSplit)) : null;
      
      // Controlla se la divisione è sensata (text O HTML)
      const originalTextLength = body.length;
      const newBodyLength = bodyText.length;
      const remainderTextLength = remainderText?.length || 0;
      const textRatio = originalTextLength / Math.max(newBodyLength, 1);
      
      // Check per split text
      const textSplitValid = textRatio > 1.05 && remainderTextLength > 120;
      
      // Check per split HTML (se disponibile)
      let htmlSplitValid = false;
      console.log(`[EMAIL-CLEANER] HTML split debug: htmlBody=${!!htmlBody}, remainderHtml=${!!remainderHtml}, htmlSplit=${htmlSplit}, remainderLength=${remainderHtml?.length || 0}`);
      if (htmlBody && remainderHtml) {
        const originalHtmlLength = htmlBody.length;
        const newBodyHtmlLength = bodyHtml?.length || 0;
        const remainderHtmlLength = remainderHtml.length;
        const htmlRatio = originalHtmlLength / Math.max(newBodyHtmlLength, 1);
        
        // Rilassa le soglie se il testo è molto corto (tipico di thread HTML)
        const isShortText = body.length < 2000;
        const htmlThreshold = isShortText ? 500 : 200; // Soglia più alta per text corti
        const ratioThreshold = isShortText ? 1.02 : 1.05; // Ratio più basso per text corti
        
        htmlSplitValid = htmlRatio > ratioThreshold && remainderHtmlLength > htmlThreshold;
        console.log(`[EMAIL-CLEANER] HTML split check: ratio=${htmlRatio.toFixed(2)}, remainder=${remainderHtmlLength}, threshold=${htmlThreshold}, valid=${htmlSplitValid} (shortText=${isShortText})`);
      }
      
      if (textSplitValid || htmlSplitValid) {
        const totalRemainderLength = remainderTextLength + (remainderHtml?.length || 0);
        console.log(`[EMAIL-CLEANER] Reply split successful: ${newBodyLength} body, ${totalRemainderLength} remainder (text:${remainderTextLength}, html:${remainderHtml?.length || 0})`);
        
        // 🔍 DEBUG: Check if the "cleaned" bodyHtml still contains signatures BEFORE return
        console.log(`[EMAIL-CLEANER] 🔍 OLD-SPLIT-DEBUG: bodyHtml exists=${!!bodyHtml}, length=${bodyHtml?.length || 0}`);
        console.log(`[EMAIL-CLEANER] 🔍 OLD-SPLIT-DEBUG: contains Ivan Lo Torto=${bodyHtml?.includes('Ivan Lo Torto')}`);
        if (bodyHtml) {
          console.log(`[EMAIL-CLEANER] 🔍 OLD-SPLIT-DEBUG: First 200 chars:`, bodyHtml.substring(0, 200));
          console.log(`[EMAIL-CLEANER] 🔍 OLD-SPLIT-DEBUG: Last 200 chars:`, bodyHtml.substring(bodyHtml.length - 200));
        }
        
        if (bodyHtml && bodyHtml.includes('Ivan Lo Torto')) {
          console.log(`[EMAIL-CLEANER] ⚠️  WARNING: "Cleaned" bodyHtml still contains signature! Length: ${bodyHtml.length}`);
        } else {
          console.log(`[EMAIL-CLEANER] ✅ Signatures properly removed from bodyHtml (OLD SPLIT)`);
        }
        
        return {
          found: true,
          bodyText,
          bodyHtml,
          remainderText,
          remainderHtml
        };
      }
    }
    
    console.log(`[EMAIL-CLEANER] No valid reply split found`);
    return {
      found: false,
      bodyText: body,
      bodyHtml: htmlBody ? this.sanitizeHtml(htmlBody) : null,
      remainderText: null,
      remainderHtml: null
    };
  }

  private static hasExplicitForwardMarkers(subject: string, textBody: string, htmlBody: string): boolean {
    // Check for explicit forward markers in subject
    const subjectForwarded = this.isForwardedSubject(subject);
    
    // Check for explicit forward markers in text body
    const explicitTextMarkers = [
      /---------- Forwarded message ---------/i,
      /---------- Messaggio inoltrato ----------/i,
      /Begin forwarded message:/i,
      /From:.*To:.*Subject:/i,
      /====== Forwarded Message ======/i,
      /Da:.*A:.*Oggetto:/i,
      /_{5,}.*Forwarded.*_{5,}/i,
      /^[\s]*From:\s*.*[\s]*Sent:\s*.*[\s]*To:/i
    ];
    
    const textHasMarkers = explicitTextMarkers.some(pattern => pattern.test(textBody));
    
    // Check for explicit forward markers in HTML
    const explicitHtmlMarkers = [
      /<div[^>]*>---------- Forwarded message ---------/i,
      /<div[^>]*>---------- Messaggio inoltrato ----------/i,
      /<div[^>]*>Begin forwarded message:/i,
      /<div[^>]*class="[^"]*forward[^"]*"/i,
      /<blockquote.*class="[^"]*gmail_quote[^"]*"/i
    ];
    
    const htmlHasMarkers = explicitHtmlMarkers.some(pattern => pattern.test(htmlBody));
    
    return subjectForwarded || textHasMarkers || htmlHasMarkers;
  }

  private static isForwardedBody(
    body: string, 
    trainingData?: { commonHeaders: string[], commonBodyPatterns: string[], threadMarkers: string[] }
  ): boolean {
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
        // ✅ CRITICAL FIX: Check training data before skipping short emails
        if (trainingData && (trainingData.threadMarkers.length > 0 || trainingData.commonHeaders.length > 0 || trainingData.commonBodyPatterns.length > 0)) {
          const hasTrainingPatterns = this.checkTrainingPatternsMatch(body, trainingData);
          if (hasTrainingPatterns) {
            console.log(`[EMAIL-CLEANER] Pre-filter override: found training patterns in short email (${body.length} chars) - processing anyway`);
            return true; // Force processing when training data matches
          }
        }
        
        // Ultima verifica: conta header anchored nelle prime 10 righe
        const lines = body.split('\n').slice(0, 10);
        const headerRegex = /^[>\s\u00A0]*?(Da|From|Inviato|Sent|A|To|Cc|Oggetto|Subject|Data|Date)\s*:\s*/i;
        const headerCount = lines.filter(line => headerRegex.test(line)).length;
        
        if (headerCount < 3) {
          // ✅ FINAL CHECK: Always verify training data before skipping
          if (trainingData && (trainingData.threadMarkers.length > 0 || trainingData.commonHeaders.length > 0 || trainingData.commonBodyPatterns.length > 0)) {
            const hasTrainingPatterns = this.checkTrainingPatternsMatch(body, trainingData);
            if (hasTrainingPatterns) {
              console.log(`[EMAIL-CLEANER] Pre-filter final override: found training patterns despite low header count (${body.length} chars, ${headerCount} headers) - processing anyway`);
              return true; // Force processing based on training data
            }
          }
          console.log(`[EMAIL-CLEANER] Pre-filter: skipping short email (${body.length} chars, ${headerCount} headers) - no explicit markers and no training patterns`);
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

    // Check standard forward patterns
    const hasStandardPatterns = forwardPatterns.some(pattern => pattern.test(body));
    
    // ✅ TRAINING INTEGRATION: Check learned thread markers from user training
    let hasTrainingPatterns = false;
    if (trainingData && trainingData.threadMarkers.length > 0) {
      for (const marker of trainingData.threadMarkers) {
        const regex = this.TRAINING_PATTERN_MAP.threadMarkers[marker as keyof typeof this.TRAINING_PATTERN_MAP.threadMarkers];
        if (regex && regex.test(body)) {
          console.log(`[EMAIL-CLEANER] Training-enhanced forward detection: found '${marker}' pattern`);
          hasTrainingPatterns = true;
          break;
        }
      }
    }
    
    return hasStandardPatterns || hasTrainingPatterns;
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

  private static cleanForwardedBody(body: string, htmlBody?: string | null): string {
    if (!body) return body;

    const originalBody = body;

    // Usa il nuovo algoritmo bounded per separare main body dal remainder  
    const splitResult = this.splitTextByHeaderClusters(body, htmlBody);
    
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

    console.log(`[EMAIL-CLEANER] Bounded HTML split not confident enough (${splitResult.confidence}), trying HTML→text fallback`);
    
    // HTML→text fallback: converte HTML in testo e usa l'algoritmo text-based
    const htmlAsText = htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (htmlAsText.length > 200) { // Solo se c'è abbastanza contenuto testuale
      const textSplitResult = this.splitTextByHeaderClusters(htmlAsText);
      
      if ((textSplitResult.confidence === 'high' || textSplitResult.confidence === 'medium') && 
          textSplitResult.mainText) {
        
        console.log(`[EMAIL-CLEANER] HTML→text fallback successful (${textSplitResult.confidence}, ${textSplitResult.method}): ${textSplitResult.mainText.length} chars main body`);
        
        // Estrai la porzione HTML corrispondente al testo identificato
        const mainTextLength = textSplitResult.mainText.length;
        const approximateHtmlLength = Math.min(mainTextLength * 3, htmlBody.length * 0.7); // Stima approssimativa
        const fallbackHtml = htmlBody.substring(0, approximateHtmlLength);
        const cleanedFallbackHtml = this.closeOpenHtmlTags(fallbackHtml);
        
        if (!this.isOnlySignatureHtml(cleanedFallbackHtml)) {
          return cleanedFallbackHtml;
        }
      }
    }
    
    console.log(`[EMAIL-CLEANER] HTML→text fallback also failed, using pattern-based fallback`);
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
  private static splitTextByHeaderClusters(textBody: string, htmlBody?: string | null): {
    mainText: string | null;
    remainderText: string | null;
    confidence: 'high' | 'medium' | 'low';
    method: 'top-prelude' | 'after-cluster' | 'html-fallback' | 'no-split';
  } {
    console.log(`[EMAIL-CLEANER] Starting bounded split analysis for text (${textBody.length} chars)`);
    
    // Normalizza il testo: sostituisce NBSP con spazi, rimuove quote leader per header detection
    const normalizedBody = textBody.replace(/\u00A0/g, ' ');
    const lines = normalizedBody.split('\n');
    
    // Regex molto più tollerante per identificare header - gestisce HTML, spazi extra, punteggiatura varia
    const headerRegex = /^[>\s\u00A0]*?(Da|From|Inviato|Sent|A|To|Cc|Oggetto|Subject|Data|Date|Fwd|FW|Destinatario|Recipient|Reply-To|Message-ID|Return-Path|Received|MIME-Version)\s*[:\-=>\u2192\u003E]\s*/i;
    
    // Single-line markers - RIMOSSA limitazione 1200 chars per gestire email brevi problematiche
    const singleLineMarkers = [
      /Il giorno .* ha scritto:/i,
      /On .* wrote:/i,
      /Le .* a écrit:/i,
      /Am .* schrieb:/i,
      /In data .* ha scritto:/i,
      // Aggiunti pattern più comuni per email italiane/inglesi
      /\d{1,2}\/\d{1,2}\/\d{2,4}.*wrote:/i,
      /\d{1,2}-\d{1,2}-\d{2,4}.*ha scritto:/i,
      /.* ha scritto il \d{1,2}\/\d{1,2}\/\d{2,4}/i
    ];
    
    const quotedMarkers = [
      /^[-_]{5,}.*(Original|Forwarded|Messaggio|Message).*/i,
      /^>{1,}/,  // Quoted text markers
      /^---------- Forwarded message ----------/i,
      /^---------- Messaggio inoltrato ----------/i,
      // Aggiunti pattern per email con formattazione HTML/Outlook
      /^[\s]*From:.*<.*@.*>/i,
      /^[\s]*Da:.*<.*@.*>/i,
      /^\s*=====.*Message.*=====/i,
      /^\s*&gt;/  // HTML encoded quotes
    ];

    let firstHeaderClusterStart = -1;
    let firstHeaderClusterEnd = -1;
    let headerCount = 0;

    // Step 1: Cerca single-line markers per TUTTE le email (rimossa limitazione 1200 chars)
    for (let i = 0; i < Math.min(lines.length, 50); i++) { // Ampliata ricerca a 50 righe
      const line = lines[i].trim();
      if (singleLineMarkers.some(marker => marker.test(line))) {
        console.log(`[EMAIL-CLEANER] Found single-line marker at line ${i}: "[pattern detected]"`);
        firstHeaderClusterStart = i;
        firstHeaderClusterEnd = i + 1;
        headerCount = 1;
        break;
      }
    }

    // Step 2: Se non trovato, cerca header cluster con rolling window MIGLIORATO
    if (firstHeaderClusterStart === -1) {
      for (let i = 0; i < Math.min(lines.length, 120); i++) { // Ampliata ricerca a 120 righe
        const line = lines[i].trim();
        
        if (line.length === 0) continue;

        const isHeader = headerRegex.test(line);
        const isQuotedMarker = quotedMarkers.some(pattern => pattern.test(line));
        
        if (isHeader || isQuotedMarker) {
          if (firstHeaderClusterStart === -1) {
            firstHeaderClusterStart = i;
          }
          headerCount++;
          
          // RILASSATA: Accetta 1 header se molto specifico, 2 header in finestra più ampia (15 righe)
          const windowSize = 15; // Aumentato da 8 a 15
          const isStrongHeader = /^[>\s\u00A0]*?(From|Da|Subject|Oggetto|Date|Data)\s*[:\-]/i.test(line);
          
          if ((headerCount >= 1 && isStrongHeader) || 
              (headerCount >= 2 && i - firstHeaderClusterStart <= windowSize)) {
            // Trova la fine del cluster con ricerca più estesa
            for (let j = i + 1; j < Math.min(lines.length, i + windowSize); j++) {
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
          // Reset rolling window se troppo lontano dal primo header (aumentato limite)
          const windowSize = 15; // Definito qui per scope
          if (firstHeaderClusterStart !== -1 && i - firstHeaderClusterStart > windowSize) {
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
      // Soglie drasticamente abbassate per email reali
      if (meaningfulLines > 0 && 
          topPreludeText.length > 50 && 
          quotedLines < meaningfulLines * 2 && 
          signatureLines < meaningfulLines * 2) {
        
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
      
      // OTTIMIZZAZIONE: Smart skip basato su analisi contenuto invece di fixed 5 righe
      const smartSkip = Math.min(8, Math.max(2, Math.floor((lines.length - firstHeaderClusterEnd) * 0.1)));
      for (let i = firstHeaderClusterEnd + smartSkip; i < lines.length; i++) {
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
          
          // OTTIMIZZAZIONE: Smart boundary confidence con weighted scoring
          const headerWeight = isNewHeader ? 2 : 0;
          const markerWeight = isNewMarker ? 1.5 : 0;
          const quoteWeight = isQuoteStart ? 1 : 0;
          const totalWeight = headerWeight + markerWeight + quoteWeight + Math.max(0, boundaryConfidence - 1) * 0.5;
          
          if (totalWeight >= 2.5 || (boundaryConfidence >= 2 && totalWeight >= 1.5)) {
            nextBoundaryIndex = i;
            console.log(`[EMAIL-CLEANER] Found boundary at line ${i}, weight=${totalWeight.toFixed(1)}, confidence=${boundaryConfidence}`);
            break;
          }
        }
      }

      const extractEndIndex = nextBoundaryIndex > 0 ? nextBoundaryIndex : lines.length;
      const mainText = lines.slice(firstHeaderClusterEnd, extractEndIndex).join('\n').trim();
      const remainderText = nextBoundaryIndex > 0 ? lines.slice(nextBoundaryIndex).join('\n').trim() : null;

      // OTTIMIZZAZIONE: Intelligent guard con multiple quality metrics
      const originalLength = textBody.length;
      const mainLength = mainText.length;
      const wordCount = mainText.split(/\s+/).filter(w => w.length > 2).length; // Solo parole significative
      const textRatio = mainLength / Math.max(originalLength, 1);
      const sentenceCount = mainText.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
      const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
      
      // Quality scoring: contenuto più ricco = confidence più alta
      const qualityScore = 
        (mainLength > 50 ? 1 : 0) +
        (wordCount > 10 ? 1 : 0) +
        (sentenceCount > 1 ? 1 : 0) +
        (avgWordsPerSentence > 4 ? 1 : 0) +
        (nextBoundaryIndex > 0 ? 1 : 0);
      
      const hasGoodBoundary = nextBoundaryIndex > 0;
      const reasonableRatio = textRatio <= 0.75;
      const substantialContent = mainLength > 100 || (wordCount > 15 && sentenceCount > 1);
      
      if (qualityScore >= 3 && 
          !this.isOnlySignature(mainText) && 
          (reasonableRatio || hasGoodBoundary || substantialContent)) {
        
        console.log(`[EMAIL-CLEANER] Extracted after cluster: ${mainText.length} chars main, ${remainderText?.length || 0} chars remainder (quality=${qualityScore}, ratio=${textRatio.toFixed(2)})`);
        
        return {
          mainText: mainText,
          remainderText: remainderText,
          confidence: nextBoundaryIndex > 0 ? 'high' : 'medium',
          method: 'after-cluster'
        };
      } else {
        console.log(`[EMAIL-CLEANER] After-cluster extraction rejected: quality=${qualityScore}, ratio=${textRatio.toFixed(2)}, words=${wordCount}, sentences=${sentenceCount}`);
      }
    }

    // Step 4: HTML FALLBACK COMPLETO - Prova in tutti i casi dove htmlBody è presente
    if (htmlBody) {
      let shouldTryHtmlFallback = false;
      let reason = '';
      
      if (firstHeaderClusterStart === -1) {
        shouldTryHtmlFallback = true;
        reason = 'text analysis failed completely';
      } else {
        // Se l'analisi testo ha trovato header, prova HTML fallback comunque prima del no-split finale
        shouldTryHtmlFallback = true;
        reason = 'low confidence text split - trying HTML rescue';
      }
      
      if (shouldTryHtmlFallback) {
        console.log(`[EMAIL-CLEANER] Trying HTML fallback: ${reason}`);
        const htmlFallback = this.tryHtmlFallbackSplit(textBody, htmlBody);
        
        if (htmlFallback.confidence === 'medium' && htmlFallback.mainText) {
          console.log(`[EMAIL-CLEANER] ✓ HTML fallback successful: ${htmlFallback.mainText.length} chars (${reason})`);
          return {
            mainText: htmlFallback.mainText,
            remainderText: htmlFallback.remainderText,
            confidence: 'medium',
            method: 'html-fallback'
          };
        } else {
          console.log(`[EMAIL-CLEANER] ✗ HTML fallback also failed (${reason})`);
        }
      }
    }

    // Step 5: Fallback finale - nessuna separazione affidabile
    console.log(`[EMAIL-CLEANER] No reliable split found, returning no-split`);
    return {
      mainText: null,
      remainderText: null,
      confidence: 'low',
      method: 'no-split'
    };
  }

  /**
   * Fallback HTML quando l'analisi del testo fallisce completamente
   */
  private static tryHtmlFallbackSplit(textBody: string, htmlBody: string): {
    mainText: string | null;
    remainderText: string | null;
    confidence: 'high' | 'medium' | 'low';
    method: 'top-prelude' | 'after-cluster' | 'html-fallback' | 'no-split';
  } {
    console.log(`[EMAIL-CLEANER] Trying HTML fallback split for failed text analysis`);
    
    // Se il textBody è molto breve (< 700 chars), è probabilmente solo firma, cerca direttamente nell'HTML
    if (textBody.length < 700) {
      console.log(`[EMAIL-CLEANER] Short text body (${textBody.length} chars), analyzing HTML directly`);
      return this.tryDirectHtmlAnalysis(htmlBody, textBody);
    }
    
    // Pattern HTML per identificare separatori di forwarding/reply (italiano-specifici)
    const htmlHeaderPatterns = [
      // Pattern specifici italiani più aggressivi
      /\b(?:Da|From|De):\s*[^<\n]*[@]/i,
      /\b(?:Oggetto|Subject|Asunto):\s*[^<\n]{10,}/i,
      /\b(?:Data|Date|Sent|Inviato|Enviado):\s*[^<\n]*\d{2,4}/i,
      /\b(?:A|To|Para):\s*[^<\n]*[@]/i,
      
      // Pattern di blocco forwarded/reply italiani  
      /(?:Messaggio\s+(?:originale|inoltrato)|Original\s+Message|Forwarded\s+Message)/i,
      /(?:-----\s*Messaggio\s+originale|=====\s*Original\s+Message)/i,
      
      // Pattern di quote/reply italiani
      /(?:Il\s+\d{1,2}\/\d{1,2}\/\d{4}.*?ha\s+scritto)/i,
      /(?:On\s+\d{1,2}\/\d{1,2}\/\d{4}.*?wrote)/i,
      
      // Pattern di separatori enterprise italiani
      /(?:________________________________)/,
      /(?:Da:\s*[\w\s]+<.*@.*>)/i,
    ];
    
    // Cerca il primo pattern di header HTML nel textBody
    for (const pattern of htmlHeaderPatterns) {
      const match = textBody.match(pattern);
      if (match && match.index !== undefined && match.index > 30) {
        const splitPoint = match.index;
        const mainText = textBody.substring(0, splitPoint).trim();
        const remainderText = textBody.substring(splitPoint).trim();
        
        // Verifica che la divisione abbia senso
        if (mainText.length > 20 && remainderText.length > 20) {
          console.log(`[EMAIL-CLEANER] HTML fallback successful via text pattern: ${mainText.length} chars main, ${remainderText.length} chars remainder`);
          return {
            mainText,
            remainderText,
            confidence: 'medium',
            method: 'html-fallback'
          };
        }
      }
    }
    
    console.log(`[EMAIL-CLEANER] HTML fallback also failed`);
    return {
      mainText: null,
      remainderText: null,
      confidence: 'low',
      method: 'no-split'
    };
  }

  /**
   * Analizza direttamente l'HTML quando il textBody è troppo breve (solo firma)
   * Specifico per email enterprise italiane con contenuto nascosto nell'HTML
   */
  private static tryDirectHtmlAnalysis(htmlBody: string, textBody: string): {
    mainText: string | null;
    remainderText: string | null;
    confidence: 'high' | 'medium' | 'low';
    method: 'top-prelude' | 'after-cluster' | 'html-fallback' | 'no-split';
  } {
    console.log(`[EMAIL-CLEANER] Analyzing HTML directly for enterprise email structure`);
    
    // Converte HTML in testo pulito per l'analisi
    const htmlAsText = htmlBody
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[EMAIL-CLEANER] HTML converted to text: ${htmlAsText.length} chars`);

    // Pattern estremamente specifici per email enterprise italiane
    const enterprisePatterns = [
      // Pattern Outlook/Exchange italiani
      /(?:Da:\s*[\w\s]+(?:<[^>]*@[^>]*>|\s*\[[^@\]]*@[^\]]*\]))/i,
      /(?:Inviato:\s*(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|\w+\s+\d{1,2}))/i,
      /(?:A:\s*[\w\s]+(?:<[^>]*@[^>]*>|\s*\[[^@\]]*@[^\]]*\]))/i,
      /(?:Oggetto:\s*[\w\s]{5,})/i,
      
      // Pattern Gmail/enterprise italiani
      /(?:Il\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2},?\s*[\w\s]+<[^>]*@[^>]*>\s*ha\s+scritto:)/i,
      /(?:Il\s+giorno\s+[\w\s,]+\d{4}\s+[\w\s]+<[^>]*@[^>]*>\s*ha\s+scritto:)/i,
      
      // Separatori enterprise comuni
      /(?:__{10,})/,
      /(?:---+\s*(?:Messaggio\s+originale|Original\s+Message))/i,
      /(?:=====+\s*(?:Forwarded\s+Message|Messaggio\s+inoltrato))/i,
      
      // Pattern di thread collapse
      /(?:Da\s*:\s*[^<\n]*<[^>]*@[^>]*>\s*Inviato\s*:\s*[^<\n]*\s*A\s*:\s*[^<\n]*\s*Oggetto\s*:)/i,
    ];

    // Cerca il primo pattern enterprise nel testo HTML convertito
    let bestMatch = null;
    let bestScore = 0;

    for (const pattern of enterprisePatterns) {
      const match = htmlAsText.match(pattern);
      if (match && match.index !== undefined) {
        const index = match.index;
        const beforeContent = htmlAsText.substring(0, index).trim();
        const afterContent = htmlAsText.substring(index).trim();
        
        // Score basato su qualità del contenuto prima del match
        const score = beforeContent.length > 50 ? 
          (beforeContent.length / htmlAsText.length) * 100 : 0;
        
        if (score > bestScore && score > 5 && beforeContent.length > 30) {
          bestMatch = { index, beforeContent, afterContent, score };
          bestScore = score;
        }
      }
    }

    if (bestMatch) {
      console.log(`[EMAIL-CLEANER] Found enterprise pattern with score ${bestMatch.score.toFixed(1)}%: ${bestMatch.beforeContent.length} chars main`);
      
      // Restituisce il contenuto HTML estratto come main content (questo è il vero contenuto dell'email)
      // Il textBody (firma) diventa remainder
      const confidence = bestMatch.score > 15 ? 'medium' : 'low';
      const mainContent = bestMatch.beforeContent.length > bestMatch.afterContent.length ? 
        bestMatch.beforeContent : bestMatch.afterContent;
      
      console.log(`[EMAIL-CLEANER] Using HTML content as main: ${mainContent.length} chars, signature as remainder: ${textBody.length} chars`);
      
      return {
        mainText: mainContent, // Il contenuto HTML è il main
        remainderText: textBody, // La firma diventa remainder
        confidence: confidence,
        method: 'html-fallback'
      };
    }

    console.log(`[EMAIL-CLEANER] No enterprise patterns found in HTML`);
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

    // Guard con ratio check abbassato per email reali: accetta postHtml se ≥30% del contenuto originale o >500 chars
    const mainTextContent = mainHtml.replace(/<[^>]+>/g, ' ').trim();
    const originalTextContent = htmlBody.replace(/<[^>]+>/g, ' ').trim();
    const postHtmlRatio = mainTextContent.length / Math.max(originalTextContent.length, 1);
    
    if (mainTextContent.length > 50 && 
        !this.isOnlySignatureHtml(mainHtml) &&
        (postHtmlRatio >= 0.30 || mainTextContent.length > 500)) {
      
      console.log(`[EMAIL-CLEANER] Extracted HTML after container: ${mainHtml.length} chars main (ratio: ${postHtmlRatio.toFixed(2)}), ${remainderHtml?.length || 0} chars remainder`);
      
      return {
        mainHtml: mainHtml,
        remainderHtml: remainderHtml,
        confidence: nextBoundaryIndex > 0 ? 'high' : 'medium',
        method: 'after-container'
      };
    } else {
      console.log(`[EMAIL-CLEANER] HTML after-container extraction rejected: main too short (${mainTextContent.length} chars), ratio too low (${postHtmlRatio.toFixed(2)} < 0.30), or signature-only`);
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