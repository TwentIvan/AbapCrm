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
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Target, MoreHorizontal, Edit, Trash2, Table as TableIcon, Calendar, Plus } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ProjectMilestone, Project } from "@shared/schema";
import ProjectMilestoneForm from "@/components/forms/project-milestone-form";
import { GanttChart } from "@/components/ui/gantt-chart";

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
        return project?.name || "-";
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
    {
      key: "actions",
      label: "Azioni",
      sortable: false,
      searchable: false,
      render: (milestone: ProjectMilestone) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`button-actions-${milestone.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(milestone)} data-testid={`action-edit-${milestone.id}`}>
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleSingleDelete(milestone)} 
              className="text-red-600"
              data-testid={`action-delete-${milestone.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Project Milestones"
          subtitle="Gestisci le milestone dei progetti con visualizzazione timeline"
        />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={handleAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-new"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuova Milestone
              </Button>
              
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
          </div>

          {viewMode === "table" ? (
            <UniversalTable
              data={milestones}
              columns={columns}
              enableSelection={true}
              onSelectionChange={(rows) => setSelectedMilestones(rows as ProjectMilestone[])}
              onRowClick={handleEdit}
              bulkActions={[
                {
                  label: "Elimina Selezionati",
                  icon: Trash2,
                  variant: "destructive",
                  onClick: () => handleDelete(selectedMilestones)
                }
              ]}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <GanttChart
                milestones={milestones}
                projects={projects || []}
                onMilestoneClick={handleEdit}
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
