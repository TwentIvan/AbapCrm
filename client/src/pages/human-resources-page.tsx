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
import { Users, DollarSign, Calendar, User as UserIcon, MoreHorizontal, Edit, Trash2, Grid3X3, List } from "lucide-react";
import { HumanResource } from "@shared/schema";
import { HumanResourceForm } from "@/components/forms/human-resource-form";

export default function HumanResourcesPage() {
  const [selectedResources, setSelectedResources] = useState<HumanResource[]>([]);
  const [editingResource, setEditingResource] = useState<HumanResource | null>(null);
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
  } = useTableLayout('human-resources');
  const viewMode = layout.viewMode;

  const { data: resources = [], isLoading } = useQuery<HumanResource[]>({
    queryKey: ["/api/human-resources"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/human-resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setShowDeleteDialog(false);
      setEditingResource(null);
      toast({ title: "Eliminato", description: "Risorsa eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (resources: HumanResource[]) => {
      for (const resource of resources) {
        await apiRequest("DELETE", `/api/human-resources/${resource.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setSelectedResources([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Risorse eliminate con successo" });
    }
  });

  const handleEdit = (resource: HumanResource) => {
    setEditingResource(resource);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingResource(null);
    setShowForm(true);
  };

  const handleSingleDelete = (resource: HumanResource) => {
    setEditingResource(resource);
    setShowDeleteDialog(true);
  };

  const handleDelete = (resources: HumanResource[]) => {
    if (resources.length === 0) return;
    setSelectedResources(resources);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingResource) {
      deleteMutation.mutate(editingResource.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedResources);
  };

  const getSkillLevelColor = (level: string) => {
    switch(level) {
      case 'junior': return 'bg-green-100 text-green-800';
      case 'mid': return 'bg-blue-100 text-blue-800';
      case 'senior': return 'bg-purple-100 text-purple-800';
      case 'lead': return 'bg-orange-100 text-orange-800';
      case 'principal': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const columns = [
    createStandardColumns.text("firstName", "Nome"),
    createStandardColumns.text("lastName", "Cognome"),
    createStandardColumns.text("email", "Email"),
    createStandardColumns.text("role", "Ruolo"),
    createStandardColumns.badge("skillLevel", "Livello", {
      junior: "bg-green-100 text-green-800",
      mid: "bg-blue-100 text-blue-800", 
      senior: "bg-purple-100 text-purple-800",
      lead: "bg-orange-100 text-orange-800",
      principal: "bg-red-100 text-red-800"
    }),
    {
      key: "baseHourlyRate",
      label: "Tariffa", 
      sortable: true,
      searchable: false,
      render: (resource: HumanResource) => resource.baseHourlyRate ? `€${resource.baseHourlyRate}/h` : "N/A"
    },
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (resource: HumanResource) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-resource-menu-${resource.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(resource)}
              data-testid={`menu-edit-resource-${resource.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(resource)}
              className="text-destructive"
              data-testid={`menu-delete-resource-${resource.id}`}
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
          title="Risorse Umane"
          subtitle="Gestisci le risorse umane"
          onNewClick={handleAdd}
        />
        <main className="p-6 space-y-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
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

            {/* View Toggle */}
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLayout({ viewMode: 'cards' })}
                data-testid="button-view-cards"
              >
                <Grid3X3 className="mr-2 h-4 w-4" />
                Cards
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLayout({ viewMode: 'list' })}
                data-testid="button-view-list"
              >
                <List className="mr-2 h-4 w-4" />
                List
              </Button>
            </div>
          </div>

          <UniversalTable
            data={resources}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca risorse..."
            onSelectionChange={(rows) => setSelectedResources(rows as HumanResource[])}
            onRowClick={handleEdit}
            bulkActions={[
              {
                label: "Elimina Selezionati",
                icon: Trash2,
                variant: "destructive",
                onClick: () => handleDelete(selectedResources)
              }
            ]}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingResource ? "Modifica Risorsa" : "Nuova Risorsa"}
                </DialogTitle>
                <DialogDescription>
                  {editingResource ? "Aggiorna" : "Crea"} una risorsa umana
                </DialogDescription>
              </DialogHeader>
              <HumanResourceForm
                humanResource={editingResource}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingResource(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Risorsa</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare "{editingResource?.firstName} {editingResource?.lastName}"? 
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
                  Sei sicuro di voler eliminare {selectedResources.length} risorse selezionate? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedResources.length} Risorse
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="human-resources"
            availableColumns={[
              { id: 'firstName', label: 'Nome' },
              { id: 'lastName', label: 'Cognome' },
              { id: 'email', label: 'Email' },
              { id: 'department', label: 'Dipartimento' },
              { id: 'position', label: 'Posizione' },
              { id: 'salary', label: 'Stipendio' },
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