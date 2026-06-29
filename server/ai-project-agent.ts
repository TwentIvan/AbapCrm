// AI Project Agent - Analyzes messages and proposes projects, partners, and tasks

import { aiGateway, getDefaultModelKey } from "./ai-gateway";
import type {
  Message, Project, Partner, Task, AiLearningPattern, Calendar,
  SapSystem, VpnConnection, McpServerConfig, McpCatalogWithValidation,
  Contact,
} from "@shared/schema";

export interface ProjectProposal {
  project: {
    isNew: boolean;
    existingId?: string;
    name: string;
    description: string;
    status: "planning" | "in_progress" | "review" | "completed" | "on_hold";
    startDate?: string;
    endDate?: string;
    estimatedEffort?: number;
    subProjects?: Array<{ name: string; description: string }>;
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
    isNew?: boolean;
    existingId?: string;
    name: string;
    email: string;
    phone?: string;
    position?: string;
    company?: string;
    notes?: string;
  }>;
  // People interested in the project — stakeholders to keep informed / who must approve.
  // Each references a contact by email (matching contacts[] or existingContacts).
  stakeholders?: Array<{
    contactEmail: string;
    role: "informed" | "approver" | "responsible" | "reviewer";
    notify?: boolean; // receive progress notifications
    notes?: string;
  }>;
  // Workflow objects the agent proposes — generic and entity-agnostic. The design is in
  // the values: entityType names the entity whose events drive it, triggerEvent/Config say
  // when it fires, actors say who is involved, actions say what happens. Only the objects
  // are created; execution is layered on later.
  workflows?: Array<{
    name: string;
    description?: string;
    entityType: string; // "project" | "task" | "deal" | "contact" | "milestone" | "message" | ...
    triggerEvent: "created" | "updated" | "deleted"; // CRUD events only
    // Field conditions apply ONLY when triggerEvent === "updated".
    conditions?: { rules: Array<{ field: string; operator: string; value?: any }> };
    actors?: Array<{
      contactEmail: string;
      action: "inform" | "approve" | "review";
    }>;
    actions?: Array<{
      type: string; // "notify" | "request_approval" | "send_email" | "create_task" | ...
      config?: Record<string, any>;
    }>;
  }>;
  tasks: Array<{
    isNew: boolean;
    existingId?: string;
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "urgent";
    taskType: "development" | "analysis" | "design" | "testing" | "consulting" | "meeting" | "documentation" | "maintenance" | "support" | "other";
    estimatedEffort?: number;
    dueDate?: string;
    subProjectName?: string;
    sapSystemRef?: string;
    aiSpec?: {
      objective: string;
      inputs: string[];
      acceptanceCriteria: string[];
      requiredMcpCategories: string[];
      proposedMcpConfigs?: Array<{
        configId?: string;
        name: string;
        category?: string;
        write: boolean;
        reason: string;
      }>;
      complexity: "S" | "M" | "L";
      openQuestions: string[];
      confidence: number;
    };
  }>;
  calendar?: {
    id?: string;
    name?: string;
    suggestedParentId?: string;
  };
  systems?: Array<{
    isNew: boolean;
    existingId?: string;
    name: string;
    systemId?: string;
    landscapeType?: "development" | "test" | "quality" | "pre_production" | "production" | "other";
    role?: "target" | "reference";
    needsManualConfig?: boolean;
    notes?: string;
  }>;
  connections?: Array<{
    isNew: boolean;
    existingId?: string;
    name: string;
    kind: "vpn" | "workflow";
    sapSystemRef?: string;
    needsManualConfig: boolean;
    notes?: string;
  }>;
  needsClarification?: boolean;
  clarificationQuestions?: string[];
  reasoning: string;
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

// Format SAP systems for AI context
function formatSapSystems(systems: SapSystem[]): string {
  if (!systems || systems.length === 0) return '  (nessun sistema SAP registrato)';
  return systems.slice(0, 25).map(s => {
    const land = s.landscapeType || s.landscape || '?';
    return `  • [${s.id}] "${s.name}" (SID ${s.systemId}, ${land}, ${s.connectionType || 'sapgui'})`
      + `${s.partnerId ? ` - Partner: ${s.partnerId}` : ''}`;
  }).join('\n');
}

// Format VPN connections for AI context
function formatConnections(connections: VpnConnection[]): string {
  if (!connections || connections.length === 0) return '  (nessuna connessione registrata)';
  return connections.slice(0, 25).map(c =>
    `  • [${c.id}] "${c.name}" (${c.connectionType}, ${c.status}) - Partner: ${c.partnerId}`
  ).join('\n');
}

// Format org's VALIDATED MCP server configs with catalog documentation
function formatMcpContext(
  mcpContext?: { catalog: McpCatalogWithValidation[]; configs: McpServerConfig[] }
): string {
  if (!mcpContext || mcpContext.configs.length === 0) {
    return '  (nessun server MCP configurato per questa organizzazione)';
  }
  const catalogById = new Map(mcpContext.catalog.map(c => [c.id, c]));
  return mcpContext.configs.map(cfg => {
    const cat = cfg.catalogId ? catalogById.get(cfg.catalogId) : undefined;
    const validated = cat?.validated === true;
    const desc = (cat?.description || '').slice(0, 200);
    const readme = (cat?.readmeMd || '').replace(/\s+/g, ' ').slice(0, 400);
    return [
      `  • config [${cfg.id}] "${cfg.name}"`,
      `      category: ${cat?.category || 'n/d'} | env: ${cfg.environment} | readOnly: ${cfg.readOnly}`
        + ` | writeCapable: ${cat?.writeCapable ?? 'n/d'} | VALIDATED: ${validated ? 'SI' : 'NO (non utilizzabile)'}`,
      desc ? `      desc: ${desc}` : '',
      readme ? `      doc: ${readme}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n');
}

/**
 * Parse JSON from an LLM response that may be wrapped in markdown fences
 * (```json ... ```) or include a textual preamble. OpenAI's json_object mode
 * returns pure JSON, but Claude and other models often do not.
 */
function parseJsonLoose(raw: string | null | undefined): any {
  const text = (raw || "").trim();
  if (!text) return {};

  // 1) Try direct parse
  try {
    return JSON.parse(text);
  } catch { /* fall through */ }

  // 2) Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* fall through */ }
  }

  // 3) Extract the outermost {...} object
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch { /* fall through */ }
  }

  throw new Error("La risposta dell'agente non è un JSON valido");
}

export async function analyzeMessageForProject(
  message: Message,
  existingProjects: Project[],
  existingPartners: Partner[],
  existingTasks: Task[],
  learningContext?: LearningContext,
  organizationId?: string,
  existingSapSystems: SapSystem[] = [],
  existingConnections: VpnConnection[] = [],
  mcpContext?: { catalog: McpCatalogWithValidation[]; configs: McpServerConfig[] },
  modelKeyOverride?: string,
  existingContacts: Contact[] = [],
): Promise<ProjectProposal & { _tokenUsage?: { promptTokens: number; completionTokens: number } }> {
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
1. **Project**: Either create NEW project or UPDATE existing one (optionally split into subProjects for multi-stream work)
2. **Partner**: Either create NEW partner or MATCH existing one
3. **Contacts**: Extract reference contacts from the message
4. **Tasks**: Decompose into as many REAL delivery tasks as the scope requires (NOT a fixed 2-5).
   Un'attività complessa "fatta di tanti pezzi" va scomposta in TUTTE le sue unità di lavoro
   significative; usa project.subProjects per i flussi distinti. Mai sotto-scomporre per stare
   in un numero piccolo, mai gonfiare. I task rappresentano lavoro di delivery REALE, non
   meta-task sul leggere o rispondere alla mail.
5. **Systems & Connections**: Match existing SAP systems and connections; propose new ones as stubs (needsManualConfig=true)
6. **MCP servers**: For each task, propose ONLY validated MCP configs from the org's catalog

## INTELLIGENCE GUIDELINES

### Partner Matching (CRITICAL)
- ALWAYS prefer matching existing partners over creating new ones
- Match by: exact email, company name similarity, person name
- If 70%+ confidence match exists, use existingId, set isNew=false
- Only create new partner if clearly a new company/person

### Contact Extraction (match-first, like projects & systems)
Extract reference contacts from the message:
- Email CC/BCC recipients, signatures, people mentioned in body
- **email is MANDATORY** — do not create contact without email
- **Match-first**: before creating a contact, check EXISTING CONTACTS by email.
  If found, set isNew=false + existingId and do NOT duplicate. Otherwise isNew=true.
- Include 0-5 contacts; notes in Italian; do not extract sender or recipient

### Stakeholders (people interested in the project — for notification/approval workflows)
Identify which contacts are **interested parties of the project** and populate stakeholders[]:
- **role**: "informed" (kept up to date on progress), "approver" (must approve deliverables/
  milestones), "responsible" (client-side owner/referente), "reviewer" (reviews work).
- **notify=true** when the person should receive progress updates (status changes, milestones).
- Reference each stakeholder by contactEmail matching a contacts[] entry or an existing contact.
- Infer roles from the message: e.g. the person asking for the work / signing off = approver or
  responsible; people in CC interested in updates = informed. Be conservative — only add a
  stakeholder when the message genuinely indicates interest/involvement. Empty array if unclear.

### Workflows (propose the automation, don't execute it) — GENERIC & ENTITY-AGNOSTIC
When the message implies a recurring communication or approval need, propose workflows[]. A
workflow is fully data-driven — its design lives in the field values, NOT in fixed types:
- **entityType**: the name of the entity whose events drive the workflow — "project", "task",
  "deal", "contact", "milestone", "message", etc. Pick whichever entity the automation is about.
- **triggerEvent**: a CRUD event only — "created", "updated", or "deleted".
- **conditions** (ONLY for triggerEvent="updated"): rules on the entity's fields, e.g.
  { rules: [ { field: "status", operator: "eq", value: "completed" } ] }. Operators:
  eq, neq, gt, lt, gte, lte, changed. "status" is just one field among many — condition on
  whatever field matters (completionPercentage, priority, dueDate, ...). Omit conditions for
  created/deleted.
- **actors**: which stakeholders are involved and what they do — "inform" (receive an update),
  "approve" (must sign off), "review". Reference each by contactEmail matching a stakeholder.
- **actions**: what the workflow does — e.g. { type: "notify" }, { type: "request_approval" },
  { type: "send_email" }, { type: "create_task", config: {...} }.
- Name/description in Italian. Propose a workflow ONLY when the message genuinely signals it
  (e.g. "tienimi aggiornato sullo stato del progetto", "il referente cliente deve approvare a
  fine sviluppo", "avvisami quando il task X è completato"). Empty array otherwise — do NOT
  invent workflows. You decide entity, event, actors and actions; the system only persists the
  objects (no execution yet).

### Project Matching (⚠️ BE CONSERVATIVE - AVOID FALSE MATCHES)
**ONLY match existing project if there is EXPLICIT reference:**
- Message mentions exact project name or ID
- Message explicitly says "follow-up", "aggiornamento su progetto X", "stesso progetto di prima"
- Email thread/subject line clearly continues previous discussion

**DO NOT match based on:** same client, similar technology, vague topic, same sender.
**Default: When in doubt, CREATE NEW project** (isNew=true, status "planning")

**Sub-projects**: Use subProjects[] ONLY when the activity has genuinely distinct deliverable streams (e.g., a migration with separate analysis, development, and go-live tracks). Do NOT add sub-projects for simple single-stream work. Tasks reference a sub-project via subProjectName matching subProjects[].name.

### ⚠️ RICHIESTE DI STIMA / PREVENTIVO (pattern critico)
Quando l'ASK del messaggio è una stima, un preventivo, una quotazione, una valutazione di
fattibilità o un'offerta (parole spia: "stima", "stimare", "preventivo", "quotazione",
"offerta", "fattibilità", "quanto tempo", "quanto costa", "ballpark"), NON creare task che
parlano di "produrre la stima". La stima NON è il lavoro: è il RISULTATO della scomposizione.

Devi invece:
1. Identificare il LAVORO sottostante da stimare (l'intervento reale richiesto nella mail).
2. Scomporre QUEL lavoro nelle sue fasi reali di delivery, ognuna con il suo estimatedEffort.
   Fasi tipiche SAP ABAP (includi solo le pertinenti): analisi requisiti → specifica
   funzionale/tecnica → oggetti DDIC (domini/data element/strutture/tabelle) → sviluppo
   (programmi/classi/function/enhancement) → unit test → test di integrazione →
   trasporto/cutover → documentazione.
3. La stima del progetto è la SOMMA degli effort dei task (project.estimatedEffort = Σ task).
   È QUESTO il senso della regola "la somma deve corrispondere al totale del progetto".
4. project.status = "planning".
5. Al massimo UN task piccolo "Predisposizione e invio preventivo/offerta", se è atteso un
   documento formale — ma è marginale, non è il progetto.

Se l'attività è troppo vaga per essere scomposta (non puoi stimare ciò che non puoi
dimensionare), attiva l'AMBIGUITY GATE: needsClarification=true + clarificationQuestions di
scoping, invece di 2 task superficiali.

PRINCIPIO GENERALE (vale oltre le stime): separa SEMPRE ciò che il mittente ti chiede di
COMUNICARE (una stima, una conferma, una risposta) dal LAVORO da modellare (l'intervento).
Modella il lavoro; la comunicazione è al massimo un singolo task piccolo.

### Task Creation (SAP ABAP Specific)
- **development**: Custom ABAP programs, reports, Fiori/UI5 apps, enhancements, BADIs
- **analysis**: Requirements, impact analysis, technical specs, code review
- **design**: Solution architecture, database design, interface design
- **testing**: Unit/integration/UAT testing
- **consulting**: Client meetings, workshops, training
- **documentation**: Technical docs, user manuals
- **maintenance/support**: Bug fixes, production support, performance

For each task, set sapSystemRef matching the name of the target SAP system (from existing or newly proposed systems).

### ⚠️ CRITICAL: Task Matching / Deduplication (match-first, like projects & systems)
**If the matched project already exists (project.isNew=false), you MUST compare every task you
generate against that project's EXISTING TASKS (see list above, grouped by project) BEFORE
proposing it.**
- If an existing task semantically covers the same work (same subProjectName/target system +
  equivalent taskType + same objective), set the task **isNew=false** and populate **existingId**
  with the existing task's id. Do NOT recreate it.
- Only set isNew=true for work genuinely NOT yet present among the project's existing tasks.
- Ignore/match-only existing tasks already in status "done"/"completed" (don't duplicate them).
- **Effort consistency**: when a task is matched (isNew=false), its estimatedEffort still counts
  toward project.estimatedEffort, but do NOT double-count — the project total = Σ of all tasks
  (new + existing) for the intended scope, not new-only.
- When unsure whether a generated task duplicates an existing one, prefer isNew=false +
  needsClarification over silently creating a duplicate.

### Effort Estimation (Conservative)
- Simple report/form: 8-16h | Medium ABAP program: 24-40h | Complex interface: 40-80h
- Fiori app: 60-120h | Analysis/design: 4-16h | Meetings: 2-4h | Bug fix: 2-8h | Docs: 4-8h

### ⚠️ CRITICAL: Effort Consistency Rule
**LA SOMMA DELLE STIME DEI TASK DEVE ESSERE UGUALE ALLA STIMA DEL PROGETTO**

### Infrastructure Awareness (Phase 6)
**SAP Systems (match-first):**
- Check EXISTING SAP SYSTEMS list before proposing new ones
- If a system is clearly referenced (by name, SID, or client): use existingId, isNew=false
- If a new system is needed: isNew=true, needsManualConfig=true (never invent host/credentials)
- Set role: "target" = work happens here; "reference" = read-only context

**Connections (match-first):**
- Check EXISTING CONNECTIONS before proposing new ones
- New connections: always needsManualConfig=true (VPN config/secrets cannot be derived from a message)

**MCP Servers (derive from catalog docs, not guessing):**
- For each task's aiSpec.proposedMcpConfigs: use ONLY configs where VALIDATED=SI
- Do NOT propose read_only configs for tasks that need writes (write=true)
- If no suitable validated server exists → add an openQuestion instead of forcing
- Keep requiredMcpCategories for backward compatibility (coarse hint)

### Ambiguity Gate
If the message lacks enough information to build a sound project:
- Set needsClarification=true
- List clarificationQuestions in Italian
- Propose only a minimal project skeleton with 1-2 placeholder tasks
- Do NOT fabricate task details when inputs are missing

### Learning from Past Decisions
- Pattern >80% confidence → follow it
- Pattern 50-80% → consider it
- Pattern <50% → ignore it

### Priority Detection
- **urgent**: "urgente", "ASAP", "critical", "production down"
- **high**: "importante", deadlines within 3 days
- **medium**: Normal requests, deadlines within 2 weeks
- **low**: Nice-to-have, future enhancements

## OUTPUT FORMAT
Return valid JSON ONLY with this structure (ALL text fields in ITALIAN):
{
  "project": {
    "isNew": boolean,
    "existingId": "uuid-if-matching",
    "name": "ITALIAN: Nome breve descrittivo",
    "description": "ITALIAN: Descrizione dettagliata (2-3 frasi)",
    "status": "planning|in_progress|review|completed|on_hold",
    "startDate": "YYYY-MM-DD if mentioned",
    "endDate": "YYYY-MM-DD if deadline mentioned",
    "estimatedEffort": total_hours_or_null,
    "subProjects": [
      { "name": "ITALIAN: nome sotto-progetto", "description": "ITALIAN: descrizione" }
    ]
  },
  "partner": {
    "isNew": boolean,
    "existingId": "uuid-if-existing",
    "name": "Nome persona o azienda",
    "email": "email-if-available",
    "company": "Nome azienda",
    "type": "client|vendor|consultant|other"
  },
  "contacts": [
    {
      "isNew": boolean,
      "existingId": "contacts.id if this contact already exists (match by email, isNew=false)",
      "name": "Nome completo",
      "email": "email@domain.com (REQUIRED)",
      "phone": "opzionale",
      "position": "opzionale",
      "company": "opzionale",
      "notes": "ITALIAN: contesto breve (1-2 frasi)"
    }
  ],
  "stakeholders": [
    {
      "contactEmail": "email del contatto interessato (deve combaciare con un contacts[].email o un contatto esistente)",
      "role": "informed|approver|responsible|reviewer",
      "notify": true,
      "notes": "ITALIAN: perché questa persona è interessata al progetto"
    }
  ],
  "workflows": [
    {
      "name": "ITALIAN: nome breve del workflow (es. 'Approvazione completamento')",
      "description": "ITALIAN: cosa fa il workflow",
      "entityType": "project|task|deal|contact|milestone|message|...",
      "triggerEvent": "created|updated|deleted",
      "conditions": { "rules": [ { "field": "status", "operator": "eq", "value": "completed" } ] },
      "actors": [
        { "contactEmail": "email (deve combaciare con uno stakeholder)", "action": "inform|approve|review" }
      ],
      "actions": [
        { "type": "notify|request_approval|send_email|create_task", "config": {} }
      ]
    }
  ],
  "tasks": [
    {
      "isNew": boolean,
      "existingId": "tasks.id if this task already exists in the matched project (isNew=false)",
      "title": "ITALIAN: Titolo specifico",
      "description": "ITALIAN: Cosa deve essere fatto",
      "priority": "low|medium|high|urgent",
      "taskType": "development|analysis|design|testing|consulting|meeting|documentation|maintenance|support|other",
      "estimatedEffort": hours (OBBLIGATORIO, somma = project.estimatedEffort),
      "dueDate": "YYYY-MM-DD if mentioned",
      "subProjectName": "matches project.subProjects[].name if applicable",
      "sapSystemRef": "matches systems[].name for the target system",
      "aiSpec": {
        "objective": "ITALIAN: obiettivo in una frase",
        "inputs": ["riferimenti concreti dal messaggio"],
        "acceptanceCriteria": ["ITALIAN: criterio verificabile"],
        "requiredMcpCategories": ["abap_adt|sap_gui|odata|..."],
        "proposedMcpConfigs": [
          {
            "configId": "mcp_server_configs.id if matched",
            "name": "nome config",
            "category": "categoria",
            "write": false,
            "reason": "ITALIAN: perché questo server serve per il task"
          }
        ],
        "complexity": "S|M|L",
        "openQuestions": ["ITALIAN: domanda se ambiguità"],
        "confidence": 0.0-1.0
      }
    }
  ],
  "calendar": {
    "id": "uuid-if-existing OR null",
    "name": "Nome nuovo calendario se necessario",
    "suggestedParentId": "uuid-parent OR null"
  },
  "systems": [
    {
      "isNew": boolean,
      "existingId": "sap_systems.id if matched",
      "name": "Nome sistema",
      "systemId": "SID 3 chars if derivable",
      "landscapeType": "development|test|quality|pre_production|production|other",
      "role": "target|reference",
      "needsManualConfig": true (always true when isNew),
      "notes": "ITALIAN: note"
    }
  ],
  "connections": [
    {
      "isNew": boolean,
      "existingId": "id if matched",
      "name": "Nome connessione",
      "kind": "vpn|workflow",
      "sapSystemRef": "matches systems[].name",
      "needsManualConfig": true (always true when isNew),
      "notes": "ITALIAN: note"
    }
  ],
  "needsClarification": false,
  "clarificationQuestions": [],
  "reasoning": "ITALIAN: spiegazione decisioni, match effettuati, pattern usati, scelte MCP, livello confidenza"
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

  const userPrompt = `Analyze this message and propose project/partner/tasks/systems/connections.

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

**EXISTING TASKS** (${existingTasks.length} total) — grouped by project, match-first to avoid duplicates:
${(() => {
  if (existingTasks.length === 0) return '  (no existing tasks)';
  // Group tasks by project so the agent can match generated tasks against
  // the tasks already present in the matched project (dedup).
  const byProject = new Map<string, Task[]>();
  for (const t of existingTasks) {
    const key = t.projectId || 'none';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(t);
  }
  const projName = new Map(existingProjects.map(p => [p.id, p.name]));
  const blocks: string[] = [];
  for (const [pid, tlist] of byProject) {
    const header = pid === 'none' ? 'Project: (none)' : `Project [${pid}] "${projName.get(pid) || '?'}"`;
    const lines = tlist.slice(0, 30).map(t =>
      `    • [${t.id}] "${t.title}" - Type: ${t.taskType}, Status: ${t.status}, Effort: ${t.estimatedEffort || 'N/A'}h`
    ).join('\n');
    const more = tlist.length > 30 ? `\n    ... and ${tlist.length - 30} more` : '';
    blocks.push(`  ${header} (${tlist.length} task):\n${lines}${more}`);
  }
  return blocks.join('\n');
})()}

**EXISTING CONTACTS** (${existingContacts.length} total) — match-first by email to avoid duplicates:
${existingContacts.length > 0
  ? existingContacts.slice(0, 30).map(c =>
      `  • [${c.id}] ${c.name} <${c.email}> - ${c.position || 'N/A'} @ ${c.company || 'N/A'}${c.partnerId ? `, Partner: ${c.partnerId}` : ''}`
    ).join('\n')
  : '  (no existing contacts)'}
${existingContacts.length > 30 ? `  ... and ${existingContacts.length - 30} more` : ''}

**EXISTING SAP SYSTEMS** (${existingSapSystems.length} total) — match-first, target tasks here:
${formatSapSystems(existingSapSystems)}

**EXISTING CONNECTIONS** (${existingConnections.length} total) — VPN/workflows, match-first:
${formatConnections(existingConnections)}

**AVAILABLE MCP SERVERS** (org configs + catalog docs) — attach per task ONLY if VALIDATED:
${formatMcpContext(mcpContext)}
${learningSection}${calendarsSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 YOUR ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on the message content and existing context above:
1. Match or create appropriate Partner (prefer matching!)
2. Extract relevant Contacts (people in CC, signatures, or mentioned in body)
3. Match or create appropriate Project (use subProjects only for multi-stream work)
4. Break down work into as many REAL delivery tasks as the scope requires — depth scales with
   complexity, NOT a fixed 2-5 (⚠️ Σ task effort = project effort!). For an estimate request,
   model the UNDERLYING engagement and let the sum BE the estimate.
5. For EACH task: set sapSystemRef (target system) and proposedMcpConfigs (only VALIDATED, with Italian reason)
6. Resolve Systems & Connections (match-first; new ones → needsManualConfig=true, never invent secrets)
7. Suggest appropriate Calendar for project events
8. AMBIGUITY GATE: if the activity is too vague, set needsClarification=true + clarificationQuestions, propose minimal skeleton
9. Provide reasoning in Italian (match decisions, patterns used, MCP choices, confidence level)

Respond with VALID JSON ONLY (no markdown, no explanations outside JSON).`;

  try {
    const modelKey = modelKeyOverride || await getDefaultModelKey(organizationId);
    const gwResult = await aiGateway.complete({
      modelKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      responseFormat: { type: "json_object" },
      organizationId,
      caller: "ai-project-agent/analyzeMessageForProject",
    });

    const proposal = parseJsonLoose(gwResult.content);

    console.log('[AI-AGENT] Generated proposal:', JSON.stringify(proposal, null, 2));

    return {
      ...proposal,
      _tokenUsage: {
        promptTokens: gwResult.promptTokens,
        completionTokens: gwResult.completionTokens,
      },
    } as ProjectProposal & { _tokenUsage: { promptTokens: number; completionTokens: number } };
  } catch (error) {
    console.error('[AI-AGENT] Error analyzing message:', error);
    throw new Error(`Failed to analyze message: ${error instanceof Error ? error.message : String(error)}`);
  }
}
