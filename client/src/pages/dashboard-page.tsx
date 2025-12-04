import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
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
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { EmbeddedTasksList } from "@/components/embedded/embedded-tasks-list";
import { 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Handshake,
  TrendingUp,
  Clock,
  Settings,
  LayoutGrid,
  Timer,
  Briefcase,
  X,
  Plus,
  ListTodo
} from "lucide-react";
import { Link } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";

type PanelContent = "tasks" | "tasks-active" | "stats" | "timer" | "projects" | "empty";

interface PanelConfig {
  id: string;
  content: PanelContent;
  title: string;
}

interface DashboardLayout {
  panels: PanelConfig[];
  direction: "horizontal" | "vertical";
}

const PANEL_OPTIONS: { value: PanelContent; label: string; icon: any; description: string }[] = [
  { value: "tasks", label: "Lista Task (completa)", icon: ListTodo, description: "Tutti i task con tutte le funzionalità" },
  { value: "tasks-active", label: "Task Attivi", icon: CheckSquare, description: "Solo task da fare e in corso" },
  { value: "stats", label: "Statistiche", icon: TrendingUp, description: "Panoramica numeri" },
  { value: "timer", label: "Timer Attivo", icon: Timer, description: "Timer corrente" },
  { value: "projects", label: "Progetti", icon: Briefcase, description: "Progetti attivi" },
  { value: "empty", label: "Vuoto", icon: X, description: "Pannello vuoto" },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  panels: [
    { id: "1", content: "tasks-active", title: "Task Attivi" },
    { id: "2", content: "timer", title: "Timer" },
  ],
  direction: "horizontal",
};

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

function TimerPanel() {
  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 1000,
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
        <div className="text-sm text-muted-foreground">{runningEntry.projectName}</div>
      )}
    </div>
  );
}

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
          <Link key={project.id} href="/projects">
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
        return (
          <EmbeddedTasksList 
            layoutKey={`dashboard_tasks_${config.id}`}
            showToolbar={true}
            showLayoutManager={true}
          />
        );
      case "tasks-active":
        return (
          <EmbeddedTasksList 
            layoutKey={`dashboard_tasks_active_${config.id}`}
            showToolbar={true}
            showLayoutManager={true}
            filterStatus={["todo", "in_progress"]}
          />
        );
      case "stats":
        return <StatsPanel />;
      case "timer":
        return <TimerPanel />;
      case "projects":
        return <ProjectsPanel />;
      case "empty":
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Pannello vuoto - seleziona un contenuto</p>
          </div>
        );
    }
  };

  const currentOption = PANEL_OPTIONS.find(o => o.value === config.content);

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          {currentOption && <currentOption.icon className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-sm">{config.title}</span>
        </div>
        {isConfiguring && (
          <Select value={config.content} onValueChange={(v) => onChangeContent(v as PanelContent)}>
            <SelectTrigger className="h-7 w-[160px] text-xs">
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
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { currentOrganization } = useOrganization();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    const saved = localStorage.getItem("dashboard-layout-v3");
    if (saved) {
      try {
        setLayout(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse dashboard layout", e);
      }
    }
  }, []);

  const saveLayout = (newLayout: DashboardLayout) => {
    setLayout(newLayout);
    localStorage.setItem("dashboard-layout-v3", JSON.stringify(newLayout));
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
        
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 flex-shrink-0">
          <div className="text-sm text-muted-foreground">
            {isConfiguring ? "Configura i pannelli - trascina i bordi per ridimensionare" : "Dashboard personalizzata"}
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
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi
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

        <div className="flex-1 p-4 overflow-hidden min-h-0">
          <ResizablePanelGroup 
            direction={layout.direction} 
            className="h-full rounded-lg"
          >
            {layout.panels.map((panel, index) => (
              <div key={panel.id} className="contents">
                {index > 0 && <ResizableHandle withHandle className="mx-1" />}
                <ResizablePanel defaultSize={100 / layout.panels.length} minSize={15}>
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
