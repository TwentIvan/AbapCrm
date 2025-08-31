import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Key, Wifi, Server } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { SystemCredentialsForm } from "@/components/forms/system-credentials-form";
import type { SystemCredentials } from "@shared/schema";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export function SystemCredentialsPage() {
  const [selectedCredentials, setSelectedCredentials] = useState<SystemCredentials[]>([]);
  const [editingCredential, setEditingCredential] = useState<SystemCredentials | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Layout management
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
  const viewMode = layout.viewMode;

  const { data: credentials = [], isLoading, error } = useQuery<SystemCredentials[]>({
    queryKey: ["/api/system-credentials"],
    queryFn: async () => {
      const res = await fetch("/api/system-credentials", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: false,
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/system-credentials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
      toast({
        title: "Credenziali eliminate",
        description: "Le credenziali sono state eliminate con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare le credenziali.",
        variant: "destructive",
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
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare le credenziali.",
        variant: "destructive",
      });
    },
  });

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(credential);
            }}
            data-testid={`button-edit-${credential.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleSingleDelete(credential);
            }}
            data-testid={`button-delete-${credential.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Credenziali Sistema"
          subtitle="Gestione unificata credenziali SAP e VPN"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <LayoutManager
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onEditLayout={(layoutToEdit) => {
              setEditingLayout(layoutToEdit);
              setShowConfigDialog(true);
            }}
          />

          <UniversalTable
            data={credentials}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca credenziali..."
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

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingCredential ? "Modifica Credenziali" : "Nuove Credenziali"}
                </DialogTitle>
                <DialogDescription>
                  {editingCredential ? "Aggiorna" : "Aggiungi"} le credenziali di sistema
                </DialogDescription>
              </DialogHeader>
              <SystemCredentialsForm
                credential={editingCredential}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingCredential(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/system-credentials"] });
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingCredential(null);
                }}
              />
            </DialogContent>
          </Dialog>

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

          {/* Layout Configuration Dialog */}
          <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Modifica Layout: {editingLayout?.name || 'Layout'}
                </DialogTitle>
                <DialogDescription>
                  Configura la visibilità delle colonne, ordinamento e filtri per questo layout.
                </DialogDescription>
              </DialogHeader>
              {/* TODO: Add TableConfiguration component */}
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}