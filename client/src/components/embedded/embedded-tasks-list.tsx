import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Edit, MoreHorizontal, Play, Square, Trash2, Bot } from "lucide-react";
import type { Task, Project, TimeEntry } from "@shared/schema";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import TaskFormContainer from "@/components/forms/task-form-container";
import AuditHistory from "@/components/ui/audit-history";
import { MessageHistory } from "@/components/ui/message-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompletionDialog } from "@/components/timesheet/completion-dialog";
import { useToast } from "@/hooks/use-toast";
import { UniversalTable } from "@/components/ui/universal-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { ThuAiDialog } from "@/components/dialogs/thu-ai-dialog";

const statusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const priorityColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusLabels: Record<string, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  review: "In revisione",
  completed: "Completato",
};

const priorityLabels: Record<string, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

interface EmbeddedTasksListProps {
  layoutKey?: string;
  showToolbar?: boolean;
  showLayoutManager?: boolean;
  filterStatus?: string[];
  compact?: boolean;
}

function TaskTimerButtons({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  
  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 1000,
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries/task", task.id],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries/task/${task.id}`, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch time entries');
      return res.json();
    },
  });

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/time-entries", {
        taskId: task.id,
        startTime: new Date().toISOString(),
        isRunning: true,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async ({ entryId, completionData }: { entryId: string; completionData?: { completionPercentage: number } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${entryId}/stop`);
      if (completionData) {
        await apiRequest("PUT", `/api/tasks/${task.id}`, {
          completionPercentage: completionData.completionPercentage,
        });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCompletionDialog(false);
      toast({ title: "Timer fermato" });
    },
  });

  const isCurrentTaskRunning = runningEntry?.taskId === task.id;
  const hasRunningTimer = !!runningEntry;

  const getElapsedTime = () => {
    if (!runningEntry || runningEntry.taskId !== task.id) return "";
    const start = new Date(runningEntry.startTime);
    const diff = currentTime.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const calculateSuggestedPercentage = () => {
    if (!runningEntry) return task.completionPercentage || 0;
    const sessionStartTime = new Date(runningEntry.startTime);
    const sessionDuration = (currentTime.getTime() - sessionStartTime.getTime()) / (1000 * 60);
    const currentCompletion = task.completionPercentage || 0;
    let suggestedIncrease = 0;
    if (sessionDuration >= 15) suggestedIncrease = Math.max(5, Math.min(15, sessionDuration / 4));
    else if (sessionDuration >= 5) suggestedIncrease = Math.max(2, sessionDuration / 2);
    else suggestedIncrease = 1;
    return Math.min(100, Math.round(currentCompletion + suggestedIncrease));
  };

  const handleStart = () => startTimerMutation.mutate();
  const handleStop = () => setShowCompletionDialog(true);

  const handleCompletionSubmit = (completionData: { completionPercentage: number }) => {
    if (runningEntry) {
      stopTimerMutation.mutate({ entryId: runningEntry.id, completionData });
    }
  };

  const getTotalTime = () => {
    const totalTime = timeEntries.reduce((total, entry) => total + (entry.duration || 0), 0);
    const hours = Math.floor(totalTime / 60);
    const mins = Math.round(totalTime % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {isCurrentTaskRunning ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStop}
            disabled={stopTimerMutation.isPending}
            data-testid={`button-stop-timer-${task.id}`}
          >
            <Square className="h-3 w-3 mr-1" />
            {getElapsedTime()}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              onClick={handleStart}
              disabled={startTimerMutation.isPending || hasRunningTimer}
              data-testid={`button-start-timer-${task.id}`}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
            {timeEntries.length > 0 && (
              <span className="text-xs text-muted-foreground font-medium">{getTotalTime()}</span>
            )}
          </div>
        )}
      </div>
      
      {showCompletionDialog && (
        <CompletionDialog
          isOpen={showCompletionDialog}
          onClose={() => setShowCompletionDialog(false)}
          currentPercentage={calculateSuggestedPercentage()}
          onSubmit={handleCompletionSubmit}
          isLoading={stopTimerMutation.isPending}
        />
      )}
    </>
  );
}

export function EmbeddedTasksList({
  layoutKey = "dashboard_tasks",
  showToolbar = true,
  showLayoutManager = true,
  filterStatus,
  compact = false,
}: EmbeddedTasksListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const [showThuAiDialog, setShowThuAiDialog] = useState(false);
  
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { 
    layout, 
    currentLayoutName,
    savedLayouts,
    updateLayout, 
    loadLayout,
    renameLayout,
    deleteLayout,
  } = useTableLayout(layoutKey);

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowDeleteDialog(false);
      setEditingTask(null);
      toast({ title: "Task eliminato" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (tasksToDelete: Task[]) => {
      for (const task of tasksToDelete) {
        await apiRequest("DELETE", `/api/tasks/${task.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Tasks eliminati" });
    }
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ tasksToEdit, updates }: { tasksToEdit: Task[], updates: Record<string, any> }) => {
      await Promise.all(tasksToEdit.map(task => apiRequest("PUT", `/api/tasks/${task.id}`, updates)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkEditDialog(false);
      toast({ title: "Tasks modificati" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ tasksToCopy, addSuffix, suffix }: { tasksToCopy: Task[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        tasksToCopy.map(task => {
          const { id, createdAt, updatedAt, userId, organizationId, ...taskData } = task;
          return apiRequest("POST", "/api/tasks", {
            ...taskData,
            title: addSuffix ? `${task.title}${suffix}` : task.title,
          });
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      setShowBulkCopyDialog(false);
      toast({ title: "Tasks copiati" });
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
      key: "dueDate",
      label: "Data Scadenza",
      type: "date",
    },
  ];

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowEditDialog(true);
  };

  const handleAdd = () => {
    setEditingTask(null);
    setShowCreateDialog(true);
  };

  const handleSingleDelete = (task: Task) => {
    setEditingTask(task);
    setShowDeleteDialog(true);
  };

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
      render: (task: Task) => (
        <Badge className={statusColors[task.status] || ""}>
          {statusLabels[task.status] || task.status}
        </Badge>
      ),
    },
    {
      key: 'priority',
      label: 'Priorità',
      sortable: true,
      render: (task: Task) => (
        <Badge className={priorityColors[task.priority] || ""}>
          {priorityLabels[task.priority] || task.priority}
        </Badge>
      ),
    },
    {
      key: 'projectId',
      label: 'Progetto',
      sortable: true,
      render: (task: any) => task.projectName ? (
        <div className="text-sm font-medium">{task.projectName}</div>
      ) : (
        <span className="text-muted-foreground text-sm">-</span>
      ),
    },
    {
      key: 'dueDate',
      label: 'Scadenza',
      sortable: true,
      render: (task: Task) => {
        if (!task.dueDate) return <span className="text-muted-foreground text-sm">-</span>;
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < new Date() && task.status !== 'completed';
        return (
          <div className={isOverdue ? 'text-red-600 font-medium' : 'text-sm'}>
            {dueDate.toLocaleDateString('it-IT')}
          </div>
        );
      },
    },
    {
      key: 'timer',
      label: 'Timer',
      sortable: false,
      render: (task: Task) => <TaskTimerButtons task={task} />,
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      render: (task: Task) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-task-menu-${task.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(task)}>
              <Edit className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSingleDelete(task)} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const visibleColumns = useMemo(() => {
    const actionsColumn = tableColumns.find(c => c.key === 'actions');
    
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return tableColumns;
    }
    
    const configuredColumns = tableColumns
      .filter(col => {
        if (col.key === 'actions') return false;
        const config = layout.columns[col.key];
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[a.key]?.position ?? 999;
        const posB = layout.columns[b.key]?.position ?? 999;
        return posA - posB;
      });
    
    if (actionsColumn) configuredColumns.push(actionsColumn);
    return configuredColumns;
  }, [layout.columns]);

  const filteredTasks = useMemo(() => {
    let result = tasks || [];
    if (filterStatus && filterStatus.length > 0) {
      result = result.filter(t => filterStatus.includes(t.status));
    }
    return result;
  }, [tasks, filterStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Clock className="h-6 w-6 animate-spin mr-2" />
        Caricamento...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {showToolbar && (
        <div className="flex-shrink-0 border-b p-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={handleAdd} data-testid="button-add-task">
                + Nuovo Task
              </Button>
              {selectedTasks.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setShowBulkEditDialog(true)}>
                    Modifica ({selectedTasks.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBulkCopyDialog(true)}>
                    Copia
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setShowBulkDeleteDialog(true)}>
                    Elimina
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowThuAiDialog(true)}>
                    <Bot className="h-4 w-4 mr-1" />
                    AI
                  </Button>
                </>
              )}
            </div>
            {showLayoutManager && (
              <LayoutManager
                currentLayoutName={currentLayoutName}
                savedLayouts={savedLayouts}
                onLoadLayout={loadLayout}
                onRenameLayout={renameLayout}
                onDeleteLayout={deleteLayout}
              />
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <UniversalTable
          data={filteredTasks}
          columns={visibleColumns}
          enableSelection={true}
          onSelectionChange={(items) => setSelectedTasks(items as Task[])}
          onRowClick={handleEdit}
        />
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo Task</DialogTitle>
          </DialogHeader>
          <TaskFormContainer
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            editingTask={null}
            onSuccess={() => {
              setShowCreateDialog(false);
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Dettagli</TabsTrigger>
                <TabsTrigger value="messages">Messaggi</TabsTrigger>
                <TabsTrigger value="history">Cronologia</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <TaskFormContainer
                  open={showEditDialog}
                  onOpenChange={setShowEditDialog}
                  editingTask={editingTask}
                  onSuccess={() => {
                    setShowEditDialog(false);
                    setEditingTask(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                  }}
                />
              </TabsContent>
              <TabsContent value="messages">
                <MessageHistory tableName="tasks" recordId={editingTask.id} />
              </TabsContent>
              <TabsContent value="history">
                <AuditHistory tableName="tasks" recordId={editingTask.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialogs */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il task "{editingTask?.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => editingTask && deleteMutation.mutate(editingTask.id)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione multipla</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedTasks.length} task selezionati?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(selectedTasks)}>
              Elimina tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Edit/Copy Dialogs */}
      <BulkEditDialog
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
        title="Modifica Task Selezionati"
        description={`Stai modificando ${selectedTasks.length} task. I campi non modificati rimarranno invariati.`}
        fields={bulkEditFields}
        selectedCount={selectedTasks.length}
        onSave={(updates) => bulkEditMutation.mutate({ tasksToEdit: selectedTasks, updates })}
        isPending={bulkEditMutation.isPending}
      />

      <BulkCopyDialog
        open={showBulkCopyDialog}
        onOpenChange={setShowBulkCopyDialog}
        title="Copia Task Selezionati"
        description={`Stai copiando ${selectedTasks.length} task.`}
        selectedCount={selectedTasks.length}
        onCopy={({ addSuffix, suffix }) => bulkCopyMutation.mutate({ tasksToCopy: selectedTasks, addSuffix, suffix })}
        isPending={bulkCopyMutation.isPending}
      />

      {/* AI Dialog */}
      {selectedTasks.length > 0 && (
        <ThuAiDialog
          open={showThuAiDialog}
          onOpenChange={setShowThuAiDialog}
          selectedTasks={selectedTasks}
        />
      )}
    </div>
  );
}
