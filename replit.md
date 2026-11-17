# Overview

This CRM application for SAP ABAP freelancers offers a comprehensive dashboard for managing projects, tasks, business deals, partners, and calendar events. It's a full-stack web application designed to streamline operations with an AI-powered project agent for intelligent message analysis and semi-automatic project creation. Key capabilities include multi-organization data filtering, a metadata-driven extension layer for custom fields and workflows, and integration with SAP systems for Transport Request handling and program execution. The vision is to empower freelancers with advanced tools for efficient business management and automation.

# User Preferences

Preferred communication style: Simple, everyday language.

## Standard Development Pattern for Table Areas

When creating any new table/CRUD area in the application ("Usa il template standard per creare la nuova area"), ALWAYS implement ALL these mandatory features:

### Checklist Template Standard (TUTTI i punti obbligatori):
- ✅ **Creazione tabella anagrafica principale** - Database schema + API + Frontend table
- ✅ **Creazione nuova voce menu** - Aggiungere nel sidebar navigation array  
- ✅ **Menu sempre visibile** - Item presente nel sidebar con icona appropriata
- ✅ **Funzioni di configurazione e salvataggio dei layout per la vista lista** - LayoutManager + TableConfiguration
- ✅ **Selezione dei layout** - Dropdown per caricare layout salvati
- ✅ **Box di selezione** - enableSelection=true + onSelectionChange
- ✅ **Funzioni legate alla selezione** - Cancellazione multipla con AlertDialog elegante + modifica massiva + copia massiva
- ✅ **Sistema Audit Trail completo** - Tracking automatico di tutte le modifiche con AuditService + AuditHistory UI

### Critical API Pattern Rules
- **ALWAYS** use `apiRequest("METHOD", "/url", data)` (method FIRST)
- **ALWAYS** use `getQueryFn({ on401: "throw" })` for queries instead of custom fetch
- **ALWAYS** add `enabled: !!currentOrganizationId` to queries for organization context
- **ALWAYS** use AlertDialog instead of system confirm()
- **ALWAYS** include both single and bulk delete with proper confirmations
- **ALWAYS** include Sidebar + Header layout
- **ALWAYS** include LayoutManager for table configuration
- **ALWAYS** integrate AuditHistory component with Tabs in edit dialogs
- **ALWAYS** use data-testid for all interactive elements

# System Architecture

## Frontend Architecture

The client-side is built with React 18, TypeScript, `shadcn/ui` (Radix UI), `TailwindCSS`, `TanStack Query`, `Wouter` for routing, and `React Hook Form` with `Zod` for form management. `Vite` is used for development and builds.

## Backend Architecture

The server uses `Express.js` with TypeScript, following a RESTful API design. `Passport.js` provides session-based authentication with scrypt hashing, and sessions are stored in PostgreSQL.

## Data Storage

`PostgreSQL` serves as the primary database, managed by `Drizzle ORM` for type-safe interactions and `Drizzle Kit` for migrations.

## Authentication & Authorization

Authentication is session-based using a local username/password strategy. Authorization is implemented via route-level middleware.

**Token API personali (`thu_…`)** — `server/api-tokens.ts`, `server/api-token-auth.ts`, `server/api-token-routes.ts`; si creano da Account
(`POST /api/account/api-tokens`, solo con la sessione) e si usano con `Authorization: Bearer thu_…`, che vince sulla sessione. Ogni token ha un
ambito di organizzazione scelto alla creazione:
-   **una organizzazione** (default: quella attiva, `X-Organization-Id` della sessione): `X-Organization-Id` e `X-Organization-Scope` della
    richiesta sono ignorati e sostituiti da quell'organizzazione e da `personal`;
-   **tutte le mie organizzazioni** (`allOrganizations: true` alla creazione, `api_tokens.organization_id` null; nell'elenco `organizationId: null`):
    se la richiesta porta `X-Organization-Id` deve essere un uuid di un'organizzazione di cui l'utente del token è membro, altrimenti 403
    «organizzazione non accessibile con questo token»; `X-Organization-Scope` passa solo se vale `all` o `personal`, altrimenti diventa `personal`;
    senza `X-Organization-Id` vale il comportamento predefinito dell'app (organizzazione Personal dell'utente). Niente ereditarietà
    dell'organizzazione dal padre nelle POST, come per gli altri token.
Il perimetro resta l'utente del token: non vede mai più di quanto vede dall'interfaccia. Route vietate e limite di 120 richieste/min valgono per
entrambi. La colonna nullable arriva con la migrazione d'avvio `api_tokens_organization_nullable` di `server/db.ts`.

**Audit delle scritture con token** — `server/api-token-audit.ts`, montato in `auth.ts` prima del middleware del token: ogni
POST/PUT/PATCH/DELETE autenticata con un token lascia una riga in `api_token_write_audit` (token, utente, organizzazione effettiva della
richiesta, metodo, percorso senza query string, esito HTTP, durata, IP, user agent). Mai il corpo né la query string. Entrano anche le scritture
rifiutate dal middleware del token (403 route vietata, 429) e quelle chiuse dal client prima della risposta (esito 499); le letture e le
scritture di sessione no. Un errore dell'audit non cambia la risposta. Il proprietario le consulta con la sessione da
`GET /api/account/api-tokens/:id/writes?limit=&before=` (dalla più recente, `limit` 1-200, `nextBefore` per la pagina successiva, anche per
token revocati) o da Account → Token API → «Attività». Tabella creata dalla migrazione d'avvio `api_token_write_audit`.

**Contratto OpenAPI delle route aperte ai token** — `GET /api/openapi.json` (sessione o token; `server/openapi.ts`): documento OpenAPI 3.1
generato alla prima richiesta dalle route registrate davvero su Express e filtrato con lo stesso `isDeniedForToken` del middleware, quindi una
route vietata ai token non compare mai e una route nuova compare da sola. Fuori contratto anche i percorsi non `/api`, `/api/__*` e
`/api/debug/*`. Ogni operazione ha `operationId`, tag (la risorsa), parametri di percorso, gli header `X-Organization-Id`/`X-Organization-Scope`,
sicurezza `bearerAuth` e le risposte 401/403/429 del token; i corpi sono oggetti generici. Riassunti e parametri di query curati per le
operazioni principali stanno in `OPERATION_DOCS`: aggiungerli lì quando si apre ai token una route nuova da usare dagli agenti.

## Core Features & Design Patterns

-   **Custom Fields & Metadata System**: A metadata-driven extension layer enables dynamic custom fields, entities, event-driven workflows, and role-based permissions, supported by `CustomMetadataService` for caching and validation.
-   **Multi-Organization Filtering**: Provides intelligent cross-organization data visibility based on `X-Organization-Id` and `X-Organization-Scope` headers.
-   **AI Project Agent & Background Proposal System**: An AI-powered agent (integrating OpenAI gpt-5) analyzes messages to propose project, partner, and task creations asynchronously.
-   **Multi-Message Chat Normalization**: Conversations from various platforms are parsed and stored in a structured `jsonb metadata` column for consistent UI display.
-   **Freelance Engagement & Procurement System**: Manages freelance engagements, project assignments, milestones (with Gantt chart and budget tracking), purchase orders, and vendor invoices.
-   **Business Scenarios - Organization Relationship Management**: Defines and manages many-to-many organization relationships with typed business contexts (e.g., `cliente_fattura`, `fornitore`, `partner`) and a dedicated UI.
-   **Bulk Operations - Mass Edit & Copy**: Comprehensive bulk editing and copying capabilities for main entities, utilizing `BulkEditDialog` and `BulkCopyDialog` with parallel requests and cache invalidation.
-   **Modular Cascade Delete System**: A reusable system for single and bulk deletions, aggregating related data counts via `useCascadeDelete` hook and `CascadeDeleteDialog`.
-   **SAP Transport Request Integration**: Supports receiving Transport Requests via API POST, email parsing of JSON attachments, or manual UI input.
-   **SAP Shortcut Integration**: Allows launching SAP ABAP programs from projects and automatically creating Transport Requests from their JSON output.
-   **THU AI Task Executor**: AI-powered ABAP code generation with rich context collection from project details, DevOps work items, messages, and transport requests, including pattern learning and a regenerate flow.
-   **Botcave**: lo smistamento delle email nuove e l'aggiornamento dei brief di progetto li fanno gli agenti di Botcave con gli inneschi di sorveglianza (`GET /api/messages?summary=true`, `GET /api/tasks`); The Hub Up non li esegue più al suo interno.
    -   Smistamento delle email: l'agente legge i messaggi da smistare con `GET /api/messages?summary=true&toTriage=true` (senza progetto, task, partner né collegamenti; `since=<ISO 8601>` per i soli ricevuti dopo un istante) e classifica con `POST /api/messages/:id/apply-suggestion`. Nella pagina Messaggi il contesto di Botcave è il messaggio aperto (`page: message`, o `workitem` per i work item DevOps) e il pulsante «Smista con Botcave» apre il pannello su Alfred.
-   **«Analizza progetto» con Botcave**: dalla pagina Messaggi il pulsante «Analizza progetto con Botcave» apre il pannello con il messaggio come contesto; l'agente legge `GET /api/messages/:id/project-analysis` (testo del messaggio e degli allegati, anagrafica dell'organizzazione del messaggio, proposte già presenti; `maxChars` 1..100000) e scrive la proposta con `POST /api/messages/:id/proposals`. Nessuna AI interna; il pulsante THU AI resta per l'analisi interna.
-   **Brief di progetto aggiornato dall'agente**: dopo ogni esecuzione l'agente Botcave legge `GET /api/projects/:id/brief` (brief, convenzioni, decisioni, `updatedAt`/`updatedBy` e `changedTasksSinceUpdate`, i task del progetto cambiati dopo l'ultimo aggiornamento, max 20) e scrive il brief nuovo con `PUT /api/projects/:id/brief` (`brief` obbligatorio, max 8000 caratteri; `newDecisions` max 5, in coda alle decisioni con limite 30; `sourceTaskId` del progetto; `expectedUpdatedAt` per la concorrenza ottimistica, null se il brief non c'era: 409 col brief attuale se è cambiato). Nelle organizzazioni della richiesta, anche con token (fuori perimetro 404); con un token `updatedBy` è `agent` e nel pannello «Contesto AI» del progetto compare «dall'agente Botcave». Nessuna AI interna.
-   **Computed Fields System (End-to-Complete)**: Dynamic calculated columns for project planning visibility (e.g., State, Completion %, Remaining Hours), fetched via batch endpoints and integrated into tables.
-   **Planning Windows & Project Relationship**: Architectural design for project scheduling in a global calendar, where projects reference independent planning windows for ETC clamping and display.
-   **Discussione della proposta con Botcave**: nel dettaglio di una proposta in attesa, scheda Discussione, «Discuti con Botcave» apre il pannello con la proposta come contesto (page `proposal`, id della proposta). L'agente legge `GET /api/proposals/:id/discussion-context` (proposta, messaggio d'origine ridotto, discussione in ordine con `proposalUpdated`, `canUpdate`; nelle organizzazioni della richiesta, anche con token) e scrive risposte e revisioni con `PATCH /api/proposals/:id`. La discussione aperta si rilegge ogni 5 secondi; la discussione con l'AI interna resta com'è.
-   **Auto-Rescheduling System**: Automatically recalculates project schedules and deficit hours when task completion or effort changes, persisting updates to project records.
-   **Freeform Dashboard with Entity Widget System**: Customizable dashboard with drag-and-drop widgets using `react-rnd`, leveraging `EntityListDescriptor` and `EmbeddedEntityList` components for generic entity rendering.
-   **Address Management System**: Comprehensive address handling for partners, including `AddressSearch` (Nominatim API), `MapPicker` (Leaflet), structured address fields, and distinction between legal and operational addresses.
-   **Resource Planner**: Global heatmap view for team managers to visualize resource allocation across time periods (day/week/month). Shows capacity vs demand per resource with color-coded criticality (green=balanced, amber=under-allocated, red=over-allocated). Includes KPI cards, skill badges, task detail popovers, and resource detail panel. Backed by `resource_skills` and `resource_availability` tables for granular skill management and configurable availability. Features an **Activity Sidebar** with hierarchical project/task tree (selectable) and resource list. Tasks can have **required skills** (`task_required_skills` table). When activities are selected, resources are highlighted with **skill match %** calculated using Fibonacci-weighted proficiency scoring (weights: 1,2,3,5,8 for levels 1-5).
-   **Skill Catalog**: Hierarchical skill catalog (`skill_catalog` table) with parent-child tree structure, used for standardized skill selection across resource skills and task required skills. Accessible under Anagrafiche in the sidebar.
-   **Skill Engine & Assessment System**: Server-side skill matching engine (`server/skill-engine.ts`) with three new tables: `resource_skill_assessments` (leaf-only skill levels linked to skill_catalog), `project_skill_requirements` (project-level skill requirements with mode MUST/SCORE/TIEBREAK and weights), `task_skill_requirements` (task-level requirements with override flag). Features include: derived parent skill levels via coverage×proficiency formula (`effectiveLevel = round(proficiency × √coverage)`), merged requirement sets (project+task with override logic, max severity, max weight), MUST gating + weighted scoring with gap penalty (λ=0.5), and explainability (topMatches, gaps, mustFailures). Frontend includes `ResourceSkillAssessmentsEditor` (tree-based assessment with 0-5 level selector, pending changes with bulk save, derived level display), `SkillRequirementsEditor` (reusable for both projects and tasks, mode/weight/override support), and `MatchPanel` (server-side "Suggest Resources" with ranked results, color-coded scores, and "Why" explainability popovers per resource).
-   **Task ABAP eseguiti da Botcave sul nodo locale**: nel menu della riga del task «Esegui con Botcave» legge la readiness da `GET /api/tasks/:id/abap-execution` e, se il task è eseguibile, apre il pannello Botcave col task come contesto. Il pacchetto (nelle organizzazioni della richiesta, anche con token; fuori perimetro 404) contiene task, progetto, sistema SAP effettivo (override del task o default del partner con il livello più basso, solo della stessa organizzazione; niente host, SAProuter né credenziali), trasporti del task e del progetto, ultimi commenti e `readiness.blockers` (`task_completed`, `no_sap_system`, `sap_system_inactive`, `sap_system_production`). Lo sviluppo lo fa la squadra Botcave sul nodo locale con i propri strumenti SAP; l'esito l'agente lo registra con `POST /api/tasks/:id/agent-runs` (`blocked` se la readiness non è pronta). Nessuna AI interna; THU AI resta per la generazione interna.

# External Dependencies

## Database Services
-   **Neon Database**: Serverless PostgreSQL hosting.

## UI & Design System
-   **Radix UI**: Low-level UI primitives.
-   **shadcn/ui**: Component library built on Radix UI.
-   **Lucide React**: Icon library.

## Development & Build Tools
-   **Vite**: Frontend build tool.
-   **TypeScript**: Type safety across the stack.

## Authentication & Security
-   **Passport.js**: Authentication middleware.

## Form & Data Validation
-   **Zod**: Schema validation library.
-   **React Hook Form**: Form library with validation.

## Artificial Intelligence
-   **OpenAI**: AI model integration (gpt-5).