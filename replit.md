# Overview

This CRM application for SAP ABAP freelancers provides a unified dashboard to manage projects, tasks, business deals, partners, and calendar events. It's a full-stack web application featuring an AI-powered project agent for intelligent message analysis and semi-automatic project creation. The system also includes robust multi-organization data filtering and a metadata-driven extension layer for custom fields, entities, workflows, and permissions. It supports receiving SAP Transport Requests via API, email, or manual input, and integrates with SAP shortcuts for direct program execution.

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

The client-side uses React 18, TypeScript, `shadcn/ui` (Radix UI), `TailwindCSS`, `TanStack Query`, `Wouter` for routing, and `React Hook Form` with `Zod` for forms. `Vite` manages development and builds.

## Backend Architecture

The server uses `Express.js` with TypeScript, implementing a RESTful API pattern. `Passport.js` handles local authentication with scrypt hashing, and `Express sessions` are stored in PostgreSQL. Custom middleware supports logging, JSON parsing, and authentication.

## Data Storage

`PostgreSQL` is the primary database, managed with `Drizzle ORM` for type-safe operations and `Drizzle Kit` for migrations.

## Authentication & Authorization

Authentication is session-based, using a local username/password strategy with scrypt hashing. Sessions are stored in PostgreSQL. Authorization is enforced via route-level middleware.

## Core Features & Design Patterns

### Custom Fields & Metadata System
A metadata-driven extension layer supports custom entities (JSONB schemas), dynamic custom fields with type validation, entity custom values, event-driven workflows, and role-based permissions. `CustomMetadataService` provides caching and Zod schema generation for runtime validation, integrated with a type-safe `EventBus`.

### Multi-Organization Filtering
The system provides intelligent cross-organization data visibility using `X-Organization-Id` and `X-Organization-Scope` headers. Users in the 'Personal' organization can view data across all their organizations, while others are restricted to their own.

### AI Project Agent & Background Proposal System
An AI-powered agent (integrating OpenAI gpt-5) analyzes messages and proposes project, partner, and task creations. This runs asynchronously, storing proposals in a dedicated `proposals` table with status tracking. A `/proposals` page allows management, with visual indicators in the UI for pending proposals.

### Multi-Message Chat Normalization
Conversations from various platforms (Teams, WhatsApp, Google Meet) are parsed and normalized into a structured format stored in a `jsonb metadata` column for rich UI display.

### Freelance Engagement & Procurement System
Manages freelance engagements with project assignments (fixed amount/hourly rate, auto PO generation), project milestones (Gantt chart with timezone-free date handling, dependencies, progress, budget tracking), purchase orders (auto-generation, vendor management, lifecycle), and vendor invoices (linking to POs/projects, payment tracking).

### Business Scenarios - Organization Relationship Management
Defines and manages many-to-many relationships between organizations with typed business contexts (e.g., `cliente_fattura`, `fornitore`, `partner`). Relationships are directional, with status tracking and notes, managed via a dedicated UI.

### Bulk Operations - Mass Edit & Copy
Comprehensive bulk editing and copying capabilities across all main entities (Projects, Tasks, Partners, Deals, Contacts, Organizations, Human Resources). `BulkEditDialog` allows selective field updates via parallel PUT requests. `BulkCopyDialog` creates entity duplicates with customizable suffixes via parallel POST requests, automatically excluding auto-generated fields. Operations include cache invalidation, toast notifications, loading states, and selection reset.

### SAP Transport Request Integration
Supports receiving Transport Requests from SAP systems via three methods: direct API POST, email integration (processing JSON attachments from a dedicated IMAP folder), and manual JSON paste via UI. The email method offers full autonomy from client IT.

### SAP Shortcut Integration
Projects linked to an SAP system can launch the **ZTHU_DOCUMENTATION** program. The system generates a `.sap` shortcut file; users execute the ABAP program, copy its JSON output, and paste it into a dialog to automatically create and link the Transport Request.

### Address Management System
Comprehensive address handling for partner entities with:
- **AddressSearch Component** (`client/src/components/ui/address-search.tsx`): Autocomplete search using Nominatim API (OpenStreetMap geocoding), Italian province code extraction (100+ mappings), radio buttons for legal/operational address type selection
- **MapPicker Component** (`client/src/components/ui/map-picker.tsx`): Interactive Leaflet map for visual location selection with draggable markers and reverse geocoding
- **Structured Address Fields**: street, streetNumber, city, province, postalCode, country, latitude, longitude
- **Legal/Operational Address Distinction**: `isLegalAddress` boolean with `parentPartnerId` for linking operational sites to their parent legal headquarters
- **Database Fields**: Partners table extended with structured address columns and hierarchical relationship support

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

## Form & Data Validation
- **Zod**: Schema validation library.
- **React Hook Form**: Form library with validation.

## Artificial Intelligence
- **OpenAI**: AI model integration (gpt-5).