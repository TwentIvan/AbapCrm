# Overview

This is a comprehensive CRM (Customer Relationship Management) application designed specifically for SAP ABAP freelancers. The application helps manage projects, tasks, business deals, partners (clients/vendors), and calendar events in a unified dashboard. Built as a full-stack web application with a modern React frontend and Express.js backend, it provides freelancers with essential business management tools including project tracking, deal pipeline management, partner relationship management, and task organization.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The client-side is built using **React 18** with **TypeScript** and follows a component-based architecture:

- **UI Framework**: Utilizes shadcn/ui components built on Radix UI primitives for consistent, accessible design
- **Styling**: TailwindCSS with CSS custom properties for theming and responsive design
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form management
- **Build Tool**: Vite for fast development and optimized production builds

## Backend Architecture

The server follows a RESTful API pattern with Express.js:

- **Web Framework**: Express.js with TypeScript for type safety
- **Authentication**: Passport.js with local strategy using scrypt for password hashing
- **Session Management**: Express sessions with PostgreSQL session store
- **API Structure**: Resource-based endpoints (/api/projects, /api/tasks, etc.) with CRUD operations
- **Middleware**: Custom logging, JSON parsing, and authentication middleware

## Data Storage

The application uses PostgreSQL as the primary database with Drizzle ORM:

- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM for type-safe database operations and schema management
- **Schema Design**: Relational model with foreign key relationships between users, projects, tasks, partners, deals, and calendar events
- **Migrations**: Drizzle Kit for schema migrations and database management

## Authentication & Authorization

Authentication is handled through a session-based approach:

- **Strategy**: Local authentication with username/password
- **Password Security**: Scrypt-based hashing with salt for secure password storage
- **Sessions**: Server-side sessions stored in PostgreSQL with connect-pg-simple
- **Authorization**: Route-level protection with authentication middleware and protected route components

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting with WebSocket connections for real-time capabilities

## UI & Design System
- **Radix UI**: Comprehensive set of low-level UI primitives for accessibility and customization
- **shadcn/ui**: Pre-built component library built on Radix UI with consistent design tokens
- **Lucide React**: Icon library providing consistent iconography throughout the application

## Development & Build Tools
- **Vite**: Frontend build tool with hot module replacement and optimized bundling
- **Replit Integration**: Specialized plugins for Replit development environment including error handling and cartographer
- **TypeScript**: Type safety across the entire application stack

## Authentication & Security
- **Passport.js**: Authentication middleware with local strategy support
- **Session Management**: PostgreSQL-backed session storage for scalable session handling

## Form & Data Validation
- **Zod**: Schema validation library used for both client and server-side data validation
- **React Hook Form**: Performant form library with built-in validation support

The application is designed as a monorepo structure with shared types and schemas between frontend and backend, ensuring type consistency across the full stack.