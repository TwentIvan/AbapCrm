import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Plus, Edit, Trash2, Key, Grid3X3, List, MoreHorizontal } from "lucide-react";
import { SystemCredentials } from "@shared/schema";
import { SystemCredentialsForm } from "@/components/forms/system-credentials-form";
import SystemCredentialsFormContainer from "@/components/forms/system-credentials-form-container";

export function SystemCredentialsPage() {
  const [location] = useLocation();
  const [selectedCredentials, setSelectedCredentials] = useState<SystemCredentials[]>([]);
  const [editingCredential, setEditingCredential] = useState<SystemCredentials | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/system-credentials/");
  const isCreateMode = location === "/system-credentials/new";
  const isEditMode = location.includes("/edit");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use the table layout hook for persistent preferences
  const { 
    layout, 
    currentLayoutName,
    savedLayouts,
    updateLayout, 
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
    updateExistingLayout,
  } = useTableLayout('system-credentials');

  const { data: credentials = [], isLoading } = useQuery<SystemCredentials[]>({
    queryKey: ["/api/system-credentials"],
    queryFn: async () => {
      const res = await fetch("/api/system-credentials", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch system credentials');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      await apiRequest("DELETE", `/api/system-credentials/${credentialId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
      setShowDeleteDialog(false);
      setEditingCredential(null);
      toast({
        title: "Credenziali eliminate",
        description: "Le credenziali sono state eliminate con successo.",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (credentials: SystemCredentials[]) => {
      for (const credential of credentials) {
        await apiRequest("DELETE", `/api/system-credentials/${credential.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
      setSelectedCredentials([]);
      setShowBulkDeleteDialog(false);
      toast({
        title: "Credenziali eliminate",
        description: "Le credenziali selezionate sono state eliminate con successo.",
      });
    },
  });

  const handleEdit = (credential: SystemCredentials) => {
    setEditingCredential(credential);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingCredential(null);
    setShowForm(true);
  };

  const handleSingleDelete = (credential: SystemCredentials) => {
    setEditingCredential(credential);
    setShowDeleteDialog(true);
  };

  const handleDelete = (credentials: SystemCredentials[]) => {
    if (credentials.length === 0) return;
    setSelectedCredentials(credentials);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingCredential) {
      deleteMutation.mutate(editingCredential.id);
    }
  };
  
  // Handle full-page mode: when user navigates directly to /system-credentials/new or /system-credentials/:id/edit
  if (isFullPageMode) {
    return (
      <SystemCredentialsFormContainer
        open={false} // Not used in full-page mode
        onOpenChange={() => {}} // Not used in full-page mode
        editingCredential={editingCredential}
        onSuccess={() => {
          setEditingCredential(null);
        }}
      />
    );
  }

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedCredentials);
  };

  const formatSystemType = (type: string) => {
    switch (type) {
      case "sap": return "SAP";
      case "vpn": return "VPN";
      default: return type.toUpperCase();
    }
  };

  const formatExpirationDate = (date: Date | string | null) => {
    if (!date) return "Nessuna scadenza";
    const expDate = new Date(date);
    const today = new Date();
    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `🔴 Scaduta ${Math.abs(diffDays)} giorni fa`;
    if (diffDays <= 7) return `🟡 Scade tra ${diffDays} giorni`;
    if (diffDays <= 30) return `🟠 Scade tra ${diffDays} giorni`;
    return `🟢 Scade il ${expDate.toLocaleDateString("it-IT")}`;
  };

  const columns = [
    createStandardColumns.text("username", "Username"),
    createStandardColumns.text("systemName", "Sistema"),
    createStandardColumns.badge("systemType", "Tipo", {
      "sap": "bg-blue-100 text-blue-800",
      "vpn": "bg-green-100 text-green-800"
    }),
    createStandardColumns.text("description", "Descrizione"),
    {
      key: "expirationDate",
      label: "Scadenza",
      sortable: true,
      searchable: false,
      render: (credential: SystemCredentials) => formatExpirationDate(credential.expirationDate)
    },
    {
      key: "isActive", 
      label: "Stato",
      sortable: true,
      searchable: false,
      render: (credential: SystemCredentials) => (
        <span className={credential.isActive ? "text-green-600" : "text-red-600"}>
          {credential.isActive ? "Attivo" : "Inattivo"}
        </span>
      )
    },
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (credential: SystemCredentials) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-credential-menu-${credential.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(credential)}
              data-testid={`menu-edit-credential-${credential.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(credential)}
              className="text-destructive"
              data-testid={`menu-delete-credential-${credential.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Credenziali Sistema" 
          subtitle="Gestione unificata credenziali SAP e VPN"
          onNewClick={handleAdd}
        />
        
        <div className="p-6">
          {/* Layout Management and View Toggle */}
          <div className="flex justify-between items-center mb-4">
            {/* Layout Manager */}
            <div className="flex items-center gap-4">
              <LayoutManager
                currentLayoutName={currentLayoutName}
                savedLayouts={savedLayouts}
                onLoadLayout={loadLayout}
                onRenameLayout={renameLayout}
                onDeleteLayout={deleteLayout}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowConfigDialog(true)}
                data-testid="button-configure-columns"
              >
                <Edit className="h-4 w-4 mr-2" />
                Configura
              </Button>
            </div>

            {/* View Toggle */}
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant='default'
                size="sm"
                onClick={() => updateLayout({})}
                data-testid="button-view-cards"
              >
                <Grid3X3 className="mr-2 h-4 w-4" />
                Cards
              </Button>
              <Button
                variant='ghost'
                size="sm"
                onClick={() => updateLayout({})}
                data-testid="button-view-list"
              >
                <List className="mr-2 h-4 w-4" />
                List
              </Button>
            </div>
          </div>

          <UniversalTable
            data={credentials}
            columns={columns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedCredentials(rows as SystemCredentials[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionate",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedCredentials)
              }
            ]}
          />
        </div>

        {/* Form Container - supports both dialog and full-page modes */}
        <SystemCredentialsFormContainer
          open={showForm}
          onOpenChange={(open) => {
            setShowForm(open);
            if (!open) {
              setEditingCredential(null);
            }
          }}
          editingCredential={editingCredential}
          onSuccess={() => {
            setShowForm(false);
            setEditingCredential(null);
          }}
        />

        {/* Single Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Credenziali</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare le credenziali per "{editingCredential?.systemName}"? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">
                Annulla
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Eliminando..." : "Elimina"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare {selectedCredentials.length} credenziali selezionate? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-bulk-delete">
                Annulla
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkDeleteMutation.isPending}
                data-testid="button-confirm-bulk-delete"
              >
                {bulkDeleteMutation.isPending ? "Eliminando..." : `Elimina ${selectedCredentials.length} Credenziali`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Table Configuration Dialog */}
        <TableConfiguration
          isOpen={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          tableId="system-credentials"
          availableColumns={[
            { id: 'username', label: 'Username' },
            { id: 'systemName', label: 'Sistema' },
            { id: 'systemType', label: 'Tipo' },
            { id: 'description', label: 'Descrizione' },
            { id: 'expirationDate', label: 'Scadenza' },
            { id: 'isActive', label: 'Stato' },
          ]}
          editingLayout={editingLayout}
          onSave={(layoutData) => {
            updateLayout(layoutData);
            setShowConfigDialog(false);
          }}
          onCancel={() => setShowConfigDialog(false)}
        />
      </main>
    </div>
  );
}