import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Trash2, Settings, DollarSign, MoreHorizontal, Grid3X3, List, Edit, Plus, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { RateAgreement, Partner, Project } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import RateAgreementForm from "@/components/forms/rate-agreement-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function RateAgreementsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<RateAgreement | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<RateAgreement | null>(null);
  const [selectedAgreements, setSelectedAgreements] = useState<RateAgreement[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use the table layout hook for persistent preferences
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
  } = useTableLayout('rate-agreements');
  const viewMode = layout.viewMode;

  const { data: agreements = [], isLoading } = useQuery<RateAgreement[]>({
    queryKey: ["/api/rate-agreements"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: partners = [] } = useQuery<Partner[]>({ 
    queryKey: ["/api/partners"],
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/rate-agreements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-agreements"] });
      toast({
        title: "Successo",
        description: "Accordo eliminato con successo",
      });
      setShowDeleteDialog(false);
      setSelectedAgreement(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione dell'accordo",
        variant: "destructive",
      });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/rate-agreements/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rate-agreements"] });
      toast({
        title: "Successo",
        description: `${selectedAgreements.length} accordi eliminati con successo`,
      });
      setShowBulkDeleteDialog(false);
      setSelectedAgreements([]);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione degli accordi",
        variant: "destructive",
      });
    }
  });

  const handleEdit = (agreement: RateAgreement) => {
    setEditingAgreement(agreement);
    setShowEditDialog(true);
  };

  const handleDelete = (agreement: RateAgreement) => {
    setSelectedAgreement(agreement);
    setShowDeleteDialog(true);
  };

  const handleBulkDelete = () => {
    if (selectedAgreements.length > 0) {
      setShowBulkDeleteDialog(true);
    }
  };

  const formatCriteria = (agreement: RateAgreement) => {
    if (agreement.groupingFields.length === 0) {
      return "Tariffa generale";
    }

    try {
      const values = JSON.parse(agreement.groupingValues);
      const parts = agreement.groupingFields.map(fieldId => {
        const value = values[fieldId];
        if (!value) return null;

        switch (fieldId) {
          case "partnerId":
            const partner = partners.find(p => p.id === value);
            return partner ? `Cliente: ${partner.name}` : `Cliente: ${value}`;
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

  const getValidityStatus = (agreement: RateAgreement) => {
    const now = new Date();
    const validFrom = new Date(agreement.validFrom);
    const validTo = agreement.validTo ? new Date(agreement.validTo) : null;

    if (!agreement.isActive) return "inactive";
    if (now < validFrom) return "future";
    if (validTo && now > validTo) return "expired";
    return "active";
  };

  const formatValidityPeriod = (agreement: RateAgreement) => {
    const validFrom = new Date(agreement.validFrom);
    const validTo = agreement.validTo ? new Date(agreement.validTo) : null;
    
    const fromStr = validFrom.toLocaleDateString("it-IT");
    const toStr = validTo ? validTo.toLocaleDateString("it-IT") : "∞";
    
    return `${fromStr} - ${toStr}`;
  };

  // Data for table view
  const tableData = agreements.map(agreement => ({
    ...agreement,
    formattedCriteria: formatCriteria(agreement),
    formattedRate: `€${agreement.hourlyRate}/h`,
    formattedPriority: `Priorità ${agreement.priority}`,
    validityStatus: getValidityStatus(agreement),
    formattedValidity: formatValidityPeriod(agreement),
    statusBadge: getValidityStatus(agreement),
  }));

  // Table columns
  const columns = [
    createTextColumn("name", "Nome"),
    {
      accessorKey: "formattedCriteria",
      header: "Criteri",
      cell: ({ row }: any) => (
        <div className="max-w-xs">
          <p className="text-sm truncate">{row.original.formattedCriteria}</p>
        </div>
      ),
    },
    createTextColumn("formattedRate", "Tariffa"),
    createTextColumn("formattedPriority", "Priorità"),
    createBadgeColumn(
      "statusBadge",
      "Stato",
      {
        active: "default",
        inactive: "secondary", 
        future: "outline",
        expired: "destructive"
      },
      {
        active: "Attivo",
        inactive: "Inattivo",
        future: "Futuro", 
        expired: "Scaduto"
      }
    ),
    createTextColumn("formattedValidity", "Validità"),
    {
      id: "actions",
      header: "Azioni",
      cell: ({ row }: any) => {
        const agreement = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${agreement.id}`}>
                <span className="sr-only">Apri menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(agreement)} data-testid={`action-edit-${agreement.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDelete(agreement)} 
                className="text-red-600"
                data-testid={`action-delete-${agreement.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex-1">
          <Header 
            title="Accordi Tariffari" 
            subtitle="Gestisci i tuoi accordi tariffari dinamici"
            onNewClick={() => setShowCreateDialog(true)}
          />
          <main className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-96 w-full" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
                Accordi Tariffari
              </h1>
              <p className="text-muted-foreground">
                Gestisci i tuoi accordi tariffari dinamici con criteri personalizzati
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedAgreements.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina {selectedAgreements.length}
                </Button>
              )}
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-agreement">
                    <Plus className="h-4 w-4 mr-2" />
                    Nuovo Accordo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Crea Nuovo Accordo Tariffario</DialogTitle>
                    <DialogDescription>
                      Configura un nuovo accordo con criteri dinamici specifici
                    </DialogDescription>
                  </DialogHeader>
                  <RateAgreementForm onSuccess={() => setShowCreateDialog(false)} />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Totale Accordi</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-agreements">
                  {agreements.length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Accordi Attivi</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="stat-active-agreements">
                  {agreements.filter(a => getValidityStatus(a) === "active").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Accordi Scaduti</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600" data-testid="stat-expired-agreements">
                  {agreements.filter(a => getValidityStatus(a) === "expired").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tariffa Media</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-average-rate">
                  €{agreements.length > 0 
                    ? Math.round(agreements.reduce((sum, a) => sum + parseFloat(a.hourlyRate), 0) / agreements.length)
                    : 0
                  }/h
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table/Grid View */}
          <LayoutManager
            viewMode={viewMode}
            onViewModeChange={(mode: string) => updateLayout({ viewMode: mode })}
            onConfigureTable={() => setShowConfigDialog(true)}
            selectedCount={selectedAgreements.length}
            totalCount={agreements.length}
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onSaveLayout={saveLayoutAs}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            data-testid="layout-manager"
          >
            <DataTable
              columns={columns}
              data={tableData}
              layout={layout}
              onLayoutChange={updateLayout}
              data-testid="agreements-table"
            />
          </LayoutManager>

          {/* Edit Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Modifica Accordo Tariffario</DialogTitle>
                <DialogDescription>
                  Aggiorna la configurazione dell'accordo
                </DialogDescription>
              </DialogHeader>
              {editingAgreement && (
                <RateAgreementForm
                  rateAgreement={editingAgreement}
                  onSuccess={() => {
                    setShowEditDialog(false);
                    setEditingAgreement(null);
                  }}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare l'accordo "{selectedAgreement?.name}"?
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => selectedAgreement && deleteMutation.mutate(selectedAgreement.id)}
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
                <AlertDialogTitle>Conferma Eliminazione di Gruppo</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare {selectedAgreements.length} accordi selezionati?
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkDeleteMutation.mutate(selectedAgreements.map(a => a.id))}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-confirm-bulk-delete"
                >
                  Elimina Tutti
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Table Configuration Dialog */}
          <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Configura Tabella</DialogTitle>
                <DialogDescription>
                  Personalizza le colonne e il layout della tabella
                </DialogDescription>
              </DialogHeader>
              <TableConfiguration
                columns={columns}
                layout={layout}
                onLayoutChange={updateLayout}
                editingLayout={editingLayout}
                onEditingLayoutChange={setEditingLayout}
                onSave={() => {
                  if (editingLayout?.name) {
                    updateExistingLayout(editingLayout.name, layout);
                  }
                  setShowConfigDialog(false);
                  setEditingLayout(null);
                }}
                onCancel={() => {
                  setShowConfigDialog(false);
                  setEditingLayout(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}