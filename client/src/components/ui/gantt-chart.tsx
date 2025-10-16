import { useState, useRef } from "react";
import { ProjectMilestone } from "@shared/schema";
import { format, differenceInDays, min, max, addDays, eachDayOfInterval, startOfDay, addHours, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface GanttChartProps {
  milestones: ProjectMilestone[];
  projects: Array<{ id: string; name: string }>;
  onMilestoneClick?: (milestone: ProjectMilestone) => void;
  onMilestoneUpdate?: (id: string, startDate: Date, endDate: Date) => void;
}

export function GanttChart({ milestones, projects, onMilestoneClick, onMilestoneUpdate }: GanttChartProps) {
  const [dragState, setDragState] = useState<{ 
    id: string; 
    type: 'move' | 'resize-start' | 'resize-end';
    offsetDays: number;
    previewStart?: Date;
    previewEnd?: Date;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (milestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Nessuna milestone da visualizzare
      </div>
    );
  }

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
  const minDate = startOfDay(min(allDates));
  const maxDate = startOfDay(max(allDates));
  const totalDays = differenceInDays(maxDate, minDate) + 1;
  const allDays = eachDayOfInterval({ start: minDate, end: maxDate });

  const getPosition = (date: Date) => {
    const days = differenceInDays(startOfDay(date), minDate);
    return (days / totalDays) * 100;
  };

  const getWidth = (start: Date, end: Date) => {
    const days = differenceInDays(startOfDay(end), startOfDay(start)) + 1;
    return (days / totalDays) * 100;
  };

  const getDayFromPosition = (x: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = x - rect.left - 192; // 192px = w-48 (12rem)
    const timelineWidth = rect.width - 192;
    const percent = (relativeX / timelineWidth) * 100;
    // Snap a mezze giornate (0.5 giorni)
    return Math.round(((percent / 100) * totalDays) * 2) / 2;
  };

  const handleMouseDown = (e: React.MouseEvent, milestone: ProjectMilestone, type: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation();
    e.preventDefault();
    
    const dayAtCursor = getDayFromPosition(e.clientX);
    const start = new Date(milestone.startDate!);
    const startDay = differenceInDays(startOfDay(start), minDate);
    
    setDragState({
      id: milestone.id,
      type,
      offsetDays: dayAtCursor - startDay
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState || !containerRef.current) return;
    
    const dayAtCursor = getDayFromPosition(e.clientX);
    const milestone = validMilestones.find(m => m.id === dragState.id);
    if (!milestone) return;

    const start = new Date(milestone.startDate!);
    const end = new Date(milestone.endDate!);
    const duration = differenceInDays(end, start);

    let newStart: Date;
    let newEnd: Date;

    if (dragState.type === 'move') {
      const targetDay = Math.max(0, Math.min(totalDays - duration - 1, dayAtCursor - dragState.offsetDays));
      newStart = addDays(minDate, Math.floor(targetDay));
      if (targetDay % 1 === 0.5) {
        newStart = addHours(newStart, 12);
      }
      newEnd = addDays(newStart, duration);
    } else if (dragState.type === 'resize-start') {
      const targetDay = Math.max(0, Math.min(differenceInDays(end, minDate) - 0.5, dayAtCursor));
      newStart = addDays(minDate, Math.floor(targetDay));
      if (targetDay % 1 === 0.5) {
        newStart = addHours(newStart, 12);
      }
      newEnd = end;
    } else { // resize-end
      const targetDay = Math.max(differenceInDays(start, minDate) + 0.5, Math.min(totalDays, dayAtCursor));
      newStart = start;
      newEnd = addDays(minDate, Math.floor(targetDay));
      if (targetDay % 1 === 0.5) {
        newEnd = addHours(newEnd, 12);
      }
    }

    // Aggiorna lo stato con preview per tooltip
    setDragState({
      ...dragState,
      previewStart: newStart,
      previewEnd: newEnd
    });

    // Visual feedback only - we'll save on mouseup
    const milestoneElement = document.querySelector(`[data-milestone-id="${dragState.id}"]`);
    if (milestoneElement) {
      const leftPos = getPosition(newStart);
      const width = getWidth(newStart, newEnd);
      (milestoneElement as HTMLElement).style.left = `${leftPos}%`;
      (milestoneElement as HTMLElement).style.width = `${width}%`;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!dragState) return;
    
    const dayAtCursor = getDayFromPosition(e.clientX);
    const milestone = validMilestones.find(m => m.id === dragState.id);
    if (!milestone) return;

    const start = new Date(milestone.startDate!);
    const end = new Date(milestone.endDate!);
    const duration = differenceInDays(end, start);

    let newStart: Date;
    let newEnd: Date;

    if (dragState.type === 'move') {
      const targetDay = Math.max(0, Math.min(totalDays - duration - 1, dayAtCursor - dragState.offsetDays));
      newStart = addDays(minDate, targetDay);
      newEnd = addDays(newStart, duration);
    } else if (dragState.type === 'resize-start') {
      const targetDay = Math.max(0, Math.min(differenceInDays(end, minDate) - 1, dayAtCursor));
      newStart = addDays(minDate, targetDay);
      newEnd = end;
    } else {
      const targetDay = Math.max(differenceInDays(start, minDate) + 1, Math.min(totalDays, dayAtCursor));
      newStart = start;
      newEnd = addDays(minDate, targetDay);
    }

    onMilestoneUpdate?.(milestone.id, newStart, newEnd);
    setDragState(null);
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

  const milestonesByProject = validMilestones.reduce((acc, milestone) => {
    const projectId = milestone.projectId || 'no-project';
    if (!acc[projectId]) acc[projectId] = [];
    acc[projectId].push(milestone);
    return acc;
  }, {} as Record<string, ProjectMilestone[]>);

  return (
    <div className="space-y-8">
      {/* Timeline Header */}
      <div className="relative pl-48">
        <div className="flex justify-between text-sm font-medium text-muted-foreground mb-2">
          <span>{format(minDate, "dd MMM yyyy", { locale: it })}</span>
          <span>{format(maxDate, "dd MMM yyyy", { locale: it })}</span>
        </div>
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>

      {/* Gantt per progetto */}
      {Object.entries(milestonesByProject).map(([projectId, projectMilestones]) => {
        const project = projects.find(p => p.id === projectId);
        const sortedMilestones = [...projectMilestones].sort((a, b) => 
          (a.displayOrder || 0) - (b.displayOrder || 0)
        );

        return (
          <div key={projectId} className="space-y-4">
            <h3 className="font-semibold text-lg">{project?.name || 'Progetto non assegnato'}</h3>
            
            <div 
              ref={containerRef}
              className="relative select-none"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Gridlines verticali - giornate e mezze giornate */}
              <div className="absolute left-48 right-0 top-0 bottom-0 pointer-events-none">
                {allDays.flatMap((day, index) => {
                  const dayPos = getPosition(day);
                  const halfDayPos = getPosition(addHours(day, 12));
                  return [
                    // Linea giornata intera (più scura)
                    <div
                      key={`day-${index}`}
                      className="absolute top-0 bottom-0 w-px bg-gray-400 dark:bg-gray-500"
                      style={{ 
                        left: `${dayPos}%`,
                        borderLeft: '1px dashed currentColor',
                        opacity: 0.5
                      }}
                    />,
                    // Linea mezza giornata (più chiara)
                    <div
                      key={`half-${index}`}
                      className="absolute top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600"
                      style={{ 
                        left: `${halfDayPos}%`,
                        borderLeft: '1px dashed currentColor',
                        opacity: 0.25
                      }}
                    />
                  ];
                })}
              </div>

              {/* Tooltip data durante drag */}
              {dragState && dragState.previewStart && dragState.previewEnd && (
                <div 
                  className="absolute top-0 left-48 right-0 pointer-events-none z-50"
                >
                  <div className="bg-black/80 text-white px-3 py-2 rounded text-xs font-medium whitespace-nowrap inline-block">
                    {format(dragState.previewStart, "dd/MM/yyyy HH:mm", { locale: it })} - {format(dragState.previewEnd, "dd/MM/yyyy HH:mm", { locale: it })}
                  </div>
                </div>
              )}

              {/* Milestone rows */}
              <div className="space-y-3">
                {sortedMilestones.map((milestone) => {
                  const start = new Date(milestone.startDate!);
                  const end = new Date(milestone.endDate!);
                  const leftPos = getPosition(start);
                  const barWidth = getWidth(start, end);

                  // Dipendenza
                  const prerequisite = milestone.dependsOnMilestoneId 
                    ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                    : null;

                  // Controlla sovrapposizione dipendenze
                  const hasOverlap = prerequisite && prerequisite.endDate && 
                    isBefore(new Date(milestone.startDate!), new Date(prerequisite.endDate));

                  return (
                    <div key={milestone.id} className="relative h-16">
                      <div className="flex items-center gap-4">
                        {/* Nome milestone */}
                        <div className="w-48 flex-shrink-0">
                          <button
                            onClick={() => onMilestoneClick?.(milestone)}
                            className="text-sm font-medium hover:underline text-left truncate w-full"
                            data-testid={`gantt-milestone-${milestone.id}`}
                          >
                            {milestone.name}
                          </button>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`${statusColors[milestone.status || "planned"]} text-white text-xs`}>
                              {statusLabels[milestone.status || "planned"]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{milestone.progress || 0}%</span>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="flex-1 relative h-16">
                          {/* Linea dipendenza - MOLTO EVIDENTE */}
                          {prerequisite && prerequisite.endDate && (
                            (() => {
                              const prereqEnd = new Date(prerequisite.endDate);
                              const prereqPos = getPosition(prereqEnd);
                              const milestonePos = getPosition(start);
                              
                              return (
                                <svg 
                                  className="absolute inset-0 pointer-events-none overflow-visible"
                                  style={{ zIndex: 5 }}
                                >
                                  <defs>
                                    <marker
                                      id={`arrow-${milestone.id}`}
                                      markerWidth="10"
                                      markerHeight="10"
                                      refX="9"
                                      refY="3"
                                      orient="auto"
                                      markerUnits="strokeWidth"
                                    >
                                      <path d="M0,0 L0,6 L9,3 z" fill="#a855f7" />
                                    </marker>
                                  </defs>
                                  <line
                                    x1={`${prereqPos}%`}
                                    y1="50%"
                                    x2={`${milestonePos}%`}
                                    y2="50%"
                                    stroke="#a855f7"
                                    strokeWidth="3"
                                    markerEnd={`url(#arrow-${milestone.id})`}
                                    style={{
                                      filter: 'drop-shadow(0 0 4px rgba(168, 85, 247, 0.8))'
                                    }}
                                  />
                                </svg>
                              );
                            })()
                          )}

                          {/* Barra milestone */}
                          <div
                            data-milestone-id={milestone.id}
                            className={`absolute top-1/2 -translate-y-1/2 h-10 rounded group ${statusColors[milestone.status || "planned"]} ${hasOverlap ? 'ring-2 ring-red-500' : ''}`}
                            style={{
                              left: `${leftPos}%`,
                              width: `${barWidth}%`,
                              cursor: dragState?.id === milestone.id ? 'grabbing' : 'grab',
                              boxShadow: hasOverlap 
                                ? '0 0 12px rgba(239, 68, 68, 0.6), 0 2px 4px rgba(0,0,0,0.2)' 
                                : '0 2px 4px rgba(0,0,0,0.2)',
                              zIndex: dragState?.id === milestone.id ? 20 : 10
                            }}
                            onMouseDown={(e) => handleMouseDown(e, milestone, 'move')}
                          >
                            {/* Ombreggiatura rossa per sovrapposizione */}
                            {hasOverlap && (
                              <div className="absolute inset-0 bg-red-500/30 rounded pointer-events-none" />
                            )}

                            {/* Resize handle sinistra */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-black/0 hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
                              onMouseDown={(e) => handleMouseDown(e, milestone, 'resize-start')}
                            >
                              <div className="w-1 h-6 bg-white/80 rounded-full" />
                            </div>
                            
                            {/* Contenuto */}
                            <div className="px-3 h-full flex items-center justify-center pointer-events-none">
                              <Progress value={milestone.progress || 0} className="h-1.5 bg-white/30" />
                            </div>

                            {/* Resize handle destra */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-black/0 hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
                              onMouseDown={(e) => handleMouseDown(e, milestone, 'resize-end')}
                            >
                              <div className="w-1 h-6 bg-white/80 rounded-full" />
                            </div>
                          </div>

                          {/* Date */}
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
