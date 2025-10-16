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

  // Raggruppa i task per OWNER (assignedToName o "Non assegnato")
  const tasksByOwner = tasks.reduce((acc, task) => {
    if (task.startDate && task.dueDate) { // Solo task con date complete
      const owner = (task as any).assignedToName || "Non assegnato";
      if (!acc[owner]) {
        acc[owner] = [];
      }
      acc[owner].push(task);
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
  
  // Calcola l'intervallo includendo TUTTE le date: milestone E task
  const allDays = validMilestones.flatMap(m => [dateToDay(m.startDate!), dateToDay(m.endDate!)]);
  
  // Aggiungi le date dei task per auto-espandere il Gantt
  tasks.forEach(task => {
    if (task.startDate) {
      const taskStartStr = new Date(task.startDate).toISOString().split('T')[0];
      allDays.push(dateToDay(taskStartStr));
    }
    if (task.dueDate) {
      const taskEndStr = new Date(task.dueDate).toISOString().split('T')[0];
      allDays.push(dateToDay(taskEndStr));
    }
  });
  
  const minDay = Math.min(...allDays);
  const maxDay = Math.max(...allDays);
  const totalDays = maxDay - minDay + 1;
  
  const minDateStr = dayToDate(minDay);
  const maxDateStr = dayToDate(maxDay);
  
  const gridBoundaries = Array.from({ length: totalDays + 1 }, (_, i) => i);

  const getPosition = (dateStr: string): number => {
    const day = dateToDay(dateStr);
    return ((day - minDay) / totalDays) * 100;
  };

  const getWidth = (startStr: string, endStr: string): number => {
    const startDay = dateToDay(startStr);
    const endDay = dateToDay(endStr);
    return ((endDay - startDay + 1) / totalDays) * 100;
  };

  const clampDate = (dateStr: string, minStr: string, maxStr: string): string => {
    if (compareDates(dateStr, minStr) < 0) return minStr;
    if (compareDates(dateStr, maxStr) > 0) return maxStr;
    return dateStr;
  };

  // Rileva sovrapposizioni tra task dello stesso owner
  const getTaskOverlaps = (ownerTasks: Task[]): Map<string, boolean> => {
    const overlaps = new Map<string, boolean>();
    for (let i = 0; i < ownerTasks.length; i++) {
      const task1 = ownerTasks[i];
      if (!task1.startDate || !task1.dueDate) continue;
      
      const start1 = new Date(task1.startDate).toISOString().split('T')[0];
      const end1 = new Date(task1.dueDate).toISOString().split('T')[0];
      
      for (let j = i + 1; j < ownerTasks.length; j++) {
        const task2 = ownerTasks[j];
        if (!task2.startDate || !task2.dueDate) continue;
        
        const start2 = new Date(task2.startDate).toISOString().split('T')[0];
        const end2 = new Date(task2.dueDate).toISOString().split('T')[0];
        
        // Check overlap
        const start1Day = dateToDay(start1);
        const end1Day = dateToDay(end1);
        const start2Day = dateToDay(start2);
        const end2Day = dateToDay(end2);
        
        if (start1Day <= end2Day && start2Day <= end1Day) {
          overlaps.set(task1.id, true);
          overlaps.set(task2.id, true);
        }
      }
    }
    return overlaps;
  };

  const handleMouseDown = (e: React.MouseEvent, milestone: ProjectMilestone, type: 'move' | 'resize-start' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!milestone.startDate || !milestone.endDate) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDragState({
      id: milestone.id,
      type,
      startX: e.clientX,
      originalStartStr: milestone.startDate,
      originalEndStr: milestone.endDate,
      rowWidth: rect.width,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState || !onMilestoneUpdate) return;
    
    const deltaX = e.clientX - dragState.startX;
    const deltaPercent = (deltaX / dragState.rowWidth) * 100;
    const deltaDays = Math.round((deltaPercent / 100) * totalDays);
    
    let newStartStr = dragState.originalStartStr;
    let newEndStr = dragState.originalEndStr;
    
    if (dragState.type === 'move') {
      newStartStr = addDaysToDate(dragState.originalStartStr, deltaDays);
      newEndStr = addDaysToDate(dragState.originalEndStr, deltaDays);
    } else if (dragState.type === 'resize-start') {
      newStartStr = clampDate(
        addDaysToDate(dragState.originalStartStr, deltaDays),
        minDateStr,
        addDaysToDate(dragState.originalEndStr, -1)
      );
    } else if (dragState.type === 'resize-end') {
      newEndStr = clampDate(
        addDaysToDate(dragState.originalEndStr, deltaDays),
        addDaysToDate(dragState.originalStartStr, 1),
        maxDateStr
      );
    }
    
    setDragState(prev => prev ? { ...prev, previewStartStr: newStartStr, previewEndStr: newEndStr } : null);
  };

  const handleMouseUp = () => {
    if (dragState && dragState.previewStartStr && dragState.previewEndStr && onMilestoneUpdate) {
      onMilestoneUpdate(dragState.id, dragState.previewStartStr, dragState.previewEndStr);
    }
    setDragState(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500";
      case "in_progress": return "bg-blue-500";
      case "blocked": return "bg-red-500";
      default: return "bg-gray-400";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-600";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-green-500";
      default: return "bg-gray-400";
    }
  };

  return (
    <div 
      ref={containerRef}
      className="gantt-chart relative select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b">
        <div className="flex">
          <div className="w-48 px-4 py-3 font-semibold border-r bg-muted">
            Owner
          </div>
          <div className="flex-1 px-4 py-3 font-semibold">
            Timeline ({formatDateStr(minDateStr)} - {formatDateStr(maxDateStr)})
          </div>
        </div>
      </div>

      {/* Milestone Rows */}
      {validMilestones.map((milestone) => {
        const startStr = dragState?.id === milestone.id && dragState.previewStartStr
          ? dragState.previewStartStr
          : milestone.startDate!;
        const endStr = dragState?.id === milestone.id && dragState.previewEndStr
          ? dragState.previewEndStr
          : milestone.endDate!;

        const left = getPosition(startStr);
        const width = getWidth(startStr, endStr);
        const project = projects.find(p => p.id === milestone.projectId);

        return (
          <div key={milestone.id} className="flex border-b hover:bg-muted/50 transition-colors">
            <div className="w-48 px-4 py-4 border-r flex flex-col gap-1">
              <div className="font-medium text-sm">{milestone.name}</div>
              <div className="text-xs text-muted-foreground">{project?.name}</div>
            </div>
            
            <div className="flex-1 relative h-16">
              {/* Grid lines */}
              {gridBoundaries.map((boundary) => (
                <div
                  key={boundary}
                  className="absolute top-0 bottom-0 border-l border-border/30"
                  style={{ left: `${(boundary / totalDays) * 100}%` }}
                />
              ))}
              
              {/* Milestone Bar */}
              <div
                className="absolute top-2 h-8 bg-primary/80 rounded cursor-move hover:bg-primary transition-colors flex items-center px-2"
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => onMilestoneClick?.(milestone)}
                onMouseDown={(e) => handleMouseDown(e, milestone, 'move')}
              >
                <div className="flex items-center gap-2 text-xs text-primary-foreground truncate">
                  <span className="font-medium">{formatDateStr(startStr)} - {formatDateStr(endStr)}</span>
                  {milestone.progress !== null && milestone.progress !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      {milestone.progress}%
                    </Badge>
                  )}
                </div>
                
                {/* Resize handles */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary-foreground/20"
                  onMouseDown={(e) => handleMouseDown(e, milestone, 'resize-start')}
                  onClick={(e) => e.stopPropagation()}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary-foreground/20"
                  onMouseDown={(e) => handleMouseDown(e, milestone, 'resize-end')}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Task Rows Grouped by Owner */}
      {Object.entries(tasksByOwner).map(([owner, ownerTasks]) => {
        const overlaps = getTaskOverlaps(ownerTasks);
        
        return (
          <div key={owner} className="flex border-b hover:bg-muted/50 transition-colors">
            <div className="w-48 px-4 py-4 border-r flex flex-col gap-1">
              <div className="font-medium text-sm text-blue-600">{owner}</div>
              <div className="text-xs text-muted-foreground">{ownerTasks.length} task</div>
            </div>
            
            <div className="flex-1 relative h-16">
              {/* Grid lines */}
              {gridBoundaries.map((boundary) => (
                <div
                  key={boundary}
                  className="absolute top-0 bottom-0 border-l border-border/30"
                  style={{ left: `${(boundary / totalDays) * 100}%` }}
                />
              ))}
              
              {/* Task Bars */}
              {ownerTasks.map((task, index) => {
                if (!task.startDate || !task.dueDate) return null;
                
                const taskStartStr = new Date(task.startDate).toISOString().split('T')[0];
                const taskEndStr = new Date(task.dueDate).toISOString().split('T')[0];
                const left = getPosition(taskStartStr);
                const width = getWidth(taskStartStr, taskEndStr);
                const hasOverlap = overlaps.get(task.id) || false;
                
                return (
                  <div
                    key={task.id}
                    className={`absolute top-2 h-8 rounded flex items-center px-2 cursor-pointer transition-all hover:opacity-90 ${
                      getStatusColor(task.status)
                    } ${hasOverlap ? 'shadow-[0_0_8px_rgba(0,0,0,0.4)] ring-2 ring-yellow-400' : ''}`}
                    style={{ 
                      left: `${left}%`, 
                      width: `${width}%`,
                      opacity: hasOverlap ? 0.85 : 1,
                    }}
                    title={`${task.title} (${formatDateStr(taskStartStr)} - ${formatDateStr(taskEndStr)})`}
                  >
                    <div className="flex items-center gap-1 text-xs text-white truncate">
                      <span className="font-medium truncate">{task.title}</span>
                      <Badge variant="outline" className={`text-xs ${getPriorityColor(task.priority)} text-white border-white/30`}>
                        {task.priority}
                      </Badge>
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
