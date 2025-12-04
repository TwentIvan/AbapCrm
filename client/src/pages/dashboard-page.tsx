import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useToast } from "@/hooks/use-toast";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { CompletionDialog } from "@/components/timesheet/completion-dialog";
import type { Task, TimeEntry } from "@shared/schema";
import { 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Handshake,
  Calendar,
  TrendingUp,
  Clock,
  Play,
  Square,
  Settings,
  LayoutGrid,
  Timer,
  Briefcase,
  X,
  GripVertical,
  PanelLeftClose,
  PanelLeft,
  MoreVertical
} from "lucide-react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PanelContent = "tasks" | "stats" | "timer" | "projects" | "empty";

interface PanelConfig {
  id: string;
  content: PanelContent;
  title: string;
}

interface DashboardLayout {
  panels: PanelConfig[];
  direction: "horizontal" | "vertical";
}

const PANEL_OPTIONS: { value: PanelContent; label: string; icon: any }[] = [
  { value: "tasks", label: "Lista Task", icon: CheckSquare },
  { value: "stats", label: "Statistiche", icon: TrendingUp },
  { value: "timer", label: "Timer Attivo", icon: Timer },
  { value: "projects", label: "Progetti", icon: Briefcase },
  { value: "empty", label: "Vuoto", icon: X },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  panels: [
    { id: "1", content: "tasks", title: "I Miei Task" },
    { id: "2", content: "timer", title: "Timer" },
  ],
  direction: "horizontal",
};

// ===== EMBEDDED TASK TABLE =====
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

function TaskTimerButton({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  
  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 1000,
  });

  const startTimer = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/time-entries", { taskId: task.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Timer avviato" });
    },
  });

  const stopTimer = useMutation({
    mutationFn: async ({ completionData }: { completionData?: { completionPercentage: number } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${runningEntry.id}/stop`, {});
      if (completionData) {
        await apiRequest("PUT", `/api/tasks/${task.id}`, {
          completionPercentage: completionData.completionPercentage,
        });
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCompletionDialog(false);
      toast({ title: "Timer fermato" });
    },
  });

  const isRunning = runningEntry?.taskId === task.id;
  const hasOtherRunning = runningEntry && runningEntry.taskId !== task.id;

  const handleStopClick = () => {
    setShowCompletionDialog(true);
  };

  const handleConfirmStop = (percentage: number) => {
    stopTimer.mutate({ completionData: { completionPercentage: percentage } });
  };

  return (
    <>
      {isRunning ? (
        <Button
          size="sm"
          variant="destructive"
          className="h-7 w-7 p-0"
          onClick={handleStopClick}
          disabled={stopTimer.isPending}
          data-testid={`button-stop-${task.id}`}
        >
          <Square className="h-3 w-3" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0"
          onClick={() => startTimer.mutate()}
          disabled={startTimer.isPending || hasOtherRunning}
          data-testid={`button-start-${task.id}`}
        >
          <Play className="h-3 w-3" />
        </Button>
      )}
      
      <CompletionDialog
        isOpen={showCompletionDialog}
        onClose={() => setShowCompletionDialog(false)}
        currentPercentage={task.completionPercentage || 0}
        onSubmit={(data) => handleConfirmStop(data.completionPercentage)}
        isLoading={stopTimer.isPending}
      />
    </>
  );
}

function EmbeddedTasksPanel() {
  const { currentOrganizationId } = useOrganization();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: tasks, isLoading } = useQuery<(Task & { projectName?: string })[]>({
    queryKey: ["/api/tasks", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 2000,
  });

  // Filter active tasks only
  const activeTasks = useMemo(() => {
    return tasks?.filter(t => t.status === "todo" || t.status === "in_progress") || [];
  }, [tasks]);

  const columns = useMemo(() => [
    {
      key: "title",
      header: "Task",
      cell: (task: Task) => (
        <div className="max-w-[300px]">
          <div className="font-medium text-sm truncate">{task.title}</div>
          {task.projectName && (
            <div className="text-xs text-muted-foreground truncate">{task.projectName}</div>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      key: "status",
      header: "Stato",
      cell: (task: Task) => (
        <Badge className={`text-xs ${statusColors[task.status] || ""}`}>
          {statusLabels[task.status] || task.status}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: "priority",
      header: "Priorità",
      cell: (task: Task) => (
        <Badge className={`text-xs ${priorityColors[task.priority] || ""}`}>
          {priorityLabels[task.priority] || task.priority}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: "completionPercentage",
      header: "%",
      cell: (task: Task) => (
        <div className="text-sm text-center">{task.completionPercentage || 0}%</div>
      ),
      sortable: true,
    },
    {
      key: "timer",
      header: "Timer",
      cell: (task: Task) => {
        const isRunning = runningEntry?.taskId === task.id;
        return (
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                ● REC
              </span>
            )}
            <TaskTimerButton task={task} />
          </div>
        );
      },
    },
  ], [runningEntry]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Caricamento...</div>;
  }

  if (activeTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <CheckSquare className="h-12 w-12 mb-2 opacity-30" />
        <p>Nessun task attivo</p>
        <Link href="/tasks">
          <Button variant="link" size="sm">Vai ai Task</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 border-b">
        <span className="text-xs text-muted-foreground">{activeTasks.length} task attivi</span>
        <Link href="/tasks">
          <Button variant="ghost" size="sm" className="h-6 text-xs">
            Apri pagina completa
          </Button>
        </Link>
      </div>
      <ScrollArea className="flex-1">
        <UniversalTable
          data={activeTasks}
          columns={columns}
          enableSelection={false}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          compact={true}
        />
      </ScrollArea>
    </div>
  );
}

// ===== STATS PANEL =====
function StatsPanel() {
  const { currentOrganizationId } = useOrganization();
  
  const { data: projects } = useQuery<any[]>({
    queryKey: ["/api/projects", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: tasks } = useQuery<any[]>({
    queryKey: ["/api/tasks", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: partners } = useQuery<any[]>({
    queryKey: ["/api/partners", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: deals } = useQuery<any[]>({
    queryKey: ["/api/deals", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const stats = [
    { 
      label: "Progetti Attivi", 
      value: projects?.filter((p: any) => p.status === "active" || p.status === "in_progress")?.length || 0,
      total: projects?.length || 0,
      icon: FolderKanban,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/30"
    },
    { 
      label: "Task Aperti", 
      value: tasks?.filter((t: any) => t.status === "todo" || t.status === "in_progress")?.length || 0,
      total: tasks?.length || 0,
      icon: CheckSquare,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-950/30"
    },
    { 
      label: "Partner", 
      value: partners?.length || 0,
      icon: Users,
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-950/30"
    },
    { 
      label: "Deals", 
      value: deals?.length || 0,
      icon: Handshake,
      color: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-950/30"
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 p-3 h-full content-start">
      {stats.map((stat) => (
        <div key={stat.label} className={`${stat.bg} rounded-lg p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
            <span className="text-sm text-muted-foreground">{stat.label}</span>
          </div>
          <div className="text-3xl font-bold">{stat.value}</div>
          {stat.total !== undefined && (
            <div className="text-xs text-muted-foreground">su {stat.total} totali</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== TIMER PANEL =====
function TimerPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 1000,
  });

  const stopTimer = useMutation({
    mutationFn: async ({ completionData }: { completionData?: { completionPercentage: number } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${runningEntry.id}/stop`, {});
      if (completionData && runningEntry.taskId) {
        await apiRequest("PUT", `/api/tasks/${runningEntry.taskId}`, {
          completionPercentage: completionData.completionPercentage,
        });
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCompletionDialog(false);
      toast({ title: "Timer fermato" });
    },
  });

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!runningEntry?.startTime) {
      setElapsed(0);
      return;
    }
    const updateElapsed = () => {
      const start = new Date(runningEntry.startTime).getTime();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [runningEntry?.startTime]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!runningEntry) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Timer className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg">Nessun timer attivo</p>
        <p className="text-sm mt-1">Avvia un timer dalla lista task</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <div className="text-6xl font-mono font-bold text-green-600 dark:text-green-400 mb-4">
        {formatTime(elapsed)}
      </div>
      <div className="text-lg font-medium mb-1 text-center px-4 truncate max-w-full">
        {runningEntry.taskTitle}
      </div>
      {runningEntry.projectName && (
        <div className="text-sm text-muted-foreground mb-6">{runningEntry.projectName}</div>
      )}
      <Button
        size="lg"
        variant="destructive"
        onClick={() => setShowCompletionDialog(true)}
        disabled={stopTimer.isPending}
        data-testid="button-stop-timer"
      >
        <Square className="h-4 w-4 mr-2" />
        Ferma Timer
      </Button>
      
      <CompletionDialog
        isOpen={showCompletionDialog}
        onClose={() => setShowCompletionDialog(false)}
        currentPercentage={runningEntry.taskCompletionPercentage || 0}
        onSubmit={(data) => stopTimer.mutate({ completionData: { completionPercentage: data.completionPercentage } })}
        isLoading={stopTimer.isPending}
      />
    </div>
  );
}

// ===== PROJECTS PANEL =====
function ProjectsPanel() {
  const { currentOrganizationId } = useOrganization();
  
  const { data: projects, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const activeProjects = projects?.filter((p: any) => 
    p.status === "active" || p.status === "in_progress"
  )?.slice(0, 10) || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Caricamento...</div>;
  }

  if (activeProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FolderKanban className="h-12 w-12 mb-2 opacity-30" />
        <p>Nessun progetto attivo</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2">
        {activeProjects.map((project: any) => (
          <Link key={project.id} href={`/projects`}>
            <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <FolderKanban className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{project.name}</div>
                <div className="text-xs text-muted-foreground">
                  {project.status === "active" ? "Attivo" : project.status}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </ScrollArea>
  );
}

// ===== PANEL WRAPPER =====
function PanelWrapper({ 
  config, 
  onChangeContent,
  isConfiguring 
}: { 
  config: PanelConfig;
  onChangeContent: (content: PanelContent) => void;
  isConfiguring: boolean;
}) {
  const renderContent = () => {
    switch (config.content) {
      case "tasks":
        return <EmbeddedTasksPanel />;
      case "stats":
        return <StatsPanel />;
      case "timer":
        return <TimerPanel />;
      case "projects":
        return <ProjectsPanel />;
      case "empty":
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Pannello vuoto</p>
          </div>
        );
    }
  };

  const currentOption = PANEL_OPTIONS.find(o => o.value === config.content);

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {currentOption && <currentOption.icon className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-sm">{config.title}</span>
        </div>
        {isConfiguring && (
          <Select value={config.content} onValueChange={(v) => onChangeContent(v as PanelContent)}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PANEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <opt.icon className="h-3 w-3" />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

// ===== MAIN DASHBOARD =====
export default function DashboardPage() {
  const { currentOrganization } = useOrganization();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  // Load layout from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("dashboard-layout-v2");
    if (saved) {
      try {
        setLayout(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse dashboard layout", e);
      }
    }
  }, []);

  // Save layout to localStorage
  const saveLayout = (newLayout: DashboardLayout) => {
    setLayout(newLayout);
    localStorage.setItem("dashboard-layout-v2", JSON.stringify(newLayout));
  };

  const handleChangeContent = (panelId: string, content: PanelContent) => {
    const newPanels = layout.panels.map((p) =>
      p.id === panelId
        ? { ...p, content, title: PANEL_OPTIONS.find((o) => o.value === content)?.label || "Pannello" }
        : p
    );
    saveLayout({ ...layout, panels: newPanels });
  };

  const handleAddPanel = () => {
    if (layout.panels.length >= 4) return;
    const newPanel: PanelConfig = {
      id: `panel-${Date.now()}`,
      content: "empty",
      title: "Nuovo Pannello",
    };
    saveLayout({ ...layout, panels: [...layout.panels, newPanel] });
  };

  const handleRemovePanel = (panelId: string) => {
    if (layout.panels.length <= 1) return;
    saveLayout({ ...layout, panels: layout.panels.filter((p) => p.id !== panelId) });
  };

  const handleToggleDirection = () => {
    saveLayout({ 
      ...layout, 
      direction: layout.direction === "horizontal" ? "vertical" : "horizontal" 
    });
  };

  const handleResetLayout = () => {
    saveLayout(DEFAULT_LAYOUT);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden flex flex-col">
        <Header 
          title="Dashboard"
          subtitle={`${currentOrganization?.name || "THE HUB UP"}`}
        />
        
        {/* Config Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {isConfiguring ? "Trascina i bordi per ridimensionare i pannelli" : "La tua dashboard personalizzata"}
          </div>
          <div className="flex items-center gap-2">
            {isConfiguring && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleToggleDirection}
                  data-testid="button-toggle-direction"
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  {layout.direction === "horizontal" ? "Verticale" : "Orizzontale"}
                </Button>
                {layout.panels.length < 4 && (
                  <Button variant="outline" size="sm" onClick={handleAddPanel} data-testid="button-add-panel">
                    + Aggiungi
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleResetLayout} data-testid="button-reset">
                  Ripristina
                </Button>
              </>
            )}
            <Button
              variant={isConfiguring ? "default" : "outline"}
              size="sm"
              onClick={() => setIsConfiguring(!isConfiguring)}
              data-testid="button-configure"
            >
              <Settings className="h-4 w-4 mr-1" />
              {isConfiguring ? "Fine" : "Configura"}
            </Button>
          </div>
        </div>

        {/* Resizable Panels */}
        <div className="flex-1 p-4 overflow-hidden">
          <ResizablePanelGroup 
            direction={layout.direction} 
            className="h-full rounded-lg"
          >
            {layout.panels.map((panel, index) => (
              <div key={panel.id} className="contents">
                {index > 0 && <ResizableHandle withHandle className="mx-1" />}
                <ResizablePanel defaultSize={100 / layout.panels.length} minSize={20}>
                  <div className="h-full relative">
                    <PanelWrapper
                      config={panel}
                      onChangeContent={(content) => handleChangeContent(panel.id, content)}
                      isConfiguring={isConfiguring}
                    />
                    {isConfiguring && layout.panels.length > 1 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 h-6 w-6 p-0 z-10"
                        onClick={() => handleRemovePanel(panel.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </ResizablePanel>
              </div>
            ))}
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
