# Pianificatore esteso (Fase 6) — note di integrazione

File modificato: `server/ai-project-agent.ts` (da 461 a 616 righe). Tutte le aggiunte sono
retrocompatibili: i nuovi parametri sono opzionali, quindi il vecchio codice continua a
compilare anche prima di toccare il chiamante.

## Cosa è cambiato, sui tre fronti che avevi indicato

1. **Sistemi & connessioni come aree amministrative.** L'agente ora riceve i `sap_systems`
   e le `vpn_connections` esistenti, applica match-first e popola `systems[]` e
   `connections[]` nella proposta. I nuovi sono *proposte* con `needsManualConfig=true`:
   host, VPN e segreti non si inventano da una mail, restano riferimenti al vault. Ogni
   task punta al suo sistema via `sapSystemRef` (→ `tasks.sapSystemId`).

2. **Direttive di costruzione progetto/task più spesse.** Aggiunte: definizione di "task
   ben formato", supporto opzionale ai `subProjects` per attività multi-flusso, e un
   **ambiguity gate** (`needsClarification` + `clarificationQuestions`): se la mail è vaga,
   l'agente non inventa task ma propone uno scheletro minimo e fa domande.

3. **MCP derivato dai documenti, non indovinato.** L'agente riceve i `mcp_server_configs`
   dell'org insieme alla documentazione di catalogo (categoria, descrizione, estratto di
   README, write-capable, stato di validazione) e, per ogni task, popola
   `aiSpec.proposedMcpConfigs[]` con server concreti + motivazione. Regole applicate: solo
   server **validati**; niente write su config `read_only`/PRD; se manca un server adatto →
   `openQuestion` invece di forzare. `requiredMcpCategories` resta come hint per
   retrocompatibilità.

## Modifica di firma (retrocompatibile)

```ts
analyzeMessageForProject(
  message, existingProjects, existingPartners, existingTasks,
  learningContext?, organizationId?,
  // NUOVI (Fase 6, opzionali):
  existingSapSystems: SapSystem[] = [],
  existingConnections: VpnConnection[] = [],
  mcpContext?: { catalog: McpCatalogWithValidation[]; configs: McpServerConfig[] },
)
```

## Patch del chiamante — `server/routes.ts` (~riga 4323)

Il blocco in background che raccoglie il contesto va arricchito. `db`, `mcpServerConfigs`,
`mcpCatalog`, `mcpCatalogValidations`, `and`, `eq` sono già importati in `routes.ts`.

```ts
const existingProjects = await storage.getProjects(userId, organizationId);
const existingPartners = await storage.getPartners(userId, organizationId);
const existingTasks    = await storage.getTasks(userId, organizationId);

// NUOVO — infrastruttura (filtra per org se il tuo getter non lo fa già)
const sapSystems     = await storage.getSapSystems(userId);
const vpnConnections = await storage.getVpnConnections(userId);

// NUOVO — contesto MCP: config dell'org + catalogo con validazione per-org
const mcpConfigs = await db.select().from(mcpServerConfigs)
  .where(and(
    eq(mcpServerConfigs.organizationId, organizationId),
    eq(mcpServerConfigs.enabled, true),
  ));
const catalogRows  = await db.select().from(mcpCatalog);
const validations  = await db.select().from(mcpCatalogValidations)
  .where(eq(mcpCatalogValidations.organizationId, organizationId));
const validatedSet = new Set(validations.filter(v => v.validated).map(v => v.catalogId));
const mcpContext = {
  catalog: catalogRows.map(c => ({ ...c, validated: validatedSet.has(c.id) })),
  configs: mcpConfigs,
};

const patterns  = await storage.getAiLearningPatterns(organizationId);
const calendars = await storage.getCalendars(userId, organizationId);
const { analyzeMessageForProject } = await import('./ai-project-agent');

const analysisResult = await analyzeMessageForProject(
  message, existingProjects, existingPartners, existingTasks,
  { patterns, calendars }, organizationId,
  sapSystems, vpnConnections, mcpContext,
);
```

(Se hai già un helper che lista il catalogo con validazione per gli endpoint MCP, usalo al
posto delle tre query inline — evita duplicazione di logica.)

## Follow-up obbligatorio: persistenza in fase di approvazione

L'analisi resta una `proposalData` JSON che passa dal gate di approvazione (come oggi). Il
**handler che accetta la proposta** dev'essere esteso per mappare i nuovi campi sulle
tabelle reali:

- `proposal.systems[]` → `sap_systems` (match `existingId`, oppure crea con
  `needsManualConfig` evidenziato in UI; mai scrivere credenziali).
- `proposal.connections[]` → `vpn_connections` / `connection_workflows` (stessa logica;
  i nuovi nascono come "da configurare").
- per ogni task: `sapSystemRef` → `tasks.sapSystemId`, e
  `aiSpec.proposedMcpConfigs[].configId` → `tasks.mcpConfigIds` (array).
- `subProjectName` → crea/collega il `projects.parentProjectId` corrispondente.

Trova l'handler con: `grep -n "proposalData\|acceptProposal\|approveProposal" server/routes.ts`.
Quel pezzo non l'ho toccato perché non rientra nelle "direttive" e va visto sul codice reale.

## Prossimo passo del pilota

Le direttive ora ci sono. Per il giro vero, passami **la mail di origine** dell'attività:
la diamo in pasto all'agente e vediamo la proposta completa (partner, progetto, task con
sistemi e server MCP, eventuali domande di chiarimento).
