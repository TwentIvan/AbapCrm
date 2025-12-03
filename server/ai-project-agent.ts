// AI Project Agent - Analyzes messages and proposes projects, partners, and tasks
// Using OpenAI integration from blueprint:javascript_openai

import OpenAI from "openai";
import type { Message, Project, Partner, Task, AiLearningPattern, Calendar } from "@shared/schema";

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
  contacts?: Array<{
    name: string;
    email: string;
    phone?: string;
    position?: string;
    company?: string;
    notes?: string;
  }>;
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
  calendar?: {
    id?: string; // Existing calendar ID
    name?: string; // For new calendar creation
    suggestedParentId?: string; // Parent calendar for hierarchy
  };
  reasoning: string; // Explanation of why these were proposed
}

// Interface for learning context
export interface LearningContext {
  patterns: AiLearningPattern[];
  calendars: Calendar[];
}

// Format learning patterns for AI context
function formatLearningPatterns(patterns: AiLearningPattern[]): string {
  if (!patterns || patterns.length === 0) {
    return '(nessun pattern appreso)';
  }

  return patterns.slice(0, 10).map(p => {
    const features = p.inputFeatures as Record<string, any>;
    const action = p.chosenAction as Record<string, any>;
    const ratio = p.acceptanceCount / (p.acceptanceCount + p.rejectionCount);
    const confidence = (ratio * 100).toFixed(0);
    
    return `  • Pattern "${p.patternType}" (${confidence}% accettato, usato ${p.acceptanceCount}x):
      Input: ${JSON.stringify(features)}
      Azione scelta: ${JSON.stringify(action)}`;
  }).join('\n');
}

// Format calendars for AI context
function formatCalendars(calendars: Calendar[]): string {
  if (!calendars || calendars.length === 0) {
    return '(nessun calendario disponibile)';
  }

  // Build hierarchical view
  const rootCalendars = calendars.filter(c => !c.parentCalendarId);
  const childrenMap = new Map<string, Calendar[]>();
  
  calendars.forEach(c => {
    if (c.parentCalendarId) {
      const children = childrenMap.get(c.parentCalendarId) || [];
      children.push(c);
      childrenMap.set(c.parentCalendarId, children);
    }
  });

  function formatCalendar(cal: Calendar, indent: string = ''): string {
    const children = childrenMap.get(cal.id) || [];
    let result = `${indent}• [${cal.id}] "${cal.name}" (${cal.color})${cal.isDefault ? ' ⭐ default' : ''}`;
    if (cal.partnerId) result += ` - Partner: ${cal.partnerId}`;
    if (children.length > 0) {
      result += '\n' + children.map(c => formatCalendar(c, indent + '    ')).join('\n');
    }
    return result;
  }

  return rootCalendars.map(c => formatCalendar(c)).join('\n');
}

export async function analyzeMessageForProject(
  message: Message,
  existingProjects: Project[],
  existingPartners: Partner[],
  existingTasks: Task[],
  learningContext?: LearningContext
): Promise<ProjectProposal> {
  const systemPrompt = `You are an intelligent project management assistant for a SAP ABAP freelancer CRM system.

## ⚠️ MANDATORY LANGUAGE REQUIREMENT ⚠️
**YOU MUST WRITE EVERYTHING IN ITALIAN - NO EXCEPTIONS**

ALL generated content MUST be in ITALIAN language:
- Project names → IN ITALIAN (e.g., "Sviluppo Report Vendite SAP", NOT "Sales Report Development")
- Descriptions → IN ITALIAN (e.g., "Creazione di un report personalizzato per...", NOT "Creation of a custom report for...")
- Task titles → IN ITALIAN (e.g., "Analisi requisiti tecnici", NOT "Technical requirements analysis")
- Task descriptions → IN ITALIAN (e.g., "Raccogliere e documentare i requisiti funzionali", NOT "Gather and document functional requirements")
- Reasoning → IN ITALIAN (e.g., "Ho identificato un nuovo progetto perché...", NOT "I identified a new project because...")

The user's interface is 100% in Italian. Everything you generate will be displayed directly to the user.
WRITE IN ITALIAN. DO NOT USE ENGLISH.

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
3. **Contacts**: Extract reference contacts from the message (people mentioned in CC, signatures, or body)
4. **Tasks**: Create task breakdown (2-5 tasks typically)

## INTELLIGENCE GUIDELINES

### Partner Matching (CRITICAL)
- ALWAYS prefer matching existing partners over creating new ones
- Match by: exact email, company name similarity, person name
- If 70%+ confidence match exists, use existingId, set isNew=false
- Only create new partner if clearly a new company/person

### Contact Extraction (IMPORTANT - NEW FEATURE)
Extract reference contacts from the message - these are people mentioned or visible in the email who may be useful for future reference:

**Where to look for contacts:**
- Email CC/BCC recipients
- Email signatures (look for name, email, phone, position)
- People mentioned in the body ("Please contact Marco for...", "Ti presento Andrea, il nostro...", "Collaborerò con Sara su questo progetto")
- People who should be involved ("Coinvolgere Maria", "Sentire Luca", "Forward to Giovanni")

**What to extract:**
- **name**: Full name of the person (REQUIRED)
- **email**: Email address (REQUIRED - do not create contact without email)
- **phone**: Phone number if mentioned
- **position**: Job title or role (e.g., "Project Manager", "SAP Consultant", "IT Director")
- **company**: Company/organization if mentioned
- **notes**: Brief context about why this contact is relevant (e.g., "Referente tecnico per il progetto", "Responsabile acquisti cliente")

**Rules:**
- Extract ONLY real people (not generic addresses like info@, support@)
- Do NOT extract the sender (they're already captured in partner)
- Do NOT extract the recipient (that's the user)
- Email is MANDATORY - don't create contact without email
- Include 0-5 contacts per message (don't force it if there aren't any)
- Keep notes concise (1-2 frasi in italiano)

**Examples of valid contacts:**
- CC recipient: marco.rossi@acmecorp.it with signature showing "Marco Rossi - SAP Technical Lead"
- Mentioned: "Collaborerò con Sara Bianchi (s.bianchi@example.com) sul modulo fatturazione"
- Signature: "Luca Verdi | Project Manager | +39 333 1234567 | l.verdi@company.it"

### Project Matching (⚠️ BE CONSERVATIVE - AVOID FALSE MATCHES)
**ONLY match existing project if there is EXPLICIT reference:**
- Message mentions exact project name (e.g., "Progetto Report Vendite", "Sistema Ordini")
- Message references specific project ID or code
- Message explicitly says "follow-up", "aggiornamento su progetto X", "stesso progetto di prima"
- Email thread/subject line clearly continues previous discussion about that project

**DO NOT match based on:**
- ❌ Same client/partner (one client can have multiple separate projects!)
- ❌ Similar technology (many projects use same SAP modules)
- ❌ Vague topic similarity (don't assume "report" = existing report project)
- ❌ Same sender (person can send messages about different projects)

**Default behavior: When in doubt, CREATE NEW project**
- Any new request, requirement, or work item → NEW project (isNew=true)
- Use "planning" status for new requests, "in_progress" only if message clearly updates existing work

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

### ⚠️ CRITICAL: Effort Consistency Rule
**LA SOMMA DELLE STIME DEI TASK DEVE ESSERE UGUALE ALLA STIMA DEL PROGETTO**

Se il progetto ha estimatedEffort = 40 ore, la somma di tutti i task.estimatedEffort deve essere esattamente 40 ore.
- Assicurati che ogni task abbia una stima (estimatedEffort)
- Verifica che: project.estimatedEffort === sum(tasks[].estimatedEffort)
- Se non puoi determinare le singole stime, distribuisci equamente le ore del progetto tra i task

Esempio corretto:
- Project: estimatedEffort = 24h
- Task 1: Analisi requisiti = 4h
- Task 2: Sviluppo = 12h
- Task 3: Testing = 4h
- Task 4: Documentazione = 4h
- TOTALE TASK: 4+12+4+4 = 24h ✓

### Learning from Past Decisions
Se il contesto include pattern appresi dall'utente, USALI per guidare le tue decisioni:
- Pattern con alta confidenza (>80%) → Segui il pattern
- Pattern con media confidenza (50-80%) → Considera il pattern
- Pattern con bassa confidenza (<50%) → Ignora il pattern

I pattern indicano preferenze dell'utente per:
- Abbinamento partner/progetto per determinati domini email
- Tipi di task preferiti per certi tipi di richiesta
- Calendari predefiniti per partner specifici
- Stime tipiche per certi tipi di lavoro

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
**REMINDER: ALL TEXT FIELDS MUST BE IN ITALIAN**

Return valid JSON ONLY with this exact structure (with ITALIAN content):
{
  "project": {
    "isNew": boolean,
    "existingId": "uuid-if-matching-existing-project",
    "name": "ITALIAN: Nome breve descrittivo (es. 'Sviluppo Modulo Fatturazione SAP')",
    "description": "ITALIAN: Descrizione dettagliata estratta dal messaggio (2-3 frasi in italiano)",
    "status": "planning|in_progress|review|completed|on_hold",
    "startDate": "YYYY-MM-DD if mentioned or implied",
    "endDate": "YYYY-MM-DD if deadline mentioned",
    "estimatedEffort": total_hours_number_or_null
  },
  "partner": {
    "isNew": boolean,
    "existingId": "uuid-if-existing-partner-matches",
    "name": "Nome persona o azienda",
    "email": "email-if-available",
    "company": "Nome azienda se menzionata",
    "type": "client|vendor|consultant|other"
  },
  "contacts": [
    {
      "name": "Nome completo della persona",
      "email": "email@domain.com (REQUIRED)",
      "phone": "Numero di telefono se disponibile (opzionale)",
      "position": "Ruolo o posizione lavorativa (opzionale)",
      "company": "Azienda di appartenenza (opzionale)",
      "notes": "ITALIAN: Breve contesto sul perché questo contatto è rilevante (1-2 frasi in italiano)"
    }
  ],
  "tasks": [
    {
      "isNew": true,
      "title": "ITALIAN: Titolo specifico del task (es. 'Analisi requisiti tecnici')",
      "description": "ITALIAN: Cosa deve essere fatto (es. 'Raccogliere e documentare i requisiti funzionali dal cliente')",
      "priority": "low|medium|high|urgent",
      "taskType": "development|analysis|design|testing|consulting|meeting|documentation|maintenance|support|other",
      "estimatedEffort": hours_number (OBBLIGATORIO - la somma deve corrispondere al progetto!),
      "dueDate": "YYYY-MM-DD if mentioned"
    }
  ],
  "calendar": {
    "id": "uuid-if-existing-calendar-suitable OR null",
    "name": "Nome nuovo calendario se necessario (es. 'Meeting Cliente ABC')",
    "suggestedParentId": "uuid-of-parent-calendar-for-hierarchy OR null"
  },
  "reasoning": "ITALIAN: Breve spiegazione in italiano del perché hai proposto questo progetto/partner/task/contatti/calendario, cosa hai abbinato, cosa hai dedotto, pattern usati, livello di confidenza. MENZIONA SE HAI USATO PATTERN APPRESI."
}`;

  // Build learning context section if available
  const learningSection = learningContext?.patterns && learningContext.patterns.length > 0 
    ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 PATTERN APPRESI (usa per guidare le tue decisioni)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${formatLearningPatterns(learningContext.patterns)}
` : '';

  const calendarsSection = learningContext?.calendars && learningContext.calendars.length > 0
    ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 CALENDARI DISPONIBILI (struttura gerarchica)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${formatCalendars(learningContext.calendars)}
` : '';

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
${learningSection}${calendarsSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 YOUR ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on the message content and existing context above:
1. Match or create appropriate Partner (prefer matching!)
2. Extract relevant Contacts (people in CC, signatures, or mentioned in body)
3. Match or create appropriate Project
4. Break down work into 2-5 specific Tasks (⚠️ STIME DEVONO SOMMARE AL TOTALE PROGETTO!)
5. Suggest appropriate Calendar for project events
6. Provide reasoning for your decisions (including any patterns used)

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
