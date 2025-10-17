import { useState } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { DollarSign, MoreHorizontal, Edit, Trash2, CheckCircle, XCircle, Settings, Grid3X3, List } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { RateAgreement, Partner, Project } from "@shared/schema";
import RateAgreementForm from "@/components/forms/rate-agreement-form";

export default function RateAgreementsPage() {
  const [selectedAgreements, setSelectedAgreements] = useState<RateAgreement[]>([]);
  const [editingAgreement, setEditingAgreement] = useState<RateAgreement | undefined>(undefined);
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
  } = useTableLayout('rate-agreements');
  const viewMode = layout.viewMode;

  const { data: agreements = [], isLoading } = useQuery<RateAgreement[]>({
    queryKey: ["/api/rate-agreements"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: partners = [] } = useQuery<Partner[]>({ 
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rate-agreements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-agreements"] });
      setShowDeleteDialog(false);
      setEditingAgreement(null);
      toast({ title: "Eliminato", description: "Accordo eliminato con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (agreements: RateAgreement[]) => {
      for (const agreement of agreements) {
        await apiRequest("DELETE", `/api/rate-agreements/${agreement.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-agreements"] });
      setSelectedAgreements([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Accordi eliminati con successo" });
    }
  });

  const handleEdit = (agreement: RateAgreement) => {
    setEditingAgreement(agreement);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingAgreement(null);
    setShowForm(true);
  };

  const handleSingleDelete = (agreement: RateAgreement) => {
    setEditingAgreement(agreement);
    setShowDeleteDialog(true);
  };

  const handleDelete = (agreements: RateAgreement[]) => {
    if (agreements.length === 0) return;
    setSelectedAgreements(agreements);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingAgreement) {
      deleteMutation.mutate(editingAgreement.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedAgreements);
  };

  const getValidityStatus = (agreement: RateAgreement) => {
    const now = new Date();
    const validFrom = new Date(agreement.validFrom);
    const validTo = agreement.validTo ? new Date(agreement.validTo) : null;

    if (!agreement.isActive) return "inactive";
    if (now < validFrom) return "future";
    if (validTo && now > validTo) return "expired";
    return "active";
  };

  const formatCriteria = (agreement: RateAgreement) => {
    if (agreement.groupingFields.length === 0) {
      return "Tariffa generale";
    }
    
    try {
      const parts = agreement.groupingFields.map(fieldId => {
        const groupValue = agreement.groupingValues && agreement.groupingValues[fieldId];
        if (!groupValue) return null;
        
        const values = Array.isArray(groupValue) ? groupValue : [groupValue];
        const value = values[0];
        
        switch(fieldId) {
          case "partnerId":
            const partner = partners.find(p => p.id === value);
            return partner ? `Partner: ${partner.name}` : `Partner: ${value}`;
          case "projectId":
            const project = projects.find(p => p.id === value);
            return project ? `Progetto: ${project.name}` : `Progetto: ${value}`;
          case "taskType":
            const taskTypeLabels: Record<string, string> = {
              development: "Sviluppo",
              analysis: "Analisi", 
              design: "Design",
              testing: "Testing",
              consulting: "Consulenza",
              meeting: "Riunioni",
              documentation: "Documentazione",
              maintenance: "Manutenzione",
              support: "Supporto",
              other: "Altro"
            };
            return `Tipo: ${taskTypeLabels[value] || value}`;
          default:
            return `${fieldId}: ${value}`;
        }
      }).filter(Boolean);

      return parts.join(" • ");
    } catch (error) {
      return "Configurazione non valida";
    }
  };

  const statusColors = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-800",
    future: "bg-blue-100 text-blue-800",
    expired: "bg-red-100 text-red-800"
  };

  const columns = [
    createStandardColumns.text("name", "Nome"),
    {
      key: "criteria",
      label: "Criteri", 
      sortable: false,
      searchable: true,
      render: (agreement: RateAgreement) => (
        <div className="max-w-xs">
          <p className="text-sm truncate">{formatCriteria(agreement)}</p>
        </div>
      )
    },
    {
      key: "hourlyRate",
      label: "Tariffa", 
      sortable: true,
      searchable: false,
      render: (agreement: RateAgreement) => `€${agreement.hourlyRate}/h`
    },
    createStandardColumns.badge("status", "Stato", statusColors, (agreement: RateAgreement) => getValidityStatus(agreement)),
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (agreement: RateAgreement) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-agreement-menu-${agreement.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(agreement)}
              data-testid={`menu-edit-agreement-${agreement.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(agreement)}
              className="text-destructive"
              data-testid={`menu-delete-agreement-${agreement.id}`}
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
          title="Accordi Tariffari"
          subtitle="Gestisci gli accordi e le tariffe"
          onNewClick={handleAdd}
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
            onDeleteSelected={() => handleDelete(selectedAgreements)}
            hasSelection={selectedAgreements.length > 0}
          />

          <UniversalTable
            data={agreements}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca accordi..."
            onSelectionChange={(rows) => setSelectedAgreements(rows as RateAgreement[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionati",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedAgreements)
              }
            ]}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingAgreement ? "Modifica Accordo" : "Nuovo Accordo"}
                </DialogTitle>
                <DialogDescription>
                  {editingAgreement ? "Aggiorna" : "Crea"} un accordo tariffario
                </DialogDescription>
              </DialogHeader>
              <RateAgreementForm
                rateAgreement={editingAgreement || undefined}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingAgreement(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/rate-agreements"] });
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="rate-agreements"
            availableColumns={[
              { id: 'name', label: 'Nome' },
              { id: 'hourlyRate', label: 'Tariffa/h' },
              { id: 'currency', label: 'Valuta' },
              { id: 'startDate', label: 'Data Inizio' },
              { id: 'endDate', label: 'Data Fine' },
              { id: 'isActive', label: 'Stato' },
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
                <AlertDialogTitle>Elimina Accordo</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare l'accordo "{editingAgreement?.name}"? 
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
                  Sei sicuro di voler eliminare {selectedAgreements.length} accordi selezionati? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedAgreements.length} Accordi
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    </div>
  );
}