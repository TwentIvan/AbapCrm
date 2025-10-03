# Overview

This CRM application is designed for SAP ABAP freelancers to manage projects, tasks, business deals, partners, and calendar events. It aims to provide a unified dashboard for essential business management tools, including project tracking, deal pipeline, partner relationship management, and task organization, built as a full-stack web application.

# Recent Changes

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