# Overview

This CRM application is designed for SAP ABAP freelancers to manage projects, tasks, business deals, partners, and calendar events. It aims to provide a unified dashboard for essential business management tools, including project tracking, deal pipeline, partner relationship management, and task organization, built as a full-stack web application.

# Recent Changes

## 🤖 AI PROJECT AGENT (October 2025)
**INTELLIGENT MESSAGE ANALYSIS & SEMI-AUTOMATIC PROJECT CREATION**

Successfully implemented AI-powered project agent that analyzes messages and proposes projects, partners, and tasks:

### ✅ **Backend AI Service**
- **OpenAI Integration**: Uses gpt-5 model with structured JSON response format
- **Context-Aware Analysis**: Retrieves existing projects, partners, tasks for intelligent suggestions
- **Service Layer**: `server/ai-project-agent.ts` with `analyzeMessageForProject()` function
- **Structured Proposals**: Returns ProjectProposal with project, partner, tasks, and reasoning

### ✅ **API Endpoints**
- **POST /api/messages/:id/analyze-project**: Analyzes message content and returns AI proposal
- **POST /api/messages/:id/apply-project-proposal**: Applies user-edited proposal to create/update records
- **Error Handling**: Proper validation, authentication, and organization context checks
- **Data Linking**: Automatically links created partner to project, tasks to project, message to project

### ✅ **Frontend UI**
- **"Analizza con AI" Button**: Purple/blue gradient button in messages toolbar (data-testid="button-analyze-project")
- **ProjectProposalDialog Component**: Full-featured dialog with editable fields for all proposal sections
- **Tabbed Interface**: Separate tabs for Project, Partner, Tasks, and Reasoning
- **Real-time Updates**: useEffect properly syncs dialog state when new proposals arrive
- **Loading States**: Visual feedback during AI analysis and proposal application

### ✅ **Semi-Automatic Workflow**
1. **User selects message** in messages page
2. **Clicks "Analizza con AI"** to trigger OpenAI analysis
3. **AI analyzes content** and generates structured proposal
4. **Dialog opens** showing editable proposal with all fields
5. **User reviews/edits** project, partner, tasks as needed
6. **User confirms** by clicking "Applica Proposta"
7. **System creates** all records and links them appropriately
8. **Success feedback** shown with created record IDs

### ✅ **Quality Assurance**
- **State Synchronization**: Fixed critical bug where dialog showed stale proposals
- **Architect Review**: ✅ PASSED - Complete feature implementation approved
- **Multi-tenant Support**: All entities correctly use organizationId
- **Cache Invalidation**: Proper query invalidation after mutations
- **Type Safety**: Full TypeScript coverage with shared interfaces

## 💬 MULTI-MESSAGE CHAT NORMALIZATION (October 2025)
**INTELLIGENT CONVERSATION PARSING & STRUCTURED DISPLAY**

Successfully implemented complete multi-message chat normalization system:

### ✅ **Database Structure**
- **Metadata Column**: Added jsonb `metadata` column to messages table for structured conversation data
- **Data Schema**: `{platform, participants: [{id, name}], messages: [{id, senderId, senderName, timestamp, text}], summary, rawSource}`
- **Backward Compatible**: Existing message fields (body, subject, fromName) populated for UI compatibility

### ✅ **Parser Implementation**
- **Multi-Platform Support**: Teams, WhatsApp, Google Meet conversation parsing
- **Complete Extraction**: ALL messages captured (not just first message)
- **Format Coverage**:
  - Teams: `[Name] timestamp\nmessage` (repeating)
  - WhatsApp: `[DD/MM/YYYY, ]HH:MM - Name: message` (supports date prefix, 12h/24h, multiline)
  - Google Meet: `Name\ntimestamp\nmessage` (repeating groups of 3)
- **Participant Detection**: Automatic identification of all unique conversation participants

### ✅ **Backend Processing**
- **Endpoint**: POST /api/messages/chat normalizes pasted conversation content
- **Structured Storage**: Saves complete conversation metadata in database
- **Formatted Body**: Human-readable conversation format for compatibility
- **Rendering Support**: GET /api/messages/:id/rendered includes metadata in response

### ✅ **Frontend Display**
- **Structured Chat View**: Custom UI when metadata.messages exists
- **Visual Components**:
  - Platform badge with icon (Teams/WhatsApp/Google Meet)
  - Participants list with count
  - Individual messages with sender name, timestamp, border-left styling
- **Seamless Integration**: Automatic detection and rendering without manual flags

### ✅ **Quality Assurance**
- **Data Completeness**: Zero message or participant loss confirmed by architect review
- **Regex Coverage**: Handles date variations, mixed separators, multiline content
- **Multi-line Support**: WhatsApp/Teams messages spanning multiple lines correctly concatenated
- **E2E Verified**: Full system tested from input → parsing → storage → rendering

## ➕ MANUAL MESSAGE ENTRY WITH FAB (October 2025)
**FLOATING ACTION BUTTON FOR CHAT/SMS/OTHER MESSAGES**

Successfully implemented manual message entry system with floating action button:

### ✅ **FAB Implementation**
- **Fixed Position**: Blue circular button in bottom-right corner (bottom-8 right-8)
- **Plus Icon**: Clear visual indicator for creating new messages
- **z-index 50**: Appears above all other content
- **data-testid**: `button-add-message` for testing

### ✅ **Type Pre-selection**
- **Smart Default**: Form opens with type pre-selected based on active tab
- **Key-based Remount**: `key={filterType}` forces form to reset when tab changes
- **Schema Validation**: `userId` and `receivedAt` are optional (backend provides defaults)

### ✅ **UI Differentiation**
- **Email Tab**: Shows "Sincronizza Email" button for automatic IMAP sync
- **Chat/SMS/Altro Tabs**: Shows informational message "Solo inserimento manuale - Usa il pulsante '+' per aggiungere"
- **Clear UX**: Visual distinction between automatic (Email) and manual (Chat/SMS/Other) entry

### ✅ **Testing Results**
- **E2E Test**: ✅ PASSED - FAB visible, type pre-selection works, message creation successful
- **Message Counts**: Correctly updates tab counters after creation
- **Filtering**: New messages appear in correct type tab

## 📬 MESSAGE TYPE FILTERING & CATEGORIZATION (October 2025)
**MULTI-CHANNEL MESSAGE SUPPORT WITH TAB FILTERS**

Successfully implemented message type categorization and filtering system:

### ✅ **Message Type Column**
- **Type Column Added**: New "Tipo" column in messages table with 4 message types
- **Icons**: Email (📧 Mail), Chat (💬 MessageSquare), SMS (📱 MessageSquare), Altro (📄 FileText)
- **Table Layout**: Fixed table layout with proper column width percentages

### ✅ **Tab-Based Filtering**
- **5 Filter Tabs**: Tutti, Email, Chat, SMS, Altro with live message counts
- **Dynamic Counters**: Each tab shows real-time count (e.g., "Email (7)", "Chat (0)")
- **Filter Logic**: Seamlessly integrated with existing search functionality
- **Empty States**: Proper "Nessun messaggio ricevuto" when no messages match filter

### ✅ **Use Cases Supported**
- Email communication tracking
- Teams chat conversations (with participant detection in square brackets)
- SMS message management
- Other message types (documents, notes, etc.)

## 🎉 MAJOR MODULAR REFACTOR COMPLETED (September 2025)
**EMAIL TRAINING SYSTEM - MODULAR TRANSFORMATION**

Successfully completed full-stack transformation from non-modular to fully modular design:

### ✅ **Architecture Achievement** 
- **Goal**: All training buttons should behave identically with unified selection_type parameter
- **Result**: ✅ **ACHIEVED** - Expert review: PASS

### ✅ **Database Layer**
- **Old**: Non-modular batch structure (separate arrays per type)
- **New**: Modular `emailTrainingSelections` table (messageId, selectionType, selectedText, sourceMessageId)

### ✅ **Backend Layer**  
- **Old**: Batch API endpoints with hardcoded type handling
- **New**: Individual selection records with unified storage interface

### ✅ **Frontend Layer**
- **Code Reduction**: 237+ duplicate lines → 67 unified lines
- **Logic Unification**: Single `handleTextSelection` for all button types  
- **State Simplification**: Complex per-type state → Simple SelectionRecord array
- **Display Modularity**: Hardcoded sections → Dynamic grouped rendering

### ✅ **Quality Metrics**
- **Modularity**: All 5 button types (body, header, thread, signatureBody, signatureHeader) use identical logic
- **Maintainability**: Adding new selection types requires only configuration, not code changes
- **Consistency**: Type-specific styling driven by centralized configuration
- **Testing**: Ready for E2E verification (requires login credentials)

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
- ✅ **Funzioni legate alla selezione** - Cancellazione multipla con AlertDialog elegante + modifica massiva (TODO)
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

The client-side is built with React 18 and TypeScript. It uses a component-based architecture with:
- **UI Framework**: shadcn/ui components built on Radix UI primitives for consistent, accessible design.
- **Styling**: TailwindCSS with CSS custom properties for theming and responsive design.
- **State Management**: TanStack Query (React Query) for server state management and caching.
- **Routing**: Wouter for lightweight client-side routing.
- **Form Handling**: React Hook Form with Zod validation for type-safe form management.
- **Build Tool**: Vite for fast development and optimized production builds.

## Backend Architecture

The server follows a RESTful API pattern with Express.js:
- **Web Framework**: Express.js with TypeScript.
- **Authentication**: Passport.js with local strategy using scrypt for password hashing.
- **Session Management**: Express sessions with PostgreSQL session store.
- **API Structure**: Resource-based endpoints with CRUD operations.
- **Middleware**: Custom logging, JSON parsing, and authentication middleware.

## Data Storage

PostgreSQL is the primary database, managed with Drizzle ORM:
- **Database**: PostgreSQL (configured for Neon serverless).
- **ORM**: Drizzle ORM for type-safe database operations and schema management.
- **Schema Design**: Relational model with foreign key relationships (users, projects, tasks, partners, deals, calendar events).
- **Migrations**: Drizzle Kit for schema migrations.

## Authentication & Authorization

Authentication is session-based:
- **Strategy**: Local authentication with username/password.
- **Password Security**: Scrypt-based hashing with salt.
- **Sessions**: Server-side sessions stored in PostgreSQL.
- **Authorization**: Route-level protection with authentication middleware.

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting.

## UI & Design System
- **Radix UI**: Low-level UI primitives.
- **shadcn/ui**: Component library built on Radix UI.
- **Lucide React**: Icon library.

## Development & Build Tools
- **Vite**: Frontend build tool.
- **Replit Integration**: Specialized plugins for Replit environment.
- **TypeScript**: Type safety across the stack.

## Authentication & Security
- **Passport.js**: Authentication middleware.
- **Session Management**: PostgreSQL-backed session storage.

## Form & Data Validation
- **Zod**: Schema validation library.
- **React Hook Form**: Form library with validation.