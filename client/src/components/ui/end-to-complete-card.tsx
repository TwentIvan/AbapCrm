import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarCheck, Clock, ListChecks, AlertTriangle, CheckCircle2, CalendarX, FileQuestion, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface EndToCompleteResult {
  projectId: string;
  projectName: string;
  state: 'completed' | 'on_track' | 'delayed' | 'no_planning_window' | 'no_tasks';
  hasTasks: boolean;
  hasWindow: boolean;
  totalEstimatedHours: number;
  totalRemainingHours: number;
  completionPercentage: number;
  plannedEndDate: string | null;
  effectiveEndDate: string | null;
  effectiveEndTime: string | null;
  windowId: string | null;
  windowName: string | null;
  taskBreakdown: {
    taskId: string;
    taskTitle: string;
    estimatedHours: number;
    completionPercentage: number;
    remainingHours: number;
  }[];
  slotAllocation: {
    date: string;
    startTime: string;
    endTime: string;
    allocatedHours: number;
    isPartialSlot: boolean;
  }[];
}

interface EndToCompleteCardProps {
  projectId: string;
  compact?: boolean;
}

export default function EndToCompleteCard({ projectId, compact = false }: EndToCompleteCardProps) {
  const { data: etcData, isLoading, error } = useQuery<EndToCompleteResult>({
    queryKey: ["/api/projects", projectId, "end-to-complete"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore</AlertTitle>
        <AlertDescription>
          Impossibile calcolare la fine effettiva del progetto.
        </AlertDescription>
      </Alert>
    );
  }

  if (!etcData) {
    return null;
  }

  if (etcData.state === 'no_tasks') {
    if (compact) return null;
    return (
      <Alert className="mb-4">
        <FileQuestion className="h-4 w-4" />
        <AlertTitle>Nessun Task</AlertTitle>
        <AlertDescription>
          Aggiungi dei task al progetto per calcolare la data di fine effettiva basata sulla stima e completamento dei task.
        </AlertDescription>
      </Alert>
    );
  }

  if (etcData.state === 'no_planning_window') {
    if (compact) return null;
    return (
      <Alert className="mb-4 border-warning/20 bg-warning/5/30 dark:border-warning/30">
        <CalendarX className="h-4 w-4 text-warning" />
        <AlertTitle>Nessuna Finestra di Pianificazione</AlertTitle>
        <AlertDescription>
          {etcData.hasTasks ? (
            <>
              Hai {etcData.taskBreakdown.length} task con {etcData.totalRemainingHours.toFixed(1)}h rimanenti.
              Crea una finestra di pianificazione nel Calendario Globale per calcolare la data di fine effettiva.
            </>
          ) : (
            "Crea una finestra di pianificazione per questo progetto nel Calendario Globale."
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const plannedEnd = etcData.plannedEndDate ? new Date(etcData.plannedEndDate) : null;
  const effectiveEnd = etcData.effectiveEndDate ? new Date(etcData.effectiveEndDate) : null;
  
  const isOnTrack = etcData.state === 'on_track';
  const isCompleted = etcData.state === 'completed';
  const isDelayed = etcData.state === 'delayed';

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return date.toLocaleDateString("it-IT", { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-sm">
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : isOnTrack ? (
                <CalendarCheck className="h-4 w-4 text-primary" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
              <span className={isCompleted ? "text-success" : isOnTrack ? "text-primary" : "text-warning"}>
                {isCompleted ? "Completato" : effectiveEnd ? formatDate(effectiveEnd) : "-"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p><strong>Stato:</strong> {isCompleted ? "Completato" : isOnTrack ? "In Tempo" : "In Ritardo"}</p>
              <p><strong>Fine effettiva:</strong> {formatDate(effectiveEnd)}</p>
              <p><strong>Fine pianificata:</strong> {formatDate(plannedEnd)}</p>
              <p><strong>Ore rimanenti:</strong> {etcData.totalRemainingHours.toFixed(1)}h su {etcData.totalEstimatedHours}h</p>
              <p><strong>Completamento:</strong> {etcData.completionPercentage}%</p>
              {etcData.windowName && <p><strong>Finestra:</strong> {etcData.windowName}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className={`border-l-4 ${isCompleted ? 'border-l-success bg-success/10/30' : isOnTrack ? 'border-l-primary bg-primary/5' : 'border-l-orange-500 bg-warning/5/30'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : isOnTrack ? (
            <CalendarCheck className="h-4 w-4 text-primary" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
          Fine Effettiva (End-to-Complete)
          <Badge variant={isCompleted ? "default" : isOnTrack ? "secondary" : "destructive"} className="ml-auto">
            {isCompleted ? "Completato" : isOnTrack ? "In Tempo" : "In Ritardo"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarCheck className="h-3 w-3" />
              Fine Effettiva
            </p>
            <p className="font-semibold text-sm">
              {isCompleted ? "Completato" : formatDate(effectiveEnd)}
              {etcData.effectiveEndTime && !isCompleted && (
                <span className="text-muted-foreground ml-1">({etcData.effectiveEndTime})</span>
              )}
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Fine Pianificata</p>
            <p className="font-semibold text-sm">{formatDate(plannedEnd)}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Ore Rimanenti
            </p>
            <p className="font-semibold text-sm">
              {etcData.totalRemainingHours.toFixed(1)}h 
              <span className="text-muted-foreground font-normal"> / {etcData.totalEstimatedHours}h</span>
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ListChecks className="h-3 w-3" />
              Task
            </p>
            <p className="font-semibold text-sm">{etcData.taskBreakdown.length}</p>
          </div>
        </div>

        {etcData.windowName && (
          <div className="text-xs text-muted-foreground">
            Finestra di pianificazione: <span className="font-medium text-foreground">{etcData.windowName}</span>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Completamento basato sui Task</span>
            <span className="font-medium">{etcData.completionPercentage}%</span>
          </div>
          <Progress value={etcData.completionPercentage} className="h-2" />
        </div>

        {etcData.taskBreakdown.length > 0 && etcData.taskBreakdown.length <= 5 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Dettaglio Task:</p>
            <div className="space-y-1">
              {etcData.taskBreakdown.map(task => (
                <div key={task.taskId} className="flex items-center justify-between text-xs bg-background/50 rounded px-2 py-1">
                  <span className="truncate flex-1 mr-2">{task.taskTitle}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-muted-foreground">{task.remainingHours.toFixed(1)}h rimanenti</span>
                    <Badge variant="outline" className="text-[10px] px-1">
                      {task.completionPercentage}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {etcData.taskBreakdown.length > 5 && (
          <div className="text-xs text-muted-foreground">
            + altri {etcData.taskBreakdown.length - 5} task non mostrati
          </div>
        )}
      </CardContent>
    </Card>
  );
}
