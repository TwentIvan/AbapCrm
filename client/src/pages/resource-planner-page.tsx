import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/organization-context";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, Users, TrendingUp, AlertTriangle,
  Clock, Filter, X, FolderOpen, ListTodo, ChevronDown,
  Sparkles, Plus, Trash2, Star, PanelLeftClose, PanelLeft, Award,
  Brain, Zap, Search, Info, ShieldCheck, Target, Scale, ChevronUp
} from "lucide-react";
import { format, addDays, addWeeks, addMonths, startOfWeek, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import type { SkillCatalog } from "@shared/schema";

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

interface RequiredSkillInfo {
  id: string;
  skillName: string;
  requiredLevel: number;
}

interface ActivityTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  assignedTo: string | null;
  estimatedEffort: number | null;
  remainingEffort: number | null;
  type: "task";
  requiredSkills: RequiredSkillInfo[];
}

interface ActivityProject {
  id: string;
  name: string;
  status: string;
  type: "project";
  tasks: ActivityTask[];
}

interface ActivityTreeResponse {
  projects: ActivityProject[];
  orphanTasks: ActivityTask[];
}

const FIBONACCI_WEIGHTS = [0, 1, 2, 3, 5, 8];

function computeSkillMatch(
  resourceSkills: ResourceSkillData[],
  requiredSkills: RequiredSkillInfo[]
): number {
  if (requiredSkills.length === 0) return 0;

  let totalWeight = 0;
  let matchedWeight = 0;

  requiredSkills.forEach(req => {
    const weight = FIBONACCI_WEIGHTS[req.requiredLevel] || req.requiredLevel;
    totalWeight += weight;

    const resSkill = resourceSkills.find(
      rs => rs.name.toLowerCase() === req.skillName.toLowerCase() ||
            rs.name.toLowerCase().includes(req.skillName.toLowerCase()) ||
            req.skillName.toLowerCase().includes(rs.name.toLowerCase())
    );

    if (resSkill) {
      const levelRatio = Math.min(resSkill.level / req.requiredLevel, 1);
      matchedWeight += weight * levelRatio;
    }
  });

  return totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
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
    unavailable: "bg-muted dark:bg-card text-muted-foreground",
    under: "bg-warning/10 text-warning border-warning/30 dark:border-amber-800",
    balanced: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    over: "bg-destructive/10 text-destructive dark:text-destructive border-destructive/30 dark:border-red-800",
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

function useResizable(initialWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width, minWidth, maxWidth]);

  return { width, handleMouseDown };
}

function ResizeDivider({ onMouseDown, orientation = "vertical" }: { onMouseDown: (e: React.MouseEvent) => void; orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`${orientation === "vertical" ? "w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30" : "h-1.5 cursor-row-resize hover:bg-primary/20 active:bg-primary/30"} flex items-center justify-center group transition-colors flex-shrink-0`}
    >
      <div className={`${orientation === "vertical" ? "w-0.5 h-8" : "h-0.5 w-8"} bg-border group-hover:bg-primary/40 rounded-full transition-colors`} />
    </div>
  );
}

function SkillsPopover({ skills, matchScore }: { skills: ResourceSkillData[]; matchScore?: number }) {
  const { data: catalogItems = [] } = useQuery<SkillCatalog[]>({
    queryKey: ["/api/skill-catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const grouped = useMemo(() => {
    const catalogMap = new Map<string, SkillCatalog>();
    catalogItems.forEach(c => catalogMap.set(c.name.toLowerCase(), c));

    const parentGroups = new Map<string, { parent: string; children: { skill: ResourceSkillData; catalogEntry?: SkillCatalog }[] }>();
    const ungrouped: { skill: ResourceSkillData; catalogEntry?: SkillCatalog }[] = [];

    skills.forEach(skill => {
      const entry = catalogMap.get(skill.name.toLowerCase());
      if (entry?.parentId) {
        const parentEntry = catalogItems.find(c => c.id === entry.parentId);
        if (parentEntry) {
          const key = parentEntry.id;
          if (!parentGroups.has(key)) {
            parentGroups.set(key, { parent: parentEntry.name, children: [] });
          }
          parentGroups.get(key)!.children.push({ skill, catalogEntry: entry });
          return;
        }
      }
      const asParent = catalogItems.find(c => c.name.toLowerCase() === skill.name.toLowerCase() && !c.parentId);
      if (asParent) {
        const key = asParent.id;
        if (!parentGroups.has(key)) {
          parentGroups.set(key, { parent: asParent.name, children: [] });
        }
        parentGroups.get(key)!.children.push({ skill, catalogEntry: entry });
      } else {
        ungrouped.push({ skill, catalogEntry: entry });
      }
    });

    return { parentGroups: Array.from(parentGroups.values()), ungrouped };
  }, [skills, catalogItems]);

  if (skills.length === 0) return null;

  const primaryCount = skills.filter(s => s.isPrimary).length;
  const stars = (level: number) => "★".repeat(level) + "☆".repeat(5 - level);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Award className="h-3 w-3" />
          <span>{skills.length} skill{skills.length !== 1 ? "s" : ""}</span>
          {primaryCount > 0 && <span className="text-[10px] text-primary">({primaryCount} primary)</span>}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="font-medium text-xs">Skills ({skills.length})</div>
          {matchScore !== undefined && matchScore > 0 && (
            <MatchBadge matchPercent={matchScore} />
          )}
        </div>
        <ScrollArea className="max-h-[280px]">
          <div className="p-2 space-y-2">
            {grouped.parentGroups.map(group => (
              <div key={group.parent}>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{group.parent}</div>
                {group.children.map(({ skill }) => (
                  <div key={skill.id} className="flex items-center justify-between py-0.5 pl-2">
                    <span className="text-xs flex items-center gap-1">
                      {skill.isPrimary && <Star className="h-2.5 w-2.5 text-warning fill-yellow-500" />}
                      {skill.name}
                    </span>
                    <span className="text-[10px] text-warning">{stars(skill.level)}</span>
                  </div>
                ))}
              </div>
            ))}
            {grouped.ungrouped.length > 0 && (
              <div>
                {grouped.parentGroups.length > 0 && (
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Altre</div>
                )}
                {grouped.ungrouped.map(({ skill }) => (
                  <div key={skill.id} className="flex items-center justify-between py-0.5">
                    <span className="text-xs flex items-center gap-1">
                      {skill.isPrimary && <Star className="h-2.5 w-2.5 text-warning fill-yellow-500" />}
                      {skill.name}
                    </span>
                    <span className="text-[10px] text-warning">{stars(skill.level)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function MatchBadge({ matchPercent }: { matchPercent: number }) {
  if (matchPercent === 0) return null;
  const color = matchPercent >= 80
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
    : matchPercent >= 50
      ? "bg-warning/10 text-warning dark:bg-amber-900 dark:text-warning border-warning/30 dark:border-amber-700"
      : "bg-destructive/10 text-destructive dark:bg-red-900 dark:text-red-300 border-destructive/30 dark:border-red-700";
  return (
    <Badge className={`text-[10px] px-1.5 py-0 font-bold border ${color}`}>
      {matchPercent}% match
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

interface SkillRequirement {
  id: string;
  skillId: string;
  skillName: string;
  requiredLevel: number;
  mode: string;
  weight: number;
  override?: number;
}

function SkillRequirementsEditor({ entityType, entityId, entityTitle }: {
  entityType: "project" | "task";
  entityId: string;
  entityTitle: string;
}) {
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [requiredLevel, setRequiredLevel] = useState(3);
  const [mode, setMode] = useState("SCORE");
  const [weight, setWeight] = useState(1.0);
  const [override, setOverride] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const apiUrl = entityType === "project"
    ? `/api/projects/${entityId}/skill-requirements`
    : `/api/tasks/${entityId}/skill-requirements-v2`;

  const { data: requirements = [] } = useQuery<SkillRequirement[]>({
    queryKey: [apiUrl],
    queryFn: async () => {
      const res = await fetch(apiUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!entityId,
  });

  const { data: catalogItems = [] } = useQuery<SkillCatalog[]>({
    queryKey: ["/api/skill-catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const activeSkills = catalogItems.filter(c => c.isActive);

  const saveMutation = useMutation({
    mutationFn: async (item: any) => {
      const res = await apiRequest("PUT", apiUrl, item);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/resource-planner/activity-tree"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/requirements"] });
      setSelectedSkillId("");
      setRequiredLevel(3);
      setMode("SCORE");
      setWeight(1.0);
      setOverride(false);
      toast({ title: "Requisito salvato" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (skillId: string) => {
      await apiRequest("DELETE", `${apiUrl}/${skillId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/resource-planner/activity-tree"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/requirements"] });
      toast({ title: "Requisito rimosso" });
    },
  });

  const handleAdd = () => {
    if (!selectedSkillId) return;
    const item: any = { skillId: selectedSkillId, requiredLevel, mode, weight };
    if (entityType === "task") item.override = override ? 1 : 0;
    saveMutation.mutate(item);
  };

  const modeIcon = (m: string) => {
    if (m === "MUST") return <ShieldCheck className="h-2.5 w-2.5 text-destructive" />;
    if (m === "TIEBREAK") return <Scale className="h-2.5 w-2.5 text-primary" />;
    return <Target className="h-2.5 w-2.5 text-success" />;
  };

  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Brain className="h-3 w-3" />
        Requisiti skill - {entityTitle}
      </div>
      {requirements.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1.5 gap-1">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {modeIcon(r.mode)}
            <span className="truncate">{r.skillName}</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Lv.{r.requiredLevel}</Badge>
            {r.weight !== 1 && (
              <span className="text-[9px] text-muted-foreground shrink-0">×{r.weight}</span>
            )}
            {r.override === 1 && (
              <Badge variant="secondary" className="text-[8px] px-0.5 py-0 shrink-0">OVR</Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => deleteMutation.mutate(r.skillId)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="space-y-1.5">
        <div className="flex items-end gap-1.5">
          <div className="flex-1 min-w-0">
            {activeSkills.length > 0 ? (
              <Select value={selectedSkillId} onValueChange={setSelectedSkillId}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Skill..." />
                </SelectTrigger>
                <SelectContent>
                  {activeSkills.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-[10px] text-muted-foreground p-1">Nessuna skill nel catalogo</div>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(lv => (
              <button key={lv} onClick={() => setRequiredLevel(lv)} className="p-0">
                <Star className={`h-3 w-3 ${lv <= requiredLevel ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-6 text-[10px] w-[85px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MUST">MUST</SelectItem>
              <SelectItem value="SCORE">SCORE</SelectItem>
              <SelectItem value="TIEBREAK">TIEBREAK</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={weight}
            onChange={e => setWeight(parseFloat(e.target.value) || 1)}
            className="h-6 text-[10px] w-[55px]"
            placeholder="Peso"
          />
          {entityType === "task" && (
            <label className="flex items-center gap-1 text-[10px] cursor-pointer">
              <Checkbox
                checked={override}
                onCheckedChange={(v) => setOverride(!!v)}
                className="h-3 w-3"
              />
              OVR
            </label>
          )}
          <Button
            size="sm"
            className="h-6 text-[10px] px-2"
            disabled={!selectedSkillId || saveMutation.isPending}
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskRequiredSkillsEditor({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  return <SkillRequirementsEditor entityType="task" entityId={taskId} entityTitle={taskTitle} />;
}

interface MatchResult {
  resourceId: string;
  resourceName: string;
  score: number;
  eligible: boolean;
  mustFailures: { skillId: string; skillName: string; requiredLevel: number; actualLevel: number }[];
  topMatches: { skillId: string; skillName: string; contribution: number; ratio: number }[];
  gaps: { skillId: string; skillName: string; penalty: number; gap: number }[];
}

interface MergedRequirement {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  mode: string;
  weight: number;
  origin: string;
}

function MatchPanel({
  selectedProjectIds,
  selectedTaskIds,
  resources,
  onMatchScores,
}: {
  selectedProjectIds: Set<string>;
  selectedTaskIds: Set<string>;
  resources: ResourceData[];
  onMatchScores: (scores: Map<string, number>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [mergedReqs, setMergedReqs] = useState<MergedRequirement[]>([]);
  const { toast } = useToast();

  const projectId = selectedProjectIds.size === 1 ? Array.from(selectedProjectIds)[0] : undefined;
  const taskId = selectedTaskIds.size === 1 ? Array.from(selectedTaskIds)[0] : undefined;

  const hasSelection = projectId || taskId;

  const { data: requirementsData } = useQuery<{ requirements: MergedRequirement[] }>({
    queryKey: ["/api/planner/requirements", projectId, taskId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (taskId) params.set("taskId", taskId);
      const res = await fetch(`/api/planner/requirements?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!hasSelection,
  });

  useEffect(() => {
    setMergedReqs(requirementsData?.requirements || []);
  }, [requirementsData]);

  const runMatch = async () => {
    if (!hasSelection || resources.length === 0) return;
    setIsMatching(true);
    try {
      const body: any = { candidateResourceIds: resources.map(r => r.id) };
      if (projectId) body.projectId = projectId;
      if (taskId) body.taskId = taskId;
      const res = await apiRequest("POST", "/api/planner/match", body);
      const data = await res.json();
      setMatchResults(data.rankings || []);
      const newScores = new Map<string, number>();
      (data.rankings || []).forEach((r: MatchResult) => {
        newScores.set(r.resourceId, Math.round(r.score * 100));
      });
      onMatchScores(newScores);
    } catch (err) {
      toast({ title: "Errore", description: "Match fallito", variant: "destructive" });
    } finally {
      setIsMatching(false);
    }
  };

  if (!hasSelection) return null;

  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium">Skill Match Engine</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={runMatch}
              disabled={isMatching || mergedReqs.length === 0}
            >
              {isMatching ? (
                <span className="animate-pulse">Analisi...</span>
              ) : (
                <>
                  <Zap className="h-3 w-3 mr-1" />
                  Suggerisci risorse
                </>
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3">
            {mergedReqs.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Requisiti unificati ({mergedReqs.length})</div>
                <div className="flex flex-wrap gap-1">
                  {mergedReqs.map(r => (
                    <TooltipProvider key={r.skillId}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 cursor-help ${
                              r.mode === "MUST" ? "border-destructive/30 dark:border-red-700 text-destructive" :
                              r.mode === "TIEBREAK" ? "border-primary/30 text-primary" :
                              "border-purple-300 dark:border-purple-700"
                            }`}
                          >
                            {r.mode === "MUST" && <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />}
                            {r.skillName} Lv.{r.requiredLevel}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <div>Modo: {r.mode} · Peso: {r.weight}</div>
                          <div className="text-muted-foreground">Origine: {r.origin}</div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            )}

            {mergedReqs.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                Nessun requisito skill definito. Aggiungi requisiti a progetto o task.
              </div>
            )}

            {matchResults.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1">Ranking risorse</div>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {matchResults.map((r, idx) => (
                    <div key={r.resourceId} className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${
                      !r.eligible ? "bg-destructive/10 border border-destructive/30 dark:border-red-800" :
                      r.score >= 0.8 ? "bg-emerald-50 dark:bg-emerald-950/20" :
                      r.score >= 0.5 ? "bg-warning/10" :
                      "bg-muted/50"
                    }`}>
                      <span className="text-[10px] font-bold text-muted-foreground w-4">{idx + 1}</span>
                      <span className="flex-1 truncate font-medium">{r.resourceName}</span>
                      {!r.eligible && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0">BLOCCATO</Badge>
                      )}
                      <span className={`font-bold text-sm ${
                        r.score >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                        r.score >= 0.5 ? "text-warning" :
                        "text-destructive dark:text-destructive"
                      }`}>
                        {Math.round(r.score * 100)}%
                      </span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                            <Info className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" align="end">
                          <div className="space-y-2">
                            <div className="font-medium text-xs">{r.resourceName} — Dettaglio match</div>
                            {r.mustFailures.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold text-destructive dark:text-destructive mb-0.5">MUST non soddisfatti</div>
                                {r.mustFailures.map(f => (
                                  <div key={f.skillId} className="text-[11px] flex justify-between">
                                    <span>{f.skillName}</span>
                                    <span className="text-destructive">richiesto Lv.{f.requiredLevel}, ha Lv.{f.actualLevel}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {r.topMatches.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Punti di forza</div>
                                {r.topMatches.map(m => (
                                  <div key={m.skillId} className="text-[11px] flex justify-between">
                                    <span>{m.skillName}</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">{Math.round(m.ratio * 100)}% (+{m.contribution.toFixed(2)})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {r.gaps.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold text-warning mb-0.5">Lacune</div>
                                {r.gaps.map(g => (
                                  <div key={g.skillId} className="text-[11px] flex justify-between">
                                    <span>{g.skillName}</span>
                                    <span className="text-warning">gap: {g.gap} (-{g.penalty.toFixed(2)})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivitySidebar({
  selectedTaskIds,
  selectedProjectIds,
  onToggleTask,
  onToggleProject,
  width,
}: {
  selectedTaskIds: Set<string>;
  selectedProjectIds: Set<string>;
  onToggleTask: (id: string) => void;
  onToggleProject: (id: string, taskIds: string[]) => void;
  width: number;
}) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [activitySearch, setActivitySearch] = useState("");

  const { data: treeData, isLoading } = useQuery<ActivityTreeResponse>({
    queryKey: ["/api/resource-planner/activity-tree"],
    queryFn: async () => {
      const res = await fetch("/api/resource-planner/activity-tree", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity tree");
      return res.json();
    },
  });

  const toggleExpand = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const filteredProjects = useMemo(() => {
    if (!treeData) return [];
    if (!activitySearch) return treeData.projects;
    const q = activitySearch.toLowerCase();
    return treeData.projects
      .map(p => ({
        ...p,
        tasks: p.tasks.filter(t => t.title.toLowerCase().includes(q)),
      }))
      .filter(p => p.name.toLowerCase().includes(q) || p.tasks.length > 0);
  }, [treeData, activitySearch]);

  const filteredOrphans = useMemo(() => {
    if (!treeData) return [];
    if (!activitySearch) return treeData.orphanTasks;
    const q = activitySearch.toLowerCase();
    return treeData.orphanTasks.filter(t => t.title.toLowerCase().includes(q));
  }, [treeData, activitySearch]);

  const selectedCount = selectedTaskIds.size + selectedProjectIds.size;

  return (
    <div style={{ width: `${width}px` }} className="border-r bg-muted/20 flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Attività
          </div>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">{selectedCount} sel.</Badge>
          )}
        </div>
        <Input
          placeholder="Cerca attività..."
          value={activitySearch}
          onChange={e => setActivitySearch(e.target.value)}
          className="h-7 text-xs"
          data-testid="activity-search"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <>
              {filteredProjects.map(project => {
                const isExpanded = expandedProjects.has(project.id);
                const projectTaskIds = project.tasks.map(t => t.id);
                const isProjectSelected = selectedProjectIds.has(project.id);
                const projectRequiredSkills = project.tasks.flatMap(t => t.requiredSkills);
                const hasSkills = projectRequiredSkills.length > 0;

                return (
                  <div key={project.id} className="rounded-md overflow-hidden">
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent/50 rounded-md cursor-pointer transition-colors ${isProjectSelected ? "bg-primary/10 border-l-2 border-primary" : ""}`}>
                      <Checkbox
                        checked={isProjectSelected}
                        onCheckedChange={() => onToggleProject(project.id, projectTaskIds)}
                        className="h-3.5 w-3.5"
                        data-testid={`project-check-${project.id}`}
                      />
                      <button onClick={() => toggleExpand(project.id)} className="p-0.5">
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </button>
                      <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1 font-medium">{project.name}</span>
                      {hasSkills && (
                        <Sparkles className="h-3 w-3 text-purple-500 shrink-0" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => { e.stopPropagation(); setEditingProjectId(editingProjectId === project.id ? null : project.id); }}
                        data-testid={`edit-project-skills-${project.id}`}
                      >
                        <Brain className="h-3 w-3 text-purple-400" />
                      </Button>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{project.tasks.length}</Badge>
                    </div>
                    {editingProjectId === project.id && (
                      <SkillRequirementsEditor entityType="project" entityId={project.id} entityTitle={project.name} />
                    )}
                    {isExpanded && (
                      <div className="ml-4 space-y-0.5 pb-1">
                        {project.tasks.map(task => {
                          const isSelected = selectedTaskIds.has(task.id);
                          return (
                            <div key={task.id}>
                              <div className={`flex items-center gap-1.5 px-2 py-1 hover:bg-accent/50 rounded-md transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-primary" : ""}`}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => onToggleTask(task.id)}
                                  className="h-3 w-3"
                                  data-testid={`task-check-${task.id}`}
                                />
                                <ListTodo className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-[11px] truncate flex-1">{task.title}</span>
                                {task.requiredSkills.length > 0 && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                                    {task.requiredSkills.length} skill
                                  </Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 shrink-0"
                                  onClick={(e) => { e.stopPropagation(); setEditingTaskId(editingTaskId === task.id ? null : task.id); }}
                                  data-testid={`edit-skills-${task.id}`}
                                >
                                  <Sparkles className="h-3 w-3 text-purple-400" />
                                </Button>
                              </div>
                              {editingTaskId === task.id && (
                                <TaskRequiredSkillsEditor taskId={task.id} taskTitle={task.title} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredOrphans.length > 0 && (
                <div className="pt-2 mt-2 border-t">
                  <div className="text-[10px] font-medium text-muted-foreground px-2 mb-1">Senza progetto</div>
                  {filteredOrphans.map(task => {
                    const isSelected = selectedTaskIds.has(task.id);
                    return (
                      <div key={task.id}>
                        <div className={`flex items-center gap-1.5 px-2 py-1 hover:bg-accent/50 rounded-md transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-primary" : ""}`}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggleTask(task.id)}
                            className="h-3 w-3"
                          />
                          <ListTodo className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] truncate flex-1">{task.title}</span>
                          {task.requiredSkills.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">{task.requiredSkills.length} skill</Badge>
                          )}
                          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                            onClick={() => setEditingTaskId(editingTaskId === task.id ? null : task.id)}
                          >
                            <Sparkles className="h-3 w-3 text-purple-400" />
                          </Button>
                        </div>
                        {editingTaskId === task.id && (
                          <TaskRequiredSkillsEditor taskId={task.id} taskTitle={task.title} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const [serverMatchScores, setServerMatchScores] = useState<Map<string, number>>(new Map());
  const [showSidebar, setShowSidebar] = useState(true);
  const sidebarResize = useResizable(320, 200, 500);
  const [resourceColWidth, setResourceColWidth] = useState(200);
  const resourceColDrag = useRef(false);
  const resourceColStartX = useRef(0);
  const resourceColStartW = useRef(0);

  const handleResourceColMouseDown = useCallback((e: React.MouseEvent) => {
    resourceColDrag.current = true;
    resourceColStartX.current = e.clientX;
    resourceColStartW.current = resourceColWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!resourceColDrag.current) return;
      const delta = ev.clientX - resourceColStartX.current;
      setResourceColWidth(Math.min(400, Math.max(120, resourceColStartW.current + delta)));
    };
    const onUp = () => {
      resourceColDrag.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [resourceColWidth]);

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

  const { data: treeData } = useQuery<ActivityTreeResponse>({
    queryKey: ["/api/resource-planner/activity-tree"],
    queryFn: async () => {
      const res = await fetch("/api/resource-planner/activity-tree", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const allRequiredSkills = useMemo(() => {
    if (!treeData) return [];
    const skills: RequiredSkillInfo[] = [];
    const seenSkillNames = new Set<string>();

    const processTask = (taskId: string) => {
      const allTasks = [
        ...treeData.projects.flatMap(p => p.tasks),
        ...treeData.orphanTasks,
      ];
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        task.requiredSkills.forEach(s => {
          const key = s.skillName.toLowerCase();
          if (!seenSkillNames.has(key)) {
            seenSkillNames.add(key);
            skills.push(s);
          }
        });
      }
    };

    selectedTaskIds.forEach(processTask);

    selectedProjectIds.forEach(projId => {
      const project = treeData.projects.find(p => p.id === projId);
      if (project) {
        project.tasks.forEach(t => {
          t.requiredSkills.forEach(s => {
            const key = s.skillName.toLowerCase();
            if (!seenSkillNames.has(key)) {
              seenSkillNames.add(key);
              skills.push(s);
            }
          });
        });
      }
    });

    return skills;
  }, [treeData, selectedTaskIds, selectedProjectIds]);

  const resourceMatchScores = useMemo(() => {
    if (serverMatchScores.size > 0) return serverMatchScores;
    if (allRequiredSkills.length === 0 || !data?.resources) return new Map<string, number>();
    const scores = new Map<string, number>();
    data.resources.forEach(r => {
      const match = computeSkillMatch(r.skills, allRequiredSkills);
      scores.set(r.id, match);
    });
    return scores;
  }, [data?.resources, allRequiredSkills, serverMatchScores]);

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

  const handleToggleTask = useCallback((taskId: string) => {
    setServerMatchScores(new Map());
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const handleToggleProject = useCallback((projectId: string, taskIds: string[]) => {
    setServerMatchScores(new Map());
    setSelectedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleToggleResource = useCallback((resourceId: string) => {
    setSelectedResourceIds(prev => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  }, []);

  const filteredResources = useMemo(() => {
    if (!data?.resources) return [];
    return data.resources.filter(r => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (skillFilter && !r.skills.some(s => s.name.toLowerCase().includes(skillFilter.toLowerCase()))) return false;
      return true;
    });
  }, [data?.resources, roleFilter, skillFilter]);

  const sortedFilteredResources = useMemo(() => {
    if (resourceMatchScores.size === 0) return filteredResources;
    return [...filteredResources].sort((a, b) => {
      const sa = resourceMatchScores.get(a.id) || 0;
      const sb = resourceMatchScores.get(b.id) || 0;
      return sb - sa;
    });
  }, [filteredResources, resourceMatchScores]);

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
        <div className="flex-1 flex overflow-hidden">
          {showSidebar && (
            <>
              <ActivitySidebar
                selectedTaskIds={selectedTaskIds}
                selectedProjectIds={selectedProjectIds}
                onToggleTask={handleToggleTask}
                onToggleProject={handleToggleProject}
                width={sidebarResize.width}
              />
              <ResizeDivider onMouseDown={sidebarResize.handleMouseDown} />
            </>
          )}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <KPICard title="Risorse Attive" value={kpis.totalResources} subtitle="nel periodo selezionato" icon={Users} color="bg-primary/10 text-primary" />
              <KPICard title="Utilizzo Medio" value={`${kpis.avgUtilization}%`} subtitle="capacità impegnata" icon={TrendingUp} color="bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400" />
              <KPICard title="Sovra-allocazioni" value={kpis.overCount} subtitle="celle in criticità" icon={AlertTriangle} color="bg-destructive/10 text-destructive dark:text-destructive" />
              <KPICard title="Sotto-allocazioni" value={kpis.underCount} subtitle="capacità disponibile" icon={Clock} color="bg-warning/10 text-warning" />
            </div>

            <MatchPanel
              selectedProjectIds={selectedProjectIds}
              selectedTaskIds={selectedTaskIds}
              resources={sortedFilteredResources}
              onMatchScores={setServerMatchScores}
            />

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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSidebar(!showSidebar)}
                      className="text-xs"
                      data-testid="toggle-sidebar"
                    >
                      {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                    </Button>
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
                ) : !data || sortedFilteredResources.length === 0 ? (
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
                          <th className="sticky left-0 bg-background z-10 text-left p-2 text-xs font-medium text-muted-foreground" style={{ width: `${resourceColWidth}px`, minWidth: `${resourceColWidth}px`, maxWidth: `${resourceColWidth}px` }}>
                            <div className="flex items-center justify-between">
                              <span>Risorsa</span>
                              <div
                                onMouseDown={handleResourceColMouseDown}
                                className="w-1 h-full cursor-col-resize hover:bg-primary/30 absolute right-0 top-0 bottom-0 flex items-center"
                              >
                                <div className="w-px h-4 bg-border mx-auto" />
                              </div>
                            </div>
                          </th>
                          {data.periods.map((label, idx) => (
                            <th key={idx} className="text-center p-1.5 text-[11px] font-medium text-muted-foreground min-w-[80px]">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedFilteredResources.map(resource => {
                          const matchScore = resourceMatchScores.get(resource.id);
                          const isSelected = selectedResourceIds.has(resource.id);
                          const rowHighlight = matchScore !== undefined && matchScore > 0
                            ? matchScore >= 80 ? "bg-emerald-50/50 dark:bg-emerald-950/20" :
                              matchScore >= 50 ? "bg-warning/10/50 dark:bg-amber-950/20" :
                              "bg-destructive/10/30 dark:bg-red-950/10"
                            : "";

                          return (
                            <tr key={resource.id} className={`border-b hover:bg-muted/30 ${rowHighlight} ${isSelected ? "ring-1 ring-inset ring-primary" : ""}`}>
                              <td className={`sticky left-0 z-10 p-2 relative ${rowHighlight || "bg-background"}`} style={{ width: `${resourceColWidth}px`, minWidth: `${resourceColWidth}px`, maxWidth: `${resourceColWidth}px` }}>
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleResource(resource.id)}
                                    className="h-3.5 w-3.5 shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => setSelectedResource(resource)}
                                      className="text-left hover:bg-muted/50 rounded p-1 -m-1 transition-colors cursor-pointer"
                                      data-testid={`resource-${resource.id}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{resource.name}</div>
                                          <div className="text-[11px] text-muted-foreground truncate">{resource.role} · {resource.skillLevel}</div>
                                        </div>
                                        {matchScore !== undefined && matchScore > 0 && (
                                          <MatchBadge matchPercent={matchScore} />
                                        )}
                                      </div>
                                    </div>
                                    <SkillsPopover skills={resource.skills} matchScore={matchScore} />
                                  </div>
                                </div>
                                <div
                                  onMouseDown={handleResourceColMouseDown}
                                  className="w-1 cursor-col-resize hover:bg-primary/30 absolute right-0 top-0 bottom-0"
                                />
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
                          );
                        })}
                        <tr className="bg-muted/50 border-t-2">
                          <td className="sticky left-0 bg-muted/50 z-10 p-2 border-r font-medium text-xs" style={{ width: `${resourceColWidth}px`, minWidth: `${resourceColWidth}px`, maxWidth: `${resourceColWidth}px` }}>
                            Totale
                          </td>
                          {data.summary.map((s, idx) => {
                            const statusColor = s.avgUtilization > 100
                              ? "text-destructive dark:text-destructive"
                              : s.avgUtilization >= 70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-warning";
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
                <div className="w-3 h-3 rounded bg-warning/20 dark:bg-amber-800 border border-warning/30 dark:border-amber-700" />
                Sotto-allocato (&lt;70%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-destructive/20 dark:bg-red-800 border border-destructive/30 dark:border-red-700" />
                Sovra-allocato (&gt;100%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-muted border border-border" />
                Non disponibile
              </div>
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

                  {resourceMatchScores.has(selectedResource.id) && resourceMatchScores.get(selectedResource.id)! > 0 && (
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                      <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-2">Skill Match</div>
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {resourceMatchScores.get(selectedResource.id)}%
                      </div>
                    </div>
                  )}

                  {selectedResource.skills.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Competenze</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedResource.skills.map(s => {
                          const stars = "★".repeat(s.level) + "☆".repeat(5 - s.level);
                          return (
                            <Badge key={s.id} variant={s.isPrimary ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                              {s.name} <span className="ml-0.5 text-[9px]">{stars}</span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Utilizzo per periodo</div>
                    <div className="space-y-1.5">
                      {selectedResource.periods.map((p, idx) => {
                        const barWidth = Math.min(p.utilization, 150);
                        const barColor = p.status === "over" ? "bg-red-500" : p.status === "balanced" ? "bg-emerald-500" : p.status === "under" ? "bg-amber-500" : "bg-muted";
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
