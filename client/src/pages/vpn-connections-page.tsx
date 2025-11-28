import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VpnConnection, Partner } from "@shared/schema";
import SimpleVPNForm from "@/components/forms/simple-vpn-form";
import VpnConnectionFormContainer from "@/components/forms/vpn-connection-form-container";
import { Trash2, CheckCircle, XCircle, Play, Loader2 } from "lucide-react";

export default function VPNConnectionsPage() {
  const [location] = useLocation();
  const [selectedConnections, setSelectedConnections] = useState<VpnConnection[]>([]);
  const [editingConnection, setEditingConnection] = useState<VpnConnection | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/vpn-connections/");
  const isCreateMode = location === "/vpn-connections/new";
  const isEditMode = location.includes("/edit");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    layout, currentLayoutName, savedLayouts, updateLayout, 
    saveLayoutAs, loadLayout, renameLayout, deleteLayout
  } = useTableLayout('vpn-connections');

  // Fetch VPN connections
  const { data: vpnConnections = [], isLoading } = useQuery<VpnConnection[]>({
    queryKey: ["/api/vpn-connections"],
    queryFn: async () => {
      const res = await fetch("/api/vpn-connections", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch VPN connections');
      return res.json();
    },
  });

  // Fetch partners for display
  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  const { data: fieldMetadata } = useEntityFieldMetadata("vpn-connections");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vpn-connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vpn-connections"] });
      setShowDeleteDialog(false);
      setEditingConnection(null);
      toast({ title: "Eliminata", description: "Connessione VPN eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (connections: VpnConnection[]) => {
      for (const connection of connections) {
        await apiRequest("DELETE", `/api/vpn-connections/${connection.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vpn-connections"] });
      setSelectedConnections([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminate", description: "Connessioni VPN eliminate con successo" });
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      console.log("🧪 Test mutation starting for connection:", connectionId);
      const response = await apiRequest("POST", `/api/vpn-connections/${connectionId}/test`);
      const data = await response.json();
      console.log("🧪 Test response JSON:", data);
      return data;
    },
    onMutate: (connectionId: string) => {
      console.log("🧪 Test mutation onMutate:", connectionId);
      setTestingConnection(connectionId);
    },
    onSuccess: (data: any, connectionId: string) => {
      console.log("🧪 Test mutation success:", data);
      setTestingConnection(null);
      const testResult = data.testResult;
      
      toast({
        title: "Test Completato",
        description: testResult.overall.message,
        variant: testResult.overall.status === 'error' ? 'destructive' : 'default'
      });
    },
    onError: (error: any, connectionId: string) => {
      console.log("🧪 Test mutation error:", error);
      setTestingConnection(null);
      toast({
        title: "Errore Test",
        description: "Impossibile testare la connessione VPN",
        variant: "destructive"
      });
    }
  });

  const handleEdit = (connection: VpnConnection) => {
    setEditingConnection(connection);
    setShowForm(true);
  };

  const handleAdd = () => {
    console.log("🔍 handleAdd called - aprendo dialog VPN");
    setEditingConnection(null);
    setShowForm(true);
    console.log("🔍 showForm state updated to:", true);
  };

  const handleSingleDelete = (connection: VpnConnection) => {
    setEditingConnection(connection);
    setShowDeleteDialog(true);
  };

  const handleDelete = (connections: VpnConnection[]) => {
    if (connections.length === 0) return;
    setSelectedConnections(connections);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingConnection) {
      deleteMutation.mutate(editingConnection.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedConnections);
  };
  
  // Handle full-page mode: when user navigates directly to /vpn-connections/new or /vpn-connections/:id/edit
  if (isFullPageMode) {
    return (
      <VpnConnectionFormContainer
        open={false} // Not used in full-page mode
        onOpenChange={() => {}} // Not used in full-page mode
        editingConnection={editingConnection}
        onSuccess={() => {
          setEditingConnection(null);
        }}
      />
    );
  }

  // Table columns
  const columns = [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      searchable: true,
      render: (connection: VpnConnection) => (
        <div>
          <div className="font-medium">{connection.name}</div>
          <div className="text-sm text-muted-foreground">{connection.description}</div>
        </div>
      ),
    },
    {
      key: "server",
      label: "Server",
      sortable: true,
      searchable: true,
      render: (connection: VpnConnection) => (
        <div className="font-mono text-sm">
          {connection.serverHost}:{connection.serverPort}
        </div>
      ),
    },
    createStandardColumns.badge("connectionType", "Tipo"),
    {
      key: "automationScript",
      label: "Automazione",
      sortable: true,
      searchable: false,
      render: (connection: VpnConnection) => {
        const hasScript = !!connection.automationScript;
        const scriptType = connection.scriptType;
        
        return (
          <div className="flex items-center gap-2">
            {hasScript ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <Badge variant="outline" className="text-xs">
                  {scriptType}
                </Badge>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-muted-foreground">Non configurata</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: "partnerId", 
      label: "Cliente",
      sortable: true,
      searchable: true,
      render: (connection: VpnConnection) => {
        const partner = partners.find(p => p.id === connection.partnerId);
        return partner ? (
          <div>
            <div className="font-medium">{partner.name}</div>
            <div className="text-sm text-muted-foreground">{partner.company || ''}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Connessioni VPN"
          subtitle="Gestisci le connessioni VPN per accesso remoto ai sistemi"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => {/* TODO: implement configure */}}
            onCreateNew={handleAdd}
            onCopySelected={() => {/* TODO: implement copy */}}
            onBulkEdit={() => {/* TODO: implement bulk edit */}}
            onDeleteSelected={() => handleDelete(selectedConnections)}
            hasSelection={selectedConnections.length > 0}
            viewToggle={
              selectedConnections.length === 1 && (
                <Button
                  data-testid="button-test-vpn"
                  variant="outline"
                  size="sm"
                  onClick={() => testConnectionMutation.mutate(selectedConnections[0].id)}
                  disabled={testingConnection !== null}
                >
                  {testingConnection === selectedConnections[0].id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Test Connessione
                    </>
                  )}
                </Button>
              )
            }
          />

          <UniversalTable
            data={vpnConnections}
            columns={columns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedConnections(rows as VpnConnection[])}
            onRowClick={handleEdit}
          />

          {/* Form Container - supports both dialog and full-page modes */}
          <VpnConnectionFormContainer
            open={showForm}
            onOpenChange={(open) => {
              console.log("🔍 VPN Form container onOpenChange called with:", open);
              setShowForm(open);
              if (!open) {
                setEditingConnection(null);
              }
            }}
            editingConnection={editingConnection}
            onSuccess={() => {
              console.log("🔍 VPN Form container success callback");
              setShowForm(false);
              setEditingConnection(null);
            }}
          />

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Connessione VPN</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare "{editingConnection?.name}"? 
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
                  Sei sicuro di voler eliminare {selectedConnections.length} connessioni VPN selezionate? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedConnections.length} Connessioni
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    </div>
  );
}