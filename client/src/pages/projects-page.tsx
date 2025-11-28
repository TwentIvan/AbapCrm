import { useState, useEffect, useMemo } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Code, Calendar, DollarSign, User, Edit, Target, Grid3X3, List, Trash2, History, MessageSquare, Workflow } from "lucide-react";
import { Project, Partner, SapSystem } from "@shared/schema";
import { RelationshipBadge } from "@/components/ui/relationship-badge";
import { RelationshipPreviewProvider } from "@/components/ui/relationship-preview-context";
import { SapPasteJsonDialog } from "@/components/dialogs/sap-paste-json-dialog";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { CascadeDeleteDialog, SimpleDeleteDialog } from "@/components/dialogs/cascade-delete-dialog";
import { useCascadeDelete } from "@/hooks/use-cascade-delete";
import { downloadZTHUDocumentationShortcut } from "@/lib/sap-shortcut";
import ProjectForm from "@/components/forms/project-form";
import ProjectFormContainer from "@/components/forms/project-form-container";
import ProjectPlanner from "@/components/planning/project-planner";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";

const statusColors = {
  planning: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800", 
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-gray-100 text-gray-800",
  on_hold: "bg-red-100 text-red-800",
};

// Type for project relationships response
type ProjectRelationships = {
  tasks: {
    count: number;
    items: Array<{id: string; name: string}>;
  };
  milestones: {
    count: number;
    items: Array<{id: string; name: string}>;
  };
};

// Hook to fetch project relationships
function useProjectRelationships(projectId: string, currentOrganizationId: string | null) {
  return useQuery<ProjectRelationships>({
    queryKey: [`/api/projects/${projectId}/relationships`, currentOrganizationId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (currentOrganizationId) {
        headers["X-Organization-Id"] = currentOrganizationId;
      }
      const res = await fetch(`/api/projects/${projectId}/relationships`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: !!currentOrganizationId,
  });
}

// Component to display Tasks count for a project
function ProjectTasksCount({ projectId, currentOrganizationId }: { projectId: string; currentOrganizationId: string | null }) {
  const { data: relationships, isLoading } = useProjectRelationships(projectId, currentOrganizationId);
  
  if (!currentOrganizationId || isLoading) {
    return <span className="text-sm text-muted-foreground">...</span>;
  }

  const count = relationships?.tasks?.count || 0;
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <RelationshipBadge
      count={count}
      label="Tasks"
      items={relationships?.tasks?.items || []}
      targetPath="/tasks"
      filterParam="projectId"
      sourceId={projectId}
      variant="secondary"
    />
  );
}

// Component to display Milestones count for a project
function ProjectMilestonesCount({ projectId, currentOrganizationId }: { projectId: string; currentOrganizationId: string | null }) {
  const { data: relationships, isLoading } = useProjectRelationships(projectId, currentOrganizationId);
  
  if (!currentOrganizationId || isLoading) {
    return <span className="text-sm text-muted-foreground">...</span>;
  }

  const count = relationships?.milestones?.count || 0;
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <RelationshipBadge
      count={count}
      label="Milestones"
      items={relationships?.milestones?.items || []}
      targetPath="/project-milestones"
      filterParam="projectId"
      sourceId={projectId}
      variant="outline"
    />
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
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
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

  const { data: fieldMetadata } = useEntityFieldMetadata("projects");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

  // URL filtering for clientId
  const urlParams = new URLSearchParams(window.location.search);
  const clientIdFilter = urlParams.get('clientId');
  const filteredProjects = clientIdFilter 
    ? projects.filter(p => p.clientId === clientIdFilter)
    : projects;

  const cascadeDelete = useCascadeDelete<Project>({
    entityName: "Progetto",
    entityNamePlural: "Progetti",
    apiBasePath: "/api/projects",
    queryKey: "/api/projects",
    relationConfigs: [
      { key: "tasks", label: "task" },
      { key: "timeEntries", label: "registrazioni tempo" },
      { key: "milestones", label: "milestone" },
      { key: "events", label: "eventi calendario" },
      { key: "comments", label: "commenti" },
      { key: "transports", label: "transport request SAP" },
    ],
    getEntityName: (project: Project) => project.name,
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ projects, updates }: { projects: Project[], updates: Record<string, any> }) => {
      await Promise.all(
        projects.map(project => apiRequest("PUT", `/api/projects/${project.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjects([]);
      setShowBulkEditDialog(false);
      toast({
        title: "Progetti aggiornati",
        description: "I progetti selezionati sono stati aggiornati con successo.",
      });
    },
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ projects, addSuffix, suffix }: { projects: Project[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        projects.map(project => {
          const { id, createdAt, updatedAt, userId, organizationId, ...projectData } = project;
          const newProject = {
            ...projectData,
            name: addSuffix ? `${project.name}${suffix}` : project.name,
          };
          return apiRequest("POST", "/api/projects", newProject);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjects([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Progetti copiati",
        description: "I progetti selezionati sono stati copiati con successo.",
      });
    },
  });

  const bulkEditFields: BulkEditField[] = [
    {
      key: "status",
      label: "Stato",
      type: "select",
      options: [
        { value: "planning", label: "Pianificazione" },
        { value: "in_progress", label: "In corso" },
        { value: "review", label: "Revisione" },
        { value: "completed", label: "Completato" },
        { value: "on_hold", label: "In attesa" },
      ],
    },
    {
      key: "clientId",
      label: "Cliente",
      type: "select",
      options: partners.map(p => ({ value: p.id, label: p.name })),
    },
    {
      key: "sapSystemId",
      label: "Sistema SAP",
      type: "select",
      options: [
        { value: "", label: "Nessuno" },
        ...sapSystems.map(s => ({ value: s.id, label: s.name })),
      ],
    },
    {
      key: "budget",
      label: "Budget",
      type: "number",
      placeholder: "Es: 50000",
    },
    {
      key: "progress",
      label: "Progresso (%)",
      type: "number",
      placeholder: "0-100",
    },
  ];

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

  const handleDelete = (projects: Project[]) => {
    cascadeDelete.handleDelete(projects);
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

  const handleBulkEditSave = (updates: Record<string, any>) => {
    bulkEditMutation.mutate({ projects: selectedProjects, updates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ projects: selectedProjects, addSuffix, suffix });
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
      key: "tasks",
      label: "Tasks", 
      sortable: false,
      searchable: false,
      render: (project: Project) => (
        <ProjectTasksCount projectId={project.id} currentOrganizationId={currentOrganizationId} />
      )
    },
    {
      key: "milestones",
      label: "Milestones", 
      sortable: false,
      searchable: false,
      render: (project: Project) => (
        <ProjectMilestonesCount projectId={project.id} currentOrganizationId={currentOrganizationId} />
      )
    },
  ];

  // Apply layout configuration: filter visible columns and sort by position
  const visibleColumns = useMemo(() => {
    // If no layout configuration or empty columns config, show all columns
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return columns;
    }
    
    // Filter and sort columns based on layout
    return columns
      .filter(col => {
        const config = layout.columns[col.key];
        // If no config for this column, show it by default
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[a.key]?.position ?? 999;
        const posB = layout.columns[b.key]?.position ?? 999;
        return posA - posB;
      });
  }, [columns, layout.columns]);

  return (
    <RelationshipPreviewProvider>
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Progetti" 
          subtitle="Gestione progetti SAP ABAP"
        />
        
        <div 
          className="p-6 rounded-t-lg min-h-full"
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
              data={filteredProjects}
              columns={visibleColumns}
              enableSelection={true}
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

      {/* Simple Delete Dialog (no related data) */}
      <SimpleDeleteDialog
        open={cascadeDelete.showDeleteDialog}
        onOpenChange={cascadeDelete.setShowDeleteDialog}
        itemCount={cascadeDelete.selectedItems.length}
        itemNames={cascadeDelete.selectedItems.map(p => cascadeDelete.getEntityName(p))}
        onConfirm={cascadeDelete.confirmDelete}
        onCancel={cascadeDelete.cancelDelete}
        isDeleting={cascadeDelete.isDeleting}
        entityName={cascadeDelete.entityName}
        entityNamePlural={cascadeDelete.entityNamePlural}
      />

      {/* Cascade Delete Dialog (with related data) */}
      <CascadeDeleteDialog
        open={cascadeDelete.showCascadeDialog}
        onOpenChange={cascadeDelete.setShowCascadeDialog}
        title="Attenzione: Dati Collegati"
        itemCount={cascadeDelete.selectedItems.length}
        itemNames={cascadeDelete.selectedItems.map(p => cascadeDelete.getEntityName(p))}
        relationLabels={cascadeDelete.getRelationLabels()}
        onConfirm={cascadeDelete.confirmDelete}
        onCancel={cascadeDelete.cancelDelete}
        isDeleting={cascadeDelete.isDeleting}
        entityName={cascadeDelete.entityName}
        entityNamePlural={cascadeDelete.entityNamePlural}
      />

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        title="Modifica Massiva Progetti"
        description="Seleziona i campi da modificare e imposta i nuovi valori per"
        fields={bulkEditFields}
        selectedCount={selectedProjects.length}
        onSave={handleBulkEditSave}
        isPending={bulkEditMutation.isPending}
      />

      {/* SAP Paste JSON Dialog */}
      <SapPasteJsonDialog 
        open={showSapPasteDialog} 
        onOpenChange={setShowSapPasteDialog}
        projectId={selectedProjectForSap?.id}
      />

      {/* Bulk Copy Dialog */}
      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title="Copia Progetti"
        description="Crea copie dei"
        selectedCount={selectedProjects.length}
        onCopy={handleBulkCopy}
        isPending={bulkCopyMutation.isPending}
      />

      {/* Table Configuration Dialog */}
      <TableConfiguration
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        tableId="projects"
        availableColumns={availableColumns.length > 0 ? availableColumns : [
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
    </RelationshipPreviewProvider>
  );
}