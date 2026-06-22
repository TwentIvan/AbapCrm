// AI Project Agent - Analyzes messages and proposes projects, partners, and tasks

import { aiGateway, getDefaultModelKey } from "./ai-gateway";
import type {
  Message, Project, Partner, Task, AiLearningPattern, Calendar,
  // Phase 6 — infrastructure & MCP awareness
  SapSystem, VpnConnection, McpServerConfig, McpCatalogWithValidation,
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
    estimatedEffort?: number; // hours
    // Optional breakdown into sub-projects (parentProjectId hierarchy) for complex activities
    // with genuinely distinct deliverable streams. Tasks group to these via task.subProjectName.
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
    // Which sub-project this task belongs to (matches project.subProjects[].name), if any
    subProjectName?: string;
    // Which SAP system this task targets (matches a systems[].name / .existingId below).
    // Maps to tasks.sapSystemId on persistence — tells the executor WHERE to run.
    sapSystemRef?: string;
    // AI Spec (Phase 5) — structured spec produced by the intake agent
    aiSpec?: {
      objective: string;
      inputs: string[];
      acceptanceCriteria: string[];
      requiredMcpCategories: string[]; // kept for backward-compat (coarse hint)
      // Phase 6 — concrete MCP servers proposed for THIS task, derived from catalog docs.
      // configId/name reference real mcp_server_configs; persisted into tasks.mcpConfigIds.
      proposedMcpConfigs?: Array<{
        configId?: string;   // mcp_server_configs.id when a concrete instance was matched
        name: string;        // human-readable server/config name
        category?: string;   // abap_adt | sap_gui | odata | docs | hana | ...
        write: boolean;      // true if the task needs a write-capable tool on this server
        reason: string;      // ITALIAN: why this server fits this task
      }>;
      complexity: "S" | "M" | "L";
      openQuestions: string[];
      confidence: number; // 0.0-1.0
    };
  }>;
  calendar?: {
    id?: string; // Existing calendar ID
    name?: string; // For new calendar creation
    suggestedParentId?: string; // Parent calendar for hierarchy
  };
  // Phase 6 — SAP systems to link/create for this activity (match-first; never invent secrets)
  systems?: Array<{
    isNew: boolean;
    existingId?: string;        // sap_systems.id when matched
    name: string;               // e.g. "DEV cliente X"
    systemId?: string;          // SID (3 chars) e.g. "DEV", if derivable
    landscapeType?: "development" | "test" | "quality" | "pre_production" | "production" | "other";
    role?: "target" | "reference"; // target = work happens here; reference = read-only context
    needsManualConfig?: boolean; // true for new systems: host/credentials cannot be derived from a message
    notes?: string;             // ITALIAN
  }>;
  // Phase 6 — connections (VPN / connection workflows) to link or flag. New ones are PROPOSALS
  // to be configured by a human, because VPN config and secrets cannot be derived from a message.
  connections?: Array<{
    isNew: boolean;
    existingId?: string;        // vpn_connections.id / connection_workflows.id when matched
    name: string;
    kind: "vpn" | "workflow";
    sapSystemRef?: string;      // which system this connection serves (matches systems[].name)
    needsManualConfig: boolean; // always true when isNew
    notes?: string;             // ITALIAN
  }>;
  // Phase 6 — ambiguity gate: when the message lacks enough to build a sound project,
  // do NOT fabricate detail. Set this true, lower confidences, and ask instead.
  needsClarification?: boolean;
  clarificationQuestions?: string[]; // ITALIAN
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

// Format SAP systems for AI context (so the agent can match-first and target tasks)
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

// Format the org's VALIDATED MCP server configs together with their catalog documentation,
// so the agent derives task→server attachments from real capabilities, not guesses.
function formatMcpContext(
  mcpContext?: { catalog: McpCatalogWithValidation[]; configs: McpServerConfig[] }
): string {
  if (!mcpContext || mcpContext.configs.length === 0) {
    return '  (nessun server MCP configurato per questa organizzazione)';
  }
  const catalogById = new Map(mcpContext.catalog.map(c => [c.id, c]));
  return mcpContext.configs.map(cfg => {
    const cat = cfg.catalogId ? catalogById.get(cfg.catalogId) : undefined;
    // Only validated catalog entries are eligible to be attached to a task.
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

export async function analyzeMessageForProject(
  message: Message,
  existingProjects: Project[],
  existingPartners: Partner[],
  existingTasks: Task[],
  learningContext?: LearningContext,
  organizationId?: string,
  // Phase 6 — infrastructure & MCP awareness (optional → backward compatible)
  existingSapSystems: SapSystem[] = [],
  existingConnections: VpnConnection[] = [],
  mcpContext?: { catalog: McpCatalogWithValidation[]; configs: McpServerConfig[] },
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

## INFRASTRUCTURE AREAS — Systems & Connections (Phase 6)
Besides partner/project/tasks, you also provision the **administrative infrastructure** needed to actually work the activity:

### SAP Systems (sap_systems)
- A task usually runs against a specific SAP system (DEV/QAS/PRD). Identify which system(s) the activity touches.
- **Match-first**: if an existing system fits (see "EXISTING SAP SYSTEMS" in context), reference it with existingId and isNew=false.
- If a clearly-needed system is NOT in the list, propose it with isNew=true and whatever is derivable (name, SID, landscapeType) — but set needsManualConfig=true, because host, ports and credentials CANNOT be derived from a message and must be configured by a human.
- **NEVER invent secrets**: do not output usernames, passwords, hosts, or certificates. Credentials always remain vault references managed outside this proposal.
- For each task that runs on a system, set the task's sapSystemRef to that system's name (or existingId). This becomes tasks.sapSystemId and tells the executor WHERE to run.

### Connections (vpn_connections / connection_workflows)
- If reaching a system requires a VPN or a connection workflow, reflect it in connections[].
- **Match-first** against "EXISTING CONNECTIONS". If a new one is needed, it is a PROPOSAL only: isNew=true, needsManualConfig=true (VPN config and secrets can't come from an email).
- Link each connection to the system it serves via sapSystemRef.

## MCP SERVER SELECTION — derive from documentation, do not guess (Phase 6)
You are given the organization's configured MCP servers (mcp_server_configs) together with their catalog documentation (category, description, README excerpt, write capability, validation status). Use them to decide, per task, which concrete server(s) the executor should use.

Rules:
- For each task, READ what the task must do and match it to the server config(s) whose documented capabilities cover it. Fill task.aiSpec.proposedMcpConfigs with { configId, name, category, write, reason } — reason in ITALIAN.
- Set write=true ONLY if the task genuinely needs to modify objects (create/change). Otherwise write=false (read/analysis).
- **Eligibility**: attach ONLY servers whose catalog entry is VALIDATED ("VALIDATED: SI"). Never attach a non-validated server.
- **PRD safety**: a config with environment=PRD or readOnly=true cannot perform writes; if a task needs a write but only a read-only/PRD server is available, do NOT attach it for the write — instead lower confidence and raise an openQuestion.
- If no suitable validated server exists for a task, leave proposedMcpConfigs empty and add an openQuestion explaining what's missing.
- Keep requiredMcpCategories filled as a coarse hint (backward compatibility), but proposedMcpConfigs is the authoritative output.

## AMBIGUITY GATE — ask, don't fabricate (Phase 6)
A thin or vague message must NOT be turned into invented detail.
- If the activity lacks a clear deliverable, an identifiable system, or any verifiable acceptance criteria, set needsClarification=true at the top level and fill clarificationQuestions (ITALIAN).
- In that case propose only a minimal, honest skeleton (e.g. a single "Analisi e chiarimento requisiti" task) and lower per-task confidence (<0.7). Do not pad with speculative development tasks.
- Well-formed task = single clear deliverable, verifiable acceptanceCriteria, one primary target system, and (where applicable) one primary MCP server.

## SUB-PROJECTS — optional (Phase 6)
For a genuinely multi-stream activity ("fatta di tanti pezzi"), you MAY propose project.subProjects[] (e.g. "Interfaccia", "Reportistica", "Migrazione") and assign each task to one via task.subProjectName. Use this ONLY when the activity splits into distinct deliverable streams; otherwise leave subProjects empty and keep a flat task list.

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
    "estimatedEffort": total_hours_number_or_null,
    "subProjects": [ { "name": "ITALIAN: nome stream", "description": "ITALIAN: descrizione" } ]  // opzionale, solo se l'attività ha flussi distinti
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
      "dueDate": "YYYY-MM-DD if mentioned",
      "subProjectName": "ITALIAN: nome del sotto-progetto di appartenenza OR omesso",
      "sapSystemRef": "nome o uuid del sistema target (da 'systems' qui sotto) OR omesso",
      "aiSpec": {
        "objective": "ITALIAN: Obiettivo del task in una frase",
        "inputs": ["riferimento concreto a email/work item/oggetto citato nel messaggio"],
        "acceptanceCriteria": ["ITALIAN: criterio verificabile 1", "criterio verificabile 2"],
        "requiredMcpCategories": ["abap_adt|sap_gui|odata|docs|..." - hint grossolano, retrocompatibilità],
        "proposedMcpConfigs": [
          { "configId": "uuid-di-un-mcp_server_config-VALIDATO", "name": "nome config", "category": "abap_adt|...", "write": false, "reason": "ITALIAN: perché questo server serve a questo task" }
        ],
        "complexity": "S|M|L",
        "openQuestions": ["ITALIAN: domanda SOLO se l'input è ambiguo o manca un server adatto — ometti se tutto è chiaro"],
        "confidence": 0.0-1.0 (0.9+ se tutto chiaro, <0.7 se ambiguità o server di scrittura mancante)
      }
    }
  ],
  "calendar": {
    "id": "uuid-if-existing-calendar-suitable OR null",
    "name": "Nome nuovo calendario se necessario (es. 'Meeting Cliente ABC')",
    "suggestedParentId": "uuid-of-parent-calendar-for-hierarchy OR null"
  },
  "systems": [
    { "isNew": false, "existingId": "uuid-se-sistema-esistente", "name": "DEV cliente X", "systemId": "DEV", "landscapeType": "development", "role": "target", "needsManualConfig": false, "notes": "ITALIAN" }
  ],
  "connections": [
    { "isNew": false, "existingId": "uuid-se-connessione-esistente", "name": "VPN cliente X", "kind": "vpn", "sapSystemRef": "DEV cliente X", "needsManualConfig": false, "notes": "ITALIAN" }
  ],
  "needsClarification": false,
  "clarificationQuestions": ["ITALIAN: domande SOLO se l'attività è troppo vaga per costruire un progetto solido"],
  "reasoning": "ITALIAN: Breve spiegazione in italiano del perché hai proposto questo progetto/partner/task/sistemi/connessioni, cosa hai abbinato (match-first), quali server MCP hai scelto e perché, cosa hai dedotto, pattern usati, livello di confidenza. MENZIONA SE HAI USATO PATTERN APPRESI."
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
3. Match or create appropriate Project (optionally split into subProjects if multi-stream)
4. Break down work into 2-5 specific Tasks (⚠️ STIME DEVONO SOMMARE AL TOTALE PROGETTO!)
5. For EACH task: set sapSystemRef (target system) and proposedMcpConfigs (only VALIDATED servers, with reason)
6. Resolve Systems & Connections (match-first; new ones → needsManualConfig=true, never invent secrets)
7. Suggest appropriate Calendar for project events
8. AMBIGUITY GATE: if the activity is too vague, set needsClarification=true + clarificationQuestions and propose only a minimal skeleton — do NOT fabricate tasks
9. Provide reasoning for your decisions (including any patterns used and MCP choices)

Respond with VALID JSON ONLY (no markdown, no explanations outside JSON).`;

  try {
    const modelKey = await getDefaultModelKey(organizationId);
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

    const proposal = JSON.parse(gwResult.content || "{}");
    
    console.log('[AI-AGENT] Generated proposal:', JSON.stringify(proposal, null, 2));
    
    return proposal as ProjectProposal;
  } catch (error) {
    console.error('[AI-AGENT] Error analyzing message:', error);
    throw new Error(`Failed to analyze message: ${error instanceof Error ? error.message : String(error)}`);
  }
}
