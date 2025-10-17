# Overview

This CRM application is designed for SAP ABAP freelancers to manage projects, tasks, business deals, partners, and calendar events. It provides a unified dashboard for essential business management tools, including project tracking, deal pipeline, partner relationship management, and task organization, built as a full-stack web application. The application incorporates an AI-powered project agent for intelligent message analysis and semi-automatic project creation, along with robust multi-organization data filtering capabilities.

## SAP Transport Request Integration

The system supports three methods for receiving Transport Requests from SAP systems:
1. **Direct API** - ABAP reports can send JSON via POST to `/api/sap-transport` with API key authentication
2. **Email Integration** - ABAP reports can send JSON attachments to a dedicated email folder, making the system completely independent from client IT infrastructure
3. **Manual Paste** - Users can manually paste JSON via UI dialog, launched directly from project actions

The email-based approach provides full autonomy: users configure a dedicated email folder (e.g., "SAP Transport"), and the IMAP service automatically processes JSON attachments to create Transport Requests with tasks and objects in the database.

## SAP Shortcut Integration

Projects with an associated SAP system can launch the **ZTHU_DOCUMENTATION** program directly:
- The system generates a `.sap` shortcut file with connection parameters
- Clicking the project action "Lancia ZTHU_DOCUMENTATION" downloads the shortcut and opens the paste JSON dialog
- Users execute the ABAP program, copy the JSON output, and paste it directly into the dialog
- The Transport Request is automatically created and linked to the project

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

The client-side is built with React 18 and TypeScript, using a component-based architecture. It leverages `shadcn/ui` (built on Radix UI) for consistent and accessible design, `TailwindCSS` for styling, `TanStack Query` for server state management, `Wouter` for routing, and `React Hook Form` with `Zod` for form handling. Development and builds are managed with `Vite`.

## Backend Architecture

The server follows a RESTful API pattern using `Express.js` with TypeScript. It implements `Passport.js` for local authentication with scrypt-based password hashing and `Express sessions` stored in PostgreSQL. API endpoints are resource-based with CRUD operations, supported by custom middleware for logging, JSON parsing, and authentication.

## Data Storage

`PostgreSQL` is the primary database, managed with `Drizzle ORM` for type-safe operations and schema management. `Drizzle Kit` is used for migrations. The schema is relational, defining foreign key relationships across entities like users, projects, tasks, partners, deals, and calendar events.

## Authentication & Authorization

Authentication is session-based, using a local strategy with username/password and scrypt for password hashing. Sessions are stored server-side in PostgreSQL. Authorization is enforced via route-level protection using authentication middleware.

## Core Features & Design Patterns

### Multi-Organization Filtering
The system supports cross-organization data visibility with intelligent filtering. A `Personal Scope Toggle` allows users from the 'Personal' organization to view data across all their organizations or only their personal items. Other organizations are restricted to viewing only their own data. This is implemented with `X-Organization-Id` and `X-Organization-Scope` headers, and backend queries using `inArray(table.organizationId, organizationIds)`.

### AI Project Agent & Background Proposal System
An AI-powered agent integrates with `OpenAI` (gpt-5) to analyze messages and propose project, partner, and task creations. The system features **background asynchronous processing** to avoid blocking users during AI analysis:

- **Asynchronous Analysis**: When users trigger message analysis, proposals are generated in the background and saved to a dedicated `proposals` table
- **Proposals Table**: Stores AI-generated proposals with status tracking (pending, accepted, rejected, partially_accepted) and JSONB proposal data
- **Proposals Management Page**: Dedicated `/proposals` page for viewing, filtering, and managing AI proposals with status-based tabs
- **Visual Indicators**: Messages with pending proposals display a purple badge with Sparkles icon and proposal count in the messages list
- **Sidebar Integration**: "Proposte AI" menu item provides quick access to proposal management

The agent uses architecture-aware prompts and context-aware analysis (retrieving existing records) to intelligently match and decompose work into structured proposals. Users can accept or reject proposals from the dedicated proposals page.

### Multi-Message Chat Normalization
The application includes a system for parsing and normalizing multi-message conversations from various platforms (Teams, WhatsApp, Google Meet) into a structured format stored in a `jsonb metadata` column. This enables a rich, structured display of chat conversations in the UI.

### Modular Design
A significant refactor transformed the email training system into a fully modular design, unifying logic for handling text selections and reducing code duplication. This improves maintainability and consistency for adding new selection types.

### Freelance Engagement & Procurement System
The system includes a complete freelance engagement management workflow with procurement capabilities:

- **Project Assignments** (`project_assignments`): Tracks freelance engagements on projects with two compensation models:
  - **Fixed Amount**: One-time project fee with defined scope
  - **Hourly Rate**: Time & materials with hourly billing and estimated hours
  - Automatic Purchase Order generation upon assignment creation
  - Links freelances (from `human_resources`) to projects with start/end dates and status tracking

- **Project Milestones** (`project_milestones`): Gantt chart and timeline visualization for project phases:
  - Milestone dependencies (prerequisite milestones)
  - Progress tracking (0-100%)
  - Budget vs actual cost tracking
  - Deliverables and completion date tracking
  - Display order for visual organization
  
  **Gantt Chart Implementation (Timezone-Free Architecture)**:
  - All milestone dates stored as YYYY-MM-DD strings (text columns) instead of timestamps
  - Backend normalization function converts any incoming date format to YYYY-MM-DD strings
  - Frontend uses Date.UTC for all date calculations (completely timezone-independent)
  - Full-day precision with inclusive duration (+1 day for width calculation)
  - Drag/resize with automatic clamping to prevent invalid date ranges (start > end)
  - No locale-dependent Date constructors - eliminates ~8% gridline misalignment bug
  - String-based date contract throughout entire stack ensures consistency

- **Purchase Orders** (`purchase_orders`): Procurement workflow for vendor orders:
  - Auto-generation from project assignments
  - Vendor management (organization or partner-based)
  - Order lifecycle: draft → approved → sent → received
  - Tax calculations and currency support
  - Terms & conditions tracking

- **Vendor Invoices** (`vendor_invoices`): Invoice management for vendor payments:
  - Links to purchase orders and projects
  - Invoice lifecycle: received → approved → paid
  - Subtotal, tax, and total amount tracking
  - Attachment storage for invoice PDFs
  - Due date and payment tracking

The system supports seamless integration between timesheet entries (hourly engagements) and project assignments for automatic cost calculation and invoicing.

### Business Scenarios - Organization Relationship Management
The system includes a comprehensive business scenarios feature for defining and managing relationships between organizations:

- **Business Scenarios** (`business_scenarios`): Many-to-many relationships between organizations with typed business contexts:
  - **Relationship Types**: 
    - `cliente_fattura` (Invoice Recipient) - Organization receives invoices
    - `cliente_servizio` (Service Recipient) - Organization receives services
    - `cliente_timesheet` (Timesheet Client) - Organization for timesheet billing
    - `fornitore` (Vendor) - Organization provides goods/services
    - `partner` (Partner) - Strategic partnership
    - `subappaltatore` (Subcontractor) - Subcontracting relationship
  - **Source/Target Organizations**: Defines directional relationships (e.g., Company A is invoice recipient for Company B)
  - **Active/Inactive Status**: Track relationship lifecycle
  - **Notes**: Additional context and relationship details
  - **UI Integration**: Dedicated "Scenari" tab in organization edit dialog
  - **Visual Management**: Card-based interface with color-coded relationship types
  - **CRUD Operations**: Full create, read, update, delete with validation

This feature enables users to model complex multi-organization business structures, track client-vendor relationships, and maintain clear visibility of inter-organizational dependencies for project and billing management.

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

## Artificial Intelligence
- **OpenAI**: AI model integration (gpt-5).