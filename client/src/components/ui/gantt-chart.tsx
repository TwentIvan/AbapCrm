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
  const [draggedMilestone, setDraggedMilestone] = useState<string | null>(null);
  const [resizingMilestone, setResizingMilestone] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
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

  const handleBarMouseDown = (e: React.MouseEvent, milestoneId: string, edge?: 'start' | 'end') => {
    e.stopPropagation();
    if (edge) {
      setResizingMilestone({ id: milestoneId, edge });
    } else {
      setDraggedMilestone(milestoneId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const positionPercent = (x / rect.width) * 100;
    const newDate = getDateFromPosition(Math.max(0, Math.min(100, positionPercent)));

    if (draggedMilestone) {
      const milestone = validMilestones.find(m => m.id === draggedMilestone);
      if (milestone && milestone.startDate && milestone.endDate) {
        const duration = differenceInDays(new Date(milestone.endDate), new Date(milestone.startDate));
        const newEndDate = addDays(newDate, duration);
        onMilestoneUpdate?.(draggedMilestone, newDate, newEndDate);
      }
    } else if (resizingMilestone) {
      const milestone = validMilestones.find(m => m.id === resizingMilestone.id);
      if (milestone && milestone.startDate && milestone.endDate) {
        const start = new Date(milestone.startDate);
        const end = new Date(milestone.endDate);
        
        if (resizingMilestone.edge === 'start') {
          if (newDate < end) {
            onMilestoneUpdate?.(resizingMilestone.id, newDate, end);
          }
        } else {
          if (newDate > start) {
            onMilestoneUpdate?.(resizingMilestone.id, start, newDate);
          }
        }
      }
    }
  };

  const handleMouseUp = () => {
    setDraggedMilestone(null);
    setResizingMilestone(null);
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
              className="space-y-3 relative"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Gridlines verticali per ogni giorno */}
              <div className="absolute inset-0 pointer-events-none" style={{ marginLeft: '12rem' }}>
                {allDays.map((day, index) => {
                  const pos = getPosition(day);
                  return (
                    <div
                      key={index}
                      className="absolute top-0 bottom-0 border-l border-dashed border-gray-300 dark:border-gray-600 opacity-30"
                      style={{ left: `${pos}%` }}
                    />
                  );
                })}
              </div>

              {sortedMilestones.map((milestone) => {
                const start = new Date(milestone.startDate!);
                const end = new Date(milestone.endDate!);
                const leftPos = getPosition(start);
                const barWidth = getWidth(start, end);
                
                // Trova dipendenza (milestone prerequisito)
                const prerequisite = milestone.dependsOnMilestoneId 
                  ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                  : null;

                return (
                  <div key={milestone.id} className="relative z-10">
                    {/* Milestone info */}
                    <div className="flex items-center gap-4 mb-1">
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
                        {/* Linea dipendenza migliorata */}
                        {prerequisite && prerequisite.endDate && (
                          (() => {
                            const prereqEnd = new Date(prerequisite.endDate);
                            const prereqPos = getPosition(prereqEnd);
                            
                            const isForward = prereqPos <= leftPos;
                            const lineWidth = Math.abs(leftPos - prereqPos);
                            
                            const lineStyle = isForward 
                              ? { left: `${prereqPos}%`, width: `${lineWidth}%` }
                              : { right: `${100 - prereqPos}%`, width: `${lineWidth}%` };
                            
                            return (
                              <div
                                className="absolute top-1/2 h-1 bg-purple-500 dark:bg-purple-400 shadow-lg z-20"
                                style={{
                                  ...lineStyle,
                                  filter: 'drop-shadow(0 0 3px rgba(168, 85, 247, 0.5))'
                                }}
                              >
                                <ArrowRight 
                                  className={`absolute -top-2.5 h-5 w-5 text-purple-500 dark:text-purple-400 ${
                                    isForward ? 'right-0' : 'left-0 rotate-180'
                                  }`}
                                  style={{ filter: 'drop-shadow(0 0 2px rgba(168, 85, 247, 0.8))' }}
                                />
                              </div>
                            );
                          })()
                        )}
                        
                        {/* Warning se dipendenza senza date */}
                        {prerequisite && !prerequisite.endDate && (
                          <div className="absolute top-0 left-0 text-xs text-yellow-600 dark:text-yellow-400">
                            ⚠️ Prerequisito senza data fine
                          </div>
                        )}

                        {/* Barra milestone con resize handles */}
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-9 rounded-md transition-all hover:opacity-90 group ${statusColors[milestone.status || "planned"]}`}
                          style={{
                            left: `${leftPos}%`,
                            width: `${barWidth}%`,
                            cursor: draggedMilestone === milestone.id ? 'grabbing' : 'grab',
                            boxShadow: draggedMilestone === milestone.id || resizingMilestone?.id === milestone.id 
                              ? '0 4px 12px rgba(0,0,0,0.3)' 
                              : '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, milestone.id)}
                        >
                          {/* Resize handle - start */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleBarMouseDown(e, milestone.id, 'start')}
                          />
                          
                          {/* Contenuto barra */}
                          <div className="px-2 h-full flex items-center justify-center pointer-events-none">
                            <Progress 
                              value={milestone.progress || 0} 
                              className="h-1 bg-white/30"
                            />
                          </div>

                          {/* Resize handle - end */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleBarMouseDown(e, milestone.id, 'end')}
                          />
                        </div>

                        {/* Date tooltip */}
                        <div 
                          className="absolute top-full mt-1 text-xs text-muted-foreground whitespace-nowrap"
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
        );
      })}
    </div>
  );
}
