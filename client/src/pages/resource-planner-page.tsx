import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/organization-context";
import { getQueryFn } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, ChevronLeft, ChevronRight, Users, TrendingUp, AlertTriangle, Clock, Filter, X } from "lucide-react";
import { format, addDays, addWeeks, addMonths, startOfWeek, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";

type Granularity = "day" | "week" | "month";

interface PeriodTask {
  id: string;
  title: string;
  projectId: string | null;
  remaining: number;
  status: string;
  priority: string;
}

interface ResourcePeriod {
  start: string;
  end: string;
  label: string;
  capacity: number;
  demand: number;
  utilization: number;
  status: "unavailable" | "under" | "balanced" | "over";
  tasks: PeriodTask[];
}

interface ResourceSkillData {
  id: string;
  name: string;
  level: number;
  isPrimary: boolean;
}

interface ResourceData {
  id: string;
  name: string;
  role: string;
  skillLevel: string;
  department: string | null;
  skills: ResourceSkillData[];
  periods: ResourcePeriod[];
}

interface SummaryPeriod {
  label: string;
  start: string;
  end: string;
  totalCapacity: number;
  totalDemand: number;
  avgUtilization: number;
  resourceCount: number;
}

interface PlannerResponse {
  resources: ResourceData[];
  summary: SummaryPeriod[];
  periods: string[];
}

function getDefaultRange(granularity: Granularity): { start: Date; end: Date } {
  const now = new Date();
  if (granularity === "day") {
    return { start: startOfWeek(now, { weekStartsOn: 1 }), end: addDays(startOfWeek(now, { weekStartsOn: 1 }), 14) };
  } else if (granularity === "week") {
    return { start: startOfWeek(now, { weekStartsOn: 1 }), end: addWeeks(startOfWeek(now, { weekStartsOn: 1 }), 8) };
  }
  return { start: startOfMonth(now), end: addMonths(startOfMonth(now), 6) };
}

function StatusCell({ period, onClick }: { period: ResourcePeriod; onClick: () => void }) {
  const bgColor = {
    unavailable: "bg-gray-100 dark:bg-gray-800 text-gray-400",
    under: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    balanced: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    over: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  }[period.status];

  const intensityClass = period.status === "over"
    ? period.utilization > 150 ? "ring-2 ring-red-500 dark:ring-red-400" : ""
    : period.status === "under" && period.utilization < 30
      ? "ring-2 ring-amber-500 dark:ring-amber-400" : "";

  return (
    <button
      onClick={onClick}
      className={`w-full h-full min-h-[52px] p-1.5 text-xs rounded border transition-all hover:shadow-md cursor-pointer ${bgColor} ${intensityClass}`}
      data-testid={`cell-${period.status}`}
    >
      <div className="font-semibold text-[11px]">{period.demand}h/{period.capacity}h</div>
      <div className="text-[10px] opacity-80">{period.utilization}%</div>
      {period.tasks.length > 0 && (
        <div className="text-[9px] mt-0.5 opacity-60">{period.tasks.length} task</div>
      )}
    </button>
  );
}

function SkillBadge({ skill }: { skill: ResourceSkillData }) {
  const stars = "★".repeat(skill.level) + "☆".repeat(5 - skill.level);
  return (
    <Badge variant={skill.isPrimary ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
      {skill.name} <span className="ml-0.5 text-[9px]">{stars}</span>
    </Badge>
  );
}

function KPICard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="text-[10px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResourcePlannerPage() {
  const { currentOrganizationId } = useOrganization();
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [dateRange, setDateRange] = useState(() => getDefaultRange("week"));
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [skillFilter, setSkillFilter] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<ResourceData | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ resource: ResourceData; period: ResourcePeriod } | null>(null);

  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  const { data, isLoading } = useQuery<PlannerResponse>({
    queryKey: ["/api/resource-planner", startStr, endStr, granularity, currentOrganizationId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (currentOrganizationId) headers["X-Organization-Id"] = currentOrganizationId;
      const res = await fetch(`/api/resource-planner?startDate=${startStr}&endDate=${endStr}&granularity=${granularity}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch resource planner data");
      return res.json();
    },
    enabled: !!currentOrganizationId,
  });

  const handleGranularityChange = (g: Granularity) => {
    setGranularity(g);
    setDateRange(getDefaultRange(g));
  };

  const navigateRange = (direction: "prev" | "next") => {
    const multiplier = direction === "next" ? 1 : -1;
    setDateRange(prev => {
      if (granularity === "day") {
        return { start: addDays(prev.start, 7 * multiplier), end: addDays(prev.end, 7 * multiplier) };
      } else if (granularity === "week") {
        return { start: addWeeks(prev.start, 4 * multiplier), end: addWeeks(prev.end, 4 * multiplier) };
      }
      return { start: addMonths(prev.start, 3 * multiplier), end: addMonths(prev.end, 3 * multiplier) };
    });
  };

  const filteredResources = useMemo(() => {
    if (!data?.resources) return [];
    return data.resources.filter(r => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (skillFilter && !r.skills.some(s => s.name.toLowerCase().includes(skillFilter.toLowerCase()))) return false;
      return true;
    });
  }, [data?.resources, roleFilter, skillFilter]);

  const uniqueRoles = useMemo(() => {
    if (!data?.resources) return [];
    return [...new Set(data.resources.map(r => r.role))].sort();
  }, [data?.resources]);

  const kpis = useMemo(() => {
    if (!data?.summary || data.summary.length === 0) return { totalResources: 0, avgUtilization: 0, overCount: 0, underCount: 0 };
    const totalResources = data.resources.length;
    const avgUtilization = Math.round(data.summary.reduce((s, p) => s + p.avgUtilization, 0) / data.summary.length);
    let overCount = 0;
    let underCount = 0;
    data.resources.forEach(r => {
      r.periods.forEach(p => {
        if (p.status === "over") overCount++;
        if (p.status === "under") underCount++;
      });
    });
    return { totalResources, avgUtilization, overCount, underCount };
  }, [data]);

  return (
    <div className="flex h-screen bg-background" data-testid="resource-planner-page">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Resource Planner" subtitle="Pianificazione e allocazione risorse" />
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <KPICard title="Risorse Attive" value={kpis.totalResources} subtitle="nel periodo selezionato" icon={Users} color="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400" />
            <KPICard title="Utilizzo Medio" value={`${kpis.avgUtilization}%`} subtitle="capacità impegnata" icon={TrendingUp} color="bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400" />
            <KPICard title="Sovra-allocazioni" value={kpis.overCount} subtitle="celle in criticità" icon={AlertTriangle} color="bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400" />
            <KPICard title="Sotto-allocazioni" value={kpis.underCount} subtitle="capacità disponibile" icon={Clock} color="bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400" />
          </div>

          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => navigateRange("prev")} data-testid="nav-prev">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[200px] text-center">
                    {format(dateRange.start, "d MMM yyyy", { locale: it })} — {format(dateRange.end, "d MMM yyyy", { locale: it })}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => navigateRange("next")} data-testid="nav-next">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDateRange(getDefaultRange(granularity))}>
                    Oggi
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={granularity} onValueChange={(v) => handleGranularityChange(v as Granularity)}>
                    <SelectTrigger className="w-[130px]" data-testid="granularity-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Giorno</SelectItem>
                      <SelectItem value="week">Settimana</SelectItem>
                      <SelectItem value="month">Mese</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="role-filter">
                      <Filter className="h-3 w-3 mr-1" />
                      <SelectValue placeholder="Ruolo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i ruoli</SelectItem>
                      {uniqueRoles.map(role => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Input
                      placeholder="Filtra per skill..."
                      value={skillFilter}
                      onChange={(e) => setSkillFilter(e.target.value)}
                      className="w-[160px] h-9 text-sm"
                      data-testid="skill-filter"
                    />
                    {skillFilter && (
                      <button onClick={() => setSkillFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-2">
                      <Skeleton className="h-14 w-[200px]" />
                      {[1, 2, 3, 4, 5, 6].map(j => (
                        <Skeleton key={j} className="h-14 flex-1" />
                      ))}
                    </div>
                  ))}
                </div>
              ) : !data || filteredResources.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nessuna risorsa trovata</p>
                  <p className="text-sm mt-1">Aggiungi risorse umane o modifica i filtri</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="sticky left-0 bg-background z-10 text-left p-2 min-w-[220px] text-xs font-medium text-muted-foreground border-r">
                          Risorsa
                        </th>
                        {data.periods.map((label, idx) => (
                          <th key={idx} className="text-center p-1.5 text-[11px] font-medium text-muted-foreground min-w-[80px]">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResources.map(resource => (
                        <tr key={resource.id} className="border-b hover:bg-muted/30">
                          <td className="sticky left-0 bg-background z-10 p-2 border-r">
                            <button
                              onClick={() => setSelectedResource(resource)}
                              className="text-left w-full hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
                              data-testid={`resource-${resource.id}`}
                            >
                              <div className="font-medium text-sm">{resource.name}</div>
                              <div className="text-[11px] text-muted-foreground">{resource.role} · {resource.skillLevel}</div>
                              {resource.skills.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {resource.skills.slice(0, 3).map(s => (
                                    <SkillBadge key={s.id} skill={s} />
                                  ))}
                                  {resource.skills.length > 3 && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0">+{resource.skills.length - 3}</Badge>
                                  )}
                                </div>
                              )}
                            </button>
                          </td>
                          {resource.periods.map((period, idx) => (
                            <td key={idx} className="p-0.5">
                              <StatusCell
                                period={period}
                                onClick={() => setSelectedCell({ resource, period })}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-muted/50 border-t-2">
                        <td className="sticky left-0 bg-muted/50 z-10 p-2 border-r font-medium text-xs">
                          Totale
                        </td>
                        {data.summary.map((s, idx) => {
                          const statusColor = s.avgUtilization > 100
                            ? "text-red-600 dark:text-red-400"
                            : s.avgUtilization >= 70
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400";
                          return (
                            <td key={idx} className="p-1.5 text-center">
                              <div className="text-[11px] font-semibold">{s.totalDemand}h/{s.totalCapacity}h</div>
                              <div className={`text-[10px] font-bold ${statusColor}`}>{s.avgUtilization}%</div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-800 border border-emerald-300 dark:border-emerald-700" />
              Bilanciato (70-100%)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-800 border border-amber-300 dark:border-amber-700" />
              Sotto-allocato (&lt;70%)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-200 dark:bg-red-800 border border-red-300 dark:border-red-700" />
              Sovra-allocato (&gt;100%)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600" />
              Non disponibile
            </div>
          </div>
        </div>
      </div>

      <Popover open={!!selectedCell} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <PopoverTrigger asChild><span /></PopoverTrigger>
        {selectedCell && (
          <PopoverContent className="w-80" side="top">
            <div className="space-y-2">
              <div className="font-medium text-sm">
                {selectedCell.resource.name} — {selectedCell.period.label}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Capacità: <span className="font-semibold">{selectedCell.period.capacity}h</span></div>
                <div>Domanda: <span className="font-semibold">{selectedCell.period.demand}h</span></div>
                <div>Utilizzo: <span className="font-semibold">{selectedCell.period.utilization}%</span></div>
                <div>Task: <span className="font-semibold">{selectedCell.period.tasks.length}</span></div>
              </div>
              {selectedCell.period.tasks.length > 0 && (
                <div className="border-t pt-2 space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Attività nel periodo:</div>
                  {selectedCell.period.tasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                      <span className="truncate flex-1 mr-2">{t.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {Math.round(t.remaining)}h
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>

      <Sheet open={!!selectedResource} onOpenChange={(open) => !open && setSelectedResource(null)}>
        <SheetContent className="w-[400px] sm:w-[500px]">
          {selectedResource && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedResource.name}</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                <div className="space-y-4 pr-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Profilo</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Ruolo: <span className="font-medium">{selectedResource.role}</span></div>
                      <div>Livello: <span className="font-medium">{selectedResource.skillLevel}</span></div>
                      {selectedResource.department && (
                        <div>Dipartimento: <span className="font-medium">{selectedResource.department}</span></div>
                      )}
                    </div>
                  </div>

                  {selectedResource.skills.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Competenze</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedResource.skills.map(s => <SkillBadge key={s.id} skill={s} />)}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Utilizzo per periodo</div>
                    <div className="space-y-1.5">
                      {selectedResource.periods.map((p, idx) => {
                        const barWidth = Math.min(p.utilization, 150);
                        const barColor = p.status === "over" ? "bg-red-500" : p.status === "balanced" ? "bg-emerald-500" : p.status === "under" ? "bg-amber-500" : "bg-gray-300";
                        return (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span className="w-16 text-muted-foreground shrink-0">{p.label}</span>
                            <div className="flex-1 bg-muted rounded-full h-3 relative overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${(barWidth / 150) * 100}%` }} />
                              {p.utilization > 100 && (
                                <div className="absolute left-[66.67%] top-0 bottom-0 w-px bg-foreground/30" />
                              )}
                            </div>
                            <span className="w-12 text-right font-medium shrink-0">{p.utilization}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Tutte le attività</div>
                    {selectedResource.periods.flatMap(p => p.tasks).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nessuna attività assegnata nel periodo</p>
                    ) : (
                      <div className="space-y-1.5">
                        {[...new Map(selectedResource.periods.flatMap(p => p.tasks).map(t => [t.id, t])).values()].map(t => (
                          <div key={t.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2.5 py-1.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Badge
                                variant={t.priority === "urgent" ? "destructive" : t.priority === "high" ? "default" : "secondary"}
                                className="text-[9px] px-1 py-0 shrink-0"
                              >
                                {t.priority}
                              </Badge>
                              <span className="truncate">{t.title}</span>
                            </div>
                            <span className="font-medium ml-2 shrink-0">{Math.round(t.remaining)}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
