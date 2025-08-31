import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, type TableColumn } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Trash2, Shield, Wifi, WifiOff, Edit } from "lucide-react";
import { VpnSystems } from "@shared/schema";
import VpnSystemForm from "@/components/forms/vpn-system-form";

const statusColors = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  error: "bg-red-100 text-red-800",
  connecting: "bg-yellow-100 text-yellow-800",
};

const statusLabels = {
  active: "Attivo",
  inactive: "Inattivo", 
  error: "Errore",
  connecting: "Connessione",
};


export default function VpnSystemsPage() {
  const [selectedItems, setSelectedItems] = useState<VpnSystems[]>([]);
  const [editingItem, setEditingItem] = useState<VpnSystems | null>(null);
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
  } = useTableLayout('vpn-systems');
  const viewMode = layout.viewMode;

  const { data: items = [], isLoading } = useQuery<VpnSystems[]>({
    queryKey: ["/api/vpn-systems"],
    queryFn: async () => {
      const res = await fetch("/api/vpn-systems", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch VPN systems');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vpn-systems/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vpn-systems"] });
      setShowDeleteDialog(false);
      setEditingItem(null);
      toast({ title: "Eliminato", description: "Sistema VPN eliminato con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (items: VpnSystems[]) => {
      for (const item of items) {
        await apiRequest("DELETE", `/api/vpn-systems/${item.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vpn-systems"] });
      setSelectedItems([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Sistemi VPN eliminati con successo" });
    }
  });

  const handleEdit = (item: VpnSystems) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const handleSingleDelete = (item: VpnSystems) => {
    setEditingItem(item);
    setShowDeleteDialog(true);
  };

  const handleDelete = (items: VpnSystems[]) => {
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

  const columns: TableColumn[] = [
    {
      key: "name",
      label: "Nome Sistema",
      sortable: true,
      searchable: true,
      render: (item: VpnSystems) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600" />
          <span className="font-medium">{item.name}</span>
        </div>
      )
    },
    {
      key: "serverHost",
      label: "Indirizzo Server",
      sortable: true,
      searchable: true,
      render: (item: VpnSystems) => (
        <div className="font-mono text-sm">
          {item.serverHost}
          {item.serverPort && <span className="text-gray-500">:{item.serverPort}</span>}
        </div>
      )
    },
    {
      key: "connectionProfile",
      label: "Profilo Connessione",
      sortable: true,
      searchable: true,
      render: (item: VpnSystems) => (
        <span className="text-sm">
          {item.connectionProfile || "Nessun profilo"}
        </span>
      )
    },
    {
      key: "status",
      label: "Stato",
      sortable: true,
      searchable: true,
      render: (item: VpnSystems) => (
        <div className="flex items-center gap-2">
          {item.status === "active" ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-gray-400" />
          )}
          <Badge 
            variant="secondary" 
            className={statusColors[item.status as keyof typeof statusColors]}
          >
            {statusLabels[item.status as keyof typeof statusLabels] || item.status}
          </Badge>
        </div>
      )
    },
    {
      key: "partner",
      label: "Partner",
      sortable: true,
      searchable: true,
      accessor: (item: VpnSystems) => (item as any).partner?.name || "",
      render: (item: VpnSystems) => (
        <div>
          {(item as any).partner ? (
            <div>
              <div className="font-medium">{(item as any).partner.name}</div>
              {(item as any).partner.company && (
                <div className="text-sm text-gray-500">{(item as any).partner.company}</div>
              )}
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      )
    },
    {
      key: "vpnSoftware",
      label: "Software VPN",
      sortable: true,
      searchable: true,
      accessor: (item: VpnSystems) => (item as any).vpnSoftware?.name || "",
      render: (item: VpnSystems) => (
        <div>
          {(item as any).vpnSoftware ? (
            <div className="flex items-center gap-2">
              {(item as any).vpnSoftware.iconUrl && (
                <img 
                  src={(item as any).vpnSoftware.iconUrl} 
                  alt={(item as any).vpnSoftware.name}
                  className="h-5 w-5"
                />
              )}
              <div>
                <div className="font-medium">{(item as any).vpnSoftware.name}</div>
                <div className="text-sm text-gray-500">{(item as any).vpnSoftware.vendor}</div>
              </div>
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      )
    },
    {
      key: "lastConnected",
      label: "Ultima Connessione",
      sortable: true,
      searchable: false,
      render: (item: VpnSystems) => (
        <div className="text-sm text-gray-600">
          {item.lastConnected 
            ? new Date(item.lastConnected).toLocaleDateString('it-IT', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : "Mai"
          }
        </div>
      )
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Sistemi VPN"
          subtitle="Gestione sistemi VPN e connessioni partner"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <LayoutManager
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onEditLayout={(layoutToEdit: any) => {
              setEditingLayout(layoutToEdit);
              setShowConfigDialog(true);
            }}
          />

          <UniversalTable
            data={items}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca sistemi VPN..."
            onSelectionChange={(rows) => setSelectedItems(rows as VpnSystems[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionati",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedItems)
              }
            ]}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? "Modifica Sistema VPN" : "Nuovo Sistema VPN"}
                </DialogTitle>
                <DialogDescription>
                  {editingItem ? "Aggiorna" : "Aggiungi"} sistema VPN
                </DialogDescription>
              </DialogHeader>
              <VpnSystemForm
                system={editingItem}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingItem(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/vpn-systems"] });
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
                <AlertDialogTitle>Elimina Sistema VPN</AlertDialogTitle>
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
                  Sei sicuro di voler eliminare {selectedItems.length} sistemi VPN selezionati? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedItems.length} Sistemi
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Table Configuration Dialog */}
          <TableConfiguration
            tableId="vpn-systems"
            availableColumns={columns.map(col => ({
              id: col.key,
              label: col.label
            }))}
            editingLayout={editingLayout}
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            onSave={(configuration) => {
              if (editingLayout) {
                updateExistingLayout(editingLayout.id, configuration);
              }
              setShowConfigDialog(false);
              setEditingLayout(null);
            }}
            onCancel={() => {
              setShowConfigDialog(false);
              setEditingLayout(null);
            }}
          />
        </main>
      </div>
    </div>
  );
}