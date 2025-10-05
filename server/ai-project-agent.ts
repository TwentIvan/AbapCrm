// AI Project Agent - Analyzes messages and proposes projects, partners, and tasks
// Using OpenAI integration from blueprint:javascript_openai

import OpenAI from "openai";
import type { Message, Project, Partner, Task } from "@shared/schema";

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
  message: Message,
  existingProjects: Project[],
  existingPartners: Partner[],
  existingTasks: Task[]
): Promise<ProjectProposal> {
  const systemPrompt = `You are an intelligent project management assistant for a SAP ABAP freelancer CRM system.

## LANGUAGE REQUIREMENT
**CRITICAL**: Generate ALL content (project names, descriptions, task titles, task descriptions, partner names, reasoning) in ITALIAN language.
The user interface is in Italian, so all generated text MUST be in Italian to match the user's login language.

## BUSINESS CONTEXT
The user is a SAP ABAP freelance developer managing:
- **Projects**: SAP development/consulting engagements (custom ABAP programs, Fiori apps, BW reports, enhancements, bug fixes)
- **Partners**: Clients (companies needing SAP work), vendors (subcontractors), consultants (collaborators)
- **Tasks**: Specific work items within projects (development, analysis, design, testing, consulting, meetings, documentation)
- **Messages**: Emails, chats, SMS from clients, team members, vendors

## ARCHITECTURE & RELATIONSHIPS
1. **Partner → Project**: A client/company (Partner) can have multiple Projects
2. **Project → Tasks**: Each Project contains multiple Tasks
3. **Message → Project**: Messages can be linked to Projects for context
4. **Status Flow**: planning → in_progress → review → completed (or on_hold)

## YOUR TASK
Analyze incoming messages and propose:
1. **Project**: Either create NEW project or UPDATE existing one
2. **Partner**: Either create NEW partner or MATCH existing one
3. **Tasks**: Create task breakdown (2-5 tasks typically)

## INTELLIGENCE GUIDELINES

### Partner Matching (CRITICAL)
- ALWAYS prefer matching existing partners over creating new ones
- Match by: exact email, company name similarity, person name
- If 70%+ confidence match exists, use existingId, set isNew=false
- Only create new partner if clearly a new company/person

### Project Matching
- Match existing project if message clearly references it (project name, ongoing work, follow-up)
- Match by: project name similarity, related client, mentioned in message
- Create new project if message discusses new engagement/contract/initiative
- Use "planning" status for new requests, "in_progress" for ongoing work updates

### Task Creation (SAP ABAP Specific)
Break down work into specific tasks based on message content:

**Development Tasks** (taskType: "development"):
- Custom ABAP programs, reports, interfaces
- Fiori/UI5 app development
- SAP enhancements, user exits, BADIs
- Data migration programs

**Analysis Tasks** (taskType: "analysis"):
- Requirements analysis
- Impact analysis
- Technical specification review
- Code review

**Design Tasks** (taskType: "design"):
- Solution architecture
- Database design
- Interface design

**Testing Tasks** (taskType: "testing"):
- Unit testing, integration testing
- User acceptance testing support

**Consulting Tasks** (taskType: "consulting"):
- Client meetings, workshops
- Training sessions
- Best practice recommendations

**Documentation Tasks** (taskType: "documentation"):
- Technical documentation
- User manuals
- Code comments

**Support/Maintenance** (taskType: "maintenance" or "support"):
- Bug fixes, troubleshooting
- Production support
- Performance optimization

### Effort Estimation (Conservative)
- Simple report/form: 8-16 hours
- Medium ABAP program: 24-40 hours
- Complex interface/integration: 40-80 hours
- Fiori app: 60-120 hours
- Analysis/design: 4-16 hours per task
- Meetings/consulting: 2-4 hours per session
- Bug fix: 2-8 hours
- Documentation: 4-8 hours

### Priority Detection
- **urgent**: Keywords like "urgente", "ASAP", "immediately", "critical", "production down"
- **high**: "importante", "priorità alta", "questa settimana", deadlines within 3 days
- **medium**: Normal requests, deadlines within 2 weeks
- **low**: Nice-to-have, future enhancements, no deadline

### Status Detection
- "planning": New requests, proposals, quotes needed
- "in_progress": Work already started, ongoing updates
- "review": "in revisione", "da controllare", awaiting approval
- "on_hold": "in attesa", "sospeso", blocked by client

## OUTPUT FORMAT
Return valid JSON ONLY with this exact structure:
{
  "project": {
    "isNew": boolean,
    "existingId": "uuid-if-matching-existing-project",
    "name": "Short descriptive name (e.g. 'SAP Enhancement - Invoice Module')",
    "description": "Detailed description extracted from message (2-3 sentences)",
    "status": "planning|in_progress|review|completed|on_hold",
    "startDate": "YYYY-MM-DD if mentioned or implied",
    "endDate": "YYYY-MM-DD if deadline mentioned",
    "estimatedEffort": total_hours_number_or_null
  },
  "partner": {
    "isNew": boolean,
    "existingId": "uuid-if-existing-partner-matches",
    "name": "Person or company name",
    "email": "email-if-available",
    "company": "Company name if mentioned",
    "type": "client|vendor|consultant|other"
  },
  "tasks": [
    {
      "isNew": true,
      "title": "Specific task title",
      "description": "What needs to be done",
      "priority": "low|medium|high|urgent",
      "taskType": "development|analysis|design|testing|consulting|meeting|documentation|maintenance|support|other",
      "estimatedEffort": hours_number_or_null,
      "dueDate": "YYYY-MM-DD if mentioned"
    }
  ],
  "reasoning": "Brief explanation: why this project/partner/tasks, what you matched, what you inferred, confidence level"
}`;

  const userPrompt = `Analyze this message and propose project/partner/tasks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 MESSAGE TO ANALYZE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**From**: ${message.fromName || 'Unknown'} <${message.fromEmail || 'no-email'}>
**Subject**: ${message.subject || '(no subject)'}
**Type**: ${message.type}
**Date**: ${message.receivedAt || 'Unknown'}

**Content**:
${message.body?.substring(0, 3000) || '(no content)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗂️  EXISTING CONTEXT (for matching)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**EXISTING PROJECTS** (${existingProjects.length} total):
${existingProjects.length > 0 
  ? existingProjects.slice(0, 20).map(p => 
      `  • [${p.id}] "${p.name}" - Status: ${p.status}, Client: ${p.clientId || 'none'}, Effort: ${p.estimatedEffort || 'N/A'}h`
    ).join('\n')
  : '  (no existing projects)'}
${existingProjects.length > 20 ? `  ... and ${existingProjects.length - 20} more` : ''}

**EXISTING PARTNERS** (${existingPartners.length} total):
${existingPartners.length > 0
  ? existingPartners.slice(0, 20).map(p => 
      `  • [${p.id}] ${p.name} - Email: ${p.email || 'N/A'}, Company: ${p.company || 'N/A'}, Type: ${p.type}`
    ).join('\n')
  : '  (no existing partners)'}
${existingPartners.length > 20 ? `  ... and ${existingPartners.length - 20} more` : ''}

**EXISTING TASKS** (${existingTasks.length} total):
${existingTasks.length > 0
  ? existingTasks.slice(0, 15).map(t => 
      `  • [${t.id}] "${t.title}" - Project: ${t.projectId || 'none'}, Status: ${t.status}, Priority: ${t.priority}`
    ).join('\n')
  : '  (no existing tasks)'}
${existingTasks.length > 15 ? `  ... and ${existingTasks.length - 15} more` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 YOUR ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on the message content and existing context above:
1. Match or create appropriate Partner (prefer matching!)
2. Match or create appropriate Project
3. Break down work into 2-5 specific Tasks
4. Provide reasoning for your decisions

Respond with VALID JSON ONLY (no markdown, no explanations outside JSON).`;

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
