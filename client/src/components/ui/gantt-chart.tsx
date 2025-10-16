import { useState, useRef } from "react";
import { ProjectMilestone } from "@shared/schema";
import { format, differenceInDays, differenceInMilliseconds, min, max, addDays, eachDayOfInterval, startOfDay, addHours, isBefore } from "date-fns";
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
    startX: number;
    originalStart: Date;
    originalEnd: Date;
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

  // Calcola range date con precisione millisecondi
  const allDates = validMilestones.flatMap(m => [new Date(m.startDate!), new Date(m.endDate!)]);
  const minDate = startOfDay(min(allDates));
  const maxDate = startOfDay(max(allDates));
  const totalMs = maxDate.getTime() - minDate.getTime() + (24 * 60 * 60 * 1000); // +1 giorno in ms
  const allDays = eachDayOfInterval({ start: minDate, end: maxDate });

  const getPosition = (date: Date) => {
    const ms = date.getTime() - minDate.getTime();
    const pos = (ms / totalMs) * 100;
    // Clamp tra 0 e 100 per evitare sforamenti
    return Math.max(0, Math.min(100, pos));
  };

  const getWidth = (start: Date, end: Date) => {
    const durationMs = end.getTime() - start.getTime();
    const width = (durationMs / totalMs) * 100;
    const startPos = getPosition(start);
    // Clamp width per non sforare il 100%
    return Math.max(0, Math.min(100 - startPos, width));
  };

  const getDayFromPosition = (x: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = x - rect.left - 192; // 192px = w-48 (12rem)
    const timelineWidth = rect.width - 192;
    const percent = (relativeX / timelineWidth) * 100;
    const totalDays = totalMs / (24 * 60 * 60 * 1000);
    const exactDays = (percent / 100) * totalDays;
    // Snap a mezze giornate (0.5 giorni)
    return Math.round(exactDays * 2) / 2;
  };

  const handleMouseDown = (e: React.MouseEvent, milestone: ProjectMilestone, type: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation();
    e.preventDefault();
    
    const start = new Date(milestone.startDate!);
    const end = new Date(milestone.endDate!);
    
    setDragState({
      id: milestone.id,
      type,
      startX: e.clientX,
      originalStart: start,
      originalEnd: end
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState || !containerRef.current) return;
    
    const deltaX = e.clientX - dragState.startX;
    const rect = containerRef.current.getBoundingClientRect();
    const timelineWidth = rect.width - 192;
    const totalDays = totalMs / (24 * 60 * 60 * 1000);
    const deltaDays = (deltaX / timelineWidth) * totalDays;
    
    // Snap a mezze giornate
    const snappedDelta = Math.round(deltaDays * 2) / 2;
    
    const durationMs = dragState.originalEnd.getTime() - dragState.originalStart.getTime();

    let newStart: Date;
    let newEnd: Date;

    if (dragState.type === 'move') {
      // Sposta entrambe le date preservando la durata
      newStart = addDays(dragState.originalStart, Math.floor(snappedDelta));
      if (snappedDelta % 1 === 0.5) {
        newStart = addHours(newStart, 12);
      } else if (snappedDelta % 1 === -0.5) {
        newStart = addHours(newStart, -12);
      }
      newEnd = new Date(newStart.getTime() + durationMs);
    } else if (dragState.type === 'resize-start') {
      // Modifica solo la data di inizio
      newStart = addDays(dragState.originalStart, Math.floor(snappedDelta));
      if (snappedDelta % 1 === 0.5) {
        newStart = addHours(newStart, 12);
      } else if (snappedDelta % 1 === -0.5) {
        newStart = addHours(newStart, -12);
      }
      newEnd = dragState.originalEnd;
    } else { // resize-end
      // Modifica solo la data di fine
      newStart = dragState.originalStart;
      newEnd = addDays(dragState.originalEnd, Math.floor(snappedDelta));
      if (snappedDelta % 1 === 0.5) {
        newEnd = addHours(newEnd, 12);
      } else if (snappedDelta % 1 === -0.5) {
        newEnd = addHours(newEnd, -12);
      }
    }

    // Aggiorna lo stato con preview per tooltip
    setDragState({
      ...dragState,
      previewStart: newStart,
      previewEnd: newEnd
    });

    // Visual feedback
    const milestoneElement = document.querySelector(`[data-milestone-id="${dragState.id}"]`);
    if (milestoneElement) {
      const leftPos = getPosition(newStart);
      const width = getWidth(newStart, newEnd);
      (milestoneElement as HTMLElement).style.left = `${leftPos}%`;
      (milestoneElement as HTMLElement).style.width = `${width}%`;
    }
  };

  const handleMouseUp = () => {
    if (!dragState || !dragState.previewStart || !dragState.previewEnd) {
      setDragState(null);
      return;
    }
    
    console.log("Drag end:", {
      id: dragState.id,
      start: dragState.previewStart.toISOString(),
      end: dragState.previewEnd.toISOString()
    });
    
    onMilestoneUpdate?.(dragState.id, dragState.previewStart, dragState.previewEnd);
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
              {/* SVG Background con gridlines */}
              <svg className="absolute left-48 right-0 top-0 bottom-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 0 }}>
                {allDays.flatMap((day, index) => {
                  const dayPos = getPosition(day);
                  const halfDayPos = getPosition(addHours(day, 12));
                  return [
                    // Linea giornata intera
                    <line
                      key={`day-${index}`}
                      x1={`${dayPos}%`}
                      y1="0"
                      x2={`${dayPos}%`}
                      y2="100%"
                      stroke="rgb(100, 116, 139)"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                      opacity="0.6"
                    />,
                    // Linea mezza giornata
                    <line
                      key={`half-${index}`}
                      x1={`${halfDayPos}%`}
                      y1="0"
                      x2={`${halfDayPos}%`}
                      y2="100%"
                      stroke="rgb(148, 163, 184)"
                      strokeWidth="1"
                      strokeDasharray="3 2"
                      opacity="0.4"
                    />
                  ];
                })}
              </svg>

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
              <div className="space-y-3" style={{ position: 'relative', zIndex: 1 }}>
                {sortedMilestones.map((milestone) => {
                  const start = new Date(milestone.startDate!);
                  const end = new Date(milestone.endDate!);
                  const leftPos = getPosition(start);
                  const barWidth = getWidth(start, end);

                  // Dipendenza
                  const prerequisite = milestone.dependsOnMilestoneId 
                    ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                    : null;

                  // Controlla sovrapposizione dipendenze - vera sovrapposizione solo se child inizia PRIMA che finisca il padre
                  const hasOverlap = prerequisite && prerequisite.endDate && 
                    (new Date(milestone.startDate!).getTime() < new Date(prerequisite.endDate).getTime());
                  
                  if (hasOverlap && prerequisite) {
                    console.log("OVERLAP DETECTED:", {
                      milestone: milestone.name,
                      milestoneStart: new Date(milestone.startDate!).toISOString(),
                      prerequisite: prerequisite.name,
                      prerequisiteEnd: new Date(prerequisite.endDate!).toISOString(),
                      overlapMs: new Date(prerequisite.endDate!).getTime() - new Date(milestone.startDate!).getTime()
                    });
                  }

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
                          {/* Linea dipendenza discreta */}
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
                                      markerWidth="8"
                                      markerHeight="8"
                                      refX="7"
                                      refY="3"
                                      orient="auto"
                                      markerUnits="strokeWidth"
                                    >
                                      <path d="M0,0 L0,6 L7,3 z" fill="rgb(148, 163, 184)" />
                                    </marker>
                                  </defs>
                                  <line
                                    x1={`${prereqPos}%`}
                                    y1="50%"
                                    x2={`${milestonePos}%`}
                                    y2="50%"
                                    stroke="rgb(148, 163, 184)"
                                    strokeWidth="1.5"
                                    strokeDasharray="4 2"
                                    markerEnd={`url(#arrow-${milestone.id})`}
                                    opacity="0.5"
                                  />
                                </svg>
                              );
                            })()
                          )}

                          {/* Area rossa di conflitto (separata) */}
                          {hasOverlap && prerequisite && (
                            (() => {
                              const prereqEnd = new Date(prerequisite.endDate!);
                              const childStart = new Date(milestone.startDate!);
                              const overlapStart = childStart;
                              const overlapEnd = prereqEnd;
                              const overlapLeft = getPosition(overlapStart);
                              const overlapWidth = getWidth(overlapStart, overlapEnd);
                              
                              return (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-10 rounded-sm pointer-events-none"
                                  style={{
                                    left: `${overlapLeft}%`,
                                    width: `${overlapWidth}%`,
                                    background: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.5), rgba(239, 68, 68, 0.5) 8px, rgba(239, 68, 68, 0.3) 8px, rgba(239, 68, 68, 0.3) 16px)',
                                    border: '2px solid rgb(239, 68, 68)',
                                    zIndex: 8
                                  }}
                                />
                              );
                            })()
                          )}

                          {/* Barra milestone */}
                          <div
                            data-milestone-id={milestone.id}
                            className={`absolute top-1/2 -translate-y-1/2 h-10 rounded group ${statusColors[milestone.status || "planned"]}`}
                            style={{
                              left: `${leftPos}%`,
                              width: `${barWidth}%`,
                              cursor: dragState?.id === milestone.id ? 'grabbing' : 'grab',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                              zIndex: dragState?.id === milestone.id ? 20 : 10,
                              position: 'relative'
                            }}
                            onMouseDown={(e) => handleMouseDown(e, milestone, 'move')}
                          >

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
