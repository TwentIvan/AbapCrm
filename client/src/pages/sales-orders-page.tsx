import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Euro, Calendar, Building, MoreHorizontal, Edit, Trash2, Grid3X3, List } from "lucide-react";
import { SalesOrder, Partner } from "@shared/schema";
// import SalesOrderForm from "@/components/forms/sales-order-form";

const statusColors = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800", 
  accepted: "bg-green-100 text-green-800",
  invoiced: "bg-purple-100 text-purple-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function SalesOrdersPage() {
  const [selectedOrders, setSelectedOrders] = useState<SalesOrder[]>([]);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
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
  } = useTableLayout('sales-orders');

  const { data: salesOrders = [], isLoading } = useQuery<SalesOrder[]>({
    queryKey: ["/api/sales-orders"],
    queryFn: async () => {
      const res = await fetch("/api/sales-orders", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sales-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      setShowDeleteDialog(false);
      setEditingOrder(null);
      toast({ title: "Eliminato", description: "Ordine eliminato con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (orders: SalesOrder[]) => {
      for (const order of orders) {
        await apiRequest("DELETE", `/api/sales-orders/${order.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      setSelectedOrders([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Ordini eliminati con successo" });
    }
  });

  const handleEdit = (order: SalesOrder) => {
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingOrder(null);
    setShowForm(true);
  };

  const handleSingleDelete = (order: SalesOrder) => {
    setEditingOrder(order);
    setShowDeleteDialog(true);
  };

  const handleDelete = (orders: SalesOrder[]) => {
    if (orders.length === 0) return;
    setSelectedOrders(orders);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingOrder) {
      deleteMutation.mutate(editingOrder.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedOrders);
  };

  const clients = partners?.filter(partner => partner.type === "client") || [];
  
  const getClientName = (partnerId: string | null) => {
    if (!partnerId) return "N/A";
    const client = clients.find(c => c.id === partnerId);
    return client?.name || "N/A";
  };

  const formatAmount = (amount: string | null) => {
    if (!amount) return "N/A";
    const value = parseFloat(amount);
    return `€${value.toLocaleString()}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("it-IT");
  };

  const columns = [
    createStandardColumns.text("orderNumber", "N. Ordine"),
    createStandardColumns.badge("status", "Status", statusColors),
    {
      key: "clientId",
      label: "Cliente", 
      sortable: true,
      searchable: true,
      render: (order: SalesOrder) => getClientName(order.partnerId)
    },
    {
      key: "totalAmount",
      label: "Importo", 
      sortable: true,
      searchable: false,
      render: (order: SalesOrder) => `€${order.total || '0'}`
    },
    {
      key: "orderDate",
      label: "Data Ordine", 
      sortable: true,
      searchable: false,
      render: (order: SalesOrder) => formatDate(order.dueDate)
    },
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (order: SalesOrder) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-order-menu-${order.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(order)}
              data-testid={`menu-edit-order-${order.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(order)}
              className="text-destructive"
              data-testid={`menu-delete-order-${order.id}`}
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
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Ordini di Vendita"
          subtitle="Gestisci gli ordini di vendita"
        />
        <main className="p-6 space-y-6">
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={handleAdd}
            onCopySelected={() => {/* TODO: implement copy */}}
            onBulkEdit={() => {/* TODO: implement bulk edit */}}
            onDeleteSelected={() => setShowBulkDeleteDialog(true)}
            hasSelection={selectedOrders.length > 0}
            viewToggle={
              <div className="flex bg-muted rounded-lg p-1">
                <Button
                  variant={'ghost'}
                  size="sm"
                  onClick={() => updateLayout({})}
                  data-testid="button-view-cards"
                >
                  <Grid3X3 className="mr-2 h-4 w-4" />
                  Cards
                </Button>
                <Button
                  variant={'default'}
                  size="sm"
                  onClick={() => updateLayout({})}
                  data-testid="button-view-list"
                >
                  <List className="mr-2 h-4 w-4" />
                  List
                </Button>
              </div>
            }
          />

          <UniversalTable
            data={salesOrders}
            columns={columns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedOrders(rows as SalesOrder[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionati",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedOrders)
              }
            ]}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingOrder ? "Modifica Ordine" : "Nuovo Ordine"}
                </DialogTitle>
                <DialogDescription>
                  {editingOrder ? "Aggiorna" : "Crea"} un ordine di vendita
                </DialogDescription>
              </DialogHeader>
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Form per {editingOrder ? "modificare" : "creare"} ordine di vendita
                </p>
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowForm(false);
                      setEditingOrder(null);
                    }}
                  >
                    Annulla
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowForm(false);
                      setEditingOrder(null);
                      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
                      toast({ title: "Salvato", description: "Ordine salvato con successo" });
                    }}
                  >
                    Salva
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Ordine</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare l'ordine "{editingOrder?.orderNumber}"? 
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
                  Sei sicuro di voler eliminare {selectedOrders.length} ordini selezionati? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedOrders.length} Ordini
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="sales-orders"
            availableColumns={[
              { id: 'orderNumber', label: 'N. Ordine' },
              { id: 'status', label: 'Status' },
              { id: 'partnerId', label: 'Cliente' },
              { id: 'total', label: 'Importo' },
              { id: 'dueDate', label: 'Data Scadenza' },
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
    </div>
  );
}