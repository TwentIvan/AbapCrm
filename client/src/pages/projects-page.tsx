import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import { useOrganization } from "@/hooks/use-organization";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Code, Calendar, DollarSign, User, MoreHorizontal, Edit, Target, Grid3X3, List, Trash2, History } from "lucide-react";
import { Project, Partner } from "@shared/schema";
import ProjectForm from "@/components/forms/project-form";
import ProjectPlanner from "@/components/planning/project-planner";
import AuditHistory from "@/components/ui/audit-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusColors = {
  planning: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800", 
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-gray-100 text-gray-800",
  on_hold: "bg-red-100 text-red-800",
};

export default function ProjectsPage() {
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [selectedProjectForPlanner, setSelectedProjectForPlanner] = useState<Project | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

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
  } = useTableLayout('projects');
  const viewMode = layout.viewMode;

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId, // Wait for organization context
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId, // Wait for organization context
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowDeleteDialog(false);
      setEditingProject(null);
      toast({
        title: "Progetto eliminato",
        description: "Il progetto è stato eliminato con successo.",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (projects: Project[]) => {
      for (const project of projects) {
        await apiRequest("DELETE", `/api/projects/${project.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjects([]);
      setShowBulkDeleteDialog(false);
      toast({
        title: "Progetti eliminati",
        description: "I progetti selezionati sono stati eliminati con successo.",
      });
    },
  });

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingProject(null);
    setShowForm(true);
  };

  const handleSingleDelete = (project: Project) => {
    setEditingProject(project);
    setShowDeleteDialog(true);
  };

  const handleDelete = (projects: Project[]) => {
    if (projects.length === 0) return;
    setSelectedProjects(projects);
    setShowBulkDeleteDialog(true);
  };

  const handleOpenPlanner = (project: Project) => {
    setSelectedProjectForPlanner(project);
    setShowPlanner(true);
  };

  const handleClosePlanner = () => {
    setShowPlanner(false);
    setSelectedProjectForPlanner(null);
  };

  const confirmDelete = () => {
    if (editingProject) {
      deleteMutation.mutate(editingProject.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedProjects);
  };

  const formatBudget = (budget: string | null) => {
    if (!budget) return "N/A";
    const amount = parseFloat(budget);
    return `€${amount.toLocaleString()}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("it-IT");
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "N/A";
    const client = partners.find(p => p.id === clientId);
    return client?.name || "N/A";
  };

  const columns = [
    createStandardColumns.text("name", "Nome"),
    createStandardColumns.badge("status", "Status", statusColors),
    {
      key: "clientId",
      label: "Cliente", 
      sortable: true,
      searchable: true,
      render: (project: Project) => getClientName(project.clientId)
    },
    {
      key: "startDate",
      label: "Data Inizio", 
      sortable: true,
      searchable: false,
      render: (project: Project) => formatDate(project.startDate)
    },
    {
      key: "endDate",
      label: "Data Fine", 
      sortable: true,
      searchable: false,
      render: (project: Project) => formatDate(project.endDate)
    },
    {
      key: "budget",
      label: "Budget", 
      sortable: true,
      searchable: false,
      render: (project: Project) => formatBudget(project.budget)
    },
    {
      key: "progress",
      label: "Progresso", 
      sortable: true,
      searchable: false,
      render: (project: Project) => `${project.progress}%`
    },
    {
      key: "actions",
      label: "Azioni", 
      sortable: false,
      searchable: false,
      render: (project: Project) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-project-menu-${project.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleEdit(project)}
              data-testid={`menu-edit-project-${project.id}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleOpenPlanner(project)}
              data-testid={`menu-planner-project-${project.id}`}
            >
              <Target className="mr-2 h-4 w-4" />
              Planner
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(project)}
              className="text-destructive"
              data-testid={`menu-delete-project-${project.id}`}
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Progetti" 
          subtitle="Gestione progetti SAP ABAP"
          onNewClick={handleAdd}
        />
        
        <div className="p-6">
          {/* Layout Management and View Toggle */}
          <div className="flex justify-between items-center mb-4">
            {/* Layout Manager */}
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
          ) : projects?.length === 0 ? (
            <div className="text-center py-12">
              <Code className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nessun progetto</h3>
              <p className="text-muted-foreground mb-4">Crea il tuo primo progetto SAP ABAP</p>
              <Button onClick={handleAdd} data-testid="button-create-first-project">
                Crea Progetto
              </Button>
            </div>
          ) : viewMode === 'list' ? (
            <UniversalTable
              data={projects}
              columns={columns}
              enableSelection={true}
              enableSearch={true}
              searchPlaceholder="Cerca progetti..."
              onSelectionChange={(rows) => setSelectedProjects(rows as Project[])}
              onRowClick={handleEdit}
              bulkActions={[
                {
                  label: "Elimina Selezionati",
                  icon: Trash2,
                  variant: "destructive",
                  onClick: () => handleDelete(selectedProjects)
                }
              ]}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects?.map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleEdit(project)}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 flex-1">
                        <CardTitle className="text-lg" data-testid={`text-project-name-${project.id}`}>
                          {project.name}
                        </CardTitle>
                        <div className="flex items-center space-x-2">
                          <Badge 
                            variant="secondary" 
                            className={statusColors[project.status as keyof typeof statusColors]}
                            data-testid={`badge-project-status-${project.id}`}
                          >
                            {project.status}
                          </Badge>
                          {project.clientId && (
                            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                              <User className="h-4 w-4" />
                              <span data-testid={`text-project-client-${project.id}`}>{project.clientId}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex space-x-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPlanner(project);
                          }}
                          data-testid={`button-planner-project-${project.id}`}
                          title="Project Planner"
                        >
                          <Target className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(project);
                          }}
                          data-testid={`button-edit-project-${project.id}`}
                          title="Edit Project"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {project.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-project-description-${project.id}`}>
                        {project.description}
                      </p>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium" data-testid={`text-project-progress-${project.id}`}>
                          {project.progress}%
                        </span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>
                    
                    <div className="flex items-center justify-between pt-2">
                      {project.budget && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <DollarSign className="h-4 w-4" />
                          <span data-testid={`text-project-budget-${project.id}`}>
                            {formatBudget(project.budget)}
                          </span>
                        </div>
                      )}
                      
                      {project.endDate && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`text-project-end-date-${project.id}`}>
                            {formatDate(project.endDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Modifica Progetto" : "Nuovo Progetto"}
            </DialogTitle>
            <DialogDescription>
              {editingProject ? "Aggiorna" : "Crea"} un progetto SAP ABAP
            </DialogDescription>
          </DialogHeader>
          
          {editingProject ? (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details" className="flex items-center space-x-2">
                  <Code className="h-4 w-4" />
                  <span>Dettagli</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center space-x-2">
                  <History className="h-4 w-4" />
                  <span>Storico Modifiche</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="mt-6">
                <ProjectForm 
                  project={editingProject || undefined}
                  onSuccess={() => {
                    setShowForm(false);
                    setEditingProject(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                  }}
                />
              </TabsContent>
              
              <TabsContent value="history" className="mt-6">
                <AuditHistory 
                  tableName="projects" 
                  recordId={editingProject.id}
                  title="Storico Modifiche Progetto"
                />
              </TabsContent>
            </Tabs>
          ) : (
            <ProjectForm 
              project={editingProject || undefined}
              onSuccess={() => {
                setShowForm(false);
                setEditingProject(null);
                queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Project Planner Dialog */}
      <Dialog open={showPlanner} onOpenChange={handleClosePlanner}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project Schedule Planner</DialogTitle>
            <DialogDescription>
              Pianifica le attività e le milestone del progetto
            </DialogDescription>
          </DialogHeader>
          {selectedProjectForPlanner && (
            <ProjectPlanner projectId={selectedProjectForPlanner.id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Progetto</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il progetto "{editingProject?.name}"? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedProjects.length} progetti selezionati? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending ? "Eliminando..." : `Elimina ${selectedProjects.length} Progetti`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table Configuration Dialog */}
      <TableConfiguration
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        tableId="projects"
        availableColumns={[
          { id: 'name', label: 'Nome' },
          { id: 'status', label: 'Status' },
          { id: 'client', label: 'Cliente' },
          { id: 'startDate', label: 'Data Inizio' },
          { id: 'endDate', label: 'Data Fine' },
          { id: 'budget', label: 'Budget' },
          { id: 'progress', label: 'Progresso' },
        ]}
        editingLayout={editingLayout}
        onSave={(layoutData) => {
          updateLayout(layoutData);
          setShowConfigDialog(false);
        }}
        onCancel={() => setShowConfigDialog(false)}
      />
    </div>
  );
}