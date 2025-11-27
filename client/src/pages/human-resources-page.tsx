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
import { Users, DollarSign, Calendar, User as UserIcon, MoreHorizontal, Edit, Trash2, Grid3X3, List } from "lucide-react";
import { HumanResource } from "@shared/schema";
import { HumanResourceForm } from "@/components/forms/human-resource-form";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";

export default function HumanResourcesPage() {
  const [selectedResources, setSelectedResources] = useState<HumanResource[]>([]);
  const [editingResource, setEditingResource] = useState<HumanResource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
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

  const { data: fieldMetadata } = useEntityFieldMetadata("human-resources");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

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

  const bulkEditMutation = useMutation({
    mutationFn: async ({ resources, updates }: { resources: HumanResource[], updates: Record<string, any> }) => {
      await Promise.all(
        resources.map(resource => apiRequest("PUT", `/api/human-resources/${resource.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setSelectedResources([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: "Risorse modificate con successo" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ resources, addSuffix, suffix }: { resources: HumanResource[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        resources.map(resource => {
          const { id, createdAt, updatedAt, userId, organizationId, ...resourceData } = resource;
          const newResource = {
            ...resourceData,
            firstName: addSuffix ? `${resource.firstName}${suffix}` : resource.firstName,
          };
          return apiRequest("POST", "/api/human-resources", newResource);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setSelectedResources([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Risorse copiate",
        description: "Le risorse selezionate sono state copiate con successo.",
      });
    },
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

  const bulkEditFields: BulkEditField[] = [
    {
      key: "role",
      label: "Ruolo",
      type: "text",
      placeholder: "Es: Developer, Analyst",
    },
    {
      key: "department",
      label: "Dipartimento",
      type: "text",
      placeholder: "Es: IT, Consulting",
    },
    {
      key: "skillLevel",
      label: "Livello",
      type: "select",
      options: [
        { value: "junior", label: "Junior" },
        { value: "mid", label: "Mid" },
        { value: "senior", label: "Senior" },
        { value: "lead", label: "Lead" },
        { value: "principal", label: "Principal" },
      ],
    },
    {
      key: "isActive",
      label: "Stato",
      type: "select",
      options: [
        { value: "true", label: "Attiva" },
        { value: "false", label: "Inattiva" },
      ],
    },
  ];

  const handleBulkEditSave = (updates: Record<string, any>) => {
    const processedUpdates = { ...updates };
    if (updates.isActive !== undefined) {
      processedUpdates.isActive = updates.isActive === "true";
    }
    bulkEditMutation.mutate({ resources: selectedResources, updates: processedUpdates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ resources: selectedResources, addSuffix, suffix });
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
        <main 
          className="p-6 space-y-6 rounded-t-lg min-h-full"
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
            onCopySelected={() => setShowBulkCopyDialog(true)}
            onBulkEdit={() => setShowBulkEditDialog(true)}
            onDeleteSelected={() => handleDelete(selectedResources)}
            hasSelection={selectedResources.length > 0}
          />

          <UniversalTable
            data={resources}
            columns={columns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca risorse..."
            onSelectionChange={(rows) => setSelectedResources(rows as HumanResource[])}
            onRowClick={handleEdit}
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

          {/* Bulk Copy Dialog */}
          <BulkCopyDialog
            open={showBulkCopyDialog}
            onOpenChange={setShowBulkCopyDialog}
            title="Copia Risorse"
            description="Crea copie delle risorse"
            selectedCount={selectedResources.length}
            onCopy={handleBulkCopy}
            isPending={bulkCopyMutation.isPending}
          />

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="human-resources"
            availableColumns={availableColumns.length > 0 ? availableColumns : [
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

          {/* Bulk Edit Dialog */}
          <BulkEditDialog
            open={showBulkEditDialog}
            onOpenChange={setShowBulkEditDialog}
            title="Modifica Multipla Risorse"
            description={`Modifica ${selectedResources.length} risorse selezionate`}
            fields={bulkEditFields}
            selectedCount={selectedResources.length}
            onSave={handleBulkEditSave}
            isPending={bulkEditMutation.isPending}
          />
        </main>
      </div>
    </div>
  );
}