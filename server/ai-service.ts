import { storage } from "./storage";
import { MessageLogService } from "./message-log-service";
import { aiGateway, getDefaultModelKey } from "./ai-gateway";
import { EmailForwardCleaner } from "./email-forward-cleaner";
import * as cheerio from "cheerio";
import type { Project, Task, Partner, Message } from "@shared/schema";

const messageLogService = new MessageLogService();

/**
 * Extract the best plain-text content for AI analysis.
 * For forwarded emails the stored text `body` is often over-stripped (left with
 * only the forwarder's signature), while the HTML body retains the original
 * content. So prefer HTML: gently strip the forwarder's signature/headers (same
 * as the message view) and convert to text. Fall back to the longer of html-text
 * vs the stored text body.
 */
export function extractAnalysisText(message: { body?: string | null; htmlBody?: string | null }): string {
  const textBody = (message.body || "").trim();
  const html = message.htmlBody;
  if (!html) return textBody;
  try {
    const stripped = EmailForwardCleaner.stripSignaturesAndHeaders(html) || html;
    const $ = cheerio.load(stripped);
    // Preserve line breaks from block elements
    $("br").replaceWith("\n");
    $("p, div, tr, li").append("\n");
    const htmlText = $("body").text().replace(/\n{3,}/g, "\n\n").trim();
    // Use whichever carries more signal
    return htmlText.length >= textBody.length ? htmlText : textBody;
  } catch {
    return textBody;
  }
}

interface AISuggestion {
  type: 'project' | 'task' | 'partner';
  id: string;
  name: string;
  confidence: number;
  reason: string;
}

interface AnalysisResult {
  suggestions: AISuggestion[];
  bestMatch?: AISuggestion;
}

export class AIService {
  async analyzeMessage(message: Message, userId: string, organizationId?: string): Promise<AnalysisResult> {
    try {
      // Skip AI analysis if no organization context
      if (!organizationId) {
        return { suggestions: [] };
      }

      // Fetch user's data for context
      const [projects, tasks, partners] = await Promise.all([
        storage.getProjects(userId, organizationId),
        storage.getTasks(userId, organizationId),
        storage.getPartners(userId, organizationId)
      ]);

      // Prepare context for AI
      const context = {
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status
        })),
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          projectId: t.projectId
        })),
        partners: partners.map(p => ({
          id: p.id,
          name: p.name,
          email: p.email,
          company: p.company,
          type: p.type
        }))
      };

      // Prefer the (richer) HTML body for analysis: the plain-text `body` is often
      // over-stripped for forwarded emails (reduced to the forwarder's signature),
      // while the HTML retains the original content. Use gentle signature/header
      // stripping (same as the message view) and convert to text.
      const analysisBody = extractAnalysisText(message);

      // Create analysis prompt
      const emailContent = `
        From: ${message.fromEmail} (${message.fromName || 'N/A'})
        To: ${message.toEmail}
        Subject: ${message.subject || 'No Subject'}
        Body: ${analysisBody || 'No Body'}
      `;

      const prompt = `
        Analizza questa email e suggerisci a quali oggetti del CRM potrebbe essere collegata.
        
        EMAIL:
        ${emailContent}
        
        CONTESTO CRM:
        Projects: ${JSON.stringify(context.projects, null, 2)}
        Tasks: ${JSON.stringify(context.tasks, null, 2)}
        Partners: ${JSON.stringify(context.partners, null, 2)}
        
        Fornisci suggerimenti basati su:
        - Corrispondenze email con partners
        - Parole chiave nel soggetto/corpo che corrispondono a nomi di progetti/task
        - Contesto e argomenti dell'email
        
        Restituisci un JSON con questo formato:
        {
          "suggestions": [
            {
              "type": "project|task|partner",
              "id": "id_oggetto",
              "name": "nome_oggetto", 
              "confidence": 0.95,
              "reason": "spiegazione del perché questo match"
            }
          ],
          "bestMatch": {
            "type": "partner",
            "id": "best_match_id",
            "name": "best_match_name",
            "confidence": 0.98,
            "reason": "motivo del miglior match"
          }
        }
        
        Ordina i suggerimenti per confidenza (da più alta a più bassa).
        Includi solo match con confidenza >= 0.3.
        Il bestMatch deve avere la confidenza più alta.
      `;

      const modelKey = await getDefaultModelKey(organizationId);
      const gwResult = await aiGateway.complete({
        modelKey,
        messages: [
          {
            role: "system",
            content: "Sei un assistente AI specializzato nell'analisi di email per sistemi CRM. Restituisci sempre un JSON valido e ben formattato."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        responseFormat: { type: "json_object" },
        temperature: 0.3,
        organizationId,
        caller: "ai-service/analyzeMessage",
      });

      const result = JSON.parse(gwResult.content || '{"suggestions": []}');
      
      // Validate and filter results
      const validSuggestions = (result.suggestions || [])
        .filter((s: any) => s.confidence >= 0.3 && s.confidence <= 1.0)
        .sort((a: any, b: any) => b.confidence - a.confidence);

      const bestMatch = validSuggestions.length > 0 ? validSuggestions[0] : undefined;

      return {
        suggestions: validSuggestions,
        bestMatch
      };

    } catch (error) {
      console.error("AI analysis error:", error);
      return {
        suggestions: []
      };
    }
  }

  async updateMessageWithSuggestion(messageId: string, suggestion: AISuggestion, userId: string, organizationId?: string): Promise<void> {
    try {
      // Update the message with confidence score and reason
      const updateData: any = {
        confidenceScore: suggestion.confidence,
        matchingReason: suggestion.reason
      };

      // Set the appropriate association (keep existing behavior for backward compatibility)
      switch (suggestion.type) {
        case 'project':
          updateData.projectId = suggestion.id;
          break;
        case 'task':
          updateData.taskId = suggestion.id;
          break;
        case 'partner':
          updateData.partnerId = suggestion.id;
          break;
      }

      await storage.updateMessage(messageId, updateData, userId);

      // Create automatic message link if organization ID is available
      if (organizationId && suggestion.confidence >= 0.7) {
        try {
          const tableName = suggestion.type === 'partner' ? 'partners' : 
                           suggestion.type === 'project' ? 'projects' : 'tasks';
          
          await MessageLogService.linkMessage(
            messageId,
            tableName,
            suggestion.id,
            { userId, organizationId },
            {
              notes: `Auto-linked by AI with ${(suggestion.confidence * 100).toFixed(1)}% confidence: ${suggestion.reason}`,
              isAutomatic: true,
              linkType: "discussion"
            }
          );

          console.log(`[AI] Auto-created message link: ${messageId} -> ${tableName}/${suggestion.id} (confidence: ${suggestion.confidence})`);
        } catch (linkError) {
          console.error("Error creating automatic message link:", linkError);
          // Don't throw - the message update should still succeed even if linking fails
        }
      }
    } catch (error) {
      console.error("Error updating message with suggestion:", error);
    }
  }

  async generateDocumentation(prompt: string): Promise<{ content: string; confidence: number }> {
    try {
      const modelKey = await getDefaultModelKey();
      const gwResult = await aiGateway.complete({
        modelKey,
        messages: [
          {
            role: "system",
            content: "You are a specialized AI assistant for SAP ABAP development documentation. Create comprehensive, professional intervention documents that provide clear technical analysis, implementation details, and actionable recommendations. Focus on accuracy, clarity, and completeness."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        maxTokens: 4000,
        caller: "ai-service/generateDocumentation",
      });

      const content = gwResult.content || "";
      
      // Calculate confidence based on content quality indicators
      let confidence = 0.7; // Base confidence
      
      // Boost confidence for comprehensive content
      if (content.length > 1000) confidence += 0.1;
      if (content.includes("Executive Summary")) confidence += 0.05;
      if (content.includes("Technical Changes")) confidence += 0.05;
      if (content.includes("Impact Analysis")) confidence += 0.05;
      if (content.includes("Testing")) confidence += 0.05;
      
      // Ensure confidence is within bounds
      confidence = Math.min(0.95, Math.max(0.5, confidence));

      return {
        content,
        confidence
      };
    } catch (error) {
      console.error("AI documentation generation error:", error);
      throw new Error(`Failed to generate AI documentation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const aiService = new AIService();