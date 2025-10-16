import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { FileText, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { PurchaseOrder, Project } from "@shared/schema";
import PurchaseOrderForm from "@/components/forms/purchase-order-form";

export default function PurchaseOrdersPage() {
  const [selectedOrders, setSelectedOrders] = useState<PurchaseOrder[]>([]);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | undefined>(undefined);
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
  } = useTableLayout('purchase-orders');

  const { data: purchaseOrders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/purchase-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setShowDeleteDialog(false);
      setEditingOrder(undefined);
      toast({ title: "Eliminato", description: "Ordine d'acquisto eliminato con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (orders: PurchaseOrder[]) => {
      for (const order of orders) {
        await apiRequest("DELETE", `/api/purchase-orders/${order.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setSelectedOrders([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Ordini d'acquisto eliminati con successo" });
    }
  });

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingOrder(undefined);
    setShowForm(true);
  };

  const handleSingleDelete = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setShowDeleteDialog(true);
  };

  const handleDelete = (orders: PurchaseOrder[]) => {
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

  const statusColors = {
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    sent: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    received: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
  };

  const statusLabels = {
    draft: "Bozza",
    approved: "Approvato",
    sent: "Inviato",
    received: "Ricevuto",
    cancelled: "Annullato"
  };

  const columns = [
    createStandardColumns.text("orderNumber", "Numero Ordine"),
    createStandardColumns.text("vendorName", "Fornitore"),
    {
      key: "project",
      label: "Progetto", 
      sortable: true,
      searchable: true,
      render: (order: PurchaseOrder) => {
        const project = projects.find(p => p.id === order.projectId);
        return project?.projectName || "-";
      }
    },
    {
      key: "totalAmount",
      label: "Importo Totale", 
      sortable: true,
      searchable: false,
      render: (order: PurchaseOrder) => {
        const total = order.totalAmount ? parseFloat(order.totalAmount) : 0;
        return `${total.toFixed(2)} ${order.currency || 'EUR'}`;
      }
    },
    {
      key: "dates",
      label: "Date", 
      sortable: true,
      searchable: false,
      render: (order: PurchaseOrder) => {
        const orderDate = order.orderDate ? format(new Date(order.orderDate), "dd/MM/yyyy", { locale: it }) : "-";
        const deliveryDate = order.expectedDeliveryDate ? format(new Date(order.expectedDeliveryDate), "dd/MM/yyyy", { locale: it }) : "-";
        return (
          <div className="text-sm">
            <div>Ordine: {orderDate}</div>
            <div className="text-muted-foreground">Consegna: {deliveryDate}</div>
          </div>
        );
      }
    },
    {
      key: "status",
      label: "Stato", 
      sortable: true,
      searchable: false,
      render: (order: PurchaseOrder) => (
        <Badge className={statusColors[order.status || "draft"]}>
          {statusLabels[order.status || "draft"]}
        </Badge>
      )
    },
    {
      key: "actions",
      label: "Azioni",
      sortable: false,
      searchable: false,
      render: (order: PurchaseOrder) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`button-actions-${order.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(order)} data-testid={`action-edit-${order.id}`}>
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(order)} 
              className="text-red-600"
              data-testid={`action-delete-${order.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Ordini d'Acquisto"
          subtitle="Gestisci gli ordini d'acquisto e il procurement"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <div className="flex items-center gap-4 mb-4">
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

          <UniversalTable
            data={purchaseOrders}
            columns={columns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedOrders(rows as PurchaseOrder[])}
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
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingOrder ? "Modifica" : "Nuovo"} Ordine d'Acquisto</DialogTitle>
                <DialogDescription>
                  {editingOrder ? "Modifica i dettagli dell'ordine" : "Crea un nuovo ordine d'acquisto"}
                </DialogDescription>
              </DialogHeader>
              <PurchaseOrderForm 
                purchaseOrder={editingOrder}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingOrder(undefined);
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare l'ordine "{editingOrder?.orderNumber}"? Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-confirm-delete"
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bulk Delete Dialog */}
          <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare {selectedOrders.length} ordini selezionati? Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-bulk-delete">Annulla</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmBulkDelete}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-confirm-bulk-delete"
                >
                  Elimina Tutti
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Column Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="purchase-orders"
            availableColumns={[
              { id: 'orderNumber', label: 'Numero Ordine' },
              { id: 'vendorName', label: 'Fornitore' },
              { id: 'project', label: 'Progetto' },
              { id: 'totalAmount', label: 'Importo Totale' },
              { id: 'dates', label: 'Date' },
              { id: 'status', label: 'Stato' },
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
