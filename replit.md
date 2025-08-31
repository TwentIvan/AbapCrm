# Overview

This is a comprehensive CRM (Customer Relationship Management) application designed specifically for SAP ABAP freelancers. The application helps manage projects, tasks, business deals, partners (clients/vendors), and calendar events in a unified dashboard. Built as a full-stack web application with a modern React frontend and Express.js backend, it provides freelancers with essential business management tools including project tracking, deal pipeline management, partner relationship management, and task organization.

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

### Implementation Template

When creating any new table/CRUD area in the application, ALWAYS follow this exact template to ensure consistency and avoid repeated errors:

### 1. Required Imports Template
```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
```

### 2. Required State Variables Template
```tsx
const [selectedItems, setSelectedItems] = useState<ItemType[]>([]);
const [editingItem, setEditingItem] = useState<ItemType | null>(null);
const [showForm, setShowForm] = useState(false);
const [showDeleteDialog, setShowDeleteDialog] = useState(false);
const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
const [showConfigDialog, setShowConfigDialog] = useState(false);
const [editingLayout, setEditingLayout] = useState<any>(null);
const { toast } = useToast();
const queryClient = useQueryClient();

const {
  layout, currentLayoutName, savedLayouts, updateLayout, 
  saveLayoutAs, loadLayout, renameLayout, deleteLayout, updateExistingLayout
} = useTableLayout('table-name');
const viewMode = layout.viewMode;
```

### 3. Required Query & Mutations Template
```tsx
const { data: items = [], isLoading } = useQuery<ItemType[]>({
  queryKey: ["/api/endpoint"],
  queryFn: async () => {
    const res = await fetch("/api/endpoint", { credentials: "include" });
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  },
});

const deleteMutation = useMutation({
  mutationFn: (id: string) => apiRequest("DELETE", `/api/endpoint/${id}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] });
    setShowDeleteDialog(false);
    setEditingItem(null);
    toast({ title: "Eliminato", description: "Item eliminato con successo" });
  }
});

const bulkDeleteMutation = useMutation({
  mutationFn: async (items: ItemType[]) => {
    for (const item of items) {
      await apiRequest("DELETE", `/api/endpoint/${item.id}`);
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] });
    setSelectedItems([]);
    setShowBulkDeleteDialog(false);
    toast({ title: "Eliminati", description: "Items eliminati con successo" });
  }
});
```

### 4. Required Handler Functions Template
```tsx
const handleEdit = (item: ItemType) => {
  setEditingItem(item);
  setShowForm(true);
};

const handleAdd = () => {
  setEditingItem(null);
  setShowForm(true);
};

const handleSingleDelete = (item: ItemType) => {
  setEditingItem(item);
  setShowDeleteDialog(true);
};

const handleDelete = (items: ItemType[]) => {
  if (items.length === 0) return;
  setSelectedItems(items);
  setShowBulkDeleteDialog(true);
};

const confirmDelete = () => {
  if (editingItem) {
    deleteMutation.mutate(editingItem.id);
  }
};

const confirmBulkDelete = () => {
  bulkDeleteMutation.mutate(selectedItems);
};
```

### 5. Required Layout Structure Template
```tsx
return (
  <div className="flex h-screen">
    <Sidebar />
    <div className="flex-1 overflow-hidden">
      <Header 
        title="Page Title"
        subtitle="Page description"
        onNewClick={handleAdd}
      />
      <main className="p-6 space-y-6">
        <LayoutManager
          layoutId="table-name"
          viewMode={viewMode}
          currentLayoutName={currentLayoutName}
          savedLayouts={savedLayouts}
          onViewModeChange={(mode) => updateLayout({ viewMode: mode })}
          onLoadLayout={loadLayout}
          onSaveLayout={saveLayoutAs}
          onRenameLayout={renameLayout}
          onDeleteLayout={deleteLayout}
          onEditLayout={(layoutToEdit) => {
            setEditingLayout(layoutToEdit);
            setShowConfigDialog(true);
          }}
        />

        <UniversalTable
          data={items}
          columns={columns}
          enableSelection={true}
          enableSearch={true}
          searchPlaceholder="Cerca..."
          onSelectionChange={(rows) => setSelectedItems(rows as ItemType[])}
          onRowClick={handleEdit}
          bulkActions={[
            {
              label: "Elimina Selezionate",
              icon: Trash2,
              variant: "destructive",
              onClick: () => handleDelete(selectedItems)
            }
          ]}
          isLoading={isLoading}
        />

        {/* Create/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? "Modifica Item" : "Nuovo Item"}
              </DialogTitle>
              <DialogDescription>
                {editingItem ? "Aggiorna" : "Aggiungi"} item
              </DialogDescription>
            </DialogHeader>
            <ItemForm
              item={editingItem}
              onSuccess={() => {
                setShowForm(false);
                setEditingItem(null);
                queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] });
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingItem(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Single Delete Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Item</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare "{editingItem?.name}"? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Elimina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare {selectedItems.length} items selezionati? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={confirmBulkDelete}>
                Elimina {selectedItems.length} Items
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  </div>
);
```

### 6. Critical API Pattern Rules
- **ALWAYS** use `apiRequest("METHOD", "/url", data)` (method FIRST)
- **ALWAYS** use AlertDialog instead of system confirm()
- **ALWAYS** include both single and bulk delete with proper confirmations
- **ALWAYS** include Sidebar + Header layout
- **ALWAYS** include LayoutManager for table configuration
- **ALWAYS** use data-testid for all interactive elements

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