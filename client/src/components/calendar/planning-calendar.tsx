import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { PlanningWindow } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isWithinInterval, addDays, startOfWeek, endOfWeek } from "date-fns";

interface PlanningCalendarProps {
  planningWindows: PlanningWindow[];
  onWindowSelect?: (window: PlanningWindow) => void;
}

interface ExpandedPlanningInstance {
  window: PlanningWindow;
  date: Date;
  startTime: string;
  endTime: string;
}

export default function PlanningCalendar({ planningWindows, onWindowSelect }: PlanningCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Espandi le finestre di pianificazione ricorsive per il mese corrente (+ buffer)
  const expandedInstances = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Inizia da lunedì
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    const instances: ExpandedPlanningInstance[] = [];
    
    planningWindows.forEach(window => {
      const windowStart = new Date(window.startDate);
      const windowEnd = new Date(window.endDate);
      
      if (window.recurrenceType === 'none') {
        // Finestra singola
        if (isWithinInterval(windowStart, { start: calendarStart, end: calendarEnd }) ||
            isWithinInterval(windowEnd, { start: calendarStart, end: calendarEnd }) ||
            (windowStart <= calendarStart && windowEnd >= calendarEnd)) {
          instances.push({
            window,
            date: windowStart,
            startTime: window.startTime || '09:00',
            endTime: window.endTime || '17:00'
          });
        }
      } else {
        // Finestra ricorsiva
        const interval = window.recurrenceInterval || 1;
        const endRecurrence = window.recurrenceEnd ? new Date(window.recurrenceEnd) : calendarEnd;
        
        let currentInstanceDate = new Date(windowStart);
        
        while (currentInstanceDate <= endRecurrence && currentInstanceDate <= calendarEnd) {
          if (currentInstanceDate >= calendarStart) {
            // Verifica se questa istanza dovrebbe essere inclusa in base al tipo di ricorsività
            let shouldInclude = true;
            
            if (window.recurrenceType === 'weekly' && window.daysOfWeek && window.daysOfWeek.length > 0) {
              const dayOfWeek = currentInstanceDate.getDay() === 0 ? 7 : currentInstanceDate.getDay(); // Domenica = 7
              shouldInclude = window.daysOfWeek.includes(dayOfWeek);
            }
            
            if (shouldInclude) {
              instances.push({
                window,
                date: new Date(currentInstanceDate),
                startTime: window.startTime || '09:00',
                endTime: window.endTime || '17:00'
              });
            }
          }
          
          // Calcola la prossima istanza
          switch (window.recurrenceType) {
            case 'daily':
              currentInstanceDate = addDays(currentInstanceDate, interval);
              break;
            case 'weekly':
              currentInstanceDate = addDays(currentInstanceDate, 7 * interval);
              break;
            case 'monthly':
              currentInstanceDate = new Date(currentInstanceDate.setMonth(currentInstanceDate.getMonth() + interval));
              break;
            case 'yearly':
              currentInstanceDate = new Date(currentInstanceDate.setFullYear(currentInstanceDate.getFullYear() + interval));
              break;
            default:
              break;
          }
          
          // Protezione da loop infiniti
          if (currentInstanceDate.getTime() <= new Date(windowStart).getTime()) {
            break;
          }
        }
      }
    });
    
    return instances;
  }, [planningWindows, currentDate]);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Planning Calendar
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
                  min-h-[100px] p-2 border border-border/50 
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
                    >
                      <div className="bg-primary/10 hover:bg-primary/20 text-xs p-1 rounded border border-primary/30">
                        <div className="font-medium truncate text-primary">
                          {instance.window.name}
                        </div>
                        <div className="text-muted-foreground">
                          {instance.startTime} - {instance.endTime}
                        </div>
                        {instance.window.recurrenceType !== 'none' && (
                          <Badge variant="outline" className="text-[10px] h-4 mt-1">
                            {instance.window.recurrenceType}
                          </Badge>
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
      </CardContent>
    </Card>
  );
}