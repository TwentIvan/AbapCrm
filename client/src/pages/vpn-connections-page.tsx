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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VpnConnection } from "@shared/schema";
import VPNConnectionForm from "@/components/forms/vpn-connection-form";
import { Trash2, Zap, Settings, Wifi, Shield, CheckCircle, XCircle } from "lucide-react";

export default function VPNConnectionsPage() {
  const [selectedConnections, setSelectedConnections] = useState<VpnConnection[]>([]);
  const [editingConnection, setEditingConnection] = useState<VpnConnection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    layout, currentLayoutName, savedLayouts, updateLayout, 
    saveLayoutAs, loadLayout, renameLayout, deleteLayout
  } = useTableLayout('vpn-connections');
  const viewMode = layout.viewMode;

  // Fetch VPN connections
  const { data: vpnConnections = [], isLoading } = useQuery<VpnConnection[]>({
    queryKey: ["/api/vpn-connections"],
    queryFn: async () => {
      const res = await fetch("/api/vpn-connections", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch VPN connections');
      return res.json();
    },
  });

  // Fetch partners for the form
  const { data: partners = [] } = useQuery({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  // Delete mutations
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

  // Handlers
  const handleEdit = (connection: VpnConnection) => {
    setEditingConnection(connection);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingConnection(null);
    setShowForm(true);
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

  // Table columns
  const columns = createStandardColumns<VpnConnection>([
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          <div className="text-sm text-muted-foreground">{row.original.description}</div>
        </div>
      ),
    },
    {
      accessorKey: "serverHost",
      header: "Server",
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.serverHost}:{row.original.serverPort}
        </div>
      ),
    },
    {
      accessorKey: "connectionType",
      header: "Tipo",
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.getValue("connectionType")}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Stato",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <Badge 
            variant={status === "active" ? "default" : "secondary"}
            className={status === "active" ? "bg-green-100 text-green-800" : ""}
          >
            {status === "active" ? "Attiva" : "Inattiva"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "automationScript",
      header: "Automazione",
      cell: ({ row }) => {
        const hasScript = !!row.original.automationScript;
        const scriptType = row.original.scriptType;
        
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
      accessorKey: "partnerId", 
      header: "Cliente",
      cell: ({ row }) => {
        const partner = partners.find(p => p.id === row.original.partnerId);
        return partner ? (
          <div>
            <div className="font-medium">{partner.name}</div>
            <div className="text-sm text-muted-foreground">{partner.company}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: "actions",
      header: "Azioni",
      cell: ({ row }) => (
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEdit(row.original)}
            data-testid={`button-edit-${row.original.id}`}
          >
            <Settings className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSingleDelete(row.original)}
            data-testid={`button-delete-${row.original.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]);

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
          <LayoutManager
            layoutId="vpn-connections"
            viewMode={viewMode}
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onViewModeChange={(mode) => updateLayout({ viewMode: mode })}
            onLoadLayout={loadLayout}
            onSaveLayout={saveLayoutAs}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
          />

          <UniversalTable
            data={vpnConnections}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca connessioni VPN..."
            onSelectionChange={(rows) => setSelectedConnections(rows as VpnConnection[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionate",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedConnections)
              }
            ]}
            isLoading={isLoading}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingConnection ? "Modifica Connessione VPN" : "Nuova Connessione VPN"}
                </DialogTitle>
                <DialogDescription>
                  {editingConnection ? "Aggiorna" : "Configura"} la connessione VPN e genera script di automazione
                </DialogDescription>
              </DialogHeader>
              <VPNConnectionForm
                vpnConnection={editingConnection}
                partners={partners}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingConnection(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/vpn-connections"] });
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingConnection(null);
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Connessione VPN</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare la connessione "{editingConnection?.name}"? 
                  Questa azione eliminerà anche tutti gli script di automazione associati e non può essere annullata.
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
                  Questa azione eliminerà anche tutti gli script di automazione associati e non può essere annullata.
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