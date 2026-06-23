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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { FileText, Grid3X3, List, AlertCircle } from "lucide-react";
import { SalesOrder, Partner, Quote } from "@shared/schema";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";
import SalesOrderForm from "@/components/forms/sales-order-form";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-primary/10 text-primary", 
  accepted: "bg-success/10 text-success",
  invoiced: "bg-purple-100 text-purple-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviato",
  accepted: "Confermato",
  invoiced: "Fatturato",
  paid: "Pagato",
  cancelled: "Annullato",
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
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: fieldMetadata } = useEntityFieldMetadata("sales-orders");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

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

  const getPartnerName = (partnerId: string | null) => {
    if (!partnerId) return "N/A";
    const partner = partners.find(p => p.id === partnerId);
    return partner?.name || "N/A";
  };

  const getQuoteNumber = (quoteId: string | null) => {
    if (!quoteId) return null;
    const quote = quotes.find(q => q.id === quoteId);
    return quote?.quoteNumber || null;
  };

  const formatCurrency = (amount: string | null) => {
    if (!amount) return "€ 0,00";
    const value = parseFloat(amount);
    return `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("it-IT");
  };

  const columns = [
    createStandardColumns.text("orderNumber", "N. Ordine"),
    {
      key: "status",
      label: "Stato",
      sortable: true,
      searchable: true,
      render: (order: SalesOrder) => (
        <div className="flex items-center gap-2">
          <Badge className={statusColors[order.status] || "bg-muted"}>
            {statusLabels[order.status] || order.status}
          </Badge>
          {!order.isBillable && (
            <span title="Non fatturabile">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </span>
          )}
        </div>
      )
    },
    {
      key: "partnerId",
      label: "Cliente", 
      sortable: true,
      searchable: true,
      render: (order: SalesOrder) => getPartnerName(order.partnerId)
    },
    {
      key: "quoteId",
      label: "Offerta",
      sortable: true,
      searchable: true,
      render: (order: SalesOrder) => {
        const quoteNum = getQuoteNumber(order.quoteId);
        return quoteNum ? (
          <span className="text-sm">
            {quoteNum} {order.quoteVersion && <span className="text-muted-foreground">v{order.quoteVersion}</span>}
          </span>
        ) : "-";
      }
    },
    {
      key: "customerOrderReference",
      label: "Rif. Ordine Cl.",
      sortable: true,
      searchable: true,
      render: (order: SalesOrder) => order.customerOrderReference || "-"
    },
    {
      key: "total",
      label: "Importo", 
      sortable: true,
      searchable: false,
      render: (order: SalesOrder) => formatCurrency(order.total)
    },
    {
      key: "issueDate",
      label: "Data Ordine", 
      sortable: true,
      searchable: false,
      render: (order: SalesOrder) => formatDate(order.issueDate)
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header
          title="Ordini di Vendita"
          subtitle="Gestisci gli ordini di vendita"
        />
        <div
          className="p-6 rounded-t-lg min-h-full"
          style={{
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={handleAdd}
            onCopySelected={() => {}}
            onBulkEdit={() => {}}
            onDeleteSelected={() => handleDelete(selectedOrders)}
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
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingOrder ? `Modifica Ordine ${editingOrder.orderNumber}` : "Nuovo Ordine di Vendita"}
                </DialogTitle>
                <DialogDescription>
                  {editingOrder ? "Modifica i dettagli dell'ordine" : "Crea un nuovo ordine di vendita"}
                </DialogDescription>
              </DialogHeader>
              <SalesOrderForm
                salesOrder={editingOrder || undefined}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingOrder(null);
                }}
              />
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
            availableColumns={availableColumns.length > 0 ? availableColumns : [
              { id: 'orderNumber', label: 'N. Ordine' },
              { id: 'status', label: 'Stato' },
              { id: 'partnerId', label: 'Cliente' },
              { id: 'quoteId', label: 'Offerta' },
              { id: 'customerOrderReference', label: 'Rif. Ordine Cl.' },
              { id: 'total', label: 'Importo' },
              { id: 'issueDate', label: 'Data Ordine' },
            ]}
            editingLayout={editingLayout}
            onSave={(layoutData) => {
              updateLayout(layoutData);
              setShowConfigDialog(false);
            }}
            onCancel={() => setShowConfigDialog(false)}
          />
        </div>
      </main>
    </div>
  );
}
