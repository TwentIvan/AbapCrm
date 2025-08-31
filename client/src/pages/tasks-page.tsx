import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckSquare, Calendar, AlertCircle, Clock, ChevronDown, ChevronRight, Edit, TrendingDown, BarChart3, Grid3X3, List, MoreHorizontal, Play, Square, Trash2, ExternalLink } from "lucide-react";
import type { Task, Project, TimeEntry } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import TaskForm from "@/components/forms/task-form";
import { TimeTracker } from "@/components/timesheet/time-tracker";
import { CompletionDialog } from "@/components/timesheet/completion-dialog";
import { useToast } from "@/hooks/use-toast";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const statusColors = {
  todo: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
};

const priorityColors = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800", 
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const statusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
};

// Compact Timer Buttons Component  
function TaskTimerButtons({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  
  // Get running entry globally
  const { data: runningEntry, error: runningEntryError } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: async () => {
      const res = await fetch("/api/time-entries/running", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch running entry');
      return res.json();
    },
    refetchInterval: 1000, // Refresh every second to get timer updates
  });

  // Get all time entries for this task to show total time
  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries/task", task.id],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries/task/${task.id}`, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch time entries');
      return res.json();
    },
  });


  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const requestData = {
        taskId: task.id,
        startTime: new Date().toISOString(),
        isRunning: true,
      };
      const res = await apiRequest("POST", "/api/time-entries", requestData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
      queryClient.refetchQueries({ queryKey: ["/api/time-entries/running"] });
    },
  });

  // Stop timer mutation
  const stopTimerMutation = useMutation({
    mutationFn: async ({ entryId, completionData }: { entryId: string; completionData?: { completionPercentage: number; notes?: string } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${entryId}/stop`);
      
      // Update task completion percentage if provided
      if (completionData) {
        await apiRequest("PUT", `/api/tasks/${task.id}`, {
          completionPercentage: completionData.completionPercentage,
        });
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/task", task.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCompletionDialog(false);
    },
  });

  // Update current time every second when timer is running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (runningEntry && runningEntry.taskId === task.id) {
      interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runningEntry, task.id]);

  const isCurrentTaskRunning = runningEntry && runningEntry.taskId === task.id;
  const hasRunningTimer = !!runningEntry;

  const handleStart = (e?: any) => {
    e?.stopPropagation(); // Prevent event bubbling
    startTimerMutation.mutate();
  };

  const handleStop = (e?: any) => {
    console.log('Stop clicked, opening completion dialog');
    console.log('Event details:', { 
      type: e?.type, 
      target: e?.target?.tagName,
      currentTarget: e?.currentTarget?.tagName,
      bubbles: e?.bubbles 
    });
    e?.stopPropagation(); // Prevent event bubbling
    e?.preventDefault(); // Also prevent default behavior
    if (runningEntry) {
      setShowCompletionDialog(true);
      console.log('Completion dialog should be open:', true);
    }
  };

  // Calculate elapsed time for display (total time including previous sessions)
  const getElapsedTime = () => {
    if (!isCurrentTaskRunning || !runningEntry) return "";
    
    // Get previous total time from completed time entries
    const previousTotal = timeEntries.reduce((total, entry) => {
      return total + (entry.duration || 0);
    }, 0);
    
    // Get current session time in minutes
    const startTime = new Date(runningEntry.startTime);
    const currentSessionMinutes = (currentTime.getTime() - startTime.getTime()) / (1000 * 60);
    
    // Total time = previous + current session
    const totalMinutes = previousTotal + currentSessionMinutes;
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = Math.floor(totalMinutes % 60);
    
    if (totalHours > 0) {
      return `${totalHours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
  };

  // Calculate suggested completion percentage 
  const calculateSuggestedPercentage = () => {
    if (!runningEntry) return task.completionPercentage || 0;

    const sessionStartTime = new Date(runningEntry.startTime);
    const sessionDuration = (currentTime.getTime() - sessionStartTime.getTime()) / (1000 * 60);
    const currentCompletion = task.completionPercentage || 0;
    
    // Simple practical approach: meaningful increments based on time worked
    let suggestedIncrease = 0;
    
    if (sessionDuration >= 15) { // 15+ minutes = significant work
      suggestedIncrease = Math.max(5, Math.min(15, sessionDuration / 4)); // 5-15% increase
    } else if (sessionDuration >= 5) { // 5-14 minutes = moderate work  
      suggestedIncrease = Math.max(2, sessionDuration / 2); // 2-7% increase
    } else { // Less than 5 minutes = small adjustment
      suggestedIncrease = 1; // 1% increase
    }
    
    return Math.min(100, Math.round(currentCompletion + suggestedIncrease));
  };

  const handleCompletionSubmit = (completionData: { completionPercentage: number; notes?: string }) => {
    if (runningEntry) {
      stopTimerMutation.mutate({ entryId: runningEntry.id, completionData });
    }
  };

  // Calculate total time tracked for this task
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getTotalTime = () => {
    const totalTime = timeEntries.reduce((total, entry) => {
      return total + (entry.duration || 0);
    }, 0);
    return formatDuration(totalTime);
  };


  return (
    <>
      <div className="flex items-center gap-1">
        {isCurrentTaskRunning ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStop}
              disabled={stopTimerMutation.isPending}
              data-testid={`button-stop-timer-${task.id}`}
              data-timer-button="true"
            >
              <Square className="h-3 w-3 mr-1" />
              {getElapsedTime()}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              onClick={handleStart}
              disabled={startTimerMutation.isPending || hasRunningTimer}
              data-testid={`button-start-timer-${task.id}`}
              data-timer-button="true"
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
            {timeEntries.length > 0 && (
              <span className="text-xs text-muted-foreground font-medium">
                {getTotalTime()}
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* Completion Dialog - Only render when needed */}
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

export default function TasksPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);

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
  const viewMode = layout.viewMode;

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const res = await apiRequest("PUT", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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

  const handleLaunchConnections = async (task: Task) => {
    if (!task.sapSystemId) {
      toast({ 
        title: "Sistema SAP non configurato", 
        description: "Questo task non ha un sistema SAP collegato",
        variant: "destructive" 
      });
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${task.id}/connection-info`, {
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error('Failed to get connection info');
      }

      const connectionInfo = await response.json();
      
      // Generate VPN connection command/URL
      const vpnInfo = connectionInfo.vpnSystem;
      const vpnSoftwareInfo = connectionInfo.vpnSoftware;
      const sapInfo = connectionInfo.sapSystem;
      
      let message = `Connessioni per: ${task.title}\n\n`;
      
      if (vpnInfo && vpnSoftwareInfo) {
        message += `🔐 VPN: ${vpnInfo.name}\n`;
        message += `   Server: ${vpnInfo.serverAddress}:${vpnInfo.serverPort}\n`;
        message += `   Software: ${vpnSoftwareInfo.name} (${vpnSoftwareInfo.vendor})\n\n`;
      }
      
      if (sapInfo) {
        message += `🖥️ SAP: ${sapInfo.name}\n`;
        message += `   Host: ${sapInfo.host}:${sapInfo.port}\n`;
        message += `   Client: ${sapInfo.client} | SID: ${sapInfo.sid}\n`;
        message += `   Versione: ${sapInfo.version}\n\n`;
      }
      
      if (connectionInfo.sapCredentials) {
        message += `👤 Utente SAP: ${connectionInfo.sapCredentials.username}\n`;
      }
      
      message += `\n⚡ Per completare la connessione:\n`;
      message += `1. Avvia ${vpnSoftwareInfo?.name || 'VPN'} e connettiti a ${vpnInfo?.name || 'il server'}\n`;
      message += `2. Apri SAP GUI e connettiti a ${sapInfo?.name || 'il sistema SAP'}\n`;
      message += `3. Usa le credenziali fornite per l'accesso`;

      // Show connection info in a simple alert for now
      // In future, this could open actual VPN client and SAP GUI
      alert(message);
      
      toast({ 
        title: "Informazioni connessione", 
        description: "Controlla i dettagli per completare la connessione" 
      });

    } catch (error) {
      console.error('Error launching connections:', error);
      toast({ 
        title: "Errore", 
        description: "Impossibile ottenere le informazioni di connessione",
        variant: "destructive" 
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
    { id: 'status', label: 'Status', type: 'select' as const, options: [
      { value: 'todo', label: 'To Do' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'review', label: 'Review' },
      { value: 'completed', label: 'Completed' },
    ]},
    { id: 'priority', label: 'Priorità', type: 'select' as const, options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'urgent', label: 'Urgent' },
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
      key: 'completed',
      label: '',
      sortable: false,
      searchable: false,
      render: (task: Task) => (
        <Checkbox
          checked={task.status === 'completed'}
          onCheckedChange={() => toggleTaskComplete(task)}
          data-testid={`checkbox-task-${task.id}`}
        />
      ),
    },
    {
      key: 'title',
      label: 'Title',
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
      label: 'Status',
      sortable: true,
      searchable: true,
      render: (task: Task) => (
        <Badge className={statusColors[task.status as keyof typeof statusColors]} data-testid={`badge-task-status-${task.id}`}>
          {statusLabels[task.status as keyof typeof statusLabels]}
        </Badge>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      searchable: true,
      render: (task: Task) => (
        <Badge className={priorityColors[task.priority as keyof typeof priorityColors]} data-testid={`badge-task-priority-${task.id}`}>
          {task.priority}
        </Badge>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      sortable: false,
      searchable: true,
      render: (task: Task) => task.description ? (
        <div className="text-sm max-w-xs truncate" title={task.description}>
          {task.description}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">No description</span>
      ),
    },
    {
      key: 'projectId',
      label: 'Project',
      sortable: true,
      searchable: true,
      render: (task: any) => task.projectName ? (
        <div className="text-sm font-medium" data-testid={`text-task-project-${task.id}`}>
          {task.projectName}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">No project</span>
      ),
    },
    {
      key: 'dueDate',
      label: 'Due Date',
      sortable: true,
      searchable: false,
      render: (task: Task) => {
        if (!task.dueDate) return <span className="text-muted-foreground text-sm">No due date</span>;
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < new Date() && task.status !== 'completed';
        return (
          <div className={isOverdue ? 'text-red-600 font-medium' : ''}>
            {dueDate.toLocaleDateString()}
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
      label: 'Actions',
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
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

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
          subtitle="Manage your project tasks and deliverables"
          onNewClick={() => setShowCreateDialog(true)}
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
              <div className="space-y-4">
                {[...Array(8)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-6 w-20" />
                      </div>
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
          ) : tasks?.length === 0 ? (
            <div className="text-center py-12">
              <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No tasks yet</h3>
              <p className="text-muted-foreground mb-4">Create your first task to start organizing your work</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-task">
                Create Task
              </Button>
            </div>
          ) : viewMode === 'list' ? (
            <UniversalTable
              data={tasks || []}
              columns={tableColumns}
              enableSelection={true}
              enableSearch={true}
              searchPlaceholder="Cerca tasks..."
              onSelectionChange={(rows) => setSelectedTasks(rows as Task[])}
              onRowClick={handleEdit}
              bulkActions={[
                {
                  label: "Elimina Selezionati",
                  icon: Trash2,
                  variant: "destructive",
                  onClick: () => handleDelete(selectedTasks)
                }
              ]}
            />
          ) : (
            <div className="space-y-4">
              {tasks?.map((task) => (
                <Card 
                  key={task.id} 
                  className={`transition-all hover:shadow-md ${
                    task.status === "completed" ? "opacity-75" : ""
                  }`}
                  data-testid={`card-task-${task.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => toggleTaskComplete(task)}
                        className="mt-1"
                        data-testid={`checkbox-task-${task.id}`}
                      />
                      
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between">
                          <h3 
                            className={`font-medium ${
                              task.status === "completed" 
                                ? "line-through text-muted-foreground" 
                                : "text-foreground"
                            }`}
                            data-testid={`text-task-title-${task.id}`}
                          >
                            {task.title}
                          </h3>
                          
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTask(task)}
                              data-testid={`button-edit-task-${task.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {console.log(`Task ${task.title} - sapSystemId:`, task.sapSystemId)}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => alert(`Test button for task: ${task.title}`)}
                              data-testid={`button-test-${task.id}`}
                              className="bg-red-500 text-white px-4 py-2"
                              style={{ backgroundColor: 'red', color: 'white', fontSize: '16px' }}
                            >
                              🔴 TEST BUTTON
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTaskExpanded(task.id)}
                              data-testid={`button-toggle-timer-${task.id}`}
                            >
                              <Clock className="h-4 w-4 mr-1" />
                              Timer
                              {expandedTasks.has(task.id) ? (
                                <ChevronDown className="h-3 w-3 ml-1" />
                              ) : (
                                <ChevronRight className="h-3 w-3 ml-1" />
                              )}
                            </Button>
                            <Badge 
                              className={priorityColors[task.priority]}
                              data-testid={`badge-task-priority-${task.id}`}
                            >
                              {task.priority}
                            </Badge>
                            <Badge 
                              className={statusColors[task.status]}
                              data-testid={`badge-task-status-${task.id}`}
                            >
                              {statusLabels[task.status]}
                            </Badge>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p 
                            className={`text-sm ${
                              task.status === "completed" 
                                ? "text-muted-foreground" 
                                : "text-muted-foreground"
                            }`}
                            data-testid={`text-task-description-${task.id}`}
                          >
                            {task.description}
                          </p>
                        )}
                        
                        {/* Task Time Information */}
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          {task.estimatedEffort && (
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{task.estimatedEffort}h estimated</span>
                            </div>
                          )}
                          
                          {task.remainingEffort !== null && task.remainingEffort > 0 && task.completionPercentage > 0 && (
                            <div className="flex items-center space-x-1">
                              <TrendingDown className="h-3 w-3" />
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                {Math.round((task.remainingEffort / 60) * 10) / 10}h remaining
                              </span>
                            </div>
                          )}
                          
                          {task.completionPercentage > 0 && (
                            <div className="flex items-center space-x-1">
                              <BarChart3 className="h-3 w-3" />
                              <span>{task.completionPercentage}% complete</span>
                            </div>
                          )}
                        </div>
                        
                        {task.dueDate && (
                          <div className="flex items-center space-x-1">
                            {isOverdue(task.dueDate) && task.status !== "completed" ? (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span 
                              className={`text-xs ${
                                isOverdue(task.dueDate) && task.status !== "completed"
                                  ? "text-red-600 font-medium"
                                  : "text-muted-foreground"
                              }`}
                              data-testid={`text-task-due-date-${task.id}`}
                            >
                              Due: {new Date(task.dueDate).toLocaleDateString()}
                              {isOverdue(task.dueDate) && task.status !== "completed" && " (Overdue)"}
                            </span>
                          </div>
                        )}
                        
                        {/* Time Tracker Collapsible */}
                        {expandedTasks.has(task.id) && (
                          <div className="mt-4 pt-4 border-t border-border">
                            <TimeTracker task={task} />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          <TaskForm onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm 
              task={editingTask} 
              onSuccess={handleCloseEditDialog} 
            />
          )}
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {selectedTasks.length} tasks selezionati? 
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete}>
              Elimina {selectedTasks.length} Tasks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table Configuration Dialog */}
      <TableConfiguration
        tableId="tasks"
        availableColumns={[
          { id: 'title', label: 'Title' },
          { id: 'status', label: 'Status' },
          { id: 'priority', label: 'Priority' },
          { id: 'projectId', label: 'Project' },
          { id: 'assigneeId', label: 'Assignee' },
          { id: 'dueDate', label: 'Due Date' },
          { id: 'estimatedEffort', label: 'Estimated Effort' },
          { id: 'timeTracker', label: 'Timer' },
          { id: 'actions', label: 'Actions' },
        ]}
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
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
