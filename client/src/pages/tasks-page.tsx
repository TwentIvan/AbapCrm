import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, Edit, MoreHorizontal, ExternalLink, Clock, CheckCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Task, Project } from "@shared/schema";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import TaskFormContainer from "@/components/forms/task-form-container";
import { useToast } from "@/hooks/use-toast";
import { UniversalTable } from "@/components/ui/universal-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { ThuAiDialog } from "@/components/dialogs/thu-ai-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskTimerButtons } from "@/components/timesheet/task-timer-buttons";
import { taskStatusColors, taskStatusLabels, taskPriorityColors, taskPriorityLabels } from "@/lib/entity-constants";

export default function TasksPage() {
  const [location] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/tasks/");
  const isCreateMode = location === "/tasks/new";
  const isEditMode = location.includes("/edit");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const [showThuAiDialog, setShowThuAiDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  const { currentOrganizationId } = useOrganization();
  
  // Read URL query params for filtering
  const urlParams = new URLSearchParams(window.location.search);
  const filterProjectId = urlParams.get('projectId');

  // Debug dialog states when they change
  useEffect(() => {
    if (showCreateDialog || showEditDialog || showConfigDialog) {
      console.log('Main dialogs changed:', {
        showCreateDialog,
        showEditDialog,
        showConfigDialog
      });
    }
  }, [showCreateDialog, showEditDialog, showConfigDialog]);
  
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
  } = useTableLayout('tasks');

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId, // Wait for organization context
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Use cache if available
    refetchOnWindowFocus: false,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const res = await apiRequest("PUT", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: (updatedTask: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      // Invalidate project-related queries to refresh ETC calculations
      queryClient.invalidateQueries({ queryKey: ["/api/projects/batch-end-to-complete"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (updatedTask?.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", updatedTask.projectId, "end-to-complete"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", updatedTask.projectId] });
      }
      toast({ title: "Task updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowDeleteDialog(false);
      setEditingTask(null);
      toast({ title: "Eliminato", description: "Task eliminato con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (tasks: Task[]) => {
      for (const task of tasks) {
        await apiRequest("DELETE", `/api/tasks/${task.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Tasks eliminati con successo" });
    }
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ tasks, updates }: { tasks: Task[], updates: Record<string, any> }) => {
      await Promise.all(
        tasks.map(task => apiRequest("PUT", `/api/tasks/${task.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      // Invalidate project-related queries to refresh ETC calculations
      queryClient.invalidateQueries({ queryKey: ["/api/projects/batch-end-to-complete"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedTasks([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: "Tasks modificati con successo" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ tasks, addSuffix, suffix }: { tasks: Task[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        tasks.map(task => {
          const { id, createdAt, updatedAt, userId, organizationId, ...taskData } = task;
          const newTask = {
            ...taskData,
            title: addSuffix ? `${task.title}${suffix}` : task.title,
          };
          return apiRequest("POST", "/api/tasks", newTask);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Task copiati",
        description: "I task selezionati sono stati copiati con successo.",
      });
    },
  });

  const bulkEditFields: BulkEditField[] = [
    {
      key: "status",
      label: "Stato",
      type: "select",
      options: [
        { value: "todo", label: "Da fare" },
        { value: "in_progress", label: "In corso" },
        { value: "review", label: "In revisione" },
        { value: "completed", label: "Completato" },
      ],
    },
    {
      key: "priority",
      label: "Priorità",
      type: "select",
      options: [
        { value: "low", label: "Bassa" },
        { value: "medium", label: "Media" },
        { value: "high", label: "Alta" },
        { value: "urgent", label: "Urgente" },
      ],
    },
    {
      key: "projectId",
      label: "Progetto",
      type: "select",
      options: [
        { value: "", label: "Nessuno" },
        ...projects.map(p => ({ value: p.id, label: p.name })),
      ],
    },
    {
      key: "assignedTo",
      label: "Assegnato a",
      type: "select",
      options: [
        { value: "", label: "Nessuno" },
        ...users.map(u => ({ value: u.id, label: u.username })),
      ],
    },
    {
      key: "dueDate",
      label: "Data Scadenza",
      type: "date",
    },
  ];

  const handleBulkEditSave = (updates: Record<string, any>) => {
    bulkEditMutation.mutate({ tasks: selectedTasks, updates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ tasks: selectedTasks, addSuffix, suffix });
  };

  const toggleTaskComplete = (task: Task) => {
    const newStatus = task.status === "completed" ? "todo" : "completed";
    updateTaskMutation.mutate({ 
      id: task.id, 
      data: { status: newStatus }
    });
  };

  const handleEditTask = (task: Task) => {
    console.log('handleEditTask called for task:', task.id);
    console.log('Stack trace:', new Error().stack);
    setEditingTask(task);
    setShowEditDialog(true);
  };

  // Avvio task reale: il server compone il piano (workflow custom o piano
  // calcolato dall'inventario) e lo accoda come job "connect"; il companion
  // lo esegue sulla workstation (VPN reachability -> tunnel cliente -> check
  // -> SAP GUI) e riporta l'esito per passo. Il sistema SAP, se non
  // esplicito sul task, è il default del partner (livello 1 = sviluppo).
  const handleLaunchConnections = async (task: Task) => {
    try {
      // Il companion è connesso?
      let online = false;
      try {
        const sr = await fetch("/api/hubup/companion/status", { credentials: "include" });
        if (sr.ok) online = !!(await sr.json()).online;
      } catch { /* trattato come offline */ }
      if (!online) {
        toast({
          title: "Companion non attivo",
          description: "Il companion non risulta connesso sulla workstation. Installalo/avvialo dal wizard VPN e riprova.",
          variant: "destructive",
        });
        return;
      }

      const res = await apiRequest("POST", `/api/tasks/${task.id}/launch`, {});
      const { jobId, steps, system, systemSource } = await res.json();
      toast({
        title: "Avvio connessioni",
        description: `Sistema ${system}${systemSource === "partner-default" ? " (default sviluppo)" : ""} — piano di ${steps?.length ?? 0} passi inviato alla workstation...`,
      });

      const started = Date.now();
      while (Date.now() - started < 180000) {
        await new Promise((r) => setTimeout(r, 2500));
        const jr = await fetch(`/api/hubup/jobs/${jobId}`, { credentials: "include" });
        if (!jr.ok) break;
        const j = await jr.json();
        if (j.status === "done" || j.status === "error") {
          const icon = (s: string) =>
            s === "ok" ? "✅" : s === "manual" ? "✋" : s === "skipped" ? "⏭" : "❌";
          const lines = (j.result?.steps || [])
            .map((s: any) => `${icon(s.status)} ${s.label}${s.detail ? ` — ${s.detail}` : ""}`)
            .join("\n");
          alert(`${j.status === "done" ? "🚀 Connessioni avviate" : "⚠️ Avvio con errori"} — ${task.title}\n\n${lines || j.error || ""}`);
          if (j.status === "done") {
            toast({ title: "Task avviato", description: "Sequenza di connessione completata sulla workstation." });
          } else {
            toast({ title: "Avvio con errori", description: j.error || "Alcuni passi sono falliti", variant: "destructive" });
          }
          return;
        }
      }
      toast({
        title: "Nessuna risposta",
        description: "Il companion non ha completato in tempo. Controlla ~/.hubup/companion.out",
        variant: "destructive",
      });
    } catch (error: any) {
      console.error('Error launching task:', error);
      toast({
        title: "Errore",
        description: error?.message || "Impossibile avviare il task",
        variant: "destructive",
      });
    }
  };

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setEditingTask(null);
  };

  const confirmDelete = () => {
    if (editingTask) {
      deleteMutation.mutate(editingTask.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedTasks);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowEditDialog(true);
  };

  const handleAdd = () => {
    setEditingTask(null);
    setShowCreateDialog(true);
  };
  
  // Handle full-page mode: when user navigates directly to /tasks/new or /tasks/:id/edit
  if (isFullPageMode) {
    return (
      <TaskFormContainer
        open={false} // Not used in full-page mode
        onOpenChange={() => {}} // Not used in full-page mode
        editingTask={editingTask}
        onSuccess={() => {
          setEditingTask(null);
        }}
      />
    );
  }

  const handleSingleDelete = (task: Task) => {
    setEditingTask(task);
    setShowDeleteDialog(true);
  };

  const handleDelete = (tasks: Task[]) => {
    if (tasks.length === 0) return;
    setSelectedTasks(tasks);
    setShowBulkDeleteDialog(true);
  };

  // Define filter columns for advanced filtering
  const filterColumns = [
    { id: 'title', label: 'Titolo', type: 'text' as const },
    { id: 'status', label: 'Stato', type: 'select' as const, options: [
      { value: 'todo', label: 'Da fare' },
      { value: 'in_progress', label: 'In corso' },
      { value: 'review', label: 'In revisione' },
      { value: 'completed', label: 'Completato' },
    ]},
    { id: 'priority', label: 'Priorità', type: 'select' as const, options: [
      { value: 'low', label: 'Bassa' },
      { value: 'medium', label: 'Media' },
      { value: 'high', label: 'Alta' },
      { value: 'urgent', label: 'Urgente' },
    ]},
    { id: 'description', label: 'Descrizione', type: 'text' as const },
    { id: 'dueDate', label: 'Scadenza', type: 'date' as const },
  ];

  // Define aggregation columns 
  const aggregationColumns = [
    { id: 'title', type: 'count' as const, label: 'Totale Tasks' },
  ];

  // Define table columns for UniversalTable
  const tableColumns = [
    {
      key: 'title',
      label: 'Titolo',
      sortable: true,
      searchable: true,
      render: (task: Task) => (
        <div className="font-medium" data-testid={`text-task-title-${task.id}`}>
          {task.title}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Stato',
      sortable: true,
      searchable: true,
      render: (task: Task) => (
        <Badge className={taskStatusColors[task.status as keyof typeof taskStatusColors]} data-testid={`badge-task-status-${task.id}`}>
          {taskStatusLabels[task.status as keyof typeof taskStatusLabels]}
        </Badge>
      ),
    },
    {
      key: 'priority',
      label: 'Priorità',
      sortable: true,
      searchable: true,
      render: (task: Task) => (
        <Badge className={taskPriorityColors[task.priority as keyof typeof taskPriorityColors]} data-testid={`badge-task-priority-${task.id}`}>
          {taskPriorityLabels[task.priority as keyof typeof taskPriorityLabels]}
        </Badge>
      ),
    },
    {
      key: 'description',
      label: 'Descrizione',
      sortable: false,
      searchable: true,
      render: (task: Task) => task.description ? (
        <div className="text-sm max-w-xs truncate" title={task.description}>
          {task.description}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Nessuna descrizione</span>
      ),
    },
    {
      key: 'projectId',
      label: 'Progetto',
      sortable: true,
      searchable: true,
      render: (task: any) => task.projectName ? (
        <div className="text-sm font-medium" data-testid={`text-task-project-${task.id}`}>
          {task.projectName}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Nessun progetto</span>
      ),
    },
    {
      key: 'dueDate',
      label: 'Scadenza',
      sortable: true,
      searchable: false,
      render: (task: Task) => {
        if (!task.dueDate) return <span className="text-muted-foreground text-sm">Nessuna scadenza</span>;
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < new Date() && task.status !== 'completed';
        return (
          <div className={isOverdue ? 'text-destructive font-medium' : ''}>
            {dueDate.toLocaleDateString('it-IT')}
          </div>
        );
      },
    },
    {
      key: 'estimatedEffort',
      label: 'Ore Stimate',
      sortable: true,
      searchable: false,
      render: (task: Task) => {
        const estimated = task.estimatedEffort || 0;
        if (estimated === 0) return <span className="text-muted-foreground text-sm">-</span>;
        return (
          <div className="text-sm font-medium" data-testid={`text-task-effort-${task.id}`}>
            {estimated}h
          </div>
        );
      },
    },
    {
      key: 'completionPercentage',
      label: 'Completamento',
      sortable: true,
      searchable: false,
      render: (task: Task) => {
        const completion = Math.min(100, Math.max(0, task.completionPercentage || 0));
        const estimated = task.estimatedEffort || 0;
        const remaining = Math.max(0, estimated * (1 - completion / 100));
        return (
          <div className="space-y-1 min-w-[100px]" data-testid={`text-task-completion-${task.id}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{completion}%</span>
              {estimated > 0 && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {remaining.toFixed(1)}h
                </span>
              )}
            </div>
            <Progress value={completion} className="h-1.5" />
          </div>
        );
      },
    },
    {
      key: 'timer',
      label: 'Timer',
      sortable: false,
      searchable: false,
      render: (task: Task) => <TaskTimerButtons task={task} />,
    },
    {
      key: 'actions',
      label: 'Azioni',
      sortable: false,
      searchable: false,
      render: (task: Task) => (
        <div className="flex items-center space-x-2">
          {task.sapSystemId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleLaunchConnections(task)}
              data-testid={`button-launch-connections-${task.id}`}
              className="text-primary hover:text-primary hover:bg-primary/10"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Avvia
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-task-menu-${task.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => handleEdit(task)}
                data-testid={`menu-edit-task-${task.id}`}
              >
                <Edit className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              {(task as any).status === "draft" && (
                <DropdownMenuItem
                  onClick={() => updateTaskMutation.mutate({ id: task.id, data: { status: "todo" } })}
                  data-testid={`menu-confirm-draft-${task.id}`}
                  className="text-purple-700 focus:text-purple-700"
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Conferma Bozza
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  // Apply layout configuration: filter visible columns and sort by position
  const visibleColumns = useMemo(() => {
    // Get column key - DataTable uses accessorKey or id, UniversalTable uses key
    const getColumnKey = (col: any) => col.accessorKey || col.id || col.key;
    
    // Always show actions column
    const actionsColumn = tableColumns.find(c => getColumnKey(c) === 'actions');
    
    // If no layout configuration or empty columns config, show all columns
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return tableColumns;
    }
    
    // Filter and sort columns based on layout
    const configuredColumns = tableColumns
      .filter(col => {
        const key = getColumnKey(col);
        if (key === 'actions') return false; // Handle separately
        const config = layout.columns[key];
        // If no config for this column, show it by default
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[getColumnKey(a)]?.position ?? 999;
        const posB = layout.columns[getColumnKey(b)]?.position ?? 999;
        return posA - posB;
      });
    
    // Add actions column at the end
    if (actionsColumn) {
      configuredColumns.push(actionsColumn);
    }
    
    return configuredColumns;
  }, [tableColumns, layout.columns]);

  const isOverdue = (dueDate: string | Date | null) => {
    if (!dueDate) return false;
    const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
    return date < new Date();
  };

  const toggleTaskExpanded = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Tasks" 
          subtitle="Gestisci i tuoi task e le attività dei progetti"
        />
        
        <div 
          className="p-6 rounded-t-lg min-h-full"
          style={{ 
            borderTop: '2px solid hsl(var(--brand) / 0.3)',
            borderLeft: '2px solid hsl(var(--brand) / 0.3)',
            borderRight: '2px solid hsl(var(--brand) / 0.3)'
          }}
        >
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={() => setShowCreateDialog(true)}
            onCopySelected={() => setShowBulkCopyDialog(true)}
            onBulkEdit={() => setShowBulkEditDialog(true)}
            onDeleteSelected={() => handleDelete(selectedTasks)}
            hasSelection={selectedTasks.length > 0}
            customActions={
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setShowThuAiDialog(true)}
                      disabled={selectedTasks.length === 0}
                      variant="ghost"
                      className={`relative flex flex-col items-center justify-center w-12 h-9 rounded-lg border-2 border-purple-300/30 dark:border-purple-600/30 bg-sidebar-accent shadow-sm hover:shadow-md transition-all ${
                        selectedTasks.length === 0 ? 'opacity-40' : 'opacity-100 hover:border-purple-400 dark:hover:border-purple-500'
                      }`}
                      data-testid="button-ai-tasks"
                    >
                      <div className="relative flex flex-col items-center">
                        <div className="flex items-baseline space-x-0">
                          <span className="text-xs font-black text-primary">T</span>
                          <span className="text-sm font-black text-primary">H</span>
                          <span className="text-sm font-black text-primary">U</span>
                        </div>
                        <span className="text-[8px] font-bold text-purple-500 dark:text-purple-400 -mt-0.5">AI</span>
                      </div>
                      {selectedTasks.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                          {selectedTasks.length > 9 ? '9+' : selectedTasks.length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-purple-500 text-white">
                    <p>{selectedTasks.length > 0 
                      ? `Assistenza AI per ${selectedTasks.length} task` 
                      : 'Seleziona task per assistenza AI'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
          />

          {isLoading && (!tasks || tasks.length === 0) ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tasks?.length === 0 ? (
            <div className="text-center py-12">
              <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Ancora nessun task</h3>
              <p className="text-muted-foreground mb-4">Crea il tuo primo task per iniziare a organizzare il lavoro</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-task">
                Crea Task
              </Button>
            </div>
          ) : (
            <UniversalTable
              data={filterProjectId ? (tasks || []).filter(t => t.projectId === filterProjectId) : (tasks || [])}
              columns={visibleColumns}
              enableSelection={true}
              onSelectionChange={(rows) => setSelectedTasks(rows as Task[])}
              onRowClick={handleEdit}
            />
          )}
        </div>
      </main>
      
      {/* Form Container - supports both dialog and full-page modes */}
      <TaskFormContainer
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            setEditingTask(null);
          }
        }}
        editingTask={editingTask}
        onSuccess={() => {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setEditingTask(null);
        }}
      />

      {/* Single Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Task</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare "{editingTask?.title}"? 
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
            <AlertDialogTitle>Elimina Tasks Selezionati</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare i {selectedTasks.length} task selezionati? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete}>
              Elimina {selectedTasks.length} Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Copy Dialog */}
      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title="Copia Task"
        description="Crea copie dei task"
        selectedCount={selectedTasks.length}
        onCopy={handleBulkCopy}
        isPending={bulkCopyMutation.isPending}
      />

      {/* Table Configuration Dialog */}
      <TableConfiguration
        tableId="tasks"
        availableColumns={[
          { id: 'title', label: 'Titolo' },
          { id: 'status', label: 'Stato' },
          { id: 'priority', label: 'Priorità' },
          { id: 'projectId', label: 'Progetto' },
          { id: 'assigneeId', label: 'Assegnato a' },
          { id: 'dueDate', label: 'Scadenza' },
          { id: 'estimatedEffort', label: 'Effort Stimato' }
        ]}
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
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

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        title="Modifica Massiva Tasks"
        description="Seleziona i campi da modificare e imposta i nuovi valori per"
        fields={bulkEditFields}
        selectedCount={selectedTasks.length}
        onSave={handleBulkEditSave}
        isPending={bulkEditMutation.isPending}
      />

      {/* THU AI Dialog */}
      <ThuAiDialog
        open={showThuAiDialog}
        onOpenChange={setShowThuAiDialog}
        selectedTasks={selectedTasks}
      />
    </div>
  );
} 
