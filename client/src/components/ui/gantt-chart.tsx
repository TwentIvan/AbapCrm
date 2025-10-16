import { useState, useRef } from "react";
import { ProjectMilestone, Task } from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface GanttChartProps {
  milestones: ProjectMilestone[];
  projects: Array<{ id: string; name: string }>;
  tasks?: Task[];
  onMilestoneClick?: (milestone: ProjectMilestone) => void;
  onMilestoneUpdate?: (id: string, startDate: string, endDate: string) => void;
}

export function GanttChart({ milestones, projects, tasks = [], onMilestoneClick, onMilestoneUpdate }: GanttChartProps) {
  const [dragState, setDragState] = useState<{ 
    id: string; 
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    originalStartStr: string;
    originalEndStr: string;
    rowWidth: number;
    previewStartStr?: string;
    previewEndStr?: string;
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

  // Raggruppa i task per milestone
  const tasksByMilestone = tasks.reduce((acc, task) => {
    if (task.milestoneId && task.dueDate) {
      if (!acc[task.milestoneId]) {
        acc[task.milestoneId] = [];
      }
      acc[task.milestoneId].push(task);
    }
    return acc;
  }, {} as Record<string, Task[]>);

  // Lavora SOLO con giorni - niente conversioni Date o millisecondi
  const dateToDay = (dateStr: string): number => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  };
  
  const dayToDate = (day: number): string => {
    const timestamp = day * 86400000;
    const d = new Date(timestamp);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  };

  const addDaysToDate = (dateStr: string, days: number): string => {
    const day = dateToDay(dateStr);
    return dayToDate(day + days);
  };

  const formatDateStr = (dateStr: string, formatType: 'short' | 'long' = 'short'): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const monthNamesFull = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    
    if (formatType === 'long') {
      return `${day.toString().padStart(2, '0')} ${monthNamesFull[month - 1]} ${year}`;
    }
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`;
  };

  const compareDates = (date1Str: string, date2Str: string): number => {
    return dateToDay(date1Str) - dateToDay(date2Str);
  };
  
  const allDays = validMilestones.flatMap(m => [dateToDay(m.startDate!), dateToDay(m.endDate!)]);
  const minDay = Math.min(...allDays);
  const maxDay = Math.max(...allDays);
  const totalDays = maxDay - minDay + 1;
  
  const minDateStr = dayToDate(minDay);
  const maxDateStr = dayToDate(maxDay);
  
  // Gridlines rappresentano confini tra giorni: serve totalDays + 1 linee per totalDays giorni
  const gridBoundaries = Array.from({ length: totalDays + 1 }, (_, i) => i);

  const getPosition = (dateStr: string): number => {
    const day = dateToDay(dateStr);
    return ((day - minDay) / totalDays) * 100;
  };

  const getWidth = (startStr: string, endStr: string): number => {
    const startDay = dateToDay(startStr);
    const endDay = dateToDay(endStr);
    // +1 per durata inclusiva (milestone di 1 giorno deve avere larghezza visibile)
    return ((endDay - startDay + 1) / totalDays) * 100;
  };

  const clampPosition = (pos: number) => Math.max(0, Math.min(100, pos));
  const clampWidth = (left: number, width: number) => Math.max(0, Math.min(100 - left, width));

  const handleMouseDown = (e: React.MouseEvent, milestone: ProjectMilestone, type: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation();
    e.preventDefault();
    
    const timeline = (e.currentTarget as HTMLElement).closest('.gantt-timeline') as HTMLElement;
    const rowWidth = timeline ? timeline.getBoundingClientRect().width : 800;
    
    setDragState({
      id: milestone.id,
      type,
      startX: e.clientX,
      originalStartStr: milestone.startDate!,
      originalEndStr: milestone.endDate!,
      rowWidth
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    
    const deltaX = e.clientX - dragState.startX;
    const deltaDays = (deltaX / dragState.rowWidth) * totalDays;
    const snappedDelta = Math.round(deltaDays);
    
    const originalStartDay = dateToDay(dragState.originalStartStr);
    const originalEndDay = dateToDay(dragState.originalEndStr);
    const durationDays = originalEndDay - originalStartDay;

    let newStartStr: string;
    let newEndStr: string;

    if (dragState.type === 'move') {
      newStartStr = addDaysToDate(dragState.originalStartStr, snappedDelta);
      newEndStr = addDaysToDate(newStartStr, durationDays);
    } else if (dragState.type === 'resize-start') {
      newStartStr = addDaysToDate(dragState.originalStartStr, snappedDelta);
      newEndStr = dragState.originalEndStr;
      // Clamp: start non può andare oltre end
      if (dateToDay(newStartStr) > dateToDay(newEndStr)) {
        newStartStr = newEndStr;
      }
    } else {
      newStartStr = dragState.originalStartStr;
      newEndStr = addDaysToDate(dragState.originalEndStr, snappedDelta);
      // Clamp: end non può andare prima di start
      if (dateToDay(newEndStr) < dateToDay(newStartStr)) {
        newEndStr = newStartStr;
      }
    }

    setDragState({
      ...dragState,
      previewStartStr: newStartStr,
      previewEndStr: newEndStr
    });
  };

  const handleMouseUp = async () => {
    if (!dragState || !dragState.previewStartStr || !dragState.previewEndStr) {
      setDragState(null);
      return;
    }
    
    const finalStartStr = dragState.previewStartStr;
    const finalEndStr = dragState.previewEndStr;
    
    setDragState(null);
    
    await onMilestoneUpdate?.(dragState.id, finalStartStr, finalEndStr);
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
      <div className="relative pl-48">
        <div className="flex justify-between text-sm font-medium text-muted-foreground mb-2">
          <span>{formatDateStr(minDateStr, 'long')}</span>
          <span>{formatDateStr(maxDateStr, 'long')}</span>
        </div>
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>

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
              {dragState && dragState.previewStartStr && dragState.previewEndStr && (
                <div className="absolute top-0 left-48 ml-4 pointer-events-none z-50">
                  <div className="bg-black/80 text-white px-3 py-2 rounded text-xs font-medium whitespace-nowrap inline-block">
                    {formatDateStr(dragState.previewStartStr)} - {formatDateStr(dragState.previewEndStr)}
                  </div>
                </div>
              )}

              <div className="space-y-3" style={{ position: 'relative', zIndex: 1 }}>
                {/* Gridlines wrapper - stesso layout delle milestone */}
                <div className="flex items-center gap-4 pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
                  <div className="w-48 flex-shrink-0"></div>
                  <div className="flex-1 relative h-full">
                    <svg className="absolute inset-0 w-full h-full">
                      {gridBoundaries.map((dayIndex) => {
                        const dayPos = (dayIndex / totalDays) * 100;
                        return (
                          <line
                            key={`boundary-${dayIndex}`}
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
                  </div>
                </div>
                {sortedMilestones.flatMap((milestone) => {
                  const startStr = dragState?.id === milestone.id && dragState.previewStartStr
                    ? dragState.previewStartStr
                    : milestone.startDate!;
                  const endStr = dragState?.id === milestone.id && dragState.previewEndStr
                    ? dragState.previewEndStr
                    : milestone.endDate!;
                  
                  const rawLeftPos = getPosition(startStr);
                  const rawBarWidth = getWidth(startStr, endStr);
                  const leftPos = clampPosition(rawLeftPos);
                  const barWidth = clampWidth(rawLeftPos, rawBarWidth);

                  const prerequisite = milestone.dependsOnMilestoneId 
                    ? validMilestones.find(m => m.id === milestone.dependsOnMilestoneId)
                    : null;

                  const prereqEndStr = prerequisite
                    ? (dragState?.id === prerequisite.id && dragState.previewEndStr
                      ? dragState.previewEndStr
                      : prerequisite.endDate!)
                    : null;

                  const hasOverlap = prerequisite && prereqEndStr && 
                    compareDates(startStr, prereqEndStr) <= 0;

                  const milestoneTasks = tasksByMilestone[milestone.id] || [];

                  const taskStatusColors: Record<string, string> = {
                    todo: "bg-gray-400 dark:bg-gray-600",
                    in_progress: "bg-blue-500 dark:bg-blue-600",
                    review: "bg-yellow-500 dark:bg-yellow-600",
                    completed: "bg-green-500 dark:bg-green-600"
                  };

                  const milestoneRow = (
                    <div key={milestone.id} className="gantt-row relative h-16">
                      <div className="flex items-center gap-4">
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

                        <div className="flex-1 relative h-16 gantt-timeline">
                          {prerequisite && prereqEndStr && (
                            (() => {
                              const prereqPos = getPosition(prereqEndStr);
                              const milestonePos = getPosition(startStr);
                              
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

                          {hasOverlap && prereqEndStr && (
                            (() => {
                              const rawOverlapLeft = getPosition(startStr);
                              const rawOverlapWidth = getWidth(startStr, prereqEndStr);
                              const overlapLeft = clampPosition(rawOverlapLeft);
                              const overlapWidth = clampWidth(rawOverlapLeft, rawOverlapWidth);
                              
                              return (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-10 rounded-sm pointer-events-none"
                                  style={{
                                    left: `${overlapLeft}%`,
                                    width: `${overlapWidth}%`,
                                    background: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.6), rgba(239, 68, 68, 0.6) 8px, rgba(239, 68, 68, 0.4) 8px, rgba(239, 68, 68, 0.4) 16px)',
                                    border: '3px solid rgb(239, 68, 68)',
                                    zIndex: 15
                                  }}
                                />
                              );
                            })()
                          )}

                          <div
                            data-milestone-id={milestone.id}
                            className={`absolute top-1/2 -translate-y-1/2 h-10 rounded group ${statusColors[milestone.status || "planned"]}`}
                            style={{
                              left: `${leftPos}%`,
                              width: `${barWidth}%`,
                              cursor: dragState?.id === milestone.id ? 'grabbing' : 'grab',
                              zIndex: dragState?.id === milestone.id ? 20 : 10,
                              position: 'relative'
                            }}
                            onMouseDown={(e) => handleMouseDown(e, milestone, 'move')}
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-black/0 hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
                              onMouseDown={(e) => handleMouseDown(e, milestone, 'resize-start')}
                            >
                              <div className="w-1 h-6 bg-white/80 rounded-full" />
                            </div>
                            
                            <div className="px-3 h-full flex items-center justify-center pointer-events-none">
                              <Progress value={milestone.progress || 0} className="h-1.5 bg-white/30" />
                            </div>

                            <div
                              className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-black/0 hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20"
                              onMouseDown={(e) => handleMouseDown(e, milestone, 'resize-end')}
                            >
                              <div className="w-1 h-6 bg-white/80 rounded-full" />
                            </div>
                          </div>

                          <div 
                            className="absolute top-full mt-1 text-xs text-muted-foreground whitespace-nowrap pointer-events-none"
                            style={{ left: `${leftPos}%` }}
                          >
                            {formatDateStr(startStr)} - {formatDateStr(endStr)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  const taskRows = milestoneTasks
                    .filter(task => task.dueDate)
                    .map((task) => {
                      const taskDueDateStr = task.dueDate!.toString().split('T')[0];
                      const taskPos = getPosition(taskDueDateStr);
                      const clampedTaskPos = clampPosition(taskPos);

                      return (
                        <div key={task.id} className="gantt-row relative h-8 ml-4">
                          <div className="flex items-center gap-4">
                            <div className="w-44 flex-shrink-0">
                              <div className="text-xs truncate text-muted-foreground">
                                {task.title}
                              </div>
                            </div>

                            <div className="flex-1 relative h-8">
                              <div
                                className={`absolute top-1/2 -translate-y-1/2 h-3 rounded ${taskStatusColors[task.status || "todo"]}`}
                                style={{
                                  left: `${clampedTaskPos}%`,
                                  width: '4px',
                                  zIndex: 8
                                }}
                                title={`${task.title} - ${formatDateStr(taskDueDateStr, 'long')}`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    });

                  return [milestoneRow, ...taskRows];
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
