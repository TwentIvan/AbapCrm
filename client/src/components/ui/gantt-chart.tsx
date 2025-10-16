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
    rowWidth: number;
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

  // Parse date strings (YYYY-MM-DD) come startOfDay locale per evitare problemi timezone
  const parseDate = (dateStr: string | Date): Date => {
    if (dateStr instanceof Date) {
      return startOfDay(dateStr);
    }
    const [year, month, day] = dateStr.split('-').map(Number);
    return startOfDay(new Date(year, month - 1, day));
  };
  
  const allDates = validMilestones.flatMap(m => [parseDate(m.startDate!), parseDate(m.endDate!)]);
  const minDate = min(allDates);
  const maxDate = max(allDates);
  const totalMs = maxDate.getTime() - minDate.getTime() + (24 * 60 * 60 * 1000); // +1 giorno in ms
  const allDays = eachDayOfInterval({ start: minDate, end: maxDate });

  const getPosition = (date: Date) => {
    const ms = date.getTime() - minDate.getTime();
    return (ms / totalMs) * 100;
  };

  const getWidth = (start: Date, end: Date) => {
    const durationMs = end.getTime() - start.getTime();
    return (durationMs / totalMs) * 100;
  };

  // Clamp solo per rendering CSS per evitare sforamenti visivi
  const clampPosition = (pos: number) => Math.max(0, Math.min(100, pos));
  const clampWidth = (left: number, width: number) => Math.max(0, Math.min(100 - left, width));

  const getDayFromPosition = (x: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = x - rect.left - 192; // 192px = w-48 (12rem)
    const timelineWidth = rect.width - 192;
    const percent = (relativeX / timelineWidth) * 100;
    const totalDays = totalMs / (24 * 60 * 60 * 1000);
    const exactDays = (percent / 100) * totalDays;
    // Snap a giorni interi
    return Math.round(exactDays);
  };

  const handleMouseDown = (e: React.MouseEvent, milestone: ProjectMilestone, type: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation();
    e.preventDefault();
    
    const start = parseDate(milestone.startDate!);
    const end = parseDate(milestone.endDate!);
    
    // Cattura geometria dalla riga corrente usando currentTarget
    const row = (e.currentTarget as HTMLElement).closest('.gantt-row') as HTMLElement;
    const rowWidth = row ? row.getBoundingClientRect().width - 192 : 800; // fallback
    
    console.log("MouseDown geometry:", { rowWidth, clientX: e.clientX });
    
    setDragState({
      id: milestone.id,
      type,
      startX: e.clientX,
      originalStart: start,
      originalEnd: end,
      rowWidth
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    
    const deltaX = e.clientX - dragState.startX;
    const totalDays = totalMs / (24 * 60 * 60 * 1000);
    const deltaDays = (deltaX / dragState.rowWidth) * totalDays;
    
    // Snap a giorni interi
    const snappedDelta = Math.round(deltaDays);
    
    console.log("Drag calc:", { deltaX, rowWidth: dragState.rowWidth, totalDays, deltaDays, snappedDelta });
    
    const durationMs = dragState.originalEnd.getTime() - dragState.originalStart.getTime();

    let newStart: Date;
    let newEnd: Date;

    // Converti giorni in millisecondi (0.5 giorni = 12 ore)
    const deltaMs = snappedDelta * 24 * 60 * 60 * 1000;

    if (dragState.type === 'move') {
      // Sposta entrambe le date preservando la durata
      newStart = new Date(dragState.originalStart.getTime() + deltaMs);
      newEnd = new Date(newStart.getTime() + durationMs);
    } else if (dragState.type === 'resize-start') {
      // Modifica solo la data di inizio
      newStart = new Date(dragState.originalStart.getTime() + deltaMs);
      newEnd = dragState.originalEnd;
    } else { // resize-end
      // Modifica solo la data di fine
      newStart = dragState.originalStart;
      newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
    }

    // Aggiorna lo stato con preview - React riposizionerà automaticamente
    setDragState({
      ...dragState,
      previewStart: newStart,
      previewEnd: newEnd
    });
  };

  const handleMouseUp = async () => {
    if (!dragState || !dragState.previewStart || !dragState.previewEnd) {
      setDragState(null);
      return;
    }
    
    const finalStart = dragState.previewStart;
    const finalEnd = dragState.previewEnd;
    
    console.log("Drag end:", {
      id: dragState.id,
      start: finalStart.toISOString(),
      end: finalEnd.toISOString()
    });
    
    // Pulisci lo stato PRIMA di aggiornare per evitare race condition
    setDragState(null);
    
    // Poi aggiorna - questo triggera il refetch
    await onMilestoneUpdate?.(dragState.id, finalStart, finalEnd);
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
                {allDays.map((day, index) => {
                  const dayPos = getPosition(day);
                  return (
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
                    />
                  );
                })}
              </svg>

              {/* Tooltip data durante drag */}
              {dragState && dragState.previewStart && dragState.previewEnd && (
                <div 
                  className="absolute top-0 left-48 right-0 pointer-events-none z-50"
                >
                  <div className="bg-black/80 text-white px-3 py-2 rounded text-xs font-medium whitespace-nowrap inline-block">
                    {format(dragState.previewStart, "dd/MM/yyyy", { locale: it })} - {format(dragState.previewEnd, "dd/MM/yyyy", { locale: it })}
                  </div>
                </div>
              )}

              {/* Milestone rows */}
              <div className="space-y-3" style={{ position: 'relative', zIndex: 1 }}>
                {sortedMilestones.map((milestone) => {
                  // Usa preview date se questo milestone è in drag, altrimenti usa le date salvate
                  const start = dragState?.id === milestone.id && dragState.previewStart
                    ? dragState.previewStart
                    : parseDate(milestone.startDate!);
                  const end = dragState?.id === milestone.id && dragState.previewEnd
                    ? dragState.previewEnd
                    : parseDate(milestone.endDate!);
                  
                  const rawLeftPos = getPosition(start);
                  const rawBarWidth = getWidth(start, end);
                  const leftPos = clampPosition(rawLeftPos);
                  const barWidth = clampWidth(rawLeftPos, rawBarWidth);

                  // Dipendenza - usa preview date se disponibili
                  const prerequisite = milestone.dependsOnMilestoneId 
                    ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                    : null;

                  // Usa preview date per prerequisite se in drag
                  const prereqEnd = prerequisite
                    ? (dragState?.id === prerequisite.id && dragState.previewEnd
                      ? dragState.previewEnd
                      : parseDate(prerequisite.endDate!))
                    : null;

                  // Controlla sovrapposizione dipendenze - vera sovrapposizione solo se child inizia PRIMA che finisca il padre
                  const hasOverlap = prerequisite && prereqEnd && 
                    (start.getTime() < prereqEnd.getTime());
                  
                  if (hasOverlap && prereqEnd) {
                    console.log("OVERLAP DETECTED:", {
                      milestone: milestone.name,
                      milestoneStart: start.toISOString(),
                      prerequisite: prerequisite?.name,
                      prerequisiteEnd: prereqEnd.toISOString(),
                      overlapMs: prereqEnd.getTime() - start.getTime()
                    });
                  }

                  return (
                    <div key={milestone.id} className="gantt-row relative h-16">
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
                          {prerequisite && prereqEnd && (
                            (() => {
                              // Usa le date sincronizzate già calcolate
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
                          {hasOverlap && prereqEnd && (
                            (() => {
                              // Usa le date sincronizzate già calcolate
                              const overlapStart = start;
                              const overlapEnd = prereqEnd;
                              const rawOverlapLeft = getPosition(overlapStart);
                              const rawOverlapWidth = getWidth(overlapStart, overlapEnd);
                              const overlapLeft = clampPosition(rawOverlapLeft);
                              const overlapWidth = clampWidth(rawOverlapLeft, rawOverlapWidth);
                              
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
