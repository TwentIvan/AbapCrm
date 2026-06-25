// AI Task Executor - Generates ABAP code and operational assistance for tasks
// Uses learned patterns from sapObjectContent and aiAbapPatterns

import { aiGateway, getDefaultModelKey } from "./ai-gateway";
import type { GatewayMessage } from "./ai-gateway";
import { connectAndListTools, callTool } from "./mcp-client";
import { EventBus } from "./event-bus";
import { db } from "./db";
import { eq, and, sql, desc, or, ilike, inArray } from "drizzle-orm";
import { getUsdEurRate, usdToEur } from "./fx";
import { assembleContext } from "./context-assembler";
import { triggerBriefUpdate } from "./context-maintainer";
import {
  tasks,
  projects,
  sapSystems,
  sapTransportRequests,
  sapTransportObjects,
  sapObjectContent,
  aiAbapPatterns,
  aiTaskExecutions,
  aiModels,
  mcpServerConfigs,
  mcpCatalogValidations,
  aiPendingActions,
  systemCredentials,
  auditLogs,
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

// Extract generated files from raw AI response when JSON parsing fails
function extractGeneratedFilesFromRaw(content: string): Array<{
  filename: string;
  language: string;
  objectType: string;
  description: string;
  content: string;
}> {
  const files: Array<{
    filename: string;
    language: string;
    objectType: string;
    description: string;
    content: string;
  }> = [];
  
  // Strategy 1: Extract from generatedFiles JSON array
  // Match each file object with its content
  const filePattern = /\{\s*"filename"\s*:\s*"([^"]+)"\s*,\s*"language"\s*:\s*"([^"]+)"\s*,\s*"objectType"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:\s*"([^"]*?)"\s*,\s*"content"\s*:\s*"/g;
  let match;
  
  while ((match = filePattern.exec(content)) !== null) {
    const filename = match[1];
    const language = match[2];
    const objectType = match[3];
    const description = match[4];
    
    // Find the content - it ends at the next unescaped quote
    const startPos = match.index + match[0].length;
    let endPos = startPos;
    let depth = 0;
    let escaped = false;
    
    for (let i = startPos; i < content.length; i++) {
      const char = content[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        endPos = i;
        break;
      }
    }
    
    if (endPos > startPos) {
      let codeContent = content.substring(startPos, endPos);
      // Unescape the content
      codeContent = codeContent
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      files.push({
        filename,
        language,
        objectType,
        description,
        content: codeContent,
      });
    }
  }
  
  // Strategy 2: If no files found, try markdown code blocks
  if (files.length === 0) {
    const codeBlockPattern = /```abap\n([\s\S]*?)```/gi;
    let blockMatch;
    let blockIndex = 1;
    
    while ((blockMatch = codeBlockPattern.exec(content)) !== null) {
      const code = blockMatch[1].trim();
      if (code.length > 20) { // Ignore very short snippets
        // Try to extract report name from code
        const reportMatch = code.match(/^REPORT\s+(\w+)/im);
        const filename = reportMatch 
          ? `${reportMatch[1].toUpperCase()}.abap`
          : `ZGENERATED_CODE_${blockIndex}.abap`;
        
        files.push({
          filename,
          language: 'ABAP',
          objectType: 'PROG',
          description: `Codice estratto (blocco ${blockIndex})`,
          content: code,
        });
        blockIndex++;
      }
    }
  }
  
  console.log(`[AI-EXECUTOR] extractGeneratedFilesFromRaw: found ${files.length} files`);
  return files;
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
  chatClarifications?: string,
  patternIds?: string[],
  modelKeyOverride?: string,
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

      // Get patterns: use explicitly selected patternIds if provided, otherwise extract keywords
      let patterns: AiAbapPattern[] = [];
      if (patternIds && patternIds.length > 0) {
        // Use user-selected patterns
        patterns = await db
          .select()
          .from(aiAbapPatterns)
          .where(and(
            inArray(aiAbapPatterns.id, patternIds),
            eq(aiAbapPatterns.organizationId, organizationId),
            eq(aiAbapPatterns.isActive, true)
          ));
        console.log(`[THU-AI] Using ${patterns.length} user-selected patterns`);
      } else {
        // Auto-select patterns based on keywords
        const keywords = extractKeywords(context);
        patterns = await getRelevantPatterns(organizationId, keywords);
        console.log(`[THU-AI] Auto-selected ${patterns.length} patterns based on keywords`);
      }
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
      let prompt = buildTaskExecutionPrompt(context, patterns, codeExamples);

      // Phase 5: Prepend assembled project context
      try {
        const ctx = await assembleContext({ taskId, tokenBudget: 4000 });
        if (ctx.text) {
          prompt = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏢 CONTESTO DI PROGETTO (${ctx.tokensUsed} token)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${ctx.text}\n\n` + prompt;
        }
      } catch (ctxErr) {
        console.warn("[AI-EXECUTOR] assembleContext failed (non-fatal):", ctxErr);
      }

      // Model resolution: task.agentModelId → org default → env → fallback
      let modelKey: string;
      if (modelKeyOverride) {
        modelKey = modelKeyOverride;
      } else if ((taskData as any).agentModelId) {
        const [assignedModel] = await db
          .select({ modelKey: aiModels.modelKey })
          .from(aiModels)
          .where(eq(aiModels.id, (taskData as any).agentModelId))
          .limit(1);
        modelKey = assignedModel?.modelKey || await getDefaultModelKey(organizationId, "openai/gpt-4o");
      } else {
        modelKey = await getDefaultModelKey(organizationId, "openai/gpt-4o");
      }

      // Budget guardrail: check cap before AI call
      const budgetCapEur = (taskData as any).budgetCapEur
        ? parseFloat((taskData as any).budgetCapEur as string)
        : null;
      if (budgetCapEur !== null) {
        const [mPricingGuard] = await db
          .select({ inputPricePerMToken: aiModels.inputPricePerMToken, outputPricePerMToken: aiModels.outputPricePerMToken })
          .from(aiModels)
          .where(eq(aiModels.modelKey, modelKey))
          .limit(1);
        const fxGuard = await getUsdEurRate(organizationId);
        const iG = mPricingGuard?.inputPricePerMToken ? parseFloat(mPricingGuard.inputPricePerMToken as string) : 2.5;
        const oG = mPricingGuard?.outputPricePerMToken ? parseFloat(mPricingGuard.outputPricePerMToken as string) : 10.0;
        const estimatedCostEur = usdToEur((10000 / 1_000_000) * (iG * 0.4 + oG * 0.6), fxGuard);
        if (estimatedCostEur >= budgetCapEur) {
          await db.update(aiTaskExecutions).set({
            status: "paused_budget",
            completedAt: new Date(),
            modelKey,
            analysisResult: { reason: "Budget cap reached", capEur: budgetCapEur, estimatedCostEur },
          }).where(eq(aiTaskExecutions.id, execution.id));
          results.push({
            success: false,
            executionId: execution.id,
            analysis: { taskType: 'unknown', complexity: 'low', suggestedApproach: '', sapModules: [], requiredObjects: [] },
            generatedFiles: [],
            suggestedActions: [{ action: 'raise_budget', priority: 'high', description: `Budget cap di €${budgetCapEur} raggiunto. Alzare il tetto di spesa e riprendere l'esecuzione.` }],
            patternsUsed: patterns.map(p => p.id),
            error: `Esecuzione sospesa: budget cap €${budgetCapEur} raggiunto`,
          });
          continue;
        }
      }

      // ── MCP Tool Use — Phase 4 ──────────────────────────────────────────────
      // PRD or readOnly=true  → only read tools exposed (Phase 3 behaviour, unchanged).
      // readOnly=false && !PRD → read + write tools exposed; write marked requiresApproval.
      // Graceful degradation: unreachable servers are logged and skipped — never block execution.
      const mcpConfigIdList: string[] = (taskData as any).mcpConfigIds ?? [];

      type ToolRegistryEntry = {
        namespacedName: string;
        originalName: string;
        configId: string;
        config: typeof mcpServerConfigs.$inferSelect;
        classification: "read" | "write";
        requiresApproval: boolean;
        description: string;
        parameters: any;
      };
      const toolRegistry = new Map<string, ToolRegistryEntry>();
      const availableMcpToolDefs: Array<{ type: string; function: { name: string; description: string; parameters: any } }> = [];

      if (mcpConfigIdList.length > 0) {
        const linkedConfigs = await db
          .select()
          .from(mcpServerConfigs)
          .where(and(
            inArray(mcpServerConfigs.id, mcpConfigIdList),
            eq(mcpServerConfigs.organizationId, organizationId),
          ));

        // Load per-org validation status for all catalog IDs in one query
        const catalogIds = linkedConfigs
          .map(c => c.catalogId)
          .filter((id): id is string => !!id);
        const validationMap = new Map<string, boolean>();
        if (catalogIds.length > 0) {
          const vals = await db
            .select({ catalogId: mcpCatalogValidations.catalogId, validated: mcpCatalogValidations.validated })
            .from(mcpCatalogValidations)
            .where(and(
              eq(mcpCatalogValidations.organizationId, organizationId),
              inArray(mcpCatalogValidations.catalogId, catalogIds),
            ));
          vals.forEach(v => validationMap.set(v.catalogId, v.validated));
        }

        for (const cfg of linkedConfigs) {
          if (cfg.enabled === false) continue;
          // Security: default-deny — no catalog entry means no validation possible → skip
          if (!cfg.catalogId) {
            console.log(`[MCP] Config ${cfg.id} (${cfg.name}) skipped: no catalog entry (validation required)`);
            continue;
          }
          // Validation enforcement: catalog entry must be validated for this org
          const isValidated = validationMap.get(cfg.catalogId) ?? false;
          if (!isValidated) {
            console.log(`[MCP] Config ${cfg.id} (${cfg.name}) skipped: catalog entry not validated`);
            continue;
          }
          const isPrd = cfg.environment === "PRD";
          const isReadOnly = cfg.readOnly;
          if (isPrd && !isReadOnly) {
            console.warn(`[MCP] Config ${cfg.id} (${cfg.name}) is PRD but readOnly=false — coerced to read-only`);
          }
          try {
            // Inherit sapSystemId/credentialsRef from task/project if config doesn't specify them
            const effectiveCfg = { ...cfg };
            if (!effectiveCfg.sapSystemId) {
              effectiveCfg.sapSystemId = (taskData as any).sapSystemId || projectData?.sapSystemId || null;
            }
            if (!effectiveCfg.credentialsRef && effectiveCfg.sapSystemId) {
              const [cred] = await db.select({ id: systemCredentials.id })
                .from(systemCredentials)
                .where(and(
                  eq(systemCredentials.systemId, effectiveCfg.sapSystemId),
                  eq(systemCredentials.isActive, true),
                ))
                .limit(1);
              if (cred) effectiveCfg.credentialsRef = cred.id;
            }
            const { tools } = await connectAndListTools(effectiveCfg); // overrides applied inside
            const allowlist: string[] = (cfg.toolAllowlist as string[] | null) ?? [];
            for (const t of tools) {
              if (allowlist.length > 0 && !allowlist.includes(t.name)) continue;
              if (isPrd && t.classification === "write") continue;   // PRD: never write
              if (isReadOnly && t.classification === "write") continue; // readOnly: never write
              const requiresApproval = t.classification === "write";
              toolRegistry.set(t.namespacedName, {
                namespacedName: t.namespacedName,
                originalName: t.name,
                configId: cfg.id,
                config: effectiveCfg,
                classification: t.classification,
                requiresApproval,
                description: t.description ?? "",
                parameters: t.inputSchema ?? { type: "object", properties: {} },
              });
              availableMcpToolDefs.push({
                type: "function",
                function: {
                  name: t.namespacedName,
                  description: `[${cfg.name}] ${t.description ?? ""}`,
                  parameters: t.inputSchema ?? { type: "object", properties: {} },
                },
              });
            }
            const readCnt = Array.from(toolRegistry.values()).filter(e => e.configId === cfg.id && !e.requiresApproval).length;
            const writeCnt = Array.from(toolRegistry.values()).filter(e => e.configId === cfg.id && e.requiresApproval).length;
            console.log(`[MCP] Config "${cfg.name}": read=${readCnt} write=${writeCnt} (${isPrd || isReadOnly ? "read-only mode" : "read+write mode"})`);
          } catch (mcpErr: any) {
            console.warn(`[MCP] Config ${cfg.id} (${cfg.name}) unreachable: ${mcpErr?.message ?? mcpErr}. Skipping.`);
          }
        }
      }

      // Agentic loop — max 8 iterations, supports tool calls when MCP tools are available.
      // Phase 4: write tool calls pause the loop for human approval (awaiting_approval).
      // Falls back to single call when no tools are present (backward compatible).
      const MCP_MAX_ITER = 8;
      const toolCallsLog: Array<Record<string, any>> = [];
      let cumulativePromptTokens = 0;
      let cumulativeCompletionTokens = 0;
      let warning80Emitted = false;
      let budgetExceededInLoop = false;
      let awaitingApprovalBreak = false;
      let finalContent = "";
      let lastIterResult: Awaited<ReturnType<typeof aiGateway.complete>> | null = null;

      const loopMessages: GatewayMessage[] = [
        { role: "system", content: "Sei un esperto sviluppatore SAP ABAP. Rispondi sempre in italiano. Output SOLO JSON valido." },
        { role: "user", content: prompt },
      ];

      for (let iter = 0; iter < MCP_MAX_ITER; iter++) {
        const iterOpts: Parameters<typeof aiGateway.complete>[0] = {
          modelKey,
          messages: loopMessages,
          temperature: 0.3,
          maxTokens: 8000,
          organizationId,
          caller: `ai-task-executor/executeTask/iter${iter}`,
          ...(availableMcpToolDefs.length > 0 ? { tools: availableMcpToolDefs } : {}),
        };

        const iterResult = await aiGateway.complete(iterOpts);
        lastIterResult = iterResult;
        cumulativePromptTokens += iterResult.promptTokens;
        cumulativeCompletionTokens += iterResult.completionTokens;

        // Cumulative budget check after each gateway call
        if (budgetCapEur !== null) {
          const fxLoop = await getUsdEurRate(organizationId);
          const [mPricingLoop] = await db
            .select({ inputPricePerMToken: aiModels.inputPricePerMToken, outputPricePerMToken: aiModels.outputPricePerMToken })
            .from(aiModels)
            .where(eq(aiModels.modelKey, modelKey))
            .limit(1);
          const iL = mPricingLoop?.inputPricePerMToken ? parseFloat(mPricingLoop.inputPricePerMToken as string) : 2.5;
          const oL = mPricingLoop?.outputPricePerMToken ? parseFloat(mPricingLoop.outputPricePerMToken as string) : 10.0;
          const cumulativeCostEur = usdToEur(
            (cumulativePromptTokens / 1_000_000) * iL + (cumulativeCompletionTokens / 1_000_000) * oL,
            fxLoop
          );

          // 80% budget warning (emitted once per execution)
          if (!warning80Emitted && cumulativeCostEur >= budgetCapEur * 0.8) {
            warning80Emitted = true;
            EventBus.emit("ai_budget", {
              entityKey: "ai_task_executions",
              recordId: execution.id,
              userId,
              organizationId,
              record: { executionId: execution.id, taskId, cumulativeCostEur, capEur: budgetCapEur, pctReached: 80 },
            });
            console.warn(`[MCP] Budget 80% warning: €${cumulativeCostEur.toFixed(4)} / €${budgetCapEur} (iter ${iter})`);
          }

          // 100% cap: pause execution
          if (cumulativeCostEur >= budgetCapEur) {
            await db.update(aiTaskExecutions).set({
              status: "paused_budget",
              completedAt: new Date(),
              modelKey,
              toolCallsLog: toolCallsLog as any,
              analysisResult: { reason: "Budget cap reached during MCP loop", capEur: budgetCapEur, cumulativeCostEur, iter },
            }).where(eq(aiTaskExecutions.id, execution.id));
            results.push({
              success: false,
              executionId: execution.id,
              analysis: { taskType: 'unknown', complexity: 'low', suggestedApproach: '', sapModules: [], requiredObjects: [] },
              generatedFiles: [],
              suggestedActions: [{ action: 'raise_budget', priority: 'high', description: `Budget cap di €${budgetCapEur} raggiunto durante esecuzione MCP (iter ${iter}). Alzare il tetto di spesa.` }],
              patternsUsed: patterns.map(p => p.id),
              error: `Esecuzione sospesa: budget cap €${budgetCapEur} raggiunto`,
            });
            budgetExceededInLoop = true;
            break;
          }
        }

        // No tool calls → model produced its final answer, exit loop
        if (!iterResult.toolCalls?.length) {
          finalContent = iterResult.content || "";
          break;
        }

        // Phase 4: separate read (execute immediately) from write (pause for human approval)
        const allToolCalls = iterResult.toolCalls;

        loopMessages.push({
          role: "assistant",
          content: iterResult.content ?? null,
          tool_calls: allToolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });

        const readTcs = allToolCalls.filter(tc => {
          const e = toolRegistry.get(tc.name);
          return e && !e.requiresApproval;
        });
        const writeTcs = allToolCalls.filter(tc => toolRegistry.get(tc.name)?.requiresApproval === true);
        const unknownTcs = allToolCalls.filter(tc => !toolRegistry.has(tc.name));

        for (const tc of unknownTcs) {
          loopMessages.push({ role: "tool", content: `Tool "${tc.name}" not available`, tool_call_id: tc.id });
        }

        // Execute READ calls immediately
        for (const tc of readTcs) {
          const entry = toolRegistry.get(tc.name)!;
          // Defense in depth: re-verify not write and not PRD
          if (entry.classification === "write" || entry.config.environment === "PRD") {
            loopMessages.push({ role: "tool", content: `[DEFENSE] Blocked: classification/env mismatch`, tool_call_id: tc.id });
            console.error(`[MCP-DEFENSE] Blocked ${tc.name}: class=${entry.classification} env=${entry.config.environment}`);
            continue;
          }
          let toolResult: { ok: boolean; text: string; durationMs: number };
          try {
            toolResult = await callTool(entry.config, entry.originalName, tc.arguments ?? {});
          } catch (callErr: any) {
            toolResult = { ok: false, text: `Error: ${callErr?.message ?? callErr}`, durationMs: 0 };
          }
          toolCallsLog.push({
            toolName: entry.originalName,
            namespacedName: entry.namespacedName,
            configId: entry.configId,
            args: tc.arguments,
            result: toolResult.text.slice(0, 2000),
            ok: toolResult.ok,
            durationMs: toolResult.durationMs,
            ts: new Date().toISOString(),
            requiresApproval: false,
          });
          await db.insert(auditLogs).values({
            tableName: "mcp_tool_calls",
            recordId: execution.id,
            action: "CREATE",
            newValues: {
              taskId, configId: entry.configId, toolName: entry.originalName,
              namespacedName: entry.namespacedName,
              args: JSON.stringify(tc.arguments ?? {}).slice(0, 2000),
              result: toolResult.text.slice(0, 2000),
              ok: toolResult.ok, durationMs: toolResult.durationMs,
            } as any,
            changedFields: [entry.originalName],
            userId, organizationId,
          });
          loopMessages.push({ role: "tool", content: toolResult.text, tool_call_id: tc.id });
          console.log(`[MCP] iter=${iter} read="${entry.originalName}" ok=${toolResult.ok} ${toolResult.durationMs}ms`);
        }

        // WRITE calls → save to ai_pending_actions, serialize loop state, pause for approval
        if (writeTcs.length > 0) {
          const pendingCallIds: Record<string, string> = {};
          for (const tc of writeTcs) {
            const entry = toolRegistry.get(tc.name)!;
            // Defense: never execute write on PRD even if it somehow reached here
            if (entry.config.environment === "PRD") {
              loopMessages.push({ role: "tool", content: `[DEFENSE] Write tool blocked on PRD`, tool_call_id: tc.id });
              console.error(`[MCP-DEFENSE] Blocked write on PRD: ${entry.originalName}`);
              continue;
            }
            const [action] = await db.insert(aiPendingActions).values({
              executionId: execution.id,
              taskId,
              organizationId,
              configId: entry.configId,
              toolName: entry.originalName,
              toolArgs: tc.arguments ?? {},
              modelRationale: iterResult.content ?? null,
              status: "pending",
            }).returning();
            pendingCallIds[action.id] = tc.id;
            toolCallsLog.push({
              toolName: entry.originalName,
              namespacedName: entry.namespacedName,
              configId: entry.configId,
              args: tc.arguments,
              result: null, ok: null, durationMs: null,
              ts: new Date().toISOString(),
              requiresApproval: true,
              pendingActionId: action.id,
              status: "pending",
            });
            console.log(`[MCP] iter=${iter} write="${entry.originalName}" → pending action ${action.id}`);
          }
          // Serialize loop state for resume after approval
          const loopStateSnap = {
            messages: loopMessages,       // includes assistant msg + any read results already appended
            iter,
            cumulativePromptTokens,
            cumulativeCompletionTokens,
            warning80Emitted,
            toolCallsLog,
            toolRegistry: Array.from(toolRegistry.values()).map(e => ({
              namespacedName: e.namespacedName,
              originalName: e.originalName,
              configId: e.configId,
              classification: e.classification,
              requiresApproval: e.requiresApproval,
              description: e.description,
              parameters: e.parameters,
            })),
            pendingCallIds,               // ai_pending_action.id → openai tool_call.id
            taskId, organizationId, userId, modelKey, budgetCapEur,
          };
          await db.update(aiTaskExecutions).set({
            status: "awaiting_approval",
            loopState: loopStateSnap as any,
            toolCallsLog: toolCallsLog as any,
          }).where(eq(aiTaskExecutions.id, execution.id));
          EventBus.emit("ai_approval", {
            entityKey: "ai_task_executions",
            recordId: execution.id,
            userId,
            organizationId,
            record: { executionId: execution.id, taskId, pendingActionIds: Object.keys(pendingCallIds) },
          });
          results.push({
            success: false,
            executionId: execution.id,
            analysis: { taskType: 'unknown', complexity: 'low', suggestedApproach: '', sapModules: [], requiredObjects: [] },
            generatedFiles: [],
            suggestedActions: [{ action: 'approve_tools', priority: 'high', description: `${writeTcs.length} azioni write richiedono approvazione umana. Approva o rifiuta nel pannello Tool Calls del task.` }],
            patternsUsed: patterns.map(p => p.id),
            error: `Esecuzione sospesa: ${writeTcs.length} azioni write in attesa di approvazione`,
          });
          awaitingApprovalBreak = true;
          break;
        }
      }

      // Awaiting human approval → skip post-processing, execution already saved with awaiting_approval status
      if (awaitingApprovalBreak) continue;

      // Budget exceeded mid-loop → skip to next task in the outer for-of
      if (budgetExceededInLoop) continue;

      // MAX_ITER reached with tool calls every iteration → use last response content
      if (!finalContent) finalContent = lastIterResult?.content ?? "";

      // Persist toolCallsLog if any tool calls were executed
      if (toolCallsLog.length > 0) {
        await db.update(aiTaskExecutions)
          .set({ toolCallsLog: toolCallsLog as any })
          .where(eq(aiTaskExecutions.id, execution.id));
      }

      const content = finalContent;
      const response = { usage: { prompt_tokens: cumulativePromptTokens, completion_tokens: cumulativeCompletionTokens } };
      
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
              
              // Now extract the actual code content from raw response
              const generatedFiles = extractGeneratedFilesFromRaw(content);
              if (generatedFiles.length > 0) {
                aiResult.generatedFiles = generatedFiles;
                console.log(`[AI-EXECUTOR] Extracted ${generatedFiles.length} files from raw content`);
              }
            } catch (safeError) {
              // Last resort: extract key fields manually and include raw response
              console.error('[AI-EXECUTOR] Safe parse also failed, extracting manually');
              console.log('[AI-EXECUTOR] Raw content sample:', content.substring(0, 500));
              
              const taskTypeMatch = jsonStr.match(/"taskType"\s*:\s*"([^"]+)"/);
              const complexityMatch = jsonStr.match(/"complexity"\s*:\s*"([^"]+)"/);
              const approachMatch = jsonStr.match(/"suggestedApproach"\s*:\s*"([^"]*?)(?:"|$)/);
              
              // Extract generated files from raw JSON content
              const generatedFiles = extractGeneratedFilesFromRaw(content);
              console.log(`[AI-EXECUTOR] Extracted ${generatedFiles.length} files from raw content`);
              
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
                  description: generatedFiles.length > 0 
                    ? 'Codice estratto con successo - verifica il risultato' 
                    : 'La risposta AI è stata parzialmente elaborata - verifica il contesto' 
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

      // Calculate costs and update execution with results
      const promptTkns = response.usage?.prompt_tokens || 0;
      const completionTkns = response.usage?.completion_tokens || 0;
      const [mPricingFinal] = await db
        .select({ inputPricePerMToken: aiModels.inputPricePerMToken, outputPricePerMToken: aiModels.outputPricePerMToken })
        .from(aiModels)
        .where(eq(aiModels.modelKey, modelKey))
        .limit(1);
      const iF = mPricingFinal?.inputPricePerMToken ? parseFloat(mPricingFinal.inputPricePerMToken as string) : 2.5;
      const oF = mPricingFinal?.outputPricePerMToken ? parseFloat(mPricingFinal.outputPricePerMToken as string) : 10.0;
      const totalCostUsd = (promptTkns / 1_000_000) * iF + (completionTkns / 1_000_000) * oF;
      const fxFinal = await getUsdEurRate(organizationId);
      const totalCostEurVal = usdToEur(totalCostUsd, fxFinal);

      await db
        .update(aiTaskExecutions)
        .set({
          status: "completed",
          completedAt: new Date(),
          generatedFiles: aiResult.generatedFiles || [],
          analysisResult: aiResult.analysis,
          suggestedActions: aiResult.suggestedActions || [],
          aiModel: modelKey,
          modelKey: modelKey,
          promptTokens: promptTkns,
          completionTokens: completionTkns,
          totalCost: totalCostUsd.toFixed(6),
          totalCostEur: totalCostEurVal.toFixed(6),
        })
        .where(eq(aiTaskExecutions.id, execution.id));

      // Phase 5: trigger background brief update
      triggerBriefUpdate(execution.id, taskId, organizationId);

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

// ── Phase 4: Resume after approval ───────────────────────────────────────────

/**
 * Parse AI content and save the final execution result.
 * Used both by the main executor and by resumeExecutionAfterApproval.
 */
async function parseAndSaveResumedResult(params: {
  executionId: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  modelKey: string;
  organizationId: string;
  patternsUsed: string[];
}): Promise<void> {
  const { executionId, content, promptTokens, completionTokens, modelKey, organizationId, patternsUsed } = params;

  let aiResult: any;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    let jsonStr = jsonMatch[0];
    jsonStr = jsonStr.replace(/:\s*"([^"]*?)(?<!\\)\n([^"]*?)"/g, (_, before, after) => `: "${before}\\n${after}"`);
    jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : '');
    aiResult = JSON.parse(jsonStr);
  } catch {
    aiResult = {
      analysis: { taskType: 'resumed', complexity: 'medium', suggestedApproach: 'Esecuzione ripresa dopo approvazione tool write', sapModules: [], requiredObjects: [] },
      generatedFiles: extractGeneratedFilesFromRaw(content),
      suggestedActions: [],
    };
  }

  const [mP] = await db
    .select({ inputPricePerMToken: aiModels.inputPricePerMToken, outputPricePerMToken: aiModels.outputPricePerMToken })
    .from(aiModels).where(eq(aiModels.modelKey, modelKey)).limit(1);
  const iF = mP?.inputPricePerMToken ? parseFloat(mP.inputPricePerMToken as string) : 2.5;
  const oF = mP?.outputPricePerMToken ? parseFloat(mP.outputPricePerMToken as string) : 10.0;
  const totalCostUsd = (promptTokens / 1_000_000) * iF + (completionTokens / 1_000_000) * oF;
  const fx = await getUsdEurRate(organizationId);
  const totalCostEurVal = usdToEur(totalCostUsd, fx);

  await db.update(aiTaskExecutions).set({
    status: "completed",
    completedAt: new Date(),
    generatedFiles: aiResult.generatedFiles || [],
    analysisResult: aiResult.analysis,
    suggestedActions: aiResult.suggestedActions || [],
    aiModel: modelKey,
    modelKey,
    promptTokens,
    completionTokens,
    totalCost: totalCostUsd.toFixed(6),
    totalCostEur: totalCostEurVal.toFixed(6),
    loopState: null, // clear loop state after completion
    updatedAt: new Date(),
  }).where(eq(aiTaskExecutions.id, executionId));

  for (const patternId of patternsUsed) {
    await db.update(aiAbapPatterns)
      .set({ usageCount: sql`${aiAbapPatterns.usageCount} + 1`, lastUsedAt: new Date() })
      .where(eq(aiAbapPatterns.id, patternId));
  }

  // Phase 5: trigger background brief update
  // Load taskId from execution record to pass to maintainer
  db.select({ taskId: aiTaskExecutions.taskId }).from(aiTaskExecutions)
    .where(eq(aiTaskExecutions.id, executionId)).limit(1)
    .then(([row]) => { if (row?.taskId) triggerBriefUpdate(executionId, row.taskId, organizationId); })
    .catch(() => {});
}

/**
 * Resume an execution that is in awaiting_approval status.
 * Called by the /decide endpoint once all pending actions for an execution are decided.
 *
 * Flow:
 *  1. Expiry check: pending actions > 24h → expire + fail.
 *  2. If any still pending → return "awaiting_approval" (caller did not decide all yet).
 *  3. Apply decisions: approved → callTool, rejected → rejection message.
 *  4. Continue agentic loop from saved iter+1.
 *  5. If another write tool arises: save new pending actions, return "awaiting_approval".
 *  6. On loop completion: parse + save result, return "completed".
 */
export async function resumeExecutionAfterApproval(executionId: string): Promise<{
  status: "completed" | "failed" | "awaiting_approval" | "processing";
  error?: string;
}> {
  const [execution] = await db.select().from(aiTaskExecutions)
    .where(eq(aiTaskExecutions.id, executionId)).limit(1);
  if (!execution) return { status: "failed", error: "Execution not found" };
  if (execution.status !== "awaiting_approval") return { status: execution.status as any };

  // Load all pending actions
  const pendingActions = await db.select().from(aiPendingActions)
    .where(eq(aiPendingActions.executionId, executionId));

  // Lazy expiry check: pending > 24h → expire + fail
  const expiryThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const action of pendingActions) {
    if (action.status === "pending" && action.createdAt < expiryThreshold) {
      await db.update(aiPendingActions).set({ status: "expired" }).where(eq(aiPendingActions.id, action.id));
      await db.update(aiTaskExecutions).set({
        status: "failed",
        completedAt: new Date(),
        analysisResult: { reason: "pending_action_expired", actionId: action.id, toolName: action.toolName, expiredAt: new Date().toISOString() },
        updatedAt: new Date(),
      }).where(eq(aiTaskExecutions.id, executionId));
      return { status: "failed", error: `Azione "${action.toolName}" scaduta (creata il ${action.createdAt.toISOString()})` };
    }
  }

  // Check all pending are decided (none still in "pending" status)
  const stillPending = pendingActions.filter(a => a.status === "pending");
  if (stillPending.length > 0) return { status: "awaiting_approval" };

  // Load loop state
  const loopState = execution.loopState as any;
  if (!loopState) {
    await db.update(aiTaskExecutions).set({
      status: "failed", completedAt: new Date(),
      analysisResult: { reason: "missing_loop_state" }, updatedAt: new Date(),
    }).where(eq(aiTaskExecutions.id, executionId));
    return { status: "failed", error: "loop_state mancante" };
  }

  const {
    messages: savedMessages, iter: savedIter,
    cumulativePromptTokens: savedPromptTkns, cumulativeCompletionTokens: savedCompletionTkns,
    warning80Emitted: savedWarning80, toolCallsLog: savedToolCallsLog,
    toolRegistry: savedRegistry, pendingCallIds,
    taskId, organizationId, userId, modelKey, budgetCapEur,
  } = loopState;

  // Re-fetch configs from DB (fresh state)
  const configIdList: string[] = Array.from(new Set((savedRegistry as any[]).map((r: any) => r.configId)));
  const configs = configIdList.length > 0
    ? await db.select().from(mcpServerConfigs).where(inArray(mcpServerConfigs.id, configIdList))
    : [];
  const configMap = new Map(configs.map(c => [c.id, c]));

  // Reconstruct tool registry
  type ResumedEntry = { namespacedName: string; originalName: string; configId: string; config: typeof mcpServerConfigs.$inferSelect; classification: "read" | "write"; requiresApproval: boolean; description: string; parameters: any };
  const toolRegistry = new Map<string, ResumedEntry>();
  for (const entry of (savedRegistry as any[])) {
    const cfg = configMap.get(entry.configId);
    if (cfg) toolRegistry.set(entry.namespacedName, { ...entry, config: cfg });
  }

  const loopMessages: GatewayMessage[] = [...(savedMessages as GatewayMessage[])];
  let toolCallsLog: Array<Record<string, any>> = [...(savedToolCallsLog ?? [])];

  // Apply decisions: append tool result messages to loopMessages
  for (const action of pendingActions) {
    const openaiCallId = (pendingCallIds as Record<string, string>)[action.id];
    if (!openaiCallId) continue;

    if (action.status === "approved") {
      const entry = Array.from(toolRegistry.values()).find(e => e.originalName === action.toolName && e.configId === action.configId);
      if (!entry) {
        loopMessages.push({ role: "tool", content: "Errore: tool non trovato nel registry", tool_call_id: openaiCallId });
        continue;
      }
      // Defense: PRD check even after approval
      if (entry.config.environment === "PRD") {
        loopMessages.push({ role: "tool", content: "[DEFENSE] Bloccato: ambiente PRD non consente tool write", tool_call_id: openaiCallId });
        console.error(`[MCP-DEFENSE] Approved write blocked on PRD: ${action.toolName}`);
        continue;
      }
      let toolResult: { ok: boolean; text: string; durationMs: number };
      try {
        toolResult = await callTool(entry.config, action.toolName, action.toolArgs as Record<string, unknown>);
      } catch (err: any) {
        toolResult = { ok: false, text: `Errore: ${err?.message ?? err}`, durationMs: 0 };
      }
      const logIdx = toolCallsLog.findIndex((l: any) => l.pendingActionId === action.id);
      if (logIdx >= 0) {
        toolCallsLog[logIdx] = { ...toolCallsLog[logIdx], result: toolResult.text.slice(0, 2000), ok: toolResult.ok, durationMs: toolResult.durationMs, status: "approved", decidedBy: action.decidedBy, decidedAt: action.decidedAt?.toISOString() };
      }
      await db.insert(auditLogs).values({
        tableName: "mcp_tool_calls",
        recordId: executionId,
        action: "CREATE",
        newValues: { taskId, configId: action.configId, toolName: action.toolName, args: JSON.stringify(action.toolArgs ?? {}).slice(0, 2000), result: toolResult.text.slice(0, 2000), ok: toolResult.ok, durationMs: toolResult.durationMs, approvedBy: action.decidedBy } as any,
        changedFields: [action.toolName],
        userId: action.decidedBy ?? userId,
        organizationId,
      });
      loopMessages.push({ role: "tool", content: toolResult.text, tool_call_id: openaiCallId });
      console.log(`[MCP-RESUME] approved tool="${action.toolName}" ok=${toolResult.ok} ${toolResult.durationMs}ms`);

    } else if (action.status === "rejected") {
      const note = action.decisionNote ?? "";
      const rejMsg = `AZIONE RIFIUTATA DALL'UTENTE${note ? `: ${note}` : ""}`;
      const logIdx = toolCallsLog.findIndex((l: any) => l.pendingActionId === action.id);
      if (logIdx >= 0) {
        toolCallsLog[logIdx] = { ...toolCallsLog[logIdx], result: rejMsg, ok: false, status: "rejected", decidedBy: action.decidedBy, decidedAt: action.decidedAt?.toISOString() };
      }
      loopMessages.push({ role: "tool", content: rejMsg, tool_call_id: openaiCallId });
      console.log(`[MCP-RESUME] rejected tool="${action.toolName}" by ${action.decidedBy}`);
    }
  }

  // Set back to processing
  await db.update(aiTaskExecutions).set({ status: "processing", updatedAt: new Date() }).where(eq(aiTaskExecutions.id, executionId));

  // Reconstruct tool defs for model
  const availableMcpToolDefs = Array.from(toolRegistry.values()).map(e => ({
    type: "function",
    function: { name: e.namespacedName, description: `[${e.config?.name ?? e.configId}] ${e.description}`, parameters: e.parameters },
  }));

  // Continue loop from savedIter + 1
  const MCP_MAX_ITER = 8;
  let cumulativePromptTokens: number = savedPromptTkns;
  let cumulativeCompletionTokens: number = savedCompletionTkns;
  let warning80Emitted: boolean = savedWarning80;
  let finalContent = "";
  let lastIterResult: Awaited<ReturnType<typeof aiGateway.complete>> | null = null;

  for (let iter = (savedIter as number) + 1; iter < MCP_MAX_ITER; iter++) {
    const iterResult = await aiGateway.complete({
      modelKey,
      messages: loopMessages,
      temperature: 0.3,
      maxTokens: 8000,
      organizationId,
      caller: `ai-task-executor/resumeExecution/iter${iter}`,
      ...(availableMcpToolDefs.length > 0 ? { tools: availableMcpToolDefs as any[] } : {}),
    });
    lastIterResult = iterResult;
    cumulativePromptTokens += iterResult.promptTokens;
    cumulativeCompletionTokens += iterResult.completionTokens;

    // Budget check
    if (budgetCapEur !== null) {
      const fxLoop = await getUsdEurRate(organizationId);
      const [mP] = await db.select({ inputPricePerMToken: aiModels.inputPricePerMToken, outputPricePerMToken: aiModels.outputPricePerMToken })
        .from(aiModels).where(eq(aiModels.modelKey, modelKey)).limit(1);
      const iL = mP?.inputPricePerMToken ? parseFloat(mP.inputPricePerMToken as string) : 2.5;
      const oL = mP?.outputPricePerMToken ? parseFloat(mP.outputPricePerMToken as string) : 10.0;
      const cumCostEur = usdToEur((cumulativePromptTokens / 1_000_000) * iL + (cumulativeCompletionTokens / 1_000_000) * oL, fxLoop);
      if (!warning80Emitted && cumCostEur >= budgetCapEur * 0.8) {
        warning80Emitted = true;
        EventBus.emit("ai_budget", { entityKey: "ai_task_executions", recordId: executionId, userId, organizationId, record: { executionId, taskId, cumCostEur, capEur: budgetCapEur, pctReached: 80 } });
      }
      if (cumCostEur >= budgetCapEur) {
        await db.update(aiTaskExecutions).set({ status: "paused_budget", completedAt: new Date(), toolCallsLog: toolCallsLog as any, updatedAt: new Date() }).where(eq(aiTaskExecutions.id, executionId));
        return { status: "failed", error: `Budget cap €${budgetCapEur} raggiunto durante resume (iter ${iter})` };
      }
    }

    if (!iterResult.toolCalls?.length) {
      finalContent = iterResult.content || "";
      break;
    }

    const allTc = iterResult.toolCalls;
    loopMessages.push({
      role: "assistant",
      content: iterResult.content ?? null,
      tool_calls: allTc.map(tc => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })),
    });

    const readTcs2 = allTc.filter(tc => !toolRegistry.get(tc.name)?.requiresApproval);
    const writeTcs2 = allTc.filter(tc => toolRegistry.get(tc.name)?.requiresApproval === true);
    const unknownTcs2 = allTc.filter(tc => !toolRegistry.has(tc.name));

    for (const tc of unknownTcs2) {
      loopMessages.push({ role: "tool", content: `Tool "${tc.name}" not available`, tool_call_id: tc.id });
    }
    for (const tc of readTcs2) {
      const entry = toolRegistry.get(tc.name)!;
      if (entry.config.environment === "PRD") { loopMessages.push({ role: "tool", content: "[DEFENSE] Blocked on PRD", tool_call_id: tc.id }); continue; }
      let tr: any;
      try { tr = await callTool(entry.config, entry.originalName, tc.arguments ?? {}); }
      catch (e: any) { tr = { ok: false, text: `Error: ${e?.message}`, durationMs: 0 }; }
      toolCallsLog.push({ toolName: entry.originalName, namespacedName: entry.namespacedName, configId: entry.configId, args: tc.arguments, result: tr.text.slice(0, 2000), ok: tr.ok, durationMs: tr.durationMs, ts: new Date().toISOString(), requiresApproval: false });
      loopMessages.push({ role: "tool", content: tr.text, tool_call_id: tc.id });
      console.log(`[MCP-RESUME] iter=${iter} read="${entry.originalName}" ok=${tr.ok}`);
    }

    if (writeTcs2.length > 0) {
      const newPendingCallIds: Record<string, string> = {};
      for (const tc of writeTcs2) {
        const entry = toolRegistry.get(tc.name)!;
        if (entry.config.environment === "PRD") { loopMessages.push({ role: "tool", content: "[DEFENSE] Write blocked on PRD", tool_call_id: tc.id }); continue; }
        const [action] = await db.insert(aiPendingActions).values({ executionId, taskId, organizationId, configId: entry.configId, toolName: entry.originalName, toolArgs: tc.arguments ?? {}, modelRationale: iterResult.content ?? null, status: "pending" }).returning();
        newPendingCallIds[action.id] = tc.id;
        toolCallsLog.push({ toolName: entry.originalName, namespacedName: entry.namespacedName, configId: entry.configId, args: tc.arguments, result: null, ok: null, durationMs: null, ts: new Date().toISOString(), requiresApproval: true, pendingActionId: action.id, status: "pending" });
        console.log(`[MCP-RESUME] iter=${iter} write="${entry.originalName}" → pending ${action.id}`);
      }
      const newLoopState = {
        messages: loopMessages, iter, cumulativePromptTokens, cumulativeCompletionTokens, warning80Emitted, toolCallsLog,
        toolRegistry: Array.from(toolRegistry.values()).map(e => ({ namespacedName: e.namespacedName, originalName: e.originalName, configId: e.configId, classification: e.classification, requiresApproval: e.requiresApproval, description: e.description, parameters: e.parameters })),
        pendingCallIds: newPendingCallIds, taskId, organizationId, userId, modelKey, budgetCapEur,
      };
      await db.update(aiTaskExecutions).set({ status: "awaiting_approval", loopState: newLoopState as any, toolCallsLog: toolCallsLog as any, updatedAt: new Date() }).where(eq(aiTaskExecutions.id, executionId));
      EventBus.emit("ai_approval", { entityKey: "ai_task_executions", recordId: executionId, userId, organizationId, record: { executionId, taskId, pendingActionIds: Object.keys(newPendingCallIds) } });
      return { status: "awaiting_approval" };
    }
  }

  if (!finalContent) finalContent = lastIterResult?.content ?? "";
  await db.update(aiTaskExecutions).set({ toolCallsLog: toolCallsLog as any, updatedAt: new Date() }).where(eq(aiTaskExecutions.id, executionId));

  await parseAndSaveResumedResult({
    executionId,
    content: finalContent,
    promptTokens: cumulativePromptTokens,
    completionTokens: cumulativeCompletionTokens,
    modelKey,
    organizationId,
    patternsUsed: execution.patternsUsed as string[] ?? [],
  });

  return { status: "completed" };
}
