import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useToast } from "@/hooks/use-toast";
import { 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Handshake,
  Calendar,
  FileText,
  TrendingUp,
  Clock,
  Play,
  Square,
  Settings,
  GripVertical,
  LayoutGrid,
  ListTodo,
  Timer,
  Briefcase,
  X,
  Plus
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

type WidgetType = 
  | "stats" 
  | "task-list" 
  | "quick-links" 
  | "recent-projects" 
  | "active-timer"
  | "empty";

interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  size: "small" | "medium" | "large";
}

interface DashboardLayout {
  widgets: WidgetConfig[];
}

const WIDGET_OPTIONS: { type: WidgetType; label: string; icon: any; description: string }[] = [
  { type: "stats", label: "Statistiche", icon: TrendingUp, description: "Panoramica numeri principali" },
  { type: "task-list", label: "Lista Task", icon: ListTodo, description: "Task con pulsanti Start/Stop" },
  { type: "quick-links", label: "Accesso Rapido", icon: LayoutGrid, description: "Link veloci alle sezioni" },
  { type: "recent-projects", label: "Progetti Recenti", icon: Briefcase, description: "Ultimi progetti attivi" },
  { type: "active-timer", label: "Timer Attivo", icon: Timer, description: "Timer corrente in evidenza" },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { id: "1", type: "stats", title: "Statistiche", size: "large" },
    { id: "2", type: "task-list", title: "I Miei Task", size: "large" },
    { id: "3", type: "quick-links", title: "Accesso Rapido", size: "medium" },
    { id: "4", type: "active-timer", title: "Timer Attivo", size: "medium" },
  ],
};

function StatsWidget() {
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

  const stats = {
    activeProjects: projects?.filter((p: any) => p.status === "active" || p.status === "in_progress")?.length || 0,
    totalProjects: projects?.length || 0,
    pendingTasks: tasks?.filter((t: any) => t.status === "todo" || t.status === "in_progress")?.length || 0,
    totalTasks: tasks?.length || 0,
    partners: partners?.length || 0,
    deals: deals?.length || 0,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <span className="text-xs text-muted-foreground">Progetti Attivi</span>
        </div>
        <div className="text-2xl font-bold mt-1">{stats.activeProjects}</div>
        <div className="text-xs text-muted-foreground">su {stats.totalProjects}</div>
      </div>
      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-green-500" />
          <span className="text-xs text-muted-foreground">Task Aperti</span>
        </div>
        <div className="text-2xl font-bold mt-1">{stats.pendingTasks}</div>
        <div className="text-xs text-muted-foreground">su {stats.totalTasks}</div>
      </div>
      <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-500" />
          <span className="text-xs text-muted-foreground">Partner</span>
        </div>
        <div className="text-2xl font-bold mt-1">{stats.partners}</div>
      </div>
      <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-orange-500" />
          <span className="text-xs text-muted-foreground">Deals</span>
        </div>
        <div className="text-2xl font-bold mt-1">{stats.deals}</div>
      </div>
    </div>
  );
}

function TaskListWidget() {
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();

  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 2000,
  });

  const startTimer = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("POST", "/api/time-entries", { taskId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Timer avviato" });
    },
  });

  const stopTimer = useMutation({
    mutationFn: async (entryId: string) => {
      return apiRequest("POST", `/api/time-entries/${entryId}/stop`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Timer fermato" });
    },
  });

  const activeTasks = tasks
    ?.filter((t: any) => t.status === "todo" || t.status === "in_progress")
    ?.slice(0, 8) || [];

  if (isLoading) {
    return <div className="text-center py-4 text-muted-foreground">Caricamento...</div>;
  }

  if (activeTasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nessun task attivo</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[280px]">
      <div className="space-y-2 pr-2">
        {activeTasks.map((task: any) => {
          const isRunning = runningEntry?.taskId === task.id;
          
          return (
            <div 
              key={task.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                isRunning ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{task.title}</span>
                  {task.priority === "high" && (
                    <Badge variant="destructive" className="text-[10px] px-1 py-0">Alta</Badge>
                  )}
                </div>
                {task.projectName && (
                  <div className="text-xs text-muted-foreground truncate">{task.projectName}</div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {task.completionPercentage > 0 && (
                  <span className="text-xs text-muted-foreground">{task.completionPercentage}%</span>
                )}
                
                {isRunning ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 w-8 p-0"
                    onClick={() => stopTimer.mutate(runningEntry.id)}
                    disabled={stopTimer.isPending}
                    data-testid={`button-stop-${task.id}`}
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => startTimer.mutate(task.id)}
                    disabled={startTimer.isPending || !!runningEntry}
                    data-testid={`button-start-${task.id}`}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function QuickLinksWidget() {
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

  const quickLinks = [
    { title: "Progetti", icon: FolderKanban, href: "/projects", count: projects?.length, color: "text-blue-500" },
    { title: "Task", icon: CheckSquare, href: "/tasks", count: tasks?.length, color: "text-green-500" },
    { title: "Calendario", icon: Calendar, href: "/calendar", color: "text-red-500" },
    { title: "Preventivi", icon: FileText, href: "/quotes", color: "text-teal-500" },
    { title: "Ore", icon: Clock, href: "/time-entries", color: "text-amber-500" },
    { title: "Partner", icon: Users, href: "/partners", color: "text-purple-500" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {quickLinks.map((link) => (
        <Link key={link.href} href={link.href}>
          <div className="flex flex-col items-center justify-center p-3 rounded-lg border hover:bg-muted/50 hover:border-primary/50 transition-colors cursor-pointer">
            <link.icon className={`h-5 w-5 ${link.color} mb-1`} />
            <span className="text-xs font-medium">{link.title}</span>
            {link.count !== undefined && (
              <span className="text-[10px] text-muted-foreground">{link.count}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function RecentProjectsWidget() {
  const { currentOrganizationId } = useOrganization();
  
  const { data: projects, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const recentProjects = projects
    ?.filter((p: any) => p.status === "active" || p.status === "in_progress")
    ?.slice(0, 5) || [];

  if (isLoading) {
    return <div className="text-center py-4 text-muted-foreground">Caricamento...</div>;
  }

  if (recentProjects.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nessun progetto attivo</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recentProjects.map((project: any) => (
        <Link key={project.id} href={`/projects`}>
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
            <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FolderKanban className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{project.name}</div>
              <div className="text-xs text-muted-foreground">
                {project.status === "active" ? "Attivo" : project.status}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ActiveTimerWidget() {
  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 1000,
  });

  const { toast } = useToast();

  const stopTimer = useMutation({
    mutationFn: async (entryId: string) => {
      return apiRequest("POST", `/api/time-entries/${entryId}/stop`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
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
      <div className="text-center py-6 text-muted-foreground">
        <Timer className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nessun timer attivo</p>
        <p className="text-xs mt-1">Avvia un timer dalla lista task</p>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <div className="text-4xl font-mono font-bold text-green-600 dark:text-green-400 mb-2">
        {formatTime(elapsed)}
      </div>
      <div className="font-medium text-sm mb-1 truncate px-2">{runningEntry.taskTitle}</div>
      {runningEntry.projectName && (
        <div className="text-xs text-muted-foreground mb-3">{runningEntry.projectName}</div>
      )}
      <Button
        size="sm"
        variant="destructive"
        onClick={() => stopTimer.mutate(runningEntry.id)}
        disabled={stopTimer.isPending}
        data-testid="button-stop-timer"
      >
        <Square className="h-3 w-3 mr-1" />
        Stop
      </Button>
    </div>
  );
}

function WidgetContainer({ 
  config, 
  onRemove, 
  onChangeType,
  isConfiguring 
}: { 
  config: WidgetConfig; 
  onRemove: () => void;
  onChangeType: (type: WidgetType) => void;
  isConfiguring: boolean;
}) {
  const renderWidget = () => {
    switch (config.type) {
      case "stats":
        return <StatsWidget />;
      case "task-list":
        return <TaskListWidget />;
      case "quick-links":
        return <QuickLinksWidget />;
      case "recent-projects":
        return <RecentProjectsWidget />;
      case "active-timer":
        return <ActiveTimerWidget />;
      case "empty":
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Slot vuoto</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className={`h-full ${isConfiguring ? "ring-2 ring-primary/50" : ""}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {isConfiguring && <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />}
          {config.title}
        </CardTitle>
        {isConfiguring && (
          <div className="flex items-center gap-1">
            <Select value={config.type} onValueChange={(v) => onChangeType(v as WidgetType)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_OPTIONS.map((opt) => (
                  <SelectItem key={opt.type} value={opt.type}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-3 w-3" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="empty">
                  <div className="flex items-center gap-2">
                    <X className="h-3 w-3" />
                    Vuoto
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {renderWidget()}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { currentOrganization } = useOrganization();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  // Load layout from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("dashboard-layout");
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
    localStorage.setItem("dashboard-layout", JSON.stringify(newLayout));
  };

  const handleChangeWidgetType = (widgetId: string, newType: WidgetType) => {
    const newWidgets = layout.widgets.map((w) =>
      w.id === widgetId
        ? { ...w, type: newType, title: WIDGET_OPTIONS.find((o) => o.type === newType)?.label || "Widget" }
        : w
    );
    saveLayout({ widgets: newWidgets });
  };

  const handleRemoveWidget = (widgetId: string) => {
    const newWidgets = layout.widgets.filter((w) => w.id !== widgetId);
    saveLayout({ widgets: newWidgets });
  };

  const handleAddWidget = () => {
    const newWidget: WidgetConfig = {
      id: `widget-${Date.now()}`,
      type: "empty",
      title: "Nuovo Widget",
      size: "medium",
    };
    saveLayout({ widgets: [...layout.widgets, newWidget] });
  };

  const handleResetLayout = () => {
    saveLayout(DEFAULT_LAYOUT);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Dashboard"
          subtitle={`Benvenuto in ${currentOrganization?.name || "THE HUB UP"}`}
        />
        <main 
          className="p-6 overflow-auto h-[calc(100vh-80px)]"
          style={{ 
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          {/* Config Bar */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" data-testid="text-welcome">
              La tua Dashboard
            </h2>
            <div className="flex items-center gap-2">
              {isConfiguring && (
                <>
                  <Button variant="outline" size="sm" onClick={handleAddWidget} data-testid="button-add-widget">
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetLayout} data-testid="button-reset-layout">
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

          {/* Widget Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {layout.widgets.map((widget) => (
              <div 
                key={widget.id}
                className={widget.size === "large" ? "lg:col-span-2" : ""}
              >
                <WidgetContainer
                  config={widget}
                  isConfiguring={isConfiguring}
                  onRemove={() => handleRemoveWidget(widget.id)}
                  onChangeType={(type) => handleChangeWidgetType(widget.id, type)}
                />
              </div>
            ))}
          </div>

          {layout.widgets.length === 0 && (
            <div className="text-center py-12">
              <LayoutGrid className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground mb-4">La dashboard è vuota</p>
              <Button onClick={handleAddWidget}>
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi Widget
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
