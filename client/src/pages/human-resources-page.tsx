import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, createTextColumn, createBadgeColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Users, Plus, Search, Edit, Trash2, DollarSign, Calendar, User as UserIcon, MoreHorizontal, Grid3X3, List } from "lucide-react";
import { HumanResourceForm } from "@/components/forms/human-resource-form";
import type { HumanResource } from "@shared/schema";

export function HumanResourcesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedResource, setSelectedResource] = useState<HumanResource | null>(null);
  const [selectedResources, setSelectedResources] = useState<HumanResource[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
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
  } = useTableLayout('human-resources');
  const viewMode = layout.viewMode;

  const { data: resources = [], isLoading } = useQuery<HumanResource[]>({
    queryKey: ["/api/human-resources"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/human-resources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      toast({
        title: "Successo",
        description: "Risorsa eliminata con successo",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione della risorsa",
        variant: "destructive",
      });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (resourceIds: string[]) => {
      const promises = resourceIds.map(id => 
        apiRequest("DELETE", `/api/human-resources/${id}`)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      toast({
        title: "Risorse eliminate",
        description: `${selectedResources.length} risorse eliminate con successo.`,
      });
      setShowBulkDeleteDialog(false);
      setSelectedResources([]);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Non è stato possibile eliminare alcune risorse.",
        variant: "destructive",
      });
    },
  });

  // Table columns configuration
  const groupingColumns = [
    { id: 'role', label: 'Ruolo', type: 'select' as const, options: [
      { value: 'developer', label: 'Developer' },
      { value: 'analyst', label: 'Analyst' },
      { value: 'consultant', label: 'Consultant' },
      { value: 'designer', label: 'Designer' },
      { value: 'manager', label: 'Manager' },
      { value: 'architect', label: 'Architect' },
      { value: 'tester', label: 'Tester' },
    ]},
    { id: 'skillLevel', label: 'Livello', type: 'select' as const, options: [
      { value: 'junior', label: 'Junior' },
      { value: 'mid', label: 'Mid' },
      { value: 'senior', label: 'Senior' },
      { value: 'lead', label: 'Lead' },
      { value: 'principal', label: 'Principal' },
    ]},
    { id: 'department', label: 'Dipartimento', type: 'text' as const },
    { id: 'costCenter', label: 'Centro di Costo', type: 'text' as const },
    { id: 'name', label: 'Nome', type: 'text' as const },
  ];

  const aggregationColumns = [
    { id: 'name', type: 'count' as const, label: 'Totale Risorse' },
  ];

  // Table columns for list view
  const tableColumns = [
    {
      accessorKey: 'name',
      header: 'Nome',
      cell: ({ row }: any) => (
        <div className="font-medium" data-testid={`text-resource-name-${row.original.id}`}>
          {row.original.name}
        </div>
      ),
    },
    createBadgeColumn('role', 'Ruolo', {
      developer: 'default',
      analyst: 'secondary',
      consultant: 'outline',
      designer: 'default',
      manager: 'secondary',
      architect: 'outline',
      tester: 'default'
    }),
    createBadgeColumn('skillLevel', 'Livello', {
      junior: 'secondary',
      mid: 'default',
      senior: 'outline',
      lead: 'default',
      principal: 'secondary'
    }),
    createTextColumn('department', 'Dipartimento', 20),
    createTextColumn('costCenter', 'Centro di Costo', 15),
    createTextColumn('baseHourlyRate', 'Tariffa (€/h)', 10),
    {
      accessorKey: 'isActive',
      header: 'Stato',
      cell: ({ row }: any) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Attiva' : 'Inattiva'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Azioni',
      cell: ({ row }: any) => {
        const resource = row.original;
        return (
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
                onClick={() => handleDelete(resource)}
                className="text-destructive"
                data-testid={`menu-delete-resource-${resource.id}`}
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

  const filteredResources = resources.filter(resource => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return resource.name.toLowerCase().includes(term) ||
           resource.role.toLowerCase().includes(term) ||
           resource.skillLevel.toLowerCase().includes(term) ||
           (resource.department && resource.department.toLowerCase().includes(term));
  });

  const handleCreate = () => {
    setSelectedResource(null);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setSelectedResource(null);
  };

  const handleEdit = (resource: HumanResource) => {
    setSelectedResource(resource);
    setIsFormOpen(true);
  };

  const handleDelete = (resource: HumanResource) => {
    setSelectedResource(resource);
    deleteMutation.mutate(resource.id);
  };

  const handleBulkDelete = () => {
    if (selectedResources.length > 0) {
      bulkDeleteMutation.mutate(selectedResources.map(r => r.id));
    }
  };

  const getSkillLevelColor = (level: string) => {
    switch (level) {
      case 'junior': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'mid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'senior': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'lead': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'principal': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'developer': return '💻';
      case 'analyst': return '📊';
      case 'consultant': return '🧑‍💼';
      case 'designer': return '🎨';
      case 'manager': return '👔';
      case 'architect': return '🏗️';
      case 'tester': return '🧪';
      default: return '👤';
    }
  };

  // Statistiche
  const stats = {
    total: resources.length,
    active: resources.filter(r => r.isActive).length,
    avgRate: resources.length > 0 
      ? (resources.reduce((sum, r) => sum + (r.baseHourlyRate ? parseFloat(r.baseHourlyRate) : 0), 0) / resources.filter(r => r.baseHourlyRate).length).toFixed(2)
      : '0.00'
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Risorse Umane" 
          subtitle="Gestisci le risorse umane e collega gli utenti alle attività"
          onNewClick={() => setIsFormOpen(true)}
        />
        
        <div className="p-6">
          {/* Layout Management and View Toggle */}
          <div className="flex justify-between items-center mb-4">
            {/* Layout Manager */}
            <LayoutManager
              currentLayoutName={currentLayoutName}
              savedLayouts={savedLayouts}
              onLoadLayout={loadLayout}
              onRenameLayout={renameLayout}
              onDeleteLayout={deleteLayout}
              onEditLayout={(layout) => {
                setEditingLayout(layout);
                setShowConfigDialog(true);
              }}
            />

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

          {/* Form Dialog */}
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedResource ? "Modifica Risorsa" : "Nuova Risorsa"}
                </DialogTitle>
                <DialogDescription>
                  {selectedResource 
                    ? "Aggiorna le informazioni della risorsa umana selezionata" 
                    : "Inserisci i dati per creare una nuova risorsa umana"
                  }
                </DialogDescription>
              </DialogHeader>
              <HumanResourceForm
                humanResource={selectedResource || undefined}
                onSuccess={handleFormSuccess}
              />
            </DialogContent>
          </Dialog>

          {isLoading ? (
            viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )
          ) : resources?.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">Nessuna risorsa</h3>
              <p className="mt-1 text-sm text-gray-500">Inizia creando la tua prima risorsa umana.</p>
              <div className="mt-6">
                <Button onClick={() => setIsFormOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi Risorsa
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca per nome, ruolo, livello o dipartimento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>

              {/* Statistics Cards */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Totale Risorse</p>
                          <p className="text-2xl font-bold">{stats.total}</p>
                        </div>
                        <Users className="h-8 w-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Risorse Attive</p>
                          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                        </div>
                        <UserIcon className="h-8 w-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Tariffa Media</p>
                          <p className="text-2xl font-bold">€{stats.avgRate}</p>
                        </div>
                        <DollarSign className="h-8 w-8 text-orange-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Content based on view mode */}
              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredResources.map((resource) => (
                    <Card key={resource.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getRoleIcon(resource.role)}</span>
                            <div>
                              <CardTitle className="text-lg">{resource.name}</CardTitle>
                              <p className="text-sm text-muted-foreground capitalize">
                                {resource.role} • {resource.skillLevel}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(resource)}
                              data-testid={`button-edit-${resource.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  data-testid={`button-delete-${resource.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Sei sicuro di voler eliminare la risorsa "{resource.name}"? 
                                    Questa azione non può essere annullata.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(resource.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Elimina
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-2">
                          <Badge className={getSkillLevelColor(resource.skillLevel)}>
                            {resource.skillLevel}
                          </Badge>
                          {resource.department && (
                            <Badge variant="outline">{resource.department}</Badge>
                          )}
                          <Badge variant={resource.isActive ? "default" : "secondary"}>
                            {resource.isActive ? "Attiva" : "Inattiva"}
                          </Badge>
                        </div>

                        {/* Informazioni */}
                        <div className="space-y-2 text-sm">
                          {resource.baseHourlyRate && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span>€{resource.baseHourlyRate}/ora</span>
                            </div>
                          )}
                          
                          {resource.costCenter && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">CC:</span>
                              <span>{resource.costCenter}</span>
                            </div>
                          )}

                          {resource.startDate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>Dal {new Date(resource.startDate).toLocaleDateString('it-IT')}</span>
                            </div>
                          )}

                          {resource.linkedUserId && (
                            <div className="flex items-center gap-2">
                              <UserIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-blue-600">Utente collegato</span>
                            </div>
                          )}
                        </div>

                        {resource.notes && (
                          <p className="text-sm text-muted-foreground border-t pt-2 mt-2">
                            {resource.notes}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <DataTable
                  data={filteredResources}
                  columns={tableColumns}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  selectedRows={selectedResources}
                  onSelectionChange={setSelectedResources}
                  onBulkDelete={selectedResources.length > 0 ? () => setShowBulkDeleteDialog(true) : undefined}
                />
              )}

              {filteredResources.length === 0 && searchTerm && (
                <div className="text-center py-12">
                  <Search className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">Nessun risultato</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Nessuna risorsa corrisponde alla ricerca "{searchTerm}"
                  </p>
                </div>
              )}
            </>
          )}

          {/* Bulk Delete Dialog */}
          <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma eliminazione multipla</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare {selectedResources.length} risorse? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Elimina {selectedResources.length} risorse
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Table Configuration Dialog */}
          <TableConfiguration
            tableId="human-resources"
            availableColumns={groupingColumns}
            editingLayout={editingLayout}
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            onSave={(newLayout) => {
              if (editingLayout) {
                updateExistingLayout(editingLayout.name, newLayout);
              } else {
                updateLayout(newLayout);
              }
              setShowConfigDialog(false);
              setEditingLayout(null);
            }}
            onCancel={() => {
              setEditingLayout(null);
              setShowConfigDialog(false);
            }}
          />
        </div>
      </main>
    </div>
  );
}