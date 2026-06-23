import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Server, MoreHorizontal, Edit, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { SapSystem } from "@shared/schema";
import SapSystemForm from "../components/forms/sap-system-form";
import SapLandscapeImport from "../components/forms/sap-landscape-import";
import SapSystemFormContainer from "../components/forms/sap-system-form-container";

const landscapeColors: Record<string, string> = {
  development: "bg-primary/10 text-primary",
  test: "bg-warning/10 text-warning",
  quality: "bg-purple-100 text-purple-800",
  pre_production: "bg-warning/10 text-warning",
  production: "bg-destructive/10 text-destructive",
  other: "bg-muted text-foreground",
};

const landscapeLabels: Record<string, string> = {
  development: "Sviluppo",
  test: "Test",
  quality: "Quality",
  pre_production: "Pre-Produzione",
  production: "Produzione",
  other: "Altro",
};

export default function SapSystemsPage() {
  const [location] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<SapSystem | null>(null);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/sap-systems/");
  const isCreateMode = location === "/sap-systems/new";
  const isEditMode = location.includes("/edit");
  const [selectedSystems, setSelectedSystems] = useState<SapSystem[]>([]);
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
  } = useTableLayout('sap-systems');

  const { data: systems, isLoading } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: async () => {
      const res = await fetch("/api/sap-systems", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch SAP systems');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (systemId: string) => {
      const response = await fetch(`/api/sap-systems/${systemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to delete SAP system');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({
        title: "SAP System Deleted",
        description: "The SAP system has been successfully deleted.",
      });
      setShowDeleteDialog(false);
      setSelectedSystem(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Unable to delete the SAP system.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (systemIds: string[]) => {
      const promises = systemIds.map(id => 
        fetch(`/api/sap-systems/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        })
      );
      const responses = await Promise.all(promises);
      
      // Check if all deletions were successful
      const failed = responses.filter(res => !res.ok);
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} SAP system(s)`);
      }
      return responses;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({
        title: "SAP Systems Deleted",
        description: `${selectedSystems.length} SAP systems deleted successfully.`,
      });
      setSelectedSystems([]);
      setShowBulkDeleteDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Unable to delete selected SAP systems.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (system: SapSystem) => {
    setSelectedSystem(system);
    setShowEditDialog(true);
  };

  const handleDelete = (system: SapSystem) => {
    setSelectedSystem(system);
    setShowDeleteDialog(true);
  };

  const handleFormClose = () => {
    setShowCreateDialog(false);
    setShowEditDialog(false);
    setSelectedSystem(null);
  };
  
  // Handle full-page mode: when user navigates directly to /sap-systems/new or /sap-systems/:id/edit
  if (isFullPageMode) {
    return (
      <SapSystemFormContainer
        open={false} // Not used in full-page mode
        onOpenChange={() => {}} // Not used in full-page mode
        editingSystem={selectedSystem}
        onSuccess={() => {
          setSelectedSystem(null);
        }}
      />
    );
  }

  const connectionTypeLabels: Record<string, string> = {
    sapgui: "SAP GUI",
    cloud: "Cloud",
    citrix: "Citrix",
  };

  // SISTEMA UNIVERSALE: Configurazione colonne standardizzata (senza colonna Actions)
  const columns = [
    createStandardColumns.text("name", "Nome Sistema"),
    {
      key: "connectionType",
      label: "Tipo Connessione",
      sortable: true,
      render: (system: SapSystem) => {
        const connType = (system as any).connectionType || "sapgui";
        return (
          <Badge variant="outline">
            {connectionTypeLabels[connType] || connType}
          </Badge>
        );
      }
    },
    createStandardColumns.text("systemNumber", "Numero Sistema"),
    createStandardColumns.text("serverHost", "Server Host"),
    {
      key: "landscapeType",
      label: "Tipo Landscape",
      sortable: true,
      render: (system: SapSystem) => {
        const landscapeValue = (system as any).landscapeType || system.landscape || "development";
        return (
          <Badge className={landscapeColors[landscapeValue] || "bg-muted text-foreground"}>
            {landscapeLabels[landscapeValue] || landscapeValue}
          </Badge>
        );
      }
    },
    {
      key: "landscapeLevel",
      label: "Livello",
      sortable: true,
      render: (system: SapSystem) => (system as any).landscapeLevel || "-"
    },
    createStandardColumns.partner("Partner"),
    createStandardColumns.text("description", "Descrizione"),
    {
      key: "systemId",
      label: "System ID",
      sortable: true,
      render: (system: SapSystem) => system.systemId || "-"
    },
    {
      key: "systemType",
      label: "Tipo",
      sortable: true,
      render: (system: SapSystem) => system.systemType || "-"
    },
    {
      key: "cloudLink",
      label: "Link Cloud",
      sortable: true,
      render: (system: SapSystem) => {
        const link = (system as any).cloudLink;
        return link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">
            {link}
          </a>
        ) : "-";
      }
    },
    {
      key: "sapShortcutFile",
      label: "File Shortcut",
      sortable: true,
      render: (system: SapSystem) => (system as any).sapShortcutFile || "-"
    },
    {
      key: "createdAt",
      label: "Creato",
      sortable: true,
      render: (system: SapSystem) => 
        system.createdAt ? format(new Date(system.createdAt), "dd/MM/yyyy", { locale: it }) : "-"
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

  // Grid view for card layout
  const renderGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {systems?.map((system) => (
        <Card key={system.id} className="h-fit" data-testid={`card-sap-system-${system.id}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Server className="h-5 w-5" />
              {system.name}
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid={`dropdown-sap-system-${system.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(system)} data-testid={`edit-sap-system-${system.id}`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(system)} data-testid={`delete-sap-system-${system.id}`}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Numero Sistema:</span>
                <Badge variant="outline" data-testid={`text-system-number-${system.id}`}>{system.systemNumber}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tipo Landscape:</span>
                <Badge 
                  className={landscapeColors[(system as any).landscapeType || system.landscape as keyof typeof landscapeColors] || "bg-muted text-foreground"}
                  data-testid={`text-landscape-${system.id}`}
                >
                  {landscapeLabels[(system as any).landscapeType || system.landscape as keyof typeof landscapeLabels] || (system as any).landscapeType || system.landscape}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Server Host:</span>
                <span className="text-sm text-muted-foreground" data-testid={`text-server-host-${system.id}`}>
                  {system.serverHost}
                </span>
              </div>
              
              {system.description && (
                <div className="pt-2">
                  <span className="text-sm font-medium">Descrizione:</span>
                  <p className="text-sm text-muted-foreground mt-1" data-testid={`text-description-${system.id}`}>
                    {system.description}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderTable = () => (
    <UniversalTable
      data={systems || []}
      columns={visibleColumns}
      enableSelection={true}
      onSelectionChange={(rows) => setSelectedSystems(rows as SapSystem[])}
      onRowClick={handleEdit}
      emptyMessage="Nessun sistema SAP trovato"
    />
  );

  if (isLoading) {
    return (
      <div className="flex h-screen bg-muted">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            title="SAP Systems" 
            subtitle="Manage your SAP system configurations and connections"
            onNewClick={() => setShowCreateDialog(true)}
          />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Sistemi SAP" 
          subtitle="Gestisci le configurazioni e le connessioni ai sistemi SAP"
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <ListViewToolbar
                currentLayoutName={currentLayoutName}
                savedLayouts={savedLayouts}
                onLoadLayout={loadLayout}
                onRenameLayout={renameLayout}
                onDeleteLayout={deleteLayout}
                onConfigureTable={() => setShowConfigDialog(true)}
                onCreateNew={() => setShowCreateDialog(true)}
                onCopySelected={() => {/* TODO: implement copy */}}
                onBulkEdit={() => {/* TODO: implement bulk edit */}}
                onDeleteSelected={() => setShowBulkDeleteDialog(true)}
                hasSelection={selectedSystems.length > 0}
                customActions={
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setShowImportDialog(true)} 
                          data-testid="button-import-xml"
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Importa da XML</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                }
              />
            </div>

            {renderTable()}
          </div>
        </main>
      </div>

      {/* Form Container - supports both dialog and full-page modes */}
      <SapSystemFormContainer
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            setSelectedSystem(null);
          }
        }}
        editingSystem={selectedSystem}
        onSuccess={() => {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedSystem(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Sistema SAP</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare "{selectedSystem?.name}"? Questa azione non può essere annullata.
              Verranno rimosse anche tutte le credenziali e le transport request associate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedSystem && deleteMutation.mutate(selectedSystem.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Sistemi SAP Selezionati</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedSystems.length} sistemi SAP selezionati? Questa azione non può essere annullata.
              Verranno rimosse anche tutte le credenziali e le transport request associate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selectedSystems.map(s => s.id))}
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Table Configuration</DialogTitle>
            <DialogDescription>
              Customize your table layout and save different configurations.
            </DialogDescription>
          </DialogHeader>
          {/* Table Configuration - Simplified for now */}
          <div className="p-4">
            <p>Table configuration will be available soon.</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowConfigDialog(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from XML Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import SAP Systems from XML</DialogTitle>
            <DialogDescription>
              Upload and import SAP system configurations from a SAPUILandscape.xml file.
            </DialogDescription>
          </DialogHeader>
          <SapLandscapeImport
            onSuccess={() => setShowImportDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}