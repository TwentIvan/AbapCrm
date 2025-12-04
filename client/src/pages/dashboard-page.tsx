import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Rnd } from "react-rnd";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { EmbeddedEntityList } from "@/components/embedded/embedded-entity-list";
import "@/lib/entities";
import { 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Handshake,
  TrendingUp,
  Timer,
  Settings,
  GripVertical,
  X,
  Plus,
  Sparkles,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
} from "lucide-react";
import { 
  PieChartWidget, 
  BarChartWidget, 
  LineChartWidget, 
  AreaChartWidget, 
  CounterWidget 
} from "@/components/dashboard/chart-widgets";
import { WidgetBuilderDialog } from "@/components/dashboard/widget-builder-dialog";
import type { DashboardWidgetTemplate } from "@shared/schema";

type WidgetType = "entity-list" | "stats" | "timer" | "pie_chart" | "bar_chart" | "line_chart" | "area_chart" | "counter";

interface WidgetConfig {
  groupByField?: string;
  valueField?: string;
  aggregation?: "count" | "sum" | "avg" | "min" | "max";
  showLegend?: boolean;
  showLabels?: boolean;
}

interface Widget {
  id: string;
  type: WidgetType;
  entityKey?: string;
  filterField?: string;
  filterValues?: string[];
  config?: WidgetConfig;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface DashboardLayout {
  widgets: Widget[];
  nextZIndex: number;
}

const GRID_SIZE = 20;
const MIN_WIDGET_SIZE = 200;

const WIDGET_TEMPLATES = [
  { type: "entity-list" as const, entityKey: "tasks", title: "Lista Task", icon: CheckSquare },
  { type: "entity-list" as const, entityKey: "tasks", filterField: "status", filterValues: ["todo", "in_progress"], title: "Task Attivi", icon: CheckSquare },
  { type: "entity-list" as const, entityKey: "projects", title: "Lista Progetti", icon: FolderKanban },
  { type: "entity-list" as const, entityKey: "projects", filterField: "status", filterValues: ["active", "in_progress"], title: "Progetti Attivi", icon: FolderKanban },
  { type: "entity-list" as const, entityKey: "partners", title: "Lista Partner", icon: Users },
  { type: "entity-list" as const, entityKey: "deals", title: "Lista Accordi", icon: Handshake },
  { type: "entity-list" as const, entityKey: "deals", filterField: "stage", filterValues: ["prospecting", "qualification", "proposal", "negotiation"], title: "Accordi Aperti", icon: Handshake },
  { type: "stats" as const, title: "Statistiche", icon: TrendingUp },
  { type: "timer" as const, title: "Timer Attivo", icon: Timer },
  { type: "pie_chart" as const, entityKey: "tasks", config: { groupByField: "status" }, title: "Task per Stato", icon: PieChartIcon },
  { type: "bar_chart" as const, entityKey: "tasks", config: { groupByField: "priority" }, title: "Task per Priorità", icon: BarChart3 },
  { type: "pie_chart" as const, entityKey: "deals", config: { groupByField: "stage" }, title: "Deals per Fase", icon: PieChartIcon },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    {
      id: "widget-1",
      type: "entity-list",
      entityKey: "tasks",
      filterField: "status",
      filterValues: ["todo", "in_progress"],
      title: "Task Attivi",
      x: 20,
      y: 20,
      width: 700,
      height: 500,
      zIndex: 1,
    },
    {
      id: "widget-2",
      type: "timer",
      title: "Timer Attivo",
      x: 740,
      y: 20,
      width: 350,
      height: 250,
      zIndex: 2,
    },
  ],
  nextZIndex: 3,
};

function StatsWidget() {
  const { currentOrganizationId } = useOrganization();
  
  const { data: projects } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: tasks } = useQuery<any[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: partners } = useQuery<any[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: deals } = useQuery<any[]>({
    queryKey: ["/api/deals"],
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

function TimerWidget() {
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
      <div className="text-5xl font-mono font-bold text-green-600 dark:text-green-400 mb-4">
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

function WidgetContent({ widget }: { widget: Widget }) {
  const chartProps = {
    entityKey: widget.entityKey || "",
    groupBy: widget.config?.groupByField,
    valueField: widget.config?.valueField,
    aggregation: widget.config?.aggregation,
    filterField: widget.filterField,
    filterValues: widget.filterValues,
    showLegend: widget.config?.showLegend,
    showLabels: widget.config?.showLabels,
  };

  switch (widget.type) {
    case "entity-list":
      if (!widget.entityKey) return null;
      return (
        <EmbeddedEntityList
          entityKey={widget.entityKey}
          layoutKey={`dashboard_${widget.id}`}
          filterField={widget.filterField}
          filterValues={widget.filterValues}
          className="h-full"
        />
      );
    case "stats":
      return <StatsWidget />;
    case "timer":
      return <TimerWidget />;
    case "pie_chart":
      if (!widget.entityKey) return null;
      return (
        <div className="h-full p-4">
          <PieChartWidget {...chartProps} />
        </div>
      );
    case "bar_chart":
      if (!widget.entityKey) return null;
      return (
        <div className="h-full p-4">
          <BarChartWidget {...chartProps} />
        </div>
      );
    case "line_chart":
      if (!widget.entityKey) return null;
      return (
        <div className="h-full p-4">
          <LineChartWidget {...chartProps} />
        </div>
      );
    case "area_chart":
      if (!widget.entityKey) return null;
      return (
        <div className="h-full p-4">
          <AreaChartWidget {...chartProps} />
        </div>
      );
    case "counter":
      if (!widget.entityKey) return null;
      return (
        <CounterWidget
          entityKey={widget.entityKey}
          filterField={widget.filterField}
          filterValues={widget.filterValues}
          label={widget.title}
        />
      );
    default:
      return null;
  }
}

export default function DashboardPage() {
  const { currentOrganization } = useOrganization();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [showPalette, setShowPalette] = useState(false);
  const [showWidgetBuilder, setShowWidgetBuilder] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dashboard-freeform-v1");
    if (saved) {
      try {
        setLayout(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse dashboard layout", e);
      }
    }
  }, []);

  const saveLayout = useCallback((newLayout: DashboardLayout) => {
    setLayout(newLayout);
    localStorage.setItem("dashboard-freeform-v1", JSON.stringify(newLayout));
  }, []);

  const handleDragStop = useCallback((widgetId: string, x: number, y: number) => {
    const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
    
    setLayout(prev => {
      const newWidgets = prev.widgets.map(w => 
        w.id === widgetId 
          ? { ...w, x: Math.max(0, snappedX), y: Math.max(0, snappedY), zIndex: prev.nextZIndex }
          : w
      );
      const newLayout = { ...prev, widgets: newWidgets, nextZIndex: prev.nextZIndex + 1 };
      localStorage.setItem("dashboard-freeform-v1", JSON.stringify(newLayout));
      return newLayout;
    });
  }, []);

  const handleResizeStop = useCallback((widgetId: string, width: number, height: number, x: number, y: number) => {
    setLayout(prev => {
      const newWidgets = prev.widgets.map(w => 
        w.id === widgetId 
          ? { ...w, width, height, x, y }
          : w
      );
      const newLayout = { ...prev, widgets: newWidgets };
      localStorage.setItem("dashboard-freeform-v1", JSON.stringify(newLayout));
      return newLayout;
    });
  }, []);

  const handleAddWidget = useCallback((template: typeof WIDGET_TEMPLATES[0]) => {
    const isChartType = ["pie_chart", "bar_chart", "line_chart", "area_chart", "counter"].includes(template.type);
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type: template.type,
      entityKey: template.entityKey,
      filterField: (template as any).filterField,
      filterValues: (template as any).filterValues,
      config: (template as any).config,
      title: template.title,
      x: 20 + (layout.widgets.length * 40) % 200,
      y: 20 + (layout.widgets.length * 40) % 200,
      width: template.type === "entity-list" ? 700 : (isChartType ? 450 : 350),
      height: template.type === "entity-list" ? 500 : (isChartType ? 350 : 250),
      zIndex: layout.nextZIndex,
    };
    
    const newLayout = {
      widgets: [...layout.widgets, newWidget],
      nextZIndex: layout.nextZIndex + 1,
    };
    saveLayout(newLayout);
    setShowPalette(false);
  }, [layout, saveLayout]);

  const handleAddCustomWidget = useCallback((templateData: Partial<DashboardWidgetTemplate>) => {
    const widgetType = templateData.widgetType === "entity_list" ? "entity-list" : templateData.widgetType;
    const isChartType = ["pie_chart", "bar_chart", "line_chart", "area_chart", "counter"].includes(widgetType || "");
    
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type: widgetType as WidgetType,
      entityKey: templateData.entityKey || undefined,
      filterField: templateData.config?.filterField,
      filterValues: templateData.config?.filterValues,
      config: {
        groupByField: templateData.config?.groupByField,
        valueField: templateData.config?.valueField,
        aggregation: templateData.config?.aggregation,
        showLegend: templateData.config?.showLegend,
        showLabels: templateData.config?.showLabels,
      },
      title: templateData.name || "Nuovo Widget",
      x: 20 + (layout.widgets.length * 40) % 200,
      y: 20 + (layout.widgets.length * 40) % 200,
      width: templateData.defaultWidth || (widgetType === "entity-list" ? 700 : (isChartType ? 450 : 350)),
      height: templateData.defaultHeight || (widgetType === "entity-list" ? 500 : (isChartType ? 350 : 250)),
      zIndex: layout.nextZIndex,
    };
    
    const newLayout = {
      widgets: [...layout.widgets, newWidget],
      nextZIndex: layout.nextZIndex + 1,
    };
    saveLayout(newLayout);
    setShowWidgetBuilder(false);
  }, [layout, saveLayout]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    saveLayout({
      ...layout,
      widgets: layout.widgets.filter(w => w.id !== widgetId),
    });
  }, [layout, saveLayout]);

  const handleUpdateTitle = useCallback((widgetId: string, newTitle: string) => {
    setLayout(prev => {
      const newWidgets = prev.widgets.map(w => 
        w.id === widgetId ? { ...w, title: newTitle } : w
      );
      const newLayout = { ...prev, widgets: newWidgets };
      localStorage.setItem("dashboard-freeform-v1", JSON.stringify(newLayout));
      return newLayout;
    });
  }, []);

  const handleResetLayout = useCallback(() => {
    saveLayout(DEFAULT_LAYOUT);
  }, [saveLayout]);

  const bringToFront = useCallback((widgetId: string) => {
    setLayout(prev => {
      const newWidgets = prev.widgets.map(w => 
        w.id === widgetId ? { ...w, zIndex: prev.nextZIndex } : w
      );
      return { ...prev, widgets: newWidgets, nextZIndex: prev.nextZIndex + 1 };
    });
  }, []);

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
            {isConfiguring ? "Trascina e ridimensiona i widget liberamente" : "Dashboard personalizzata"}
          </div>
          <div className="flex items-center gap-2">
            {isConfiguring && (
              <>
                <div className="relative">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowPalette(!showPalette)}
                    data-testid="button-add-widget"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Aggiungi Widget
                  </Button>
                  {showPalette && (
                    <div className="absolute top-full right-0 mt-1 bg-popover border rounded-lg shadow-lg p-2 z-50 w-72">
                      <div className="text-sm font-medium mb-2 px-2">Widget Predefiniti</div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {WIDGET_TEMPLATES.map((template, idx) => (
                          <button
                            key={idx}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left rounded hover:bg-muted transition-colors"
                            onClick={() => handleAddWidget(template)}
                            data-testid={`button-template-${idx}`}
                          >
                            <template.icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{template.title}</span>
                          </button>
                        ))}
                      </div>
                      <div className="border-t mt-2 pt-2">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-left rounded hover:bg-primary/10 transition-colors text-primary"
                          onClick={() => {
                            setShowPalette(false);
                            setShowWidgetBuilder(true);
                          }}
                          data-testid="button-custom-widget"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span className="text-sm font-medium">Crea Widget Personalizzato</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleResetLayout} data-testid="button-reset">
                  Ripristina
                </Button>
              </>
            )}
            <Button
              variant={isConfiguring ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsConfiguring(!isConfiguring);
                setShowPalette(false);
              }}
              data-testid="button-configure"
            >
              <Settings className="h-4 w-4 mr-1" />
              {isConfiguring ? "Fine" : "Configura"}
            </Button>
          </div>
        </div>

        <div 
          className="flex-1 relative overflow-auto bg-muted/10" 
          style={{ 
            backgroundImage: isConfiguring ? `radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)` : 'none',
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          }}
        >
          {layout.widgets.map((widget) => (
            <Rnd
              key={widget.id}
              size={{ width: widget.width, height: widget.height }}
              position={{ x: widget.x, y: widget.y }}
              onDragStart={() => bringToFront(widget.id)}
              onDragStop={(e, d) => handleDragStop(widget.id, d.x, d.y)}
              onResizeStop={(e, direction, ref, delta, position) => {
                handleResizeStop(
                  widget.id,
                  parseInt(ref.style.width),
                  parseInt(ref.style.height),
                  position.x,
                  position.y
                );
              }}
              minWidth={MIN_WIDGET_SIZE}
              minHeight={MIN_WIDGET_SIZE}
              bounds="parent"
              dragGrid={isConfiguring ? [GRID_SIZE, GRID_SIZE] : undefined}
              resizeGrid={isConfiguring ? [GRID_SIZE, GRID_SIZE] : undefined}
              disableDragging={!isConfiguring}
              enableResizing={isConfiguring}
              style={{ zIndex: widget.zIndex }}
              className={`${isConfiguring ? 'ring-2 ring-primary/30' : ''}`}
            >
              <div className="h-full flex flex-col bg-card rounded-lg border shadow-sm overflow-hidden">
                {/* Widget Header */}
                <div 
                  className={`flex items-center justify-between px-3 py-2 flex-shrink-0 ${isConfiguring ? 'cursor-move' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {isConfiguring && (
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    )}
                    {isConfiguring ? (
                      <input
                        type="text"
                        value={widget.title}
                        onChange={(e) => handleUpdateTitle(widget.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="font-medium text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md border-0 outline-none focus:ring-2 focus:ring-blue-400 min-w-[100px]"
                        data-testid={`input-widget-title-${widget.id}`}
                      />
                    ) : (
                      <span 
                        className="font-medium text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md"
                        data-testid={`badge-widget-title-${widget.id}`}
                      >
                        {widget.title}
                      </span>
                    )}
                  </div>
                  {isConfiguring && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleRemoveWidget(widget.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                {/* Widget Content */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <WidgetContent widget={widget} />
                </div>
              </div>
            </Rnd>
          ))}
        </div>
      </div>

      <WidgetBuilderDialog
        open={showWidgetBuilder}
        onOpenChange={setShowWidgetBuilder}
        onWidgetCreated={handleAddCustomWidget}
      />
    </div>
  );
}
