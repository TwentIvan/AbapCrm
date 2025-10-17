import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import { useOrganization } from "@/contexts/organization-context";
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
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Code, Calendar, DollarSign, User, MoreHorizontal, Edit, Target, Grid3X3, List, Trash2, History, MessageSquare, Workflow } from "lucide-react";
import { Project, Partner, SapSystem } from "@shared/schema";
import { RelationshipBadge } from "@/components/ui/relationship-badge";
import { SapPasteJsonDialog } from "@/components/dialogs/sap-paste-json-dialog";
import { downloadZTHUDocumentationShortcut } from "@/lib/sap-shortcut";
import ProjectForm from "@/components/forms/project-form";
import ProjectFormContainer from "@/components/forms/project-form-container";
import ProjectPlanner from "@/components/planning/project-planner";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statusColors = {
  planning: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800", 
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-gray-100 text-gray-800",
  on_hold: "bg-red-100 text-red-800",
};

// Component to display relationship badges for a project
function ProjectRelationships({ project, currentOrganizationId }: { project: Project; currentOrganizationId: string | null }) {
  const { data: relationships } = useQuery({
    queryKey: [`/api/projects/${project.id}/relationships`, currentOrganizationId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  if (!currentOrganizationId) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  if (!relationships) {
    return <span className="text-sm text-muted-foreground">Loading...</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      <RelationshipBadge
        count={relationships.tasks?.count || 0}
        label="Tasks"
        items={relationships.tasks?.items || []}
        targetPath="/tasks"
        filterParam="projectId"
        sourceId={project.id}
        variant="secondary"
      />
      <RelationshipBadge
        count={relationships.milestones?.count || 0}
        label="Milestones"
        items={relationships.milestones?.items || []}
        targetPath="/project-milestones"
        filterParam="projectId"
        sourceId={project.id}
        variant="outline"
      />
    </div>
  );
}

export default function ProjectsPage() {
  const [location] = useLocation();
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/projects/");
  const isCreateMode = location === "/projects/new";
  const isEditMode = location.includes("/edit");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [selectedProjectForPlanner, setSelectedProjectForPlanner] = useState<Project | null>(null);
  const [showSapPasteDialog, setShowSapPasteDialog] = useState(false);
  const [selectedProjectForSap, setSelectedProjectForSap] = useState<Project | null>(null);
  
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
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cache if available
    refetchOnWindowFocus: false,
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId, // Wait for organization context
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cache if available
    refetchOnWindowFocus: false,
  });

  const { data: sapSystems = [] } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
  
  // Handle full-page mode: when user navigates directly to /projects/new or /projects/:id/edit
  if (isFullPageMode) {
    return (
      <ProjectFormContainer
        open={false} // Not used in full-page mode
        onOpenChange={() => {}} // Not used in full-page mode
        editingProject={editingProject}
        onSuccess={() => {
          setEditingProject(null);
        }}
      />
    );
  }

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

  const handleLaunchSapDocumentation = async (project: Project) => {
    // Trova il sistema SAP associato al progetto tramite sapSystemId
    const projectSapSystem = sapSystems.find(sys => sys.id === project.sapSystemId);
    
    if (!projectSapSystem) {
      toast({
        title: "Sistema SAP non trovato",
        description: "Nessun sistema SAP è collegato a questo progetto. Configurane uno prima di procedere.",
        variant: "destructive",
      });
      return;
    }

    // Scarica il SAP shortcut per ZTHU_DOCUMENTATION
    try {
      // Recupera le credenziali SAP attive per questo sistema
      const credentialsResponse = await fetch(`/api/sap-systems/${projectSapSystem.id}/credentials/active`, {
        credentials: "include",
      });
      
      // Usa credenziali di default dal sistema SAP se disponibili
      let clipboardContent = project.id; // Fallback: solo project ID
      let toastMessage = `ID progetto copiato nel clipboard`;
      
      if (credentialsResponse.ok) {
        const credentials = await credentialsResponse.json();
        if (credentials && credentials.length > 0 && credentials[0].password) {
          // Usa credenziali configurate se disponibili
          clipboardContent = `${credentials[0].password}\n${project.id}`;
          toastMessage = `Password SAP e ID progetto copiati nel clipboard`;
        }
      }
      
      // Se non ci sono credenziali configurate, usa quelle di default del sistema
      if (clipboardContent === project.id && projectSapSystem.defaultPassword) {
        clipboardContent = `${projectSapSystem.defaultPassword}\n${project.id}`;
        toastMessage = `Password SAP (default) e ID progetto copiati nel clipboard`;
      }

      // Copia prima nel clipboard (prima del download per evitare interferenze)
      await navigator.clipboard.writeText(clipboardContent);

      // Poi scarica lo shortcut SAP
      downloadZTHUDocumentationShortcut({
        systemName: projectSapSystem.name,
        description: projectSapSystem.description || undefined,
        serverHost: projectSapSystem.serverHost,
        systemId: projectSapSystem.systemId || projectSapSystem.name, // Usa systemId se disponibile
        systemNumber: projectSapSystem.systemNumber,
        applicationServerPort: projectSapSystem.applicationServerPort || undefined,
        client: "100", // Client di default - verrà sovrascritto dall'utente in SAP
        language: "IT",
        username: projectSapSystem.defaultUsername || undefined, // Username nello shortcut
      });

      // Apri il dialog di paste JSON
      setSelectedProjectForSap(project);
      setShowSapPasteDialog(true);

      toast({
        title: "Shortcut SAP scaricato",
        description: toastMessage,
      });
    } catch (error) {
      toast({
        title: "Errore",
        description: "Impossibile generare lo shortcut SAP.",
        variant: "destructive",
      });
    }
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
      key: "relationships",
      label: "Relazioni", 
      sortable: false,
      searchable: false,
      render: (project: Project) => <ProjectRelationships project={project} currentOrganizationId={currentOrganizationId} />
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
            {project.sapSystemId && (
              <DropdownMenuItem 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleLaunchSapDocumentation(project);
                }}
                data-testid={`menu-sap-zthu-${project.id}`}
              >
                <Workflow className="mr-2 h-4 w-4" />
                Lancia ZTHU_DOCUMENTATION
              </DropdownMenuItem>
            )}
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
        />
        
        <div className="p-6">
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
            onDeleteSelected={() => handleDelete(selectedProjects)}
            hasSelection={selectedProjects.length > 0}
          />

          {isLoading && (!projects || projects.length === 0) ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <div className="text-center py-12">
              <Code className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nessun progetto</h3>
              <p className="text-muted-foreground mb-4">Crea il tuo primo progetto SAP ABAP</p>
              <Button onClick={handleAdd} data-testid="button-create-first-project">
                Crea Progetto
              </Button>
            </div>
          ) : (
            <UniversalTable
              data={projects}
              columns={columns}
              enableSelection={true}
              enableSearch={true}
              searchPlaceholder="Cerca progetti..."
              onSelectionChange={(rows) => setSelectedProjects(rows as Project[])}
              onRowClick={handleEdit}
            />
          )}
        </div>
      </main>

      {/* Form Container - supports both dialog and full-page modes */}
      <ProjectFormContainer
        open={showForm}
        onOpenChange={setShowForm}
        editingProject={editingProject}
        onSuccess={() => {
          setShowForm(false);
          setEditingProject(null);
        }}
      />

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

      {/* SAP Paste JSON Dialog */}
      <SapPasteJsonDialog 
        open={showSapPasteDialog} 
        onOpenChange={setShowSapPasteDialog}
        projectId={selectedProjectForSap?.id}
      />

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