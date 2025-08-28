import OpenAI from "openai";
import { storage } from "./storage";
import type { Project, Task, Partner, Message } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  async analyzeMessage(message: Message, userId: string): Promise<AnalysisResult> {
    try {
      // Fetch user's data for context
      const [projects, tasks, partners] = await Promise.all([
        storage.getProjects(userId),
        storage.getTasks(userId),
        storage.getPartners(userId)
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

      // Create analysis prompt
      const emailContent = `
        From: ${message.fromEmail} (${message.fromName || 'N/A'})
        To: ${message.toEmail}
        Subject: ${message.subject || 'No Subject'}
        Body: ${message.body || 'No Body'}
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

      const response = await openai.chat.completions.create({
        model: "gpt-5",
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
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
      
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

  async updateMessageWithSuggestion(messageId: string, suggestion: AISuggestion, userId: string): Promise<void> {
    try {
      const updateData: any = {
        confidenceScore: suggestion.confidence,
        matchingReason: suggestion.reason
      };

      // Set the appropriate association
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
    } catch (error) {
      console.error("Error updating message with suggestion:", error);
    }
  }
}

export const aiService = new AIService();