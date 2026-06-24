import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { VendorInvoice, Project } from "@shared/schema";
import VendorInvoiceForm from "@/components/forms/vendor-invoice-form";

export default function VendorInvoicesPage() {
  const [selectedInvoices, setSelectedInvoices] = useState<VendorInvoice[]>([]);
  const [editingInvoice, setEditingInvoice] = useState<VendorInvoice | undefined>(undefined);
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
  } = useTableLayout('vendor-invoices');

  const { data: vendorInvoices = [], isLoading } = useQuery<VendorInvoice[]>({
    queryKey: ["/api/vendor-invoices"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vendor-invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
      setShowDeleteDialog(false);
      setEditingInvoice(undefined);
      toast({ title: "Eliminato", description: "Fattura fornitore eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (invoices: VendorInvoice[]) => {
      for (const invoice of invoices) {
        await apiRequest("DELETE", `/api/vendor-invoices/${invoice.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
      setSelectedInvoices([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Fatture fornitore eliminate con successo" });
    }
  });

  const handleEdit = (invoice: VendorInvoice) => {
    setEditingInvoice(invoice);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingInvoice(undefined);
    setShowForm(true);
  };

  const handleSingleDelete = (invoice: VendorInvoice) => {
    setEditingInvoice(invoice);
    setShowDeleteDialog(true);
  };

  const handleDelete = (invoices: VendorInvoice[]) => {
    if (invoices.length === 0) return;
    setSelectedInvoices(invoices);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingInvoice) {
      deleteMutation.mutate(editingInvoice.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedInvoices);
  };

  const statusColors = {
    draft: "bg-muted text-foreground dark:bg-card",
    received: "bg-primary/10 text-primary",
    approved: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    paid: "bg-success/10 text-success dark:text-success",
    cancelled: "bg-destructive/10 text-destructive"
  };

  const statusLabels = {
    draft: "Bozza",
    received: "Ricevuta",
    approved: "Approvata",
    paid: "Pagata",
    cancelled: "Annullata"
  };

  const columns = [
    createStandardColumns.text("invoiceNumber", "Numero Fattura"),
    createStandardColumns.text("vendorName", "Fornitore"),
    {
      key: "project",
      label: "Progetto", 
      sortable: true,
      searchable: true,
      render: (invoice: VendorInvoice) => {
        const project = projects.find(p => p.id === invoice.projectId);
        return project?.projectName || "-";
      }
    },
    {
      key: "totalAmount",
      label: "Importo Totale", 
      sortable: true,
      searchable: false,
      render: (invoice: VendorInvoice) => {
        const total = invoice.totalAmount ? parseFloat(invoice.totalAmount) : 0;
        return `${total.toFixed(2)} ${invoice.currency || 'EUR'}`;
      }
    },
    {
      key: "dates",
      label: "Date", 
      sortable: true,
      searchable: false,
      render: (invoice: VendorInvoice) => {
        const invoiceDate = invoice.invoiceDate ? format(new Date(invoice.invoiceDate), "dd/MM/yyyy", { locale: it }) : "-";
        const dueDate = invoice.dueDate ? format(new Date(invoice.dueDate), "dd/MM/yyyy", { locale: it }) : "-";
        const paidDate = invoice.paidDate ? format(new Date(invoice.paidDate), "dd/MM/yyyy", { locale: it }) : "-";
        return (
          <div className="text-sm">
            <div>Fattura: {invoiceDate}</div>
            <div className="text-muted-foreground">Scadenza: {dueDate}</div>
            {invoice.paidDate && <div className="text-success dark:text-success">Pagata: {paidDate}</div>}
          </div>
        );
      }
    },
    {
      key: "status",
      label: "Stato", 
      sortable: true,
      searchable: false,
      render: (invoice: VendorInvoice) => (
        <Badge className={statusColors[invoice.status || "received"]}>
          {statusLabels[invoice.status || "received"]}
        </Badge>
      )
    },
  ];

  // Apply layout configuration: filter visible columns and sort by position
  const visibleColumns = useMemo(() => {
    const getColumnKey = (col: any) => col.accessorKey || col.id || col.key;
    
    // If no layout configuration or empty columns config, show all columns
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return columns;
    }
    
    // Filter and sort columns based on layout
    return columns
      .filter(col => {
        const key = getColumnKey(col);
        const config = layout.columns[key];
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[getColumnKey(a)]?.position ?? 999;
        const posB = layout.columns[getColumnKey(b)]?.position ?? 999;
        return posA - posB;
      });
  }, [columns, layout.columns]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header
          title="Fatture Fornitore"
          subtitle="Gestisci le fatture e i pagamenti ai fornitori"
          onNewClick={handleAdd}
        />
        <div
          className="p-6 rounded-t-lg min-h-full"
          style={{
            borderTop: '2px solid hsl(var(--brand) / 0.3)',
            borderLeft: '2px solid hsl(var(--brand) / 0.3)',
            borderRight: '2px solid hsl(var(--brand) / 0.3)'
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
            onCopySelected={() => {/* TODO: implement copy */}}
            onBulkEdit={() => {/* TODO: implement bulk edit */}}
            onDeleteSelected={() => handleDelete(selectedInvoices)}
            hasSelection={selectedInvoices.length > 0}
          />

          <UniversalTable
            data={vendorInvoices}
            columns={visibleColumns}
            enableSelection={true}
            onSelectionChange={(rows) => setSelectedInvoices(rows as VendorInvoice[])}
            onRowClick={handleEdit}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingInvoice ? "Modifica" : "Nuova"} Fattura Fornitore</DialogTitle>
                <DialogDescription>
                  {editingInvoice ? "Modifica i dettagli della fattura" : "Crea una nuova fattura fornitore"}
                </DialogDescription>
              </DialogHeader>
              <VendorInvoiceForm 
                vendorInvoice={editingInvoice}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingInvoice(undefined);
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
                  Sei sicuro di voler eliminare la fattura "{editingInvoice?.invoiceNumber}"? Questa azione non può essere annullata.
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
                  Sei sicuro di voler eliminare {selectedInvoices.length} fatture selezionate? Questa azione non può essere annullata.
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
            tableId="vendor-invoices"
            availableColumns={[
              { id: 'invoiceNumber', label: 'Numero Fattura' },
              { id: 'vendorName', label: 'Fornitore' },
              { id: 'project', label: 'Progetto' },
              { id: 'totalAmount', label: 'Importo Totale' },
              { id: 'dates', label: 'Date' },
              { id: 'status', label: 'Stato' },
            ]}
            editingLayout={editingLayout}
            onSave={(layoutData) => {
              const { layoutName, saveAsDefault, ...config } = layoutData;
              if (layoutName && layoutName !== 'Default' && layoutName !== 'default') {
                saveLayoutAs(layoutName);
              }
              updateLayout(config);
              setShowConfigDialog(false);
            }}
            onCancel={() => setShowConfigDialog(false)}
          />
        </div>
      </main>
    </div>
  );
}
