// AI Task Executor - Generates ABAP code and operational assistance for tasks
// Uses learned patterns from sapObjectContent and aiAbapPatterns

import OpenAI from "openai";
import { db } from "./db";
import { eq, and, sql, desc, or, ilike } from "drizzle-orm";
import {
  tasks,
  projects,
  sapSystems,
  sapTransportRequests,
  sapTransportObjects,
  sapObjectContent,
  aiAbapPatterns,
  aiTaskExecutions,
  type Task,
  type Project,
  type AiAbapPattern,
  type AiTaskExecution,
  type AiGeneratedFile,
  type AiTaskContext,
} from "@shared/schema";

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

// Build AI prompt for task execution
function buildTaskExecutionPrompt(
  context: AiTaskContext,
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

## PATTERN APPRESI (usa come riferimento)
${patternsSection}

## ESEMPI DI CODICE ESISTENTE (stile dell'organizzazione)
${codeExamplesSection}

## ISTRUZIONI PER LA GENERAZIONE

1. **Analisi**: Analizza il task e identifica:
   - Tipo di sviluppo richiesto (report, function module, class, enhancement, etc.)
   - Complessità (low/medium/high)
   - Moduli SAP coinvolti
   - Oggetti SAP necessari (tabelle, function module, classi, etc.)

2. **Generazione Codice**: Genera codice ABAP completo e funzionante:
   - Segui le best practice SAP e i pattern appresi
   - Includi commenti dettagliati in italiano
   - Gestisci correttamente le eccezioni
   - Usa naming convention SAP standard (Z*, Y*)

3. **Output Files**: Per ogni oggetto generato, fornisci:
   - Nome file (es. ZREPORT_VENDITE.abap)
   - Tipo oggetto (PROG, FUGR, CLAS, etc.)
   - Codice completo

4. **Azioni Suggerite**: Elenca i passi successivi per implementare la soluzione

## FORMATO RISPOSTA (JSON)
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
      "content": "REPORT zreport_esempio.\\n..."
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

Rispondi SOLO con il JSON, senza markdown o altro testo.`;
}

// Execute AI analysis and code generation for tasks
export async function executeTaskWithAI(
  taskIds: string[],
  userId: string,
  organizationId: string,
  customInstructions?: string
): Promise<TaskExecutionResult[]> {
  const results: TaskExecutionResult[] = [];

  for (const taskId of taskIds) {
    try {
      // Get task with project context
      const task = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
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

      // Get project if linked
      let projectData: Project | null = null;
      if (taskData.projectId) {
        const project = await db
          .select()
          .from(projects)
          .where(eq(projects.id, taskData.projectId))
          .limit(1);
        projectData = project[0] || null;
      }

      // Build context
      const context: AiTaskContext = {
        taskTitle: taskData.title,
        taskDescription: taskData.description || undefined,
        projectName: projectData?.name,
        projectDescription: projectData?.description || undefined,
        sapSystemId: projectData?.sapSystemId || undefined,
        customInstructions,
      };

      // Get SAP system info if available
      if (context.sapSystemId) {
        const sapSystem = await db
          .select()
          .from(sapSystems)
          .where(eq(sapSystems.id, context.sapSystemId))
          .limit(1);
        if (sapSystem[0]) {
          context.sapSystemName = sapSystem[0].name;
        }
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
          aiResult = JSON.parse(jsonMatch[0]);
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
