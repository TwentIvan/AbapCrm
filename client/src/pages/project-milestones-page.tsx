import { useState, useMemo } from "react";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Target, Calendar, Table as TableIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ProjectMilestone, Project, Task } from "@shared/schema";
import ProjectMilestoneForm from "@/components/forms/project-milestone-form";
import { GanttChart } from "@/components/ui/gantt-chart";
import { RelationshipLink } from "@/components/ui/relationship-link";

export default function ProjectMilestonesPage() {
  const [viewMode, setViewMode] = useState<"table" | "gantt">("table");
  const [selectedMilestones, setSelectedMilestones] = useState<ProjectMilestone[]>([]);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Read URL query params for filtering
  const urlParams = new URLSearchParams(window.location.search);
  const filterProjectId = urlParams.get('projectId');

  const {
    layout, currentLayoutName, savedLayouts, updateLayout, 
    saveLayoutAs, loadLayout, renameLayout, deleteLayout, updateExistingLayout
  } = useTableLayout('project-milestones');

  const { data: milestones = [], isLoading } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/project-milestones"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: projects = [] } = useQuery<Project[]>({ 
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/project-milestones/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-milestones"] });
      setShowDeleteDialog(false);
      setEditingMilestone(undefined);
      toast({ title: "Eliminato", description: "Milestone eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (milestones: ProjectMilestone[]) => {
      for (const milestone of milestones) {
        await apiRequest("DELETE", `/api/project-milestones/${milestone.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-milestones"] });
      setSelectedMilestones([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Milestone eliminate con successo" });
    }
  });

  const updateDatesMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: string; endDate: string }) => {
      return apiRequest("PUT", `/api/project-milestones/${id}`, {
        startDate,
        endDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-milestones"] });
      toast({ title: "Aggiornato", description: "Milestone aggiornata con successo" });
    },
    onError: (error: any) => {
      toast({ 
        variant: "destructive",
        title: "Errore", 
        description: error?.message || "Impossibile aggiornare la milestone" 
      });
    },
  });

  const handleMilestoneUpdate = (id: string, startDate: string, endDate: string) => {
    updateDatesMutation.mutate({ id, startDate, endDate });
  };

  const handleEdit = (milestone: ProjectMilestone) => {
    setEditingMilestone(milestone);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingMilestone(undefined);
    setShowForm(true);
  };

  const handleSingleDelete = (milestone: ProjectMilestone) => {
    setEditingMilestone(milestone);
    setShowDeleteDialog(true);
  };

  const handleDelete = (milestones: ProjectMilestone[]) => {
    if (milestones.length === 0) return;
    setSelectedMilestones(milestones);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingMilestone) {
      deleteMutation.mutate(editingMilestone.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedMilestones);
  };

  const statusColors = {
    planned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
  };

  const statusLabels = {
    planned: "Pianificato",
    in_progress: "In Corso",
    completed: "Completato",
    cancelled: "Annullato"
  };

  const columns = [
    createStandardColumns.text("name", "Nome"),
    {
      key: "project",
      label: "Progetto", 
      sortable: true,
      searchable: true,
      render: (milestone: ProjectMilestone) => {
        const project = projects.find(p => p.id === milestone.projectId);
        return project ? (
          <div className="flex items-center gap-2">
            <span>{project.name}</span>
            <RelationshipLink
              entityType="project"
              entityId={project.id}
              targetPath="/projects"
              label={`Vai a ${project.name}`}
              variant="ghost"
              size="icon"
            />
          </div>
        ) : "-";
      }
    },
    {
      key: "dates",
      label: "Date", 
      sortable: true,
      searchable: false,
      render: (milestone: ProjectMilestone) => {
        const start = milestone.startDate ? format(new Date(milestone.startDate), "dd/MM/yyyy", { locale: it }) : "-";
        const end = milestone.endDate ? format(new Date(milestone.endDate), "dd/MM/yyyy", { locale: it }) : "-";
        return (
          <div className="text-sm">
            <div>{start} → {end}</div>
            {milestone.completedDate && (
              <div className="text-muted-foreground text-xs">
                Completato: {format(new Date(milestone.completedDate), "dd/MM/yyyy", { locale: it })}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: "progress",
      label: "Progresso", 
      sortable: true,
      searchable: false,
      render: (milestone: ProjectMilestone) => (
        <div className="w-32">
          <div className="flex items-center gap-2 mb-1">
            <Progress value={milestone.progress || 0} className="h-2" />
            <span className="text-xs text-muted-foreground">{milestone.progress || 0}%</span>
          </div>
        </div>
      )
    },
    {
      key: "budget",
      label: "Budget vs Costo", 
      sortable: true,
      searchable: false,
      render: (milestone: ProjectMilestone) => {
        const budget = milestone.budgetAmount ? parseFloat(milestone.budgetAmount) : 0;
        const actual = milestone.actualCost ? parseFloat(milestone.actualCost) : 0;
        const isOverBudget = actual > budget && budget > 0;
        
        return (
          <div className="text-sm">
            <div>Budget: {budget.toFixed(2)} {milestone.currency || 'EUR'}</div>
            <div className={isOverBudget ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
              Costo: {actual.toFixed(2)} {milestone.currency || 'EUR'}
            </div>
          </div>
        );
      }
    },
    {
      key: "status",
      label: "Stato", 
      sortable: true,
      searchable: false,
      render: (milestone: ProjectMilestone) => (
        <Badge className={statusColors[milestone.status || "planned"]}>
          {statusLabels[milestone.status || "planned"]}
        </Badge>
      )
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Project Milestones"
          subtitle="Gestisci le milestone dei progetti con visualizzazione timeline"
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
            onDeleteSelected={() => handleDelete(selectedMilestones)}
            hasSelection={selectedMilestones.length > 0}
            viewToggle={
              <div className="flex items-center gap-2 border rounded-md p-1">
                <Button
                  variant={viewMode === "table" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  data-testid="button-view-table"
                  className="gap-2"
                >
                  <TableIcon className="h-4 w-4" />
                  Tabella
                </Button>
                <Button
                  variant={viewMode === "gantt" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("gantt")}
                  data-testid="button-view-gantt"
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Gantt
                </Button>
              </div>
            }
          />

          {viewMode === "table" ? (
            <UniversalTable
              data={filterProjectId ? milestones.filter(m => m.projectId === filterProjectId) : milestones}
              columns={visibleColumns}
              enableSelection={true}
              onSelectionChange={(rows) => setSelectedMilestones(rows as ProjectMilestone[])}
              onRowClick={handleEdit}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <GanttChart
                milestones={filterProjectId ? milestones.filter(m => m.projectId === filterProjectId) : milestones}
                projects={projects || []}
                tasks={tasks || []}
                onMilestoneClick={handleEdit}
                onMilestoneUpdate={handleMilestoneUpdate}
              />
            </div>
          )}

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingMilestone ? "Modifica" : "Nuova"} Milestone</DialogTitle>
                <DialogDescription>
                  {editingMilestone ? "Modifica i dettagli della milestone" : "Crea una nuova milestone per il progetto"}
                </DialogDescription>
              </DialogHeader>
              <ProjectMilestoneForm 
                milestone={editingMilestone}
                onSuccess={() => {
                  setShowForm(false);
                  setEditingMilestone(undefined);
                }}
              />
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare la milestone "{editingMilestone?.name}"? Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmDelete}
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
                <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare {selectedMilestones.length} milestone selezionate? Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-bulk-delete">Annulla</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmBulkDelete}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-confirm-bulk-delete"
                >
                  Elimina Tutti
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Column Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="project-milestones"
            availableColumns={[
              { id: 'name', label: 'Nome' },
              { id: 'project', label: 'Progetto' },
              { id: 'dates', label: 'Date' },
              { id: 'progress', label: 'Progresso' },
              { id: 'budget', label: 'Budget vs Costo' },
              { id: 'status', label: 'Stato' },
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
        </main>
      </div>
    </div>
  );
}
