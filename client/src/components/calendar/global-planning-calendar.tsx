import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, FolderTree } from "lucide-react";
import { PlanningWindow, Project } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isWithinInterval, addDays, startOfWeek, endOfWeek } from "date-fns";

interface PlanningWindowWithProject extends PlanningWindow {
  project: Project;
}

interface GlobalPlanningCalendarProps {
  onWindowSelect?: (window: PlanningWindow) => void;
}

interface ExpandedPlanningInstance {
  window: PlanningWindow;
  project: Project;
  date: Date;
  startTime: string;
  endTime: string;
  level: number; // Profondità nella gerarchia (0 = root, 1 = child, 2 = grandchild, etc.)
}

export default function GlobalPlanningCalendar({ onWindowSelect }: GlobalPlanningCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Fetch all planning windows for the user
  const { data: planningWindowsWithProject, isLoading } = useQuery<PlanningWindowWithProject[]>({
    queryKey: ["/api/planning-windows", "user"],
  });

  // Build project hierarchy map
  const projectHierarchy = useMemo(() => {
    if (!planningWindowsWithProject) return new Map<string, number>();
    
    const hierarchy = new Map<string, number>();
    const projects = Array.from(new Set(planningWindowsWithProject.map(w => w.project)));
    
    // Function to calculate project depth recursively
    const calculateDepth = (project: Project, visited = new Set<string>()): number => {
      if (visited.has(project.id)) return 0; // Prevent infinite loops
      visited.add(project.id);
      
      if (!project.parentProjectId) return 0; // Root project
      
      const parent = projects.find(p => p.id === project.parentProjectId);
      if (!parent) return 0;
      
      return 1 + calculateDepth(parent, visited);
    };
    
    projects.forEach(project => {
      hierarchy.set(project.id, calculateDepth(project));
    });
    
    return hierarchy;
  }, [planningWindowsWithProject]);

  // Espandi le finestre di pianificazione ricorsive per il mese corrente
  const expandedInstances = useMemo(() => {
    if (!planningWindowsWithProject) return [];
    
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    const instances: ExpandedPlanningInstance[] = [];
    
    planningWindowsWithProject.forEach(({ project, ...window }) => {
      const windowStart = new Date(window.startDate);
      const windowEnd = new Date(window.endDate);
      const projectLevel = projectHierarchy.get(project.id) || 0;
      
      if (window.recurrenceType === 'none') {
        // Finestra singola
        if (isWithinInterval(windowStart, { start: calendarStart, end: calendarEnd }) ||
            isWithinInterval(windowEnd, { start: calendarStart, end: calendarEnd }) ||
            (windowStart <= calendarStart && windowEnd >= calendarEnd)) {
          instances.push({
            window,
            project,
            date: windowStart,
            startTime: window.startTime || '09:00',
            endTime: window.endTime || '17:00',
            level: projectLevel
          });
        }
      } else {
        // Finestra ricorsiva (stessa logica del calendario singolo)
        const interval = window.recurrenceInterval || 1;
        const endRecurrence = window.recurrenceEnd ? new Date(window.recurrenceEnd) : calendarEnd;
        
        if (window.recurrenceType === 'weekly' && window.daysOfWeek && window.daysOfWeek.length > 0) {
          const startWeek = startOfWeek(windowStart, { weekStartsOn: 1 });
          let currentWeek = startWeek;
          let weekCount = 0;
          
          while (currentWeek <= endRecurrence && currentWeek <= calendarEnd) {
            if (weekCount % interval === 0) {
              window.daysOfWeek.forEach(dayOfWeekNumber => {
                const dayOffset = dayOfWeekNumber === 7 ? 6 : dayOfWeekNumber - 1;
                const targetDate = addDays(currentWeek, dayOffset);
                
                const targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
                const windowStartOnly = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate());
                const endRecurrenceOnly = new Date(endRecurrence.getFullYear(), endRecurrence.getMonth(), endRecurrence.getDate());
                
                if (targetDateOnly >= windowStartOnly && 
                    targetDateOnly <= endRecurrenceOnly && 
                    targetDate >= calendarStart && 
                    targetDate <= calendarEnd) {
                  instances.push({
                    window,
                    project,
                    date: new Date(targetDate),
                    startTime: window.startTime || '09:00',
                    endTime: window.endTime || '17:00',
                    level: projectLevel
                  });
                }
              });
            }
            
            currentWeek = addDays(currentWeek, 7);
            weekCount++;
            
            if (weekCount > 1000) break;
          }
        } else {
          // Ricorrenze non settimanali
          let currentInstanceDate = new Date(windowStart);
          
          while (currentInstanceDate <= endRecurrence && currentInstanceDate <= calendarEnd) {
            if (currentInstanceDate >= calendarStart) {
              instances.push({
                window,
                project,
                date: new Date(currentInstanceDate),
                startTime: window.startTime || '09:00',
                endTime: window.endTime || '17:00',
                level: projectLevel
              });
            }
            
            switch (window.recurrenceType) {
              case 'daily':
                currentInstanceDate = addDays(currentInstanceDate, interval);
                break;
              case 'monthly':
                currentInstanceDate = new Date(currentInstanceDate.setMonth(currentInstanceDate.getMonth() + interval));
                break;
              case 'yearly':
                currentInstanceDate = new Date(currentInstanceDate.setFullYear(currentInstanceDate.getFullYear() + interval));
                break;
              default:
                currentInstanceDate = addDays(currentInstanceDate, 1);
                break;
            }
            
            if (currentInstanceDate.getTime() <= new Date(windowStart).getTime()) {
              break;
            }
          }
        }
      }
    });
    
    return instances;
  }, [planningWindowsWithProject, currentDate, projectHierarchy]);

  // Raggruppa le istanze per data
  const instancesByDate = useMemo(() => {
    const groups: Record<string, ExpandedPlanningInstance[]> = {};
    
    expandedInstances.forEach(instance => {
      const dateKey = format(instance.date, 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(instance);
    });
    
    // Ordina per livello gerarchico (genitori prima, figli dopo)
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => a.level - b.level);
    });
    
    return groups;
  }, [expandedInstances]);

  // Genera i giorni del calendario
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const isCurrentMonth = (day: Date) => {
    return day.getMonth() === currentDate.getMonth();
  };

  const isToday = (day: Date) => {
    return isSameDay(day, new Date());
  };

  // Funzione per ottenere il colore in base al livello gerarchico
  const getLevelColor = (level: number) => {
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-300', // Level 0 (root)
      'bg-green-100 border-green-300 text-green-800 dark:bg-green-950/30 dark:border-green-700 dark:text-green-300', // Level 1
      'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-950/30 dark:border-purple-700 dark:text-purple-300', // Level 2
      'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-950/30 dark:border-orange-700 dark:text-orange-300', // Level 3
    ];
    return colors[Math.min(level, colors.length - 1)];
  };

  // Funzione per ottenere l'indentazione in base al livello
  const getLevelIndentation = (level: number) => {
    return level * 4; // 4px per livello
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center">Loading calendar...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Global Planning Calendar
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[140px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {/* Header giorni della settimana */}
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
          
          {/* Giorni del calendario */}
          {calendarDays.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayInstances = instancesByDate[dateKey] || [];
            const isInCurrentMonth = isCurrentMonth(day);
            const isTodayDate = isToday(day);
            
            return (
              <div 
                key={dateKey} 
                className={`
                  min-h-[120px] p-2 border border-border/50 
                  ${!isInCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-background'}
                  ${isTodayDate ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800' : ''}
                `}
              >
                <div className={`text-sm font-medium mb-1 ${isTodayDate ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                  {format(day, 'd')}
                </div>
                
                <div className="space-y-1">
                  {dayInstances.map((instance, idx) => (
                    <div
                      key={`${instance.window.id}-${idx}`}
                      onClick={() => onWindowSelect?.(instance.window)}
                      className="group cursor-pointer"
                      style={{ 
                        marginLeft: `${getLevelIndentation(instance.level)}px`,
                        marginRight: `${getLevelIndentation(instance.level)}px`
                      }}
                    >
                      <div className={`${getLevelColor(instance.level)} hover:opacity-80 text-xs p-1 rounded border`}>
                        <div className="font-medium truncate">
                          {instance.window.name}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {instance.startTime} - {instance.endTime}
                        </div>
                        <div className="text-[10px] opacity-75 truncate">
                          {instance.project.name}
                          {instance.level > 0 && (
                            <span className="ml-1">
                              {'→'.repeat(instance.level)}
                            </span>
                          )}
                        </div>
                        {instance.project.description && (
                          <div className="text-[9px] opacity-60 truncate mt-1">
                            {instance.project.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        
        {expandedInstances.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            Nessuna finestra di pianificazione per questo periodo
          </div>
        )}
        
        {/* Legend */}
        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Legenda Gerarchia Progetti:</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-200 border border-blue-300"></div>
              <span>Progetti Principali</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-200 border border-green-300"></div>
              <span>Sotto-progetti (Livello 1)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-purple-200 border border-purple-300"></div>
              <span>Sotto-progetti (Livello 2)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-200 border border-orange-300"></div>
              <span>Sotto-progetti (Livello 3+)</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}