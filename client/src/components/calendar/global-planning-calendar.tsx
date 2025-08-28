import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, FolderTree, Clock } from "lucide-react";
import { PlanningWindow, Project } from "@shared/schema";
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, 
  isWithinInterval, addDays, startOfWeek, endOfWeek, startOfDay, endOfDay, addWeeks, 
  subWeeks, subDays, eachHourOfInterval, isSameHour, parseISO, setHours, setMinutes,
  isAfter, isBefore, differenceInMinutes
} from "date-fns";

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
  level: number;
}

type CalendarView = 'month' | 'week' | 'day';

export default function GlobalPlanningCalendar({ onWindowSelect }: GlobalPlanningCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  
  // Fetch all planning windows for the user
  const { data: planningWindowsWithProject, isLoading } = useQuery<PlanningWindowWithProject[]>({
    queryKey: ["/api/planning-windows", "user"],
  });

  // Build project hierarchy map
  const projectHierarchy = useMemo(() => {
    if (!planningWindowsWithProject) return new Map<string, number>();
    
    const hierarchy = new Map<string, number>();
    const projects = Array.from(new Set(planningWindowsWithProject.map(w => w.project)));
    
    const calculateDepth = (project: Project, visited = new Set<string>()): number => {
      if (visited.has(project.id)) return 0;
      visited.add(project.id);
      
      if (!project.parentProjectId) return 0;
      
      const parent = projects.find(p => p.id === project.parentProjectId);
      if (!parent) return 0;
      
      return 1 + calculateDepth(parent, visited);
    };
    
    projects.forEach(project => {
      hierarchy.set(project.id, calculateDepth(project));
    });
    
    return hierarchy;
  }, [planningWindowsWithProject]);

  // Get date range based on view
  const getDateRange = () => {
    switch (view) {
      case 'day':
        return {
          start: startOfDay(currentDate),
          end: endOfDay(currentDate)
        };
      case 'week':
        return {
          start: startOfWeek(currentDate, { weekStartsOn: 1 }),
          end: endOfWeek(currentDate, { weekStartsOn: 1 })
        };
      case 'month':
      default:
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          start: startOfWeek(monthStart, { weekStartsOn: 1 }),
          end: endOfWeek(monthEnd, { weekStartsOn: 1 })
        };
    }
  };

  // Expand planning windows for current view
  const expandedInstances = useMemo(() => {
    if (!planningWindowsWithProject) return [];
    
    const { start: calendarStart, end: calendarEnd } = getDateRange();
    const instances: ExpandedPlanningInstance[] = [];
    
    planningWindowsWithProject.forEach(({ project, ...window }) => {
      const windowStart = new Date(window.startDate);
      const windowEnd = new Date(window.endDate);
      const projectLevel = projectHierarchy.get(project.id) || 0;
      
      if (window.recurrenceType === 'none') {
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
  }, [planningWindowsWithProject, currentDate, view, projectHierarchy]);

  // Navigation functions
  const navigate = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      switch (view) {
        case 'day':
          return direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1);
        case 'week':
          return direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1);
        case 'month':
        default:
          return direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1);
      }
    });
  };

  // Helper functions
  const getLevelColor = (level: number) => {
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-300',
      'bg-green-100 border-green-300 text-green-800 dark:bg-green-950/30 dark:border-green-700 dark:text-green-300',
      'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-950/30 dark:border-purple-700 dark:text-purple-300',
      'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-950/30 dark:border-orange-700 dark:text-orange-300',
    ];
    return colors[Math.min(level, colors.length - 1)];
  };

  const getLevelIndentation = (level: number) => {
    return level * 4;
  };

  const formatDateRange = () => {
    switch (view) {
      case 'day':
        return format(currentDate, 'EEEE, dd MMMM yyyy');
      case 'week':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(weekStart, 'dd MMM')} - ${format(weekEnd, 'dd MMM yyyy')}`;
      case 'month':
      default:
        return format(currentDate, 'MMMM yyyy');
    }
  };

  // Render functions for different views
  const renderMonthView = () => {
    const { start: calendarStart, end: calendarEnd } = getDateRange();
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    
    const instancesByDate = expandedInstances.reduce((acc, instance) => {
      const dateKey = format(instance.date, 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(instance);
      return acc;
    }, {} as Record<string, ExpandedPlanningInstance[]>);

    Object.keys(instancesByDate).forEach(dateKey => {
      instancesByDate[dateKey].sort((a, b) => a.level - b.level);
    });

    return (
      <div className="grid grid-cols-7 gap-1">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        
        {calendarDays.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayInstances = instancesByDate[dateKey] || [];
          const isInCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isTodayDate = isSameDay(day, new Date());
          
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourHeight = 60; // altezza in pixel di ogni ora
    
    // Raggruppa le istanze per data
    const instancesByDate = expandedInstances.reduce((acc, instance) => {
      const dateKey = format(instance.date, 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(instance);
      return acc;
    }, {} as Record<string, ExpandedPlanningInstance[]>);

    // Funzione per convertire time string in minuti dall'inizio della giornata
    const timeToMinutes = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    return (
      <div className="flex flex-col">
        {/* Header giorni */}
        <div className="grid grid-cols-8 border-b border-border">
          <div className="p-2 text-center text-sm font-medium text-muted-foreground border-r border-border bg-muted/30">
            Ora
          </div>
          {weekDays.map(day => (
            <div key={format(day, 'yyyy-MM-dd')} className="p-2 text-center text-sm font-medium text-muted-foreground border-r border-border/50">
              <div>{format(day, 'EEE')}</div>
              <div className={`${isSameDay(day, new Date()) ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        
        {/* Griglia oraria */}
        <div className="flex-1 overflow-auto max-h-[600px] relative">
          <div className="grid grid-cols-8">
            {/* Colonna orari */}
            <div className="border-r border-border bg-muted/30">
              {hours.map(hour => (
                <div key={hour} className="relative border-b border-border/50" style={{ height: `${hourHeight}px` }}>
                  <div className="p-2 text-xs text-muted-foreground text-right">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  {/* Linea tratteggiata per la mezzora */}
                  <div 
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{ top: `${hourHeight / 2}px` }}
                  />
                </div>
              ))}
            </div>
            
            {/* Colonne giorni */}
            {weekDays.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayInstances = instancesByDate[dateKey] || [];
              
              return (
                <div key={dateKey} className="border-r border-border/50 relative">
                  {/* Griglia di background */}
                  {hours.map(hour => (
                    <div 
                      key={hour} 
                      className="border-b border-border/50 relative"
                      style={{ height: `${hourHeight}px` }}
                    >
                      {/* Linea tratteggiata per la mezzora */}
                      <div 
                        className="absolute left-0 right-0 border-t border-dashed border-border/30"
                        style={{ top: `${hourHeight / 2}px` }}
                      />
                    </div>
                  ))}
                  
                  {/* Eventi sovrapposti */}
                  {dayInstances.map((instance, idx) => {
                    const startMinutes = timeToMinutes(instance.startTime);
                    const endMinutes = timeToMinutes(instance.endTime);
                    const durationMinutes = endMinutes - startMinutes;
                    
                    const topPosition = (startMinutes / 60) * hourHeight;
                    const height = (durationMinutes / 60) * hourHeight;
                    
                    return (
                      <div
                        key={`${instance.window.id}-${idx}`}
                        onClick={() => onWindowSelect?.(instance.window)}
                        className="absolute cursor-pointer z-10"
                        style={{ 
                          top: `${topPosition}px`,
                          height: `${height}px`,
                          left: `${2 + getLevelIndentation(instance.level)}px`,
                          right: `${2 + getLevelIndentation(instance.level)}px`,
                        }}
                      >
                        <div className={`${getLevelColor(instance.level)} hover:opacity-80 text-xs p-2 rounded border h-full overflow-hidden`}>
                          <div className="font-medium truncate">
                            {instance.window.name}
                          </div>
                          <div className="text-[10px] opacity-75">
                            {instance.startTime} - {instance.endTime}
                          </div>
                          <div className="text-[9px] opacity-75 truncate">
                            {instance.project.name}
                            {instance.level > 0 && <span className="ml-1">{'→'.repeat(instance.level)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourHeight = 80; // altezza in pixel più grande per la vista giornaliera
    const dayInstances = expandedInstances.filter(instance => 
      isSameDay(instance.date, currentDate)
    );
    
    // Funzione per convertire time string in minuti dall'inizio della giornata
    const timeToMinutes = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    return (
      <div className="flex flex-col">
        <div className="border-b border-border p-4">
          <h3 className="text-lg font-medium text-center">
            {format(currentDate, 'EEEE, dd MMMM yyyy')}
          </h3>
        </div>
        
        <div className="flex-1 overflow-auto max-h-[700px] relative">
          <div className="flex">
            {/* Colonna orari */}
            <div className="w-20 border-r border-border bg-muted/30 flex-shrink-0">
              {hours.map(hour => (
                <div key={hour} className="relative border-b border-border/50" style={{ height: `${hourHeight}px` }}>
                  <div className="p-3 text-sm text-muted-foreground text-right">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  {/* Linea tratteggiata per la mezzora */}
                  <div 
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{ top: `${hourHeight / 2}px` }}
                  />
                </div>
              ))}
            </div>
            
            {/* Colonna eventi */}
            <div className="flex-1 relative">
              {/* Griglia di background */}
              {hours.map(hour => (
                <div 
                  key={hour} 
                  className="border-b border-border/50 relative"
                  style={{ height: `${hourHeight}px` }}
                >
                  {/* Linea tratteggiata per la mezzora */}
                  <div 
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{ top: `${hourHeight / 2}px` }}
                  />
                </div>
              ))}
              
              {/* Eventi sovrapposti */}
              {dayInstances.map((instance, idx) => {
                const startMinutes = timeToMinutes(instance.startTime);
                const endMinutes = timeToMinutes(instance.endTime);
                const durationMinutes = endMinutes - startMinutes;
                
                const topPosition = (startMinutes / 60) * hourHeight;
                const height = (durationMinutes / 60) * hourHeight;
                
                return (
                  <div
                    key={`${instance.window.id}-${idx}`}
                    onClick={() => onWindowSelect?.(instance.window)}
                    className="absolute cursor-pointer z-10"
                    style={{ 
                      top: `${topPosition}px`,
                      height: `${height}px`,
                      left: `${8 + getLevelIndentation(instance.level)}px`,
                      right: `${8 + getLevelIndentation(instance.level)}px`,
                    }}
                  >
                    <div className={`${getLevelColor(instance.level)} hover:opacity-80 p-3 rounded border h-full overflow-hidden flex flex-col`}>
                      <div className="font-medium truncate">
                        {instance.window.name}
                      </div>
                      <div className="text-sm opacity-75 mt-1">
                        {instance.startTime} - {instance.endTime}
                      </div>
                      <div className="text-sm opacity-75 mt-1">
                        {instance.project.name}
                        {instance.level > 0 && (
                          <span className="ml-2">
                            {'→'.repeat(instance.level)}
                          </span>
                        )}
                      </div>
                      {instance.project.description && height > 120 && (
                        <div className="text-xs opacity-60 mt-2 flex-1 overflow-hidden">
                          {instance.project.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
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
          
          <div className="flex items-center gap-4">
            {/* View buttons */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={view === 'day' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('day')}
                data-testid="button-day-view"
              >
                Giorno
              </Button>
              <Button
                variant={view === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('week')}
                data-testid="button-week-view"
              >
                Settimana
              </Button>
              <Button
                variant={view === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('month')}
                data-testid="button-month-view"
              >
                Mese
              </Button>
            </div>
            
            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('prev')} data-testid="button-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[200px] text-center">
                {formatDateRange()}
              </span>
              <Button variant="outline" size="sm" onClick={() => navigate('next')} data-testid="button-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        {view === 'month' && renderMonthView()}
        {view === 'week' && renderWeekView()}
        {view === 'day' && renderDayView()}
        
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