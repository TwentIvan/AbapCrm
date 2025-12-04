// AI Task Executor - Generates ABAP code and operational assistance for tasks
// Uses learned patterns from sapObjectContent and aiAbapPatterns

import OpenAI from "openai";
import { db } from "./db";
import { eq, and, sql, desc, or, ilike, inArray } from "drizzle-orm";
import {
  tasks,
  projects,
  sapSystems,
  sapTransportRequests,
  sapTransportObjects,
  sapObjectContent,
  aiAbapPatterns,
  aiTaskExecutions,
  messages,
  messageLinks,
  comments,
  type Task,
  type Project,
  type AiAbapPattern,
  type AiTaskExecution,
  type AiGeneratedFile,
  type AiTaskContext,
} from "@shared/schema";

// Extended context with DevOps, messages, transport requests
interface ExtendedTaskContext extends AiTaskContext {
  // DevOps work item info (full data from linked message)
  devOpsWorkItem?: {
    id: string;
    url: string;
    system: string;
    title?: string;
    description?: string;
    descriptionHtml?: string;
    acceptanceCriteria?: string;
    workItemType?: string;
    state?: string;
    priority?: number;
    iterationPath?: string;
    areaPath?: string;
    tags?: string[];
    attachments?: string[];
    images?: string[]; // Extracted image URLs from description
    sapFields?: Record<string, any>;
    comments?: Array<{
      author?: string;
      content?: string;
      date?: string;
    }>;
  };
  // Linked messages
  linkedMessages?: Array<{
    subject: string;
    content: string;
    fromName?: string;
    date?: string;
    attachments?: string[];
    images?: string[];
  }>;
  // Task comments
  taskComments?: Array<{
    content: string;
    createdAt: string;
  }>;
  // Project transport requests
  projectTransports?: Array<{
    requestNumber: string;
    description: string;
    status: string;
    objects: string[];
  }>;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Result from AI task execution
export interface TaskExecutionResult {
  success: boolean;
  executionId: string;
  analysis: {
    taskType: string;
    complexity: "low" | "medium" | "high";
    suggestedApproach: string;
    estimatedEffort?: number;
    sapModules: string[];
    requiredObjects: string[];
  };
  generatedFiles: AiGeneratedFile[];
  suggestedActions: Array<{
    action: string;
    priority: "high" | "medium" | "low";
    description: string;
  }>;
  patternsUsed: string[];
  error?: string;
  // Context transparency - what the AI received
  contextSummary?: {
    taskInfo: {
      title: string;
      description?: string;
      projectName?: string;
    };
    devOpsWorkItem?: {
      id: string;
      title?: string;
      type?: string;
      state?: string;
      commentsCount?: number;
      hasImages?: boolean;
      imagesCount?: number;
    };
    linkedMessages: Array<{
      subject: string;
      fromName?: string;
      date?: string;
      preview: string;
    }>;
    taskComments: Array<{
      preview: string;
      createdAt: string;
    }>;
    projectTransports: Array<{
      requestNumber: string;
      description: string;
      objectsCount: number;
    }>;
    patternsCount: number;
  };
}

// Get relevant ABAP patterns for a task
async function getRelevantPatterns(
  organizationId: string,
  keywords: string[],
  sapModules: string[] = [],
  limit: number = 5
): Promise<AiAbapPattern[]> {
  // Build search conditions
  const conditions = [
    eq(aiAbapPatterns.organizationId, organizationId),
    eq(aiAbapPatterns.isActive, true),
  ];

  // Search by keywords in name, description, tags
  const keywordConditions = keywords.flatMap(kw => [
    ilike(aiAbapPatterns.name, `%${kw}%`),
    ilike(aiAbapPatterns.description, `%${kw}%`),
  ]);

  const patterns = await db
    .select()
    .from(aiAbapPatterns)
    .where(and(...conditions))
    .orderBy(desc(aiAbapPatterns.qualityScore), desc(aiAbapPatterns.usageCount))
    .limit(limit * 2); // Get more, filter in code

  // Filter by keyword relevance
  const filtered = patterns.filter(p => {
    const searchText = `${p.name} ${p.description || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
    return keywords.some(kw => searchText.includes(kw.toLowerCase())) ||
           sapModules.some(mod => (p.sapModules || []).includes(mod));
  });

  return filtered.slice(0, limit);
}

// Get existing ABAP code from transport objects for learning
// CRITICAL: Must filter by organizationId to prevent tenant data leakage
async function getExistingCodeExamples(
  organizationId: string,
  objectTypes: string[] = [],
  limit: number = 3
): Promise<{ objectName: string; objectType: string; code: string }[]> {
  // Get recent transport objects with code content, filtered by organization
  const results = await db
    .select({
      objectName: sapTransportObjects.objectName,
      objectType: sapTransportObjects.objectType,
      code: sapObjectContent.content,
    })
    .from(sapObjectContent)
    .innerJoin(sapTransportObjects, eq(sapObjectContent.objectId, sapTransportObjects.id))
    .innerJoin(sapTransportRequests, eq(sapTransportObjects.requestId, sapTransportRequests.id))
    .where(and(
      eq(sapObjectContent.contentType, "source"),
      eq(sapTransportRequests.organizationId, organizationId) // Filter by org to prevent tenant leakage
    ))
    .orderBy(desc(sapTransportRequests.createdAt))
    .limit(limit);

  return results.filter(r => r.code && r.code.length > 100);
}

// Get linked messages for a task (from sourceMessageIds)
async function getLinkedMessages(
  sourceMessageIds: string[],
  organizationId: string,
  limit: number = 5
): Promise<ExtendedTaskContext['linkedMessages']> {
  if (!sourceMessageIds || sourceMessageIds.length === 0) return [];
  
  try {
    const linkedMsgs = await db
      .select({
        subject: messages.subject,
        content: messages.body,
        htmlBody: messages.htmlBody,
        fromName: messages.fromName,
        createdAt: messages.createdAt,
        attachments: messages.attachments,
        externalMetadata: messages.externalMetadata,
      })
      .from(messages)
      .where(and(
        inArray(messages.id, sourceMessageIds),
        eq(messages.organizationId, organizationId)
      ))
      .limit(limit);

    return linkedMsgs.map(m => {
      // Extract images from HTML body if present
      const images: string[] = [];
      if (m.htmlBody) {
        const imgMatches = m.htmlBody.match(/<img[^>]+src=["']([^"']+)["']/gi);
        if (imgMatches) {
          imgMatches.slice(0, 5).forEach(match => {
            const srcMatch = match.match(/src=["']([^"']+)["']/i);
            if (srcMatch?.[1] && !srcMatch[1].startsWith('data:')) {
              images.push(srcMatch[1]);
            }
          });
        }
      }
      
      // Also check externalMetadata for DevOps images
      const extMeta = m.externalMetadata as any;
      if (extMeta?.enrichedData?.images) {
        images.push(...(extMeta.enrichedData.images as string[]).slice(0, 5 - images.length));
      }

      return {
        subject: m.subject || '',
        content: (m.content || '').substring(0, 2000), // Truncate for prompt
        fromName: m.fromName || undefined,
        date: m.createdAt?.toISOString(),
        attachments: m.attachments || undefined,
        images: images.length > 0 ? images : undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching linked messages:', error);
    return [];
  }
}

// Get messages linked via messageLinks table (for task or project)
// This retrieves messages associated through the MessageHistory feature
async function getMessageHistoryLinks(
  tableName: string,
  recordId: string,
  organizationId: string,
  limit: number = 10
): Promise<ExtendedTaskContext['linkedMessages']> {
  try {
    // Query messageLinks to get linked message IDs
    const links = await db
      .select({
        messageId: messageLinks.messageId,
        linkType: messageLinks.linkType,
      })
      .from(messageLinks)
      .where(and(
        eq(messageLinks.linkedTableName, tableName),
        eq(messageLinks.linkedRecordId, recordId),
        eq(messageLinks.organizationId, organizationId)
      ))
      .limit(limit);

    if (links.length === 0) return [];

    const messageIds = links.map(l => l.messageId);
    
    // Fetch the actual messages with attachments
    const linkedMsgs = await db
      .select({
        id: messages.id,
        subject: messages.subject,
        content: messages.body,
        htmlBody: messages.htmlBody,
        fromName: messages.fromName,
        createdAt: messages.createdAt,
        attachments: messages.attachments,
        externalMetadata: messages.externalMetadata,
      })
      .from(messages)
      .where(and(
        inArray(messages.id, messageIds),
        eq(messages.organizationId, organizationId)
      ));

    return linkedMsgs.map(m => {
      // Extract meaningful content - prefer body over HTML
      let content = m.content || '';
      
      // Extract images from HTML body
      const images: string[] = [];
      if (m.htmlBody) {
        const imgMatches = m.htmlBody.match(/<img[^>]+src=["']([^"']+)["']/gi);
        if (imgMatches) {
          imgMatches.slice(0, 5).forEach(match => {
            const srcMatch = match.match(/src=["']([^"']+)["']/i);
            if (srcMatch?.[1] && !srcMatch[1].startsWith('data:')) {
              images.push(srcMatch[1]);
            }
          });
        }
      }
      
      // If HTML body exists and body is empty, extract text from HTML
      if (!content && m.htmlBody) {
        // Basic HTML to text conversion
        content = m.htmlBody
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // Check for DevOps metadata
      const metadata = m.externalMetadata as any;
      if (metadata) {
        // Include DevOps description if available
        if (metadata.description && metadata.description.length > content.length) {
          content = metadata.description;
        }
        // Extract DevOps images
        if (metadata.enrichedData?.images) {
          images.push(...(metadata.enrichedData.images as string[]).slice(0, 5 - images.length));
        }
        // Include work item title in subject if available
        if (metadata.workItemTitle && !m.subject) {
          return {
            subject: `[DevOps] ${metadata.workItemTitle}`,
            content: content.substring(0, 3000),
            fromName: metadata.assignedTo || m.fromName || undefined,
            date: m.createdAt?.toISOString(),
            attachments: m.attachments || undefined,
            images: images.length > 0 ? images : undefined,
          };
        }
      }
      
      return {
        subject: m.subject || '',
        content: content.substring(0, 3000), // Slightly larger limit for message history
        fromName: m.fromName || undefined,
        date: m.createdAt?.toISOString(),
        attachments: m.attachments || undefined,
        images: images.length > 0 ? images : undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching message history links:', error);
    return [];
  }
}

// Get full DevOps work item data from linked message or by searching for the work item
// The message's externalMetadata contains the enriched DevOps data from the bookmarklet
async function getFullDevOpsWorkItemData(
  sourceMessageIds: string[],
  externalWorkItemId: string,
  organizationId: string
): Promise<ExtendedTaskContext['devOpsWorkItem'] | undefined> {
  if (!externalWorkItemId) {
    return undefined;
  }

  try {
    let devOpsMessages: Array<{
      id: string;
      externalMetadata: unknown;
      sourceType: string | null;
    }> = [];

    // Strategy 1: Look in linked source messages first
    if (sourceMessageIds && sourceMessageIds.length > 0) {
      devOpsMessages = await db
        .select({
          id: messages.id,
          externalMetadata: messages.externalMetadata,
          sourceType: messages.sourceType,
        })
        .from(messages)
        .where(and(
          inArray(messages.id, sourceMessageIds),
          eq(messages.organizationId, organizationId)
        ));
    }

    // Strategy 2: If not found in sourceMessageIds, search by workItemId in organization
    if (devOpsMessages.length === 0) {
      devOpsMessages = await db
        .select({
          id: messages.id,
          externalMetadata: messages.externalMetadata,
          sourceType: messages.sourceType,
        })
        .from(messages)
        .where(and(
          eq(messages.organizationId, organizationId),
          eq(messages.sourceType, 'email_devops_workitem'),
          sql`${messages.externalMetadata}->>'workItemId' = ${externalWorkItemId}`
        ))
        .limit(1);
    }

    console.log(`[AI-EXECUTOR] Found ${devOpsMessages.length} DevOps messages for WI ${externalWorkItemId}`);
    
    // Find the message with matching workItemId
    for (const msg of devOpsMessages) {
      const metadata = msg.externalMetadata as any;
      if (!metadata) {
        console.log(`[AI-EXECUTOR] Message ${msg.id} has no metadata`);
        continue;
      }

      // Check if this message has the DevOps work item data
      const workItemId = metadata.workItemId || metadata.enrichedData?.workItemId;
      console.log(`[AI-EXECUTOR] Checking message ${msg.id}: workItemId=${workItemId}, looking for ${externalWorkItemId}`);
      
      if (String(workItemId) === String(externalWorkItemId)) {
        // Extract images from HTML description - check multiple locations including enrichedData from bookmarklet
        const descriptionHtml = metadata.workItemDescriptionHtml || 
                                 metadata.descriptionHtml || 
                                 metadata.enrichedData?.descriptionHtml || 
                                 '';
        
        console.log(`[AI-EXECUTOR] DevOps WI ${externalWorkItemId}: descriptionHtml length = ${descriptionHtml.length}`);
        console.log(`[AI-EXECUTOR] Source: workItemDescriptionHtml=${!!metadata.workItemDescriptionHtml}, descriptionHtml=${!!metadata.descriptionHtml}, enrichedData=${!!metadata.enrichedData?.descriptionHtml}`);
        
        const images: string[] = [];
        
        // Extract image URLs (both base64 and external URLs)
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        let match;
        while ((match = imgRegex.exec(descriptionHtml)) !== null) {
          const src = match[1];
          // Keep first 5 images, allow base64 up to 500KB (about 700K chars)
          if (images.length < 5 && (!src.startsWith('data:') || src.length < 700000)) {
            images.push(src);
          }
        }
        
        console.log(`[AI-EXECUTOR] DevOps WI ${externalWorkItemId}: found ${images.length} images in description`);
        if (images.length > 0) {
          console.log(`[AI-EXECUTOR] Image URLs: ${images.map(img => img.startsWith('data:') ? `base64(${Math.round(img.length/1024)}KB)` : img.substring(0, 100)).join(', ')}`);
        }

        // Merge data from both direct metadata and enrichedData (from bookmarklet)
        const enriched = metadata.enrichedData || {};
        
        // Build the full DevOps context
        return {
          id: String(workItemId),
          url: metadata.workItemUrl || enriched.url || '',
          system: 'azure_devops',
          title: metadata.workItemTitle || enriched.workItemTitle || undefined,
          description: metadata.description || enriched.descriptionText || undefined,
          descriptionHtml: descriptionHtml.substring(0, 15000), // Limit for prompt
          acceptanceCriteria: metadata.acceptanceCriteria || enriched.acceptanceCriteria || undefined,
          workItemType: metadata.workItemType || enriched.workItemType || undefined,
          state: metadata.state || enriched.state || undefined,
          priority: metadata.priority || enriched.customFields?.Priority || undefined,
          iterationPath: metadata.iterationPath || enriched.iterationPath || undefined,
          areaPath: metadata.areaPath || enriched.areaPath || undefined,
          tags: metadata.tags || enriched.tags || undefined,
          images: images.length > 0 ? images : undefined,
          sapFields: {
            ticketCode: metadata.ticketCode || enriched.ticketCode,
            wbsCode: metadata.wbsCode || enriched.wbsCode,
            ticketType: metadata.ticketType || enriched.ticketType,
            ...(metadata.customFields || enriched.customFields || {}),
          },
          comments: (metadata.workItemComments || enriched.comments || []).slice(0, 10).map((c: any) => ({
            author: c.author,
            content: c.content?.substring(0, 1000) || c.contentHtml?.substring(0, 1000),
            date: c.date,
          })),
        };
      }
    }

    return undefined;
  } catch (error) {
    console.error('Error fetching DevOps work item data:', error);
    return undefined;
  }
}

// Get comments for a task (with organization scoping via task ownership)
async function getTaskComments(
  taskId: string,
  organizationId: string,
  limit: number = 10
): Promise<ExtendedTaskContext['taskComments']> {
  try {
    // Join with tasks to ensure the task belongs to the organization
    const taskComments = await db
      .select({
        content: comments.content,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(tasks, eq(comments.taskId, tasks.id))
      .where(and(
        eq(comments.taskId, taskId),
        eq(tasks.organizationId, organizationId)
      ))
      .orderBy(desc(comments.createdAt))
      .limit(limit);

    return taskComments.map(c => ({
      content: c.content.substring(0, 1000),
      createdAt: c.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching task comments:', error);
    return [];
  }
}

// Get transport requests for a project
async function getProjectTransports(
  projectId: string,
  organizationId: string,
  limit: number = 5
): Promise<ExtendedTaskContext['projectTransports']> {
  try {
    const transports = await db
      .select({
        requestNumber: sapTransportRequests.requestNumber,
        description: sapTransportRequests.description,
        status: sapTransportRequests.status,
        id: sapTransportRequests.id,
      })
      .from(sapTransportRequests)
      .where(and(
        eq(sapTransportRequests.projectId, projectId),
        eq(sapTransportRequests.organizationId, organizationId)
      ))
      .orderBy(desc(sapTransportRequests.createdAt))
      .limit(limit);

    // Get objects for each transport
    const results: ExtendedTaskContext['projectTransports'] = [];
    for (const tr of transports) {
      const objects = await db
        .select({ objectName: sapTransportObjects.objectName })
        .from(sapTransportObjects)
        .where(eq(sapTransportObjects.requestId, tr.id))
        .limit(20);

      results.push({
        requestNumber: tr.requestNumber,
        description: tr.description || '',
        status: tr.status || 'unknown',
        objects: objects.map(o => o.objectName),
      });
    }

    return results;
  } catch (error) {
    console.error('Error fetching project transports:', error);
    return [];
  }
}

// Extract keywords from task context
function extractKeywords(context: AiTaskContext): string[] {
  const text = `${context.taskTitle} ${context.taskDescription || ''} ${context.projectDescription || ''}`;
  
  // SAP-specific keywords
  const sapKeywords = [
    'alv', 'report', 'bapi', 'rfc', 'idoc', 'bdc', 'smartform', 'adobe',
    'fiori', 'odata', 'cds', 'amdp', 'hana', 'enhancement', 'badi',
    'user-exit', 'function module', 'class', 'interface', 'screen',
    'selection-screen', 'table', 'structure', 'domain', 'data element',
    'mm', 'sd', 'fi', 'co', 'hr', 'pm', 'qm', 'pp', 'wm', 'ewm',
    'extraction', 'report', 'form', 'print', 'email', 'workflow'
  ];

  const found = sapKeywords.filter(kw => 
    text.toLowerCase().includes(kw.toLowerCase())
  );

  // Extract additional meaningful words
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['this', 'that', 'with', 'from', 'have', 'been'].includes(w));

  const combined = [...found, ...words.slice(0, 10)];
  return Array.from(new Set(combined));
}

// Build AI prompt for task execution with extended context
function buildTaskExecutionPrompt(
  context: ExtendedTaskContext,
  patterns: AiAbapPattern[],
  codeExamples: { objectName: string; objectType: string; code: string }[]
): string {
  const patternsSection = patterns.length > 0
    ? patterns.map(p => `
### Pattern: ${p.name} (${p.category})
Descrizione: ${p.description || 'N/A'}
Tags: ${(p.tags || []).join(', ')}
Moduli SAP: ${(p.sapModules || []).join(', ')}
Prerequisiti: ${(p.prerequisites || []).join(', ')}
Template:
\`\`\`abap
${p.codeTemplate.substring(0, 2000)}${p.codeTemplate.length > 2000 ? '\n... (troncato)' : ''}
\`\`\`
`).join('\n')
    : '(Nessun pattern disponibile)';

  const codeExamplesSection = codeExamples.length > 0
    ? codeExamples.map(e => `
### ${e.objectType}: ${e.objectName}
\`\`\`abap
${e.code.substring(0, 1500)}${e.code.length > 1500 ? '\n... (troncato)' : ''}
\`\`\`
`).join('\n')
    : '(Nessun esempio di codice disponibile)';

  // Build DevOps section with full data
  let devOpsSection = '';
  if (context.devOpsWorkItem) {
    const wi = context.devOpsWorkItem;
    const sapFieldsStr = wi.sapFields && Object.keys(wi.sapFields).length > 0
      ? `\nCampi SAP Custom: ${JSON.stringify(wi.sapFields, null, 2)}`
      : '';
    const tagsStr = wi.tags?.length ? `\nTags: ${wi.tags.join(', ')}` : '';
    // Format images for the prompt - include actual URLs/base64 data
    let imagesStr = '';
    if (wi.images?.length) {
      imagesStr = `\n\n### IMMAGINI DALLA DESCRIZIONE DEVOPS (${wi.images.length}):`;
      wi.images.forEach((img, idx) => {
        if (img.startsWith('data:image')) {
          // Base64 image - include it for visual AI models
          imagesStr += `\n[Immagine ${idx + 1}]: ${img.substring(0, 100)}... (base64 data - ${Math.round(img.length / 1024)}KB)`;
        } else {
          // URL image - include full URL
          imagesStr += `\n[Immagine ${idx + 1}]: ${img}`;
        }
      });
      imagesStr += '\n(Queste immagini sono disponibili per analisi visiva)';
    }
    
    // DevOps comments section
    const commentsStr = wi.comments?.length
      ? `\n\n### COMMENTI DAL WORK ITEM DEVOPS:
${wi.comments.map((c, i) => `[${i + 1}] ${c.author || 'Anonimo'} (${c.date || 'N/A'}): ${c.content || ''}`).join('\n')}`
      : '';

    devOpsSection = `## AZURE DEVOPS WORK ITEM (DATI COMPLETI)
ID: ${wi.id}
URL: ${wi.url}
Tipo: ${wi.workItemType || 'N/A'}
Stato: ${wi.state || 'N/A'}
Priorità: ${wi.priority || 'N/A'}
Iteration Path: ${wi.iterationPath || 'N/A'}
Area Path: ${wi.areaPath || 'N/A'}${tagsStr}

### TITOLO:
${wi.title || 'N/A'}

### DESCRIZIONE COMPLETA:
${wi.description || wi.descriptionHtml?.replace(/<[^>]*>/g, ' ').substring(0, 5000) || 'N/A'}
${imagesStr}

### CRITERI DI ACCETTAZIONE:
${wi.acceptanceCriteria || 'Non specificati'}
${sapFieldsStr}${commentsStr}`;
  }

  // Build messages section with attachment/image info
  const messagesSection = context.linkedMessages?.length
    ? `## MESSAGGI COLLEGATI (email/conversazioni)
${context.linkedMessages.map(m => {
  const attachInfo = m.attachments?.length ? `[${m.attachments.length} allegati]` : '';
  const imgInfo = m.images?.length ? `[${m.images.length} immagini]` : '';
  const extras = [attachInfo, imgInfo].filter(Boolean).join(' ');
  return `
### ${m.subject || 'Senza oggetto'} ${extras}
Da: ${m.fromName || 'Sconosciuto'} | Data: ${m.date || 'N/A'}
${m.content.substring(0, 1000)}${m.content.length > 1000 ? '\n... (troncato)' : ''}
${m.attachments?.length ? `Allegati: ${m.attachments.join(', ')}` : ''}`;
}).join('\n')}`
    : '';

  // Build comments section
  const commentsSection = context.taskComments?.length
    ? `## COMMENTI SUL TASK
${context.taskComments.map(c => `
[${c.createdAt}] ${c.content}
`).join('\n')}`
    : '';

  // Build transport requests section
  const transportsSection = context.projectTransports?.length
    ? `## TRANSPORT REQUEST DEL PROGETTO
${context.projectTransports.map(tr => `
### ${tr.requestNumber} (${tr.status})
Descrizione: ${tr.description}
Oggetti: ${tr.objects.slice(0, 10).join(', ')}${tr.objects.length > 10 ? ` ... e altri ${tr.objects.length - 10}` : ''}
`).join('\n')}`
    : '';

  // Build chat clarifications section (from previous chat interaction)
  const chatClarificationsSection = context.chatClarifications
    ? `## CHIARIMENTI DALLA CHAT (IMPORTANTE!)
L'utente ha chiesto chiarimenti prima di rigenerare il codice. Considera queste informazioni come prioritarie:

${context.chatClarifications}

**ATTENZIONE**: Usa questi chiarimenti per generare un codice più accurato e allineato alle aspettative dell'utente.`
    : '';

  return `Sei un esperto sviluppatore SAP ABAP con oltre 15 anni di esperienza.
Il tuo compito è analizzare un task e generare codice ABAP di alta qualità.

## TASK DA ESEGUIRE
Titolo: ${context.taskTitle}
Descrizione: ${context.taskDescription || 'Non specificata'}
Progetto: ${context.projectName || 'N/A'}
Descrizione Progetto: ${context.projectDescription || 'N/A'}
Sistema SAP: ${context.sapSystemName || 'N/A'}
Moduli SAP: ${(context.sapModules || []).join(', ') || 'N/A'}
Istruzioni Aggiuntive: ${context.customInstructions || 'Nessuna'}

${chatClarificationsSection}

${devOpsSection}

${messagesSection}

${commentsSection}

${transportsSection}

## PATTERN APPRESI (usa come riferimento)
${patternsSection}

## ESEMPI DI CODICE ESISTENTE (stile dell'organizzazione)
${codeExamplesSection}

## ISTRUZIONI PER LA GENERAZIONE

1. **Analisi**: Analizza TUTTI i dati disponibili sopra (task, DevOps, messaggi, commenti, transports) e identifica:
   - Tipo di sviluppo richiesto (report, function module, class, enhancement, etc.)
   - Complessità (low/medium/high)
   - Moduli SAP coinvolti
   - Oggetti SAP necessari (tabelle, function module, classi, etc.)

2. **Generazione Codice**: Genera codice ABAP completo e funzionante:
   - Segui le best practice SAP e i pattern appresi
   - Includi commenti dettagliati in italiano
   - Gestisci correttamente le eccezioni
   - Usa naming convention SAP standard (Z*, Y*)
   - Considera i criteri di accettazione da DevOps se presenti

3. **Output Files**: Per ogni oggetto generato, fornisci:
   - Nome file (es. ZREPORT_VENDITE.abap)
   - Tipo oggetto (PROG, FUGR, CLAS, etc.)
   - Codice completo

4. **Azioni Suggerite**: Elenca i passi successivi per implementare la soluzione

## FORMATO RISPOSTA (JSON)

**IMPORTANTE - ESCAPE CORRETTO DEL JSON:**
- Usa \\n per i newline nel codice (NON newline reali nelle stringhe JSON)
- Usa \\\\ per i backslash singoli
- Usa \\" per le virgolette dentro le stringhe
- NON usare newline o tab reali dentro i valori stringa JSON

ESEMPIO CORRETTO:
{
  "analysis": {
    "taskType": "report|function_module|class|enhancement|bapi|alv|other",
    "complexity": "low|medium|high",
    "suggestedApproach": "Descrizione dell'approccio suggerito",
    "estimatedEffort": 8,
    "sapModules": ["MM", "SD"],
    "requiredObjects": ["MARA", "VBAK", "BAPI_..."]
  },
  "generatedFiles": [
    {
      "filename": "ZREPORT_ESEMPIO.abap",
      "language": "ABAP",
      "objectType": "PROG",
      "description": "Report principale per...",
      "content": "REPORT zreport_esempio.\\nDATA: lv_var TYPE string.\\nSTART-OF-SELECTION.\\n  WRITE: 'Hello'.\\n"
    }
  ],
  "suggestedActions": [
    {
      "action": "Creare oggetto nel sistema",
      "priority": "high",
      "description": "Creare il report ZREPORT_ESEMPIO in SE38"
    }
  ]
}

Rispondi SOLO con il JSON valido, senza markdown, backticks o altro testo. Assicurati che il JSON sia parsabile.`;
}

// Execute AI analysis and code generation for tasks
export async function executeTaskWithAI(
  taskIds: string[],
  userId: string,
  organizationId: string,
  customInstructions?: string,
  chatClarifications?: string
): Promise<TaskExecutionResult[]> {
  const results: TaskExecutionResult[] = [];

  for (const taskId of taskIds) {
    try {
      // Get task with project context - MUST filter by organizationId for tenant isolation
      const task = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.organizationId, organizationId)
        ))
        .limit(1);

      if (!task[0]) {
        results.push({
          success: false,
          executionId: '',
          analysis: {
            taskType: 'unknown',
            complexity: 'low',
            suggestedApproach: '',
            sapModules: [],
            requiredObjects: [],
          },
          generatedFiles: [],
          suggestedActions: [],
          patternsUsed: [],
          error: `Task ${taskId} non trovato`,
        });
        continue;
      }

      const taskData = task[0];

      // Get project if linked - MUST filter by organizationId for tenant isolation
      let projectData: Project | null = null;
      if (taskData.projectId) {
        const project = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, taskData.projectId),
            eq(projects.organizationId, organizationId)
          ))
          .limit(1);
        projectData = project[0] || null;
      }

      // Build extended context with all available data
      const context: ExtendedTaskContext = {
        taskTitle: taskData.title,
        taskDescription: taskData.description || undefined,
        projectName: projectData?.name,
        projectDescription: projectData?.description || undefined,
        sapSystemId: projectData?.sapSystemId || undefined,
        customInstructions,
        chatClarifications,
      };

      // Get SAP system info if available - MUST filter by organizationId for tenant isolation
      if (context.sapSystemId) {
        const sapSystem = await db
          .select()
          .from(sapSystems)
          .where(and(
            eq(sapSystems.id, context.sapSystemId),
            eq(sapSystems.organizationId, organizationId)
          ))
          .limit(1);
        if (sapSystem[0]) {
          context.sapSystemName = sapSystem[0].name;
        }
      }

      // === EXTENDED CONTEXT: DevOps work item (full data from linked message or by searching) ===
      // Strategy 1: Task has direct externalWorkItemId
      if (taskData.externalWorkItemId) {
        const fullDevOpsData = await getFullDevOpsWorkItemData(
          taskData.sourceMessageIds || [],
          taskData.externalWorkItemId,
          organizationId
        );
        if (fullDevOpsData) {
          context.devOpsWorkItem = fullDevOpsData;
          console.log(`[THU-AI] Loaded full DevOps data for Work Item #${fullDevOpsData.id}: ${fullDevOpsData.images?.length || 0} images, ${fullDevOpsData.comments?.length || 0} comments`);
        } else if (taskData.externalSystem) {
          context.devOpsWorkItem = {
            id: taskData.externalWorkItemId,
            url: taskData.externalWorkItemUrl || '',
            system: taskData.externalSystem,
          };
          console.log(`[THU-AI] Using basic DevOps data for Work Item #${taskData.externalWorkItemId} (no enriched message found)`);
        }
      }
      
      // Strategy 2: If no DevOps data from task, try to inherit from project's sourceMessageIds
      if (!context.devOpsWorkItem && projectData?.sourceMessageIds && projectData.sourceMessageIds.length > 0) {
        console.log(`[THU-AI] No DevOps on task, checking project's sourceMessageIds: ${projectData.sourceMessageIds.join(', ')}`);
        
        // Get messages linked to the project and check for DevOps data
        const projectMessages = await db
          .select({
            id: messages.id,
            externalMetadata: messages.externalMetadata,
            sourceType: messages.sourceType,
          })
          .from(messages)
          .where(and(
            inArray(messages.id, projectData.sourceMessageIds),
            eq(messages.organizationId, organizationId)
          ));
        
        for (const msg of projectMessages) {
          const metadata = msg.externalMetadata as any;
          if (!metadata) continue;
          
          // Check if this message has DevOps work item data
          const workItemId = metadata.workItemId || metadata.enrichedData?.workItemId;
          if (workItemId) {
            console.log(`[THU-AI] Found DevOps WI #${workItemId} in project's message ${msg.id}`);
            
            // Get full DevOps data using the found workItemId
            const fullDevOpsData = await getFullDevOpsWorkItemData(
              [msg.id],
              String(workItemId),
              organizationId
            );
            
            if (fullDevOpsData) {
              context.devOpsWorkItem = fullDevOpsData;
              console.log(`[THU-AI] Inherited DevOps data from project: WI #${fullDevOpsData.id}, ${fullDevOpsData.images?.length || 0} images`);
              break;
            }
          }
        }
      }

      // === EXTENDED CONTEXT: Linked messages ===
      // Combine messages from sourceMessageIds AND messageLinks table
      const allLinkedMessages: NonNullable<ExtendedTaskContext['linkedMessages']> = [];
      
      // 1. Get messages from task.sourceMessageIds (direct link)
      if (taskData.sourceMessageIds && taskData.sourceMessageIds.length > 0) {
        const directLinkedMessages = await getLinkedMessages(
          taskData.sourceMessageIds,
          organizationId
        );
        if (directLinkedMessages && directLinkedMessages.length > 0) {
          allLinkedMessages.push(...directLinkedMessages);
          console.log(`[THU-AI] Found ${directLinkedMessages.length} direct linked messages from sourceMessageIds`);
        }
      }
      
      // 2. Get messages from messageLinks table (MessageHistory feature)
      const taskHistoryMessages = await getMessageHistoryLinks('tasks', taskId, organizationId);
      if (taskHistoryMessages && taskHistoryMessages.length > 0) {
        // Deduplicate by subject+date to avoid duplicates
        const existingKeys = new Set(allLinkedMessages.map(m => `${m.subject}|${m.date}`));
        const newMessages = taskHistoryMessages.filter(m => !existingKeys.has(`${m.subject}|${m.date}`));
        allLinkedMessages.push(...newMessages);
        console.log(`[THU-AI] Found ${taskHistoryMessages.length} messages from task MessageHistory (${newMessages.length} new)`);
      }
      
      // 3. Also get messages from project's messageLinks (project-level context)
      if (taskData.projectId) {
        const projectHistoryMessages = await getMessageHistoryLinks('projects', taskData.projectId, organizationId);
        if (projectHistoryMessages && projectHistoryMessages.length > 0) {
          const existingKeys = new Set(allLinkedMessages.map(m => `${m.subject}|${m.date}`));
          const newMessages = projectHistoryMessages.filter(m => !existingKeys.has(`${m.subject}|${m.date}`));
          allLinkedMessages.push(...newMessages);
          console.log(`[THU-AI] Found ${projectHistoryMessages.length} messages from project MessageHistory (${newMessages.length} new)`);
        }
      }
      
      context.linkedMessages = allLinkedMessages;
      console.log(`[THU-AI] Total linked messages for context: ${allLinkedMessages.length}`);

      // === EXTENDED CONTEXT: Task comments ===
      context.taskComments = await getTaskComments(taskId, organizationId);

      // === EXTENDED CONTEXT: Project transport requests ===
      if (taskData.projectId) {
        context.projectTransports = await getProjectTransports(
          taskData.projectId,
          organizationId
        );
      }

      // Extract keywords and get relevant patterns
      const keywords = extractKeywords(context);
      const patterns = await getRelevantPatterns(organizationId, keywords);
      const codeExamples = await getExistingCodeExamples(organizationId);

      // Create execution record
      const [execution] = await db
        .insert(aiTaskExecutions)
        .values({
          organizationId,
          userId,
          taskId,
          status: "processing",
          taskContext: context,
          patternsUsed: patterns.map(p => p.id),
          startedAt: new Date(),
        })
        .returning();

      // Build prompt and call AI
      const prompt = buildTaskExecutionPrompt(context, patterns, codeExamples);

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Sei un esperto sviluppatore SAP ABAP. Rispondi sempre in italiano. Output SOLO JSON valido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 8000,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Parse AI response
      let aiResult: any;
      try {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let jsonStr = jsonMatch[0];
          
          // Fix common JSON escaping issues in AI responses
          // Replace unescaped newlines inside strings
          jsonStr = jsonStr.replace(/:\s*"([^"]*?)(?<!\\)\n([^"]*?)"/g, (match, before, after) => {
            return `: "${before}\\n${after}"`;
          });
          
          // Fix unescaped backslashes that aren't part of valid escape sequences
          jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
          
          // Fix unescaped control characters
          jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (char) => {
            if (char === '\n') return '\\n';
            if (char === '\r') return '\\r';
            if (char === '\t') return '\\t';
            return '';
          });
          
          try {
            aiResult = JSON.parse(jsonStr);
          } catch (innerError) {
            // If still failing, try a more aggressive cleanup
            console.error('[AI-EXECUTOR] First parse attempt failed, trying aggressive cleanup');
            
            // Try to parse without code blocks (just get the structure)
            const safeJson = jsonStr
              .replace(/"content"\s*:\s*"[^"]*(?:\\.[^"]*)*"/g, '"content": "[code removed for parsing]"')
              .replace(/"code"\s*:\s*"[^"]*(?:\\.[^"]*)*"/g, '"code": "[code removed for parsing]"');
            
            try {
              aiResult = JSON.parse(safeJson);
              console.log('[AI-EXECUTOR] Parsed with code content removed');
            } catch (safeError) {
              // Last resort: extract key fields manually and include raw response
              console.error('[AI-EXECUTOR] Safe parse also failed, extracting manually');
              console.log('[AI-EXECUTOR] Raw content sample:', content.substring(0, 500));
              
              const taskTypeMatch = jsonStr.match(/"taskType"\s*:\s*"([^"]+)"/);
              const complexityMatch = jsonStr.match(/"complexity"\s*:\s*"([^"]+)"/);
              const approachMatch = jsonStr.match(/"suggestedApproach"\s*:\s*"([^"]*?)(?:"|$)/);
              
              // Try to extract code blocks from the raw response
              const codeBlockMatch = content.match(/```abap\n([\s\S]*?)```/i);
              const generatedFiles = [];
              
              if (codeBlockMatch) {
                generatedFiles.push({
                  filename: 'ZGENERATED_CODE.abap',
                  language: 'ABAP',
                  objectType: 'PROG',
                  description: 'Codice estratto dalla risposta AI (parsing parziale)',
                  content: codeBlockMatch[1].trim(),
                });
                console.log('[AI-EXECUTOR] Extracted ABAP code block from markdown');
              }
              
              aiResult = {
                analysis: {
                  taskType: taskTypeMatch?.[1] || 'extraction',
                  complexity: complexityMatch?.[1] || 'medium',
                  suggestedApproach: approachMatch?.[1] || 'Vedere risposta AI completa nel contesto',
                  sapModules: [],
                  requiredObjects: [],
                  rawResponse: content.substring(0, 10000), // Store raw response for manual review
                },
                generatedFiles,
                suggestedActions: [{ 
                  action: 'review_raw', 
                  priority: 'high',
                  description: 'La risposta AI è stata parzialmente elaborata - verifica il codice estratto' 
                }],
              };
              console.log('[AI-EXECUTOR] Extracted basic structure manually, found ' + generatedFiles.length + ' code blocks');
            }
          }
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        // Update execution with error
        await db
          .update(aiTaskExecutions)
          .set({
            status: "failed",
            completedAt: new Date(),
            analysisResult: { error: 'Parsing failed', raw: content.substring(0, 1000) },
          })
          .where(eq(aiTaskExecutions.id, execution.id));

        results.push({
          success: false,
          executionId: execution.id,
          analysis: {
            taskType: 'unknown',
            complexity: 'low',
            suggestedApproach: '',
            sapModules: [],
            requiredObjects: [],
          },
          generatedFiles: [],
          suggestedActions: [],
          patternsUsed: patterns.map(p => p.id),
          error: `Errore parsing risposta AI: ${parseError}`,
        });
        continue;
      }

      // Update execution with results
      await db
        .update(aiTaskExecutions)
        .set({
          status: "completed",
          completedAt: new Date(),
          generatedFiles: aiResult.generatedFiles || [],
          analysisResult: aiResult.analysis,
          suggestedActions: aiResult.suggestedActions || [],
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
        })
        .where(eq(aiTaskExecutions.id, execution.id));

      // Update pattern usage statistics
      for (const pattern of patterns) {
        await db
          .update(aiAbapPatterns)
          .set({
            usageCount: sql`${aiAbapPatterns.usageCount} + 1`,
            lastUsedAt: new Date(),
          })
          .where(eq(aiAbapPatterns.id, pattern.id));
      }

      // Build context summary for transparency
      const contextSummary: TaskExecutionResult['contextSummary'] = {
        taskInfo: {
          title: taskData.title,
          description: taskData.description || undefined,
          projectName: projectData?.name || undefined,
        },
        devOpsWorkItem: context.devOpsWorkItem ? {
          id: context.devOpsWorkItem.id,
          title: context.devOpsWorkItem.title,
          type: context.devOpsWorkItem.workItemType,
          state: context.devOpsWorkItem.state,
          commentsCount: context.devOpsWorkItem.comments?.length || 0,
          hasImages: (context.devOpsWorkItem.images?.length || 0) > 0,
          imagesCount: context.devOpsWorkItem.images?.length || 0,
        } : undefined,
        linkedMessages: (context.linkedMessages || []).map(m => ({
          subject: m.subject,
          fromName: m.fromName,
          date: m.date,
          preview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
          hasAttachments: (m.attachments?.length || 0) > 0,
          attachmentsCount: m.attachments?.length || 0,
          hasImages: (m.images?.length || 0) > 0,
          imagesCount: m.images?.length || 0,
        })),
        taskComments: (context.taskComments || []).map(c => ({
          preview: c.content.substring(0, 150) + (c.content.length > 150 ? '...' : ''),
          createdAt: c.createdAt,
        })),
        projectTransports: (context.projectTransports || []).map(t => ({
          requestNumber: t.requestNumber,
          description: t.description,
          objectsCount: t.objects.length,
        })),
        patternsCount: patterns.length,
      };

      results.push({
        success: true,
        executionId: execution.id,
        analysis: aiResult.analysis || {
          taskType: 'unknown',
          complexity: 'medium',
          suggestedApproach: '',
          sapModules: [],
          requiredObjects: [],
        },
        generatedFiles: aiResult.generatedFiles || [],
        suggestedActions: aiResult.suggestedActions || [],
        patternsUsed: patterns.map(p => p.id),
        contextSummary,
      });

    } catch (error: any) {
      results.push({
        success: false,
        executionId: '',
        analysis: {
          taskType: 'unknown',
          complexity: 'low',
          suggestedApproach: '',
          sapModules: [],
          requiredObjects: [],
        },
        generatedFiles: [],
        suggestedActions: [],
        patternsUsed: [],
        error: error.message || 'Errore sconosciuto',
      });
    }
  }

  return results;
}

// Submit feedback for an execution (approve/reject)
export async function submitExecutionFeedback(
  executionId: string,
  approved: boolean,
  feedback?: string,
  rating?: number
): Promise<void> {
  const [execution] = await db
    .select()
    .from(aiTaskExecutions)
    .where(eq(aiTaskExecutions.id, executionId))
    .limit(1);

  if (!execution) {
    throw new Error('Execution not found');
  }

  // Update execution
  await db
    .update(aiTaskExecutions)
    .set({
      status: approved ? "approved" : "rejected",
      userFeedback: feedback,
      userRating: rating,
      updatedAt: new Date(),
    })
    .where(eq(aiTaskExecutions.id, executionId));

  // Update pattern statistics
  const patternsUsed = execution.patternsUsed as string[] || [];
  for (const patternId of patternsUsed) {
    await db
      .update(aiAbapPatterns)
      .set(approved
        ? { successCount: sql`${aiAbapPatterns.successCount} + 1` }
        : { failureCount: sql`${aiAbapPatterns.failureCount} + 1` }
      )
      .where(eq(aiAbapPatterns.id, patternId));

    // Recalculate quality score
    const [pattern] = await db
      .select()
      .from(aiAbapPatterns)
      .where(eq(aiAbapPatterns.id, patternId))
      .limit(1);

    if (pattern) {
      const total = pattern.successCount + pattern.failureCount;
      const score = total > 0 ? pattern.successCount / total : 1.0;
      await db
        .update(aiAbapPatterns)
        .set({ qualityScore: score.toFixed(2) })
        .where(eq(aiAbapPatterns.id, patternId));
    }
  }

  // If approved with high rating, consider creating a new pattern from the generated code
  if (approved && rating && rating >= 4) {
    const generatedFiles = execution.generatedFiles as AiGeneratedFile[] || [];
    const context = execution.taskContext as AiTaskContext;
    
    // Create new patterns from approved generations
    for (const file of generatedFiles) {
      if (file.language === 'ABAP' && file.content.length > 100) {
        await db.insert(aiAbapPatterns).values({
          organizationId: execution.organizationId,
          userId: execution.userId,
          category: mapObjectTypeToCategory(file.objectType || 'other'),
          source: 'ai_generated',
          name: `Pattern da: ${context.taskTitle}`.substring(0, 200),
          description: file.description || `Generato automaticamente per task: ${context.taskTitle}`,
          tags: extractKeywords(context).slice(0, 10),
          codeTemplate: file.content,
          sapModules: context.sapModules || [],
          usageCount: 0,
          successCount: 1,
          failureCount: 0,
          qualityScore: "1.00",
          isActive: true,
        });
      }
    }
  }
}

// Map SAP object type to pattern category
function mapObjectTypeToCategory(objectType: string): "report" | "function_module" | "class" | "enhancement" | "form" | "selection_screen" | "alv" | "bapi" | "data_extraction" | "bdc" | "idoc" | "smartform" | "workflow" | "fiori" | "cds_view" | "amdp" | "other" {
  const mapping: Record<string, any> = {
    'PROG': 'report',
    'FUGR': 'function_module',
    'CLAS': 'class',
    'INTF': 'class',
    'ENHO': 'enhancement',
    'FORM': 'form',
    'SSCRP': 'selection_screen',
    'FUNC': 'function_module',
    'BADI': 'enhancement',
    'IDOC': 'idoc',
    'SFPI': 'smartform',
    'WDYN': 'fiori',
    'DDLS': 'cds_view',
  };
  return mapping[objectType?.toUpperCase()] || 'other';
}

// Get execution history for a task
export async function getTaskExecutions(
  taskId: string,
  limit: number = 10
): Promise<AiTaskExecution[]> {
  return db
    .select()
    .from(aiTaskExecutions)
    .where(eq(aiTaskExecutions.taskId, taskId))
    .orderBy(desc(aiTaskExecutions.createdAt))
    .limit(limit);
}

// Get all patterns for an organization
export async function getOrganizationPatterns(
  organizationId: string,
  category?: string
): Promise<AiAbapPattern[]> {
  const conditions = [eq(aiAbapPatterns.organizationId, organizationId)];
  if (category) {
    conditions.push(eq(aiAbapPatterns.category, category as any));
  }

  return db
    .select()
    .from(aiAbapPatterns)
    .where(and(...conditions))
    .orderBy(desc(aiAbapPatterns.qualityScore), desc(aiAbapPatterns.usageCount));
}
