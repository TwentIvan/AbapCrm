// AI Project Agent - Analyzes messages and proposes projects, partners, and tasks
// Using OpenAI integration from blueprint:javascript_openai

import OpenAI from "openai";
import type { SelectMessage, SelectProject, SelectPartner, SelectTask } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProjectProposal {
  project: {
    isNew: boolean;
    existingId?: string;
    name: string;
    description: string;
    status: "planning" | "in_progress" | "review" | "completed" | "on_hold";
    startDate?: string;
    endDate?: string;
    estimatedEffort?: number; // hours
  };
  partner: {
    isNew: boolean;
    existingId?: string;
    name: string;
    email?: string;
    company?: string;
    type: "client" | "vendor" | "consultant" | "other";
  };
  tasks: Array<{
    isNew: boolean;
    existingId?: string;
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "urgent";
    taskType: "development" | "analysis" | "design" | "testing" | "consulting" | "meeting" | "documentation" | "maintenance" | "support" | "other";
    estimatedEffort?: number; // hours
    dueDate?: string;
  }>;
  reasoning: string; // Explanation of why these were proposed
}

export async function analyzeMessageForProject(
  message: SelectMessage,
  existingProjects: SelectProject[],
  existingPartners: SelectPartner[],
  existingTasks: SelectTask[]
): Promise<ProjectProposal> {
  const systemPrompt = `You are an intelligent project management assistant for SAP ABAP freelancers.
Analyze email/chat messages and propose:
1. A project (new or modification to existing)
2. A partner/client (new or existing)
3. Tasks to be created or modified

Consider:
- Email subject, body, sender information
- Existing projects that might be related
- Existing partners that might match
- Task breakdown based on mentioned work

Output JSON with this structure:
{
  "project": {
    "isNew": boolean,
    "existingId": "uuid if modifying existing",
    "name": "project name",
    "description": "detailed description",
    "status": "planning|in_progress|review|completed|on_hold",
    "startDate": "ISO date if mentioned",
    "endDate": "ISO date if mentioned",
    "estimatedEffort": number in hours if you can estimate
  },
  "partner": {
    "isNew": boolean,
    "existingId": "uuid if existing partner matches",
    "name": "partner name",
    "email": "partner email if available",
    "company": "company name",
    "type": "client|vendor|consultant|other"
  },
  "tasks": [
    {
      "isNew": boolean,
      "existingId": "uuid if modifying existing task",
      "title": "task title",
      "description": "task description",
      "priority": "low|medium|high|urgent",
      "taskType": "development|analysis|design|testing|consulting|meeting|documentation|maintenance|support|other",
      "estimatedEffort": number in hours,
      "dueDate": "ISO date if mentioned"
    }
  ],
  "reasoning": "Brief explanation of your analysis and proposals"
}`;

  const userPrompt = `Analyze this message and propose project/partner/tasks:

MESSAGE DETAILS:
From: ${message.fromName || message.fromEmail}
Subject: ${message.subject || "No subject"}
Type: ${message.type}
Body: ${message.body?.substring(0, 3000) || "No content"}

EXISTING PROJECTS (match if related):
${existingProjects.map(p => `- ID: ${p.id}, Name: ${p.name}, Status: ${p.status}, Client: ${p.clientId}`).join('\n') || 'None'}

EXISTING PARTNERS (match if same company/person):
${existingPartners.map(p => `- ID: ${p.id}, Name: ${p.name}, Email: ${p.email}, Company: ${p.company}, Type: ${p.type}`).join('\n') || 'None'}

EXISTING TASKS (match if this message relates to an existing task):
${existingTasks.map(t => `- ID: ${t.id}, Title: ${t.title}, Project: ${t.projectId}, Status: ${t.status}`).join('\n') || 'None'}

Respond with valid JSON only.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
    });

    const proposal = JSON.parse(response.choices[0].message.content || "{}");
    
    console.log('[AI-AGENT] Generated proposal:', JSON.stringify(proposal, null, 2));
    
    return proposal as ProjectProposal;
  } catch (error) {
    console.error('[AI-AGENT] Error analyzing message:', error);
    throw new Error(`Failed to analyze message: ${error instanceof Error ? error.message : String(error)}`);
  }
}
