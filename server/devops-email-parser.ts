/**
 * Azure DevOps Work Item Email Parser
 * 
 * Riconosce e parsifica le email di notifica di Azure DevOps per estrarre
 * metadata sui Work Items (Bug, Task, User Story, Feature, etc.)
 */

export interface DevOpsWorkItemMetadata {
  workItemId: number;
  workItemTitle: string;
  workItemUrl: string;
  workItemType?: string; // Bug, Task, User Story, Feature, Epic
  workItemProject?: string;
  workItemOrganization?: string;
  eventType: 'created' | 'updated' | 'commented' | 'state_changed' | 'assigned' | 'unknown';
  assignedTo?: string;
  state?: string;
  description?: string;
  changedBy?: string;
  changedFields?: string[];
}

export interface DevOpsParseResult {
  isDevOpsEmail: boolean;
  metadata?: DevOpsWorkItemMetadata;
  confidence: number; // 0-1
  sourceType?: 'email_devops_workitem'; // The sourceType to use for the message
}

// Pattern per riconoscere email Azure DevOps
const DEVOPS_SENDER_PATTERNS = [
  /azuredevops@microsoft\.com/i,
  /vsts@microsoft\.com/i,
  /vsts.*noreply/i,
  /no-reply@azure\.com/i,
  /notifications@azure\.com/i,
  /@dev\.azure\.com/i,
  /visualstudio\.com.*noreply/i,
  /noreply.*visualstudio/i,
  /azure.*devops/i,
  /devops.*azure/i,
];

// Pattern per estrarre Work Item ID dall'oggetto
// Esempi:
// - "[ProjectName] Bug 12345: Fix login issue"
// - "[ProjectName] #12345: Implement feature"
// - "Re: [ProjectName] Task 12345: Update database"
// - "[Organization/ProjectName] User Story 12345: ..."
// - "Azure DevOps" (generic notification)
const SUBJECT_PATTERNS = [
  /\[([^\]]+)\]\s*(?:#|(?:Bug|Task|User Story|Feature|Epic|Issue|Work Item)\s*)(\d+):\s*(.+)/i,
  /\[([^\]]+)\]\s*(\d+):\s*(.+)/i,
  /(?:Bug|Task|User Story|Feature|Epic|Issue)\s*#?(\d+):\s*(.+)/i,
  /#(\d+)\s*[-:]\s*(.+)/i,
  // Pattern per Azure DevOps: "Task 121 - 26586:0004 - Descrizione"
  /^(Bug|Task|User Story|Feature|Epic|Issue)\s+(\d+)\s*[-–]\s*(.+)/i,
  // Pattern generico: "Type ID: Title" o "Type ID - Title"
  /^(Bug|Task|User Story|Feature|Epic)\s+(\d+)\s*[:–-]\s*(.+)/i,
];

// Pattern per identificare email DevOps dal subject (senza necessità di estrarre metadata)
const DEVOPS_SUBJECT_INDICATORS = [
  /azure\s*devops/i,
  /work\s*item/i,
  /\bvsts\b/i,
  /visualstudio/i,
  /tfs\s+notification/i,
];

// Pattern per estrarre URL del work item dal body
const URL_PATTERNS = [
  /https?:\/\/dev\.azure\.com\/([^\/]+)\/([^\/]+)\/_workitems\/edit\/(\d+)/gi,
  /https?:\/\/([^\.]+)\.visualstudio\.com\/([^\/]+)\/_workitems\/edit\/(\d+)/gi,
  /https?:\/\/dev\.azure\.com\/[^\s<>"]+\/(\d+)/gi,
];

// Pattern per identificare il tipo di evento
const EVENT_PATTERNS = {
  created: [/created\s+(?:a\s+)?(?:new\s+)?(?:work\s+item|bug|task|user\s+story|feature)/i, /has\s+been\s+created/i],
  updated: [/updated/i, /changed/i, /modified/i],
  commented: [/added\s+a\s+comment/i, /commented\s+on/i, /new\s+comment/i],
  state_changed: [/state\s+changed/i, /moved\s+to/i, /transitioned\s+to/i],
  assigned: [/assigned\s+to/i, /reassigned/i],
};

// Pattern per estrarre tipo di work item
const WORK_ITEM_TYPE_PATTERNS = {
  'Bug': /\bbug\b/i,
  'Task': /\btask\b/i,
  'User Story': /\buser\s*story\b/i,
  'Feature': /\bfeature\b/i,
  'Epic': /\bepic\b/i,
  'Issue': /\bissue\b/i,
};

export class DevOpsEmailParser {
  
  /**
   * Verifica se un'email proviene da Azure DevOps
   */
  static isDevOpsEmail(fromEmail: string, subject: string): boolean {
    // Check sender patterns
    const isSenderMatch = DEVOPS_SENDER_PATTERNS.some(pattern => pattern.test(fromEmail || ''));
    if (isSenderMatch) return true;
    
    // Check subject pattern with Work Item ID (Azure DevOps ha un formato riconoscibile)
    const hasDevOpsSubject = SUBJECT_PATTERNS.some(pattern => pattern.test(subject || ''));
    if (hasDevOpsSubject) return true;
    
    // Check subject for DevOps indicators (e.g., "Azure DevOps", "work item", etc.)
    const hasDevOpsIndicator = DEVOPS_SUBJECT_INDICATORS.some(pattern => pattern.test(subject || ''));
    if (hasDevOpsIndicator) return true;
    
    return false;
  }
  
  /**
   * Parsifica un'email Azure DevOps ed estrae i metadata del Work Item
   */
  static parseDevOpsEmail(
    fromEmail: string,
    subject: string,
    body: string,
    htmlBody?: string | null
  ): DevOpsParseResult {
    const textContent = body || '';
    const htmlContent = htmlBody || '';
    const fullContent = textContent + ' ' + htmlContent;
    
    // Verifica se è un'email DevOps
    if (!this.isDevOpsEmail(fromEmail, subject)) {
      return { isDevOpsEmail: false, confidence: 0 };
    }
    
    let confidence = 0.5; // Base confidence for being recognized as DevOps email
    
    // Estrai Work Item ID e titolo dall'oggetto
    let workItemId: number | undefined;
    let workItemTitle: string | undefined;
    let workItemProject: string | undefined;
    
    for (const pattern of SUBJECT_PATTERNS) {
      const match = subject?.match(pattern);
      if (match) {
        if (match.length === 4) {
          // Pattern con progetto: [Project] Type ID: Title
          workItemProject = match[1];
          workItemId = parseInt(match[2], 10);
          workItemTitle = match[3].trim();
        } else if (match.length === 3) {
          // Pattern senza progetto: Type ID: Title
          workItemId = parseInt(match[1], 10);
          workItemTitle = match[2].trim();
        }
        confidence += 0.2;
        break;
      }
    }
    
    // Estrai URL del work item dal body
    let workItemUrl: string | undefined;
    let workItemOrganization: string | undefined;
    
    for (const pattern of URL_PATTERNS) {
      const matches = Array.from(fullContent.matchAll(pattern));
      if (matches.length > 0) {
        const match = matches[0];
        workItemUrl = match[0];
        
        // Estrai org e progetto dall'URL
        if (match.length >= 4) {
          workItemOrganization = match[1];
          if (!workItemProject) workItemProject = match[2];
          if (!workItemId) workItemId = parseInt(match[3], 10);
        }
        confidence += 0.2;
        break;
      }
    }
    
    // Se non abbiamo ID, creiamo comunque metadata parziali
    // così l'email viene categorizzata come DevOps e può essere arricchita con il bookmarklet
    if (!workItemId) {
      const partialMetadata: DevOpsWorkItemMetadata = {
        workItemId: 0, // Placeholder - will be enriched via bookmarklet
        workItemTitle: subject || 'Unknown Work Item',
        workItemUrl: '',
        eventType: 'unknown',
      };
      console.log(`[DevOps Parser] Identified as DevOps email but no Work Item ID extracted. Subject: ${subject}`);
      return { 
        isDevOpsEmail: true, 
        metadata: partialMetadata,
        confidence: 0.4,
        sourceType: 'email_devops_workitem' as const
      };
    }
    
    // Determina il tipo di evento
    let eventType: DevOpsWorkItemMetadata['eventType'] = 'unknown';
    for (const [type, patterns] of Object.entries(EVENT_PATTERNS)) {
      if (patterns.some(p => p.test(fullContent))) {
        eventType = type as DevOpsWorkItemMetadata['eventType'];
        confidence += 0.05;
        break;
      }
    }
    
    // Determina il tipo di work item
    let workItemType: string | undefined;
    for (const [type, pattern] of Object.entries(WORK_ITEM_TYPE_PATTERNS)) {
      if (pattern.test(subject || '') || pattern.test(fullContent)) {
        workItemType = type;
        confidence += 0.05;
        break;
      }
    }
    
    // Estrai altri metadata se presenti
    const assignedToMatch = fullContent.match(/assigned\s+to[:\s]+([^<\n,]+)/i);
    const stateMatch = fullContent.match(/state[:\s]+([^<\n,]+)/i);
    const changedByMatch = fullContent.match(/(?:changed|updated|modified)\s+by[:\s]+([^<\n,]+)/i);
    
    const metadata: DevOpsWorkItemMetadata = {
      workItemId,
      workItemTitle: workItemTitle || `Work Item #${workItemId}`,
      workItemUrl: workItemUrl || `https://dev.azure.com/_workitems/edit/${workItemId}`,
      workItemType,
      workItemProject,
      workItemOrganization,
      eventType,
      assignedTo: assignedToMatch?.[1]?.trim(),
      state: stateMatch?.[1]?.trim(),
      changedBy: changedByMatch?.[1]?.trim(),
    };
    
    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);
    
    console.log(`[DevOps Parser] Parsed Work Item #${workItemId}: ${workItemTitle} (confidence: ${confidence.toFixed(2)})`);
    
    return {
      isDevOpsEmail: true,
      metadata,
      confidence,
      sourceType: 'email_devops_workitem' as const
    };
  }
  
  /**
   * Arricchisce i metadata con dati incollati dall'utente (dal bookmarklet)
   */
  static enrichWithBookmarkletData(
    existingMetadata: DevOpsWorkItemMetadata,
    bookmarkletData: any
  ): DevOpsWorkItemMetadata {
    return {
      ...existingMetadata,
      workItemTitle: bookmarkletData.title || existingMetadata.workItemTitle,
      workItemType: bookmarkletData.workItemType || existingMetadata.workItemType,
      workItemProject: bookmarkletData.project || existingMetadata.workItemProject,
      state: bookmarkletData.state || existingMetadata.state,
      assignedTo: bookmarkletData.assignedTo || existingMetadata.assignedTo,
      description: bookmarkletData.description || existingMetadata.description,
      // Aggiungi i dati arricchiti dal bookmarklet come oggetto separato
      ...{ enrichedData: bookmarkletData }
    } as DevOpsWorkItemMetadata & { enrichedData: any };
  }
}
