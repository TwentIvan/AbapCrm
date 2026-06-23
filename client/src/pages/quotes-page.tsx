import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, FileDown } from "lucide-react";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Quote, Partner, RateAgreement } from "@shared/schema";
import QuoteForm from "@/components/forms/quote-form";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";
import { ArrowRightCircle } from "lucide-react";

export default function QuotesPage() {
  const [selectedQuotes, setSelectedQuotes] = useState<Quote[]>([]);
  const [editingQuote, setEditingQuote] = useState<Quote | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const {
    layout, currentLayoutName, savedLayouts, updateLayout, 
    saveLayoutAs, loadLayout, renameLayout, deleteLayout, updateExistingLayout
  } = useTableLayout('quotes');

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: partners = [] } = useQuery<Partner[]>({ 
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: rateAgreements = [] } = useQuery<RateAgreement[]>({ 
    queryKey: ["/api/rate-agreements"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: fieldMetadata } = useEntityFieldMetadata("quotes");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quotes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      setShowDeleteDialog(false);
      setEditingQuote(undefined);
      toast({ title: "Eliminata", description: "Offerta eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (quotes: Quote[]) => {
      for (const quote of quotes) {
        await apiRequest("DELETE", `/api/quotes/${quote.id}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      setSelectedQuotes([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminate", description: "Offerte eliminate con successo" });
    }
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/quotes/${id}/convert`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      qc.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      setShowConvertDialog(false);
      setEditingQuote(undefined);
      toast({ title: "Convertita", description: "Offerta convertita in ordine di vendita con successo" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore", 
        description: error?.message || "Impossibile convertire l'offerta. Deve essere in stato 'Accettata'",
        variant: "destructive"
      });
    }
  });

  const handleEdit = (quote: Quote) => {
    setEditingQuote(quote);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingQuote(undefined);
    setShowForm(true);
  };

  const handleSingleDelete = (quote: Quote) => {
    setEditingQuote(quote);
    setShowDeleteDialog(true);
  };

  const handleDelete = (quotes: Quote[]) => {
    if (quotes.length === 0) return;
    setSelectedQuotes(quotes);
    setShowBulkDeleteDialog(true);
  };

  const handleConvert = (quote: Quote) => {
    setEditingQuote(quote);
    setShowConvertDialog(true);
  };

  const handleDownloadPdf = async (quote: Quote) => {
    try {
      const response = await fetch(`/api/quotes/${quote.id}/pdf`, {
        credentials: 'include',
        headers: {
          'X-Organization-Id': localStorage.getItem('currentOrganizationId') || '',
        }
      });
      
      if (!response.ok) {
        throw new Error('Errore nel download del PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quote.quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "PDF scaricato", description: `Offerta ${quote.quoteNumber} esportata in PDF` });
    } catch (error) {
      toast({ 
        title: "Errore", 
        description: "Impossibile generare il PDF",
        variant: "destructive"
      });
    }
  };

  const confirmDelete = () => {
    if (editingQuote) {
      deleteMutation.mutate(editingQuote.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedQuotes);
  };

  const confirmConvert = () => {
    if (editingQuote) {
      convertMutation.mutate(editingQuote.id);
    }
  };

  const getPartnerName = (partnerId: string | null) => {
    if (!partnerId) return "-";
    const partner = partners.find(p => p.id === partnerId);
    return partner?.name || "-";
  };

  const getRateAgreementName = (rateAgreementId: string | null) => {
    if (!rateAgreementId) return "-";
    const agreement = rateAgreements.find(r => r.id === rateAgreementId);
    return agreement?.name || "-";
  };

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-foreground",
    sent: "bg-primary/10 text-primary",
    accepted: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive",
    expired: "bg-warning/10 text-warning",
    cancelled: "bg-muted text-muted-foreground"
  };

  const statusLabels: Record<string, string> = {
    draft: "Bozza",
    sent: "Inviata",
    accepted: "Accettata",
    rejected: "Rifiutata",
    expired: "Scaduta",
    cancelled: "Annullata"
  };

  const columns = [
    createStandardColumns.text("quoteNumber", "Numero"),
    {
      key: "partnerId",
      label: "Cliente", 
      sortable: true,
      searchable: true,
      render: (quote: Quote) => getPartnerName(quote.partnerId)
    },
    {
      key: "externalNotes",
      label: "Descrizione", 
      sortable: true,
      searchable: true,
      render: (quote: Quote) => {
        const notes = quote.externalNotes || "";
        return notes.length > 50 ? notes.substring(0, 50) + "..." : notes || "-";
      }
    },
    {
      key: "issueDate",
      label: "Data Emissione", 
      sortable: true,
      searchable: false,
      render: (quote: Quote) => 
        quote.issueDate ? format(new Date(quote.issueDate), "dd/MM/yyyy", { locale: it }) : "-"
    },
    {
      key: "validTo",
      label: "Scadenza", 
      sortable: true,
      searchable: false,
      render: (quote: Quote) => 
        quote.validTo ? format(new Date(quote.validTo), "dd/MM/yyyy", { locale: it }) : "-"
    },
    {
      key: "total",
      label: "Totale", 
      sortable: true,
      searchable: false,
      render: (quote: Quote) => {
        const total = parseFloat(quote.total || "0");
        const currency = quote.currency || "EUR";
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(total);
      }
    },
    {
      key: "status",
      label: "Stato", 
      sortable: true,
      searchable: false,
      render: (quote: Quote) => (
        <Badge className={statusColors[quote.status] || statusColors.draft}>
          {statusLabels[quote.status] || quote.status}
        </Badge>
      )
    },
    {
      key: "version",
      label: "Versione", 
      sortable: true,
      searchable: false,
      render: (quote: Quote) => `v${quote.version}`
    },
    {
      key: "rateAgreementId",
      label: "Accordo Tariffario", 
      sortable: true,
      searchable: true,
      render: (quote: Quote) => getRateAgreementName(quote.rateAgreementId)
    },
    {
      key: "convertedToOrderId",
      label: "Ordine", 
      sortable: false,
      searchable: false,
      render: (quote: Quote) => {
        if (quote.convertedToOrderId) {
          return <Badge variant="outline" className="bg-success/10">Convertita</Badge>;
        }
        if (quote.status === 'accepted') {
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleConvert(quote);
              }}
              data-testid={`button-convert-quote-${quote.id}`}
            >
              <ArrowRightCircle className="h-3 w-3 mr-1" />
              Converti
            </Button>
          );
        }
        return "-";
      }
    },
  ];

  const visibleColumns = useMemo(() => {
    const getColumnKey = (col: any) => col.accessorKey || col.id || col.key;
    
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return columns;
    }
    
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
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Offerte / Preventivi"
          subtitle="Gestisci le offerte commerciali"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6 overflow-y-auto" style={{ height: 'calc(100vh - 80px)' }}>
          {/* Inline Form Panel - Full Width */}
          {showForm ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
                <CardTitle className="text-lg">
                  {editingQuote ? `Modifica Offerta ${editingQuote.quoteNumber}` : "Nuova Offerta"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {editingQuote && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDownloadPdf(editingQuote)}
                      data-testid="button-download-pdf"
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Scarica PDF
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      setShowForm(false);
                      setEditingQuote(undefined);
                    }}
                    data-testid="button-close-form"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <QuoteForm
                  quote={editingQuote || undefined}
                  onSuccess={() => {
                    setShowForm(false);
                    setEditingQuote(undefined);
                    qc.invalidateQueries({ queryKey: ["/api/quotes"] });
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <>
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
                onDeleteSelected={() => handleDelete(selectedQuotes)}
                hasSelection={selectedQuotes.length > 0}
              />

              <UniversalTable
                data={quotes}
                columns={visibleColumns}
                enableSelection={true}
                onSelectionChange={(rows) => setSelectedQuotes(rows as Quote[])}
                onRowClick={handleEdit}
              />
            </>
          )}

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="quotes"
            availableColumns={availableColumns.length > 0 ? availableColumns : [
              { id: 'quoteNumber', label: 'Numero' },
              { id: 'partnerId', label: 'Cliente' },
              { id: 'externalNotes', label: 'Descrizione' },
              { id: 'issueDate', label: 'Data Emissione' },
              { id: 'validTo', label: 'Scadenza' },
              { id: 'total', label: 'Totale' },
              { id: 'status', label: 'Stato' },
              { id: 'version', label: 'Versione' },
              { id: 'rateAgreementId', label: 'Accordo Tariffario' },
              { id: 'convertedToOrderId', label: 'Ordine' },
            ]}
            editingLayout={editingLayout}
            onSave={(layoutData) => {
              updateLayout(layoutData);
              setShowConfigDialog(false);
            }}
            onCancel={() => setShowConfigDialog(false)}
          />

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Offerta</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare l'offerta "{editingQuote?.quoteNumber}"? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} data-testid="button-confirm-delete">
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
                  Sei sicuro di voler eliminare {selectedQuotes.length} offerte selezionate? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete} data-testid="button-confirm-bulk-delete">
                  Elimina {selectedQuotes.length} Offerte
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Convert to Order Dialog */}
          <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Converti in Ordine di Vendita</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler convertire l'offerta "{editingQuote?.quoteNumber}" in un ordine di vendita? 
                  Verranno copiate tutte le righe dell'offerta nel nuovo ordine.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmConvert} data-testid="button-confirm-convert">
                  Converti in Ordine
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    </div>
  );
}
