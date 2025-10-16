import { useState, useRef } from "react";
import { ProjectMilestone } from "@shared/schema";
import { format, differenceInDays, min, max, addDays, eachDayOfInterval } from "date-fns";
import { it } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface GanttChartProps {
  milestones: ProjectMilestone[];
  projects: Array<{ id: string; name: string }>;
  onMilestoneClick?: (milestone: ProjectMilestone) => void;
  onMilestoneUpdate?: (id: string, startDate: Date, endDate: Date) => void;
}

export function GanttChart({ milestones, projects, onMilestoneClick, onMilestoneUpdate }: GanttChartProps) {
  const [draggingState, setDraggingState] = useState<{ 
    id: string; 
    startDate: Date; 
    endDate: Date; 
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const [resizingState, setResizingState] = useState<{ 
    id: string; 
    edge: 'start' | 'end';
    startDate: Date;
    endDate: Date;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (milestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Nessuna milestone da visualizzare
      </div>
    );
  }

  // Filtra milestone con date valide
  const validMilestones = milestones.filter(m => m.startDate && m.endDate);
  
  if (validMilestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aggiungi date alle milestone per visualizzare il Gantt
      </div>
    );
  }

  // Calcola range date
  const allDates = validMilestones.flatMap(m => [new Date(m.startDate!), new Date(m.endDate!)]);
  const minDate = min(allDates);
  const maxDate = max(allDates);
  const totalDays = differenceInDays(maxDate, minDate) + 1;

  // Genera array di tutti i giorni per le gridlines
  const allDays = eachDayOfInterval({ start: minDate, end: maxDate });

  const getPosition = (date: Date) => {
    const days = differenceInDays(date, minDate);
    return (days / totalDays) * 100;
  };

  const getWidth = (start: Date, end: Date) => {
    const days = differenceInDays(end, start) + 1;
    return (days / totalDays) * 100;
  };

  const getDateFromPosition = (positionPercent: number): Date => {
    const days = Math.round((positionPercent / 100) * totalDays);
    return addDays(minDate, days);
  };

  const handleBarMouseDown = (e: React.MouseEvent, milestone: ProjectMilestone, edge?: 'start' | 'end') => {
    e.stopPropagation();
    const start = new Date(milestone.startDate!);
    const end = new Date(milestone.endDate!);
    
    if (edge) {
      setResizingState({ 
        id: milestone.id, 
        edge,
        startDate: start,
        endDate: end
      });
    } else {
      setDraggingState({ 
        id: milestone.id,
        startDate: start,
        endDate: end,
        originalStart: start,
        originalEnd: end
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const positionPercent = (x / rect.width) * 100;
    const newDate = getDateFromPosition(Math.max(0, Math.min(100, positionPercent)));

    if (draggingState) {
      const duration = differenceInDays(draggingState.originalEnd, draggingState.originalStart);
      const newEndDate = addDays(newDate, duration);
      setDraggingState({
        ...draggingState,
        startDate: newDate,
        endDate: newEndDate
      });
    } else if (resizingState) {
      if (resizingState.edge === 'start') {
        if (newDate < resizingState.endDate) {
          setResizingState({
            ...resizingState,
            startDate: newDate
          });
        }
      } else {
        if (newDate > resizingState.startDate) {
          setResizingState({
            ...resizingState,
            endDate: newDate
          });
        }
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingState) {
      onMilestoneUpdate?.(draggingState.id, draggingState.startDate, draggingState.endDate);
      setDraggingState(null);
    } else if (resizingState) {
      onMilestoneUpdate?.(resizingState.id, resizingState.startDate, resizingState.endDate);
      setResizingState(null);
    }
  };

  const statusColors = {
    planned: "bg-blue-500",
    in_progress: "bg-yellow-500",
    completed: "bg-green-500",
    cancelled: "bg-red-500"
  };

  const statusLabels = {
    planned: "Pianificato",
    in_progress: "In Corso",
    completed: "Completato",
    cancelled: "Annullato"
  };

  // Raggruppa per progetto
  const milestonesByProject = validMilestones.reduce((acc, milestone) => {
    const projectId = milestone.projectId || 'no-project';
    if (!acc[projectId]) acc[projectId] = [];
    acc[projectId].push(milestone);
    return acc;
  }, {} as Record<string, ProjectMilestone[]>);

  return (
    <div className="space-y-8">
      {/* Timeline Header */}
      <div className="relative">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>{format(minDate, "dd MMM yyyy", { locale: it })}</span>
          <span>{format(maxDate, "dd MMM yyyy", { locale: it })}</span>
        </div>
        <div className="relative h-1 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>

      {/* Gantt per progetto */}
      {Object.entries(milestonesByProject).map(([projectId, projectMilestones]) => {
        const project = projects.find(p => p.id === projectId);
        const sortedMilestones = [...projectMilestones].sort((a, b) => 
          (a.displayOrder || 0) - (b.displayOrder || 0)
        );

        return (
          <div key={projectId} className="space-y-4">
            <h3 className="font-semibold text-lg">
              {project?.name || 'Progetto non assegnato'}
            </h3>
            
            <div 
              ref={containerRef}
              className="relative"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Gridlines verticali - layer dietro tutto */}
              <div className="absolute inset-0 pointer-events-none z-0">
                {allDays.map((day, index) => {
                  const pos = getPosition(day);
                  return (
                    <div
                      key={index}
                      className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-300 dark:border-gray-600"
                      style={{ left: `calc(12rem + ${pos}% * (100% - 12rem) / 100)` }}
                    />
                  );
                })}
              </div>

              {/* Layer dipendenze - sopra gridlines, sotto milestone bars */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {sortedMilestones.map((milestone) => {
                  const prerequisite = milestone.dependsOnMilestoneId 
                    ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                    : null;

                  if (!prerequisite || !prerequisite.endDate) return null;

                  const prereqEnd = new Date(prerequisite.endDate);
                  const milestoneStart = new Date(milestone.startDate!);
                  const prereqPos = getPosition(prereqEnd);
                  const milestonePos = getPosition(milestoneStart);
                  
                  const prereqIndex = sortedMilestones.findIndex(m => m.id === prerequisite.id);
                  const milestoneIndex = sortedMilestones.findIndex(m => m.id === milestone.id);
                  
                  const isForward = prereqPos <= milestonePos;
                  const lineWidth = Math.abs(milestonePos - prereqPos);
                  
                  const lineStyle = isForward 
                    ? { left: `calc(12rem + ${prereqPos}% * (100% - 12rem) / 100)`, width: `calc(${lineWidth}% * (100% - 12rem) / 100)` }
                    : { right: `calc(100% - 12rem - ${prereqPos}% * (100% - 12rem) / 100)`, width: `calc(${lineWidth}% * (100% - 12rem) / 100)` };
                  
                  const topOffset = prereqIndex * 72 + 48;
                  const height = Math.abs(milestoneIndex - prereqIndex) * 72;
                  
                  return (
                    <div
                      key={`dep-${milestone.id}`}
                      className="absolute"
                      style={{ 
                        top: `${topOffset}px`,
                        height: `${height}px`,
                        ...lineStyle
                      }}
                    >
                      <div className="relative w-full h-full">
                        <div 
                          className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-400 dark:to-purple-500 rounded-full shadow-lg"
                          style={{
                            filter: 'drop-shadow(0 0 6px rgba(168, 85, 247, 0.7))'
                          }}
                        >
                          <ArrowRight 
                            className={`absolute top-1/2 -translate-y-1/2 h-6 w-6 text-purple-600 dark:text-purple-400 ${
                              isForward ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2 rotate-180'
                            }`}
                            style={{ filter: 'drop-shadow(0 0 4px rgba(168, 85, 247, 0.9))' }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Milestone rows - layer sopra */}
              <div className="space-y-3 relative z-20">
                {sortedMilestones.map((milestone) => {
                  const state = draggingState?.id === milestone.id ? draggingState : 
                                resizingState?.id === milestone.id ? resizingState : null;
                  const start = state ? state.startDate : new Date(milestone.startDate!);
                  const end = state ? state.endDate : new Date(milestone.endDate!);
                  const leftPos = getPosition(start);
                  const barWidth = getWidth(start, end);

                  return (
                    <div key={milestone.id} className="relative h-12">
                      {/* Milestone info */}
                      <div className="flex items-center gap-4">
                        <div className="w-48 flex-shrink-0">
                          <button
                            onClick={() => onMilestoneClick?.(milestone)}
                            className="text-sm font-medium hover:underline text-left"
                            data-testid={`gantt-milestone-${milestone.id}`}
                          >
                            {milestone.name}
                          </button>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`${statusColors[milestone.status || "planned"]} text-white text-xs`}>
                              {statusLabels[milestone.status || "planned"]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {milestone.progress || 0}%
                            </span>
                          </div>
                        </div>

                        {/* Timeline bar */}
                        <div className="flex-1 relative h-12">
                          {/* Barra milestone con resize handles */}
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-9 rounded-md transition-all hover:opacity-90 group ${statusColors[milestone.status || "planned"]}`}
                            style={{
                              left: `${leftPos}%`,
                              width: `${barWidth}%`,
                              cursor: draggingState?.id === milestone.id ? 'grabbing' : 'grab',
                              boxShadow: state
                                ? '0 6px 16px rgba(0,0,0,0.4)' 
                                : '0 2px 6px rgba(0,0,0,0.15)',
                              transform: state ? 'translateY(-50%) scale(1.05)' : 'translateY(-50%)',
                            }}
                            onMouseDown={(e) => handleBarMouseDown(e, milestone)}
                          >
                            {/* Resize handle - start */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-md flex items-center justify-center"
                              onMouseDown={(e) => handleBarMouseDown(e, milestone, 'start')}
                            >
                              <div className="w-1 h-4 bg-white/60 rounded" />
                            </div>
                            
                            {/* Contenuto barra */}
                            <div className="px-3 h-full flex items-center justify-center pointer-events-none">
                              <Progress 
                                value={milestone.progress || 0} 
                                className="h-1.5 bg-white/30"
                              />
                            </div>

                            {/* Resize handle - end */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-r-md flex items-center justify-center"
                              onMouseDown={(e) => handleBarMouseDown(e, milestone, 'end')}
                            >
                              <div className="w-1 h-4 bg-white/60 rounded" />
                            </div>
                          </div>

                          {/* Date tooltip */}
                          <div 
                            className="absolute top-full mt-1 text-xs text-muted-foreground whitespace-nowrap pointer-events-none"
                            style={{ left: `${leftPos}%` }}
                          >
                            {format(start, "dd/MM")} - {format(end, "dd/MM")}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
