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
-   **Computed Fields System (End-to-Complete)**: Dynamic calculated columns for project planning visibility (e.g., State, Completion %, Remaining Hours), fetched via batch endpoints and integrated into tables.
-   **Planning Windows & Project Relationship**: Architectural design for project scheduling in a global calendar, where projects reference independent planning windows for ETC clamping and display.
-   **Auto-Rescheduling System**: Automatically recalculates project schedules and deficit hours when task completion or effort changes, persisting updates to project records.
-   **Freeform Dashboard with Entity Widget System**: Customizable dashboard with drag-and-drop widgets using `react-rnd`, leveraging `EntityListDescriptor` and `EmbeddedEntityList` components for generic entity rendering.
-   **Address Management System**: Comprehensive address handling for partners, including `AddressSearch` (Nominatim API), `MapPicker` (Leaflet), structured address fields, and distinction between legal and operational addresses.
-   **Resource Planner**: Global heatmap view for team managers to visualize resource allocation across time periods (day/week/month). Shows capacity vs demand per resource with color-coded criticality (green=balanced, amber=under-allocated, red=over-allocated). Includes KPI cards, skill badges, task detail popovers, and resource detail panel. Backed by `resource_skills` and `resource_availability` tables for granular skill management and configurable availability.

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