import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, FolderTree, Clock, Plus } from "lucide-react";
import { PlanningWindow, Project } from "@shared/schema";
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, 
  isWithinInterval, addDays, startOfWeek, endOfWeek, startOfDay, endOfDay, addWeeks, 
  subWeeks, subDays, eachHourOfInterval, isSameHour, parseISO, setHours, setMinutes,
  isAfter, isBefore, differenceInMinutes, max, min
} from "date-fns";

interface PlanningWindowWithProject extends PlanningWindow {
  project: Project | null;
}

interface GlobalPlanningCalendarProps {
  onWindowSelect?: (window: PlanningWindow) => void;
  onAddNew?: () => void;
}

interface ExpandedPlanningInstance {
  window: PlanningWindow;
  project: Project | null;
  date: Date;
  startTime: string;
  endTime: string;
  level: number;
  slotLabel?: string;
  slotIndex?: number;
  totalSlots?: number;
  // New fields for partial slot support
  slotDurationHours: number;      // Full duration of the slot (e.g., 4 hours for morning)
  allocatedHours: number;         // Actual hours allocated to this slot (may be partial)
  isPartialSlot: boolean;         // True if this slot doesn't use its full duration
}

type CalendarView = 'month' | 'week' | 'day';

interface ETCBatchData {
  [projectId: string]: {
    state: string;
    completionPercentage: number;
    totalRemainingHours: number;
    effectiveEndDate: string | null;
    scheduleDeficitHours: number;
    storedCalculatedEndDate: string | null;
  };
}

export default function GlobalPlanningCalendar({ onWindowSelect, onAddNew }: GlobalPlanningCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  
  // Fetch all planning windows for the user
  const { data: planningWindowsWithProject, isLoading } = useQuery<PlanningWindowWithProject[]>({
    queryKey: ["/api/planning-windows", "user"],
  });
  
  // Fetch ETC batch data to get remaining hours for all projects
  const { data: etcBatchData } = useQuery<ETCBatchData>({
    queryKey: ["/api/projects/batch-end-to-complete"],
  });

  // Build planning window hierarchy map (based on parentPlanningWindowId)
  const windowHierarchy = useMemo(() => {
    if (!planningWindowsWithProject) return new Map<string, number>();
    
    const hierarchy = new Map<string, number>();
    const windows = planningWindowsWithProject.map(w => ({
      id: w.id,
      parentPlanningWindowId: w.parentPlanningWindowId
    }));
    
    const calculateDepth = (windowId: string, visited = new Set<string>()): number => {
      if (visited.has(windowId)) return 0;
      visited.add(windowId);
      
      const window = windows.find(w => w.id === windowId);
      if (!window || !window.parentPlanningWindowId) return 0;
      
      return 1 + calculateDepth(window.parentPlanningWindowId, visited);
    };
    
    windows.forEach(window => {
      hierarchy.set(window.id, calculateDepth(window.id));
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

  // Helper function to get time slots from a window
  const getTimeSlots = (window: PlanningWindow): Array<{ startTime: string; endTime: string; label?: string }> => {
    // Se ci sono time slots definiti, usali
    if (window.timeSlots && Array.isArray(window.timeSlots) && window.timeSlots.length > 0) {
      return window.timeSlots as Array<{ startTime: string; endTime: string; label?: string }>;
    }
    // Altrimenti, usa startTime e endTime come singolo slot
    return [{ 
      startTime: window.startTime || '09:00', 
      endTime: window.endTime || '17:00' 
    }];
  };

  // Helper to calculate effective end date based on estimated effort
  const calculateEffectiveEndDate = (
    windowStart: Date, 
    windowEnd: Date, 
    estimatedHours: number | null | undefined, 
    workingHoursPerDay: number,
    daysOfWeek: number[]
  ): Date => {
    // If no estimated hours, use the window's end date
    if (!estimatedHours || estimatedHours <= 0) {
      return windowEnd;
    }
    
    // Calculate working days needed
    const daysNeeded = Math.ceil(estimatedHours / workingHoursPerDay);
    
    // Function to check if a day is a working day
    const isWorkingDay = (date: Date): boolean => {
      const dayOfWeek = date.getDay();
      const ourDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      return daysOfWeek.includes(ourDayOfWeek);
    };
    
    // Calculate end date by counting only working days
    let effectiveEnd = new Date(windowStart);
    let workingDaysCount = isWorkingDay(effectiveEnd) ? 1 : 0;
    
    while (workingDaysCount < daysNeeded && effectiveEnd < windowEnd) {
      effectiveEnd = addDays(effectiveEnd, 1);
      if (isWorkingDay(effectiveEnd)) {
        workingDaysCount++;
      }
    }
    
    // Don't exceed window's end date
    return min([effectiveEnd, windowEnd]);
  };

  // Helper to get inherited scheduling config from parent window chain
  const getInheritedConfig = (window: PlanningWindow): { daysOfWeek: number[], workingHoursPerDay: number, timeSlots: Array<{ startTime: string; endTime: string; label?: string }> } => {
    // If window has parentPlanningWindowId, inherit from parent
    if (window.parentPlanningWindowId && planningWindowsWithProject) {
      const parent = planningWindowsWithProject.find(w => w.id === window.parentPlanningWindowId);
      if (parent) {
        // Use parent's config
        return {
          daysOfWeek: parent.daysOfWeek || [1, 2, 3, 4, 5],
          workingHoursPerDay: parent.workingHoursPerDay || 8,
          timeSlots: getTimeSlots(parent)
        };
      }
    }
    // Use own config
    return {
      daysOfWeek: window.daysOfWeek || [1, 2, 3, 4, 5],
      workingHoursPerDay: window.workingHoursPerDay || 8,
      timeSlots: getTimeSlots(window)
    };
  };

  // Expand planning windows for current view
  const expandedInstances = useMemo(() => {
    if (!planningWindowsWithProject) return [];
    
    const { start: calendarStart, end: calendarEnd } = getDateRange();
    const instances: ExpandedPlanningInstance[] = [];
    
    // Helper to check if a day is a working day
    const isWorkingDay = (date: Date, daysOfWeek: number[]): boolean => {
      const dayOfWeek = date.getDay();
      const ourDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      return daysOfWeek.includes(ourDayOfWeek);
    };
    
    planningWindowsWithProject.forEach(({ project, ...window }) => {
      const windowStart = new Date(window.startDate);
      const windowEnd = new Date(window.endDate);
      const windowLevel = windowHierarchy.get(window.id) || 0;
      
      // Get inherited config from parent chain
      const inheritedConfig = getInheritedConfig(window);
      const { daysOfWeek, workingHoursPerDay, timeSlots } = inheritedConfig;
      
      // Use REMAINING hours from ETC batch data (reflects task completion progress)
      // This ensures calendar slot occupation updates when tasks advance
      const projectETC = project?.id ? etcBatchData?.[project.id] : null;
      const estimatedHours = projectETC?.totalRemainingHours ?? project?.estimatedEffort ?? null;
      const workingDaysQuota = estimatedHours ? Math.ceil(estimatedHours / workingHoursPerDay) : null;
      
      // CRITICAL: Child windows (with parentPlanningWindowId) should ALWAYS use 'none' expansion logic
      // to respect quota-based day generation from estimatedEffort, regardless of their recurrence_type setting
      const isChildWindow = !!window.parentPlanningWindowId;
      const effectiveRecurrenceType = isChildWindow ? 'none' : window.recurrenceType;
      
      // Helper to calculate slot duration in hours
      const getSlotDurationHours = (slot: { startTime: string; endTime: string }): number => {
        const [startH, startM] = slot.startTime.split(':').map(Number);
        const [endH, endM] = slot.endTime.split(':').map(Number);
        return (endH * 60 + endM - startH * 60 - startM) / 60;
      };
      
      if (effectiveRecurrenceType === 'none') {
        // Verifica se la finestra interseca il range del calendario
        if (isWithinInterval(windowStart, { start: calendarStart, end: calendarEnd }) ||
            isWithinInterval(windowEnd, { start: calendarStart, end: calendarEnd }) ||
            (windowStart <= calendarStart && windowEnd >= calendarEnd)) {
          
          // Track remaining hours instead of working days for accurate partial slot handling
          let remainingHours = estimatedHours;
          let currentDay = new Date(windowStart);
          
          while (currentDay <= windowEnd) {
            // Check if this is a working day
            if (isWorkingDay(currentDay, daysOfWeek)) {
              // Stop if hours are exhausted (only if estimatedHours is set)
              if (remainingHours !== null && remainingHours <= 0) {
                break;
              }
              
              // Create instance for each time slot, tracking hours consumed
              for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
                const slot = timeSlots[slotIdx];
                const slotDurationHours = getSlotDurationHours(slot);
                
                // Calculate hours to allocate to this slot
                let allocatedHours: number;
                let isPartialSlot: boolean;
                
                if (remainingHours === null) {
                  // No estimated hours - use full slot duration
                  allocatedHours = slotDurationHours;
                  isPartialSlot = false;
                } else if (remainingHours <= 0) {
                  // Hours exhausted - skip this slot
                  break;
                } else if (remainingHours >= slotDurationHours) {
                  // Enough hours for full slot
                  allocatedHours = slotDurationHours;
                  isPartialSlot = false;
                  remainingHours -= slotDurationHours;
                } else {
                  // Partial slot - use only remaining hours
                  allocatedHours = remainingHours;
                  isPartialSlot = true;
                  remainingHours = 0;
                }
                
                instances.push({
                  window,
                  project,
                  date: new Date(currentDay),
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  level: windowLevel,
                  slotLabel: slot.label,
                  slotIndex: slotIdx,
                  totalSlots: timeSlots.length,
                  slotDurationHours,
                  allocatedHours,
                  isPartialSlot
                });
              }
            }
            
            currentDay = addDays(currentDay, 1);
          }
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
                  // Crea un'istanza per ogni time slot
                  timeSlots.forEach((slot, slotIdx) => {
                    const slotDurationHours = getSlotDurationHours(slot);
                    instances.push({
                      window,
                      project,
                      date: new Date(targetDate),
                      startTime: slot.startTime,
                      endTime: slot.endTime,
                      level: windowLevel,
                      slotLabel: slot.label,
                      slotIndex: slotIdx,
                      totalSlots: timeSlots.length,
                      slotDurationHours,
                      allocatedHours: slotDurationHours,
                      isPartialSlot: false
                    });
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
              // Crea un'istanza per ogni time slot
              timeSlots.forEach((slot, slotIdx) => {
                const slotDurationHours = getSlotDurationHours(slot);
                instances.push({
                  window,
                  project,
                  date: new Date(currentInstanceDate),
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  level: windowLevel,
                  slotLabel: slot.label,
                  slotIndex: slotIdx,
                  totalSlots: timeSlots.length,
                  slotDurationHours,
                  allocatedHours: slotDurationHours,
                  isPartialSlot: false
                });
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
  }, [planningWindowsWithProject, currentDate, view, windowHierarchy, etcBatchData]);

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

  // Helper functions per colori gerarchici
  // Utility per convertire hex a rgb
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Utility per convertire rgb a hex
  const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  // Funzione per schiarire un colore in base al livello gerarchico
  const getLighterColor = (baseColor: string, level: number): string => {
    const rgb = hexToRgb(baseColor);
    if (!rgb) return baseColor;
    
    // Aumenta la luminosità del 20% per ogni livello
    const factor = level * 0.2;
    const newR = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor));
    const newG = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor));
    const newB = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor));
    
    return rgbToHex(newR, newG, newB);
  };

  // Funzione per generare gli stili inline per un progetto e livello
  const getProjectColorStyle = (projectColor: string, level: number): { backgroundColor: string; borderColor: string; color: string } => {
    const lightColor = getLighterColor(projectColor, level);
    const rgb = hexToRgb(lightColor);
    if (!rgb) return { backgroundColor: '#E5E7EB', borderColor: '#D1D5DB', color: '#374151' };
    
    // Calcola luminosità per determinare il colore del testo
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    const textColor = luminance > 0.6 ? '#374151' : '#FFFFFF';
    
    return {
      backgroundColor: lightColor,
      borderColor: projectColor, // Il bordo usa sempre il colore base del progetto
      color: textColor
    };
  };

  const getLevelIndentation = (level: number) => {
    return level * 4;
  };

  // Funzione per trovare il colore del progetto padre nella gerarchia
  const getProjectHierarchyColor = (project: Project | null): string => {
    if (!project) return '#6B7280'; // Default gray for standalone windows
    // Se il progetto ha un padre, cerca ricorsivamente il colore del progetto root
    if (project.parentProjectId && planningWindowsWithProject) {
      const parentProject = planningWindowsWithProject
        .map(pwp => pwp.project)
        .filter((p): p is Project => p !== null)
        .find((p: Project) => p.id === project.parentProjectId);
      if (parentProject) {
        return getProjectHierarchyColor(parentProject);
      }
    }
    // Questo è il progetto root, restituisce il suo colore
    return project.color || '#3B82F6';
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

  // Calculate continuous periods for month view
  const getContinuousPeriods = () => {
    if (!planningWindowsWithProject) return [];
    
    const { start: calendarStart, end: calendarEnd } = getDateRange();
    const periods: Array<{
      window: PlanningWindow;
      project: Project | null;
      level: number;
      startDate: Date;
      endDate: Date;
      startTime: string;
      endTime: string;
    }> = [];
    
    planningWindowsWithProject.forEach(({ project, ...window }) => {
      const windowStart = new Date(window.startDate);
      const windowEnd = new Date(window.endDate);
      const windowLevel = windowHierarchy.get(window.id) || 0;
      
      // Solo finestre padre (che hanno figli) o finestre standalone di primo livello
      // Le finestre figlie usano i box giornalieri, non le barre continue
      const hasChildWindows = planningWindowsWithProject.some(w => w.parentPlanningWindowId === window.id);
      if (hasChildWindows || windowLevel === 0) {
        // Per le finestre padre con figli, usa windowEnd (gabbia completa)
        // Per le finestre standalone senza figli, calcola effectiveEndDate
        let effectiveEnd = windowEnd;
        if (!hasChildWindows && project?.estimatedEffort) {
          const workingHoursPerDay = window.workingHoursPerDay || 8;
          const daysOfWeek = window.daysOfWeek || [1, 2, 3, 4, 5];
          effectiveEnd = calculateEffectiveEndDate(
            windowStart, windowEnd, project.estimatedEffort, workingHoursPerDay, daysOfWeek
          );
        }
        
        // Intersect with calendar range
        const rangeStart = max([windowStart, calendarStart]);
        const rangeEnd = min([effectiveEnd, calendarEnd]);
        
        if (rangeStart <= rangeEnd) {
          periods.push({
            window,
            project,
            level: windowLevel,
            startDate: rangeStart,
            endDate: rangeEnd,
            startTime: window.startTime || '09:00',
            endTime: window.endTime || '17:00'
          });
        }
      }
    });
    
    return periods.sort((a, b) => a.level - b.level);
  };

  // Funzione per convertire time string in minuti dall'inizio della giornata (come nella vista settimanale)
  const timeToMinutes = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
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

    // Aggiungi i periodi continui per i progetti padre
    const continuousPeriods = getContinuousPeriods();
    
    Object.keys(instancesByDate).forEach(dateKey => {
      instancesByDate[dateKey].sort((a, b) => a.level - b.level);
    });

    // Altezza fissa per tutti i giorni per mantenere allineamento griglia
    // Per far stare il mese in una schermata: 6 settimane * 140px = 840px + headers
    const FIXED_DAY_HEIGHT = 140; // Altezza per fit in schermata
    const HEADER_HEIGHT = 28; // Spazio per numero del giorno
    const CONTENT_HEIGHT = FIXED_DAY_HEIGHT - HEADER_HEIGHT; // 112px effettivi
    // Con 112px di contenuto: 8 ore = 1/3 = ~37px, quindi ~4.7px per ora

    // Funzione ricorsiva per renderizzare progetti padre -> figli
    // allDayInstances: all instances for this day (for hasChildren lookup)
    // instancesToProcess: subset of instances to render in this call
    const renderHierarchicalProjects = (allDayInstances: ExpandedPlanningInstance[], instancesToProcess: ExpandedPlanningInstance[], availableHeight: number, parentBounds?: { start: number, end: number, level: number }) => {
      const minutesInDay = 24 * 60; // 1440 minuti
      // IMPORTANTE: Usa l'altezza totale della cella (140px) per calcoli proporzioni corrette
      const totalCellHeight = FIXED_DAY_HEIGHT; // 140px per proporzioni corrette
      
      // Raggruppa per livello
      const byLevel = instancesToProcess.reduce((acc, instance) => {
        if (!acc[instance.level]) acc[instance.level] = [];
        acc[instance.level].push(instance);
        return acc;
      }, {} as Record<number, ExpandedPlanningInstance[]>);
      
      const levels = Object.keys(byLevel).map(Number).sort();
      const result: JSX.Element[] = [];
      
      // Helper per calcolare l'orario di fine effettivo basato sulle ore allocate
      const getEffectiveEndTime = (startTime: string, allocatedHours: number): string => {
        const [startH, startM] = startTime.split(':').map(Number);
        const totalMinutes = startH * 60 + startM + allocatedHours * 60;
        const endH = Math.floor(totalMinutes / 60);
        const endM = Math.round(totalMinutes % 60);
        return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      };

      levels.forEach(level => {
        const levelInstances = byLevel[level];
        
        levelInstances.forEach((instance, idx) => {
          const startMinutes = timeToMinutes(instance.startTime);
          const originalEndMinutes = timeToMinutes(instance.endTime); // Per i bounds dei children
          // Per slot parziali, usa le ore allocate effettive invece della durata completa
          const effectiveDurationMinutes = instance.allocatedHours * 60;
          const effectiveEndTime = instance.isPartialSlot 
            ? getEffectiveEndTime(instance.startTime, instance.allocatedHours)
            : instance.endTime;
          const durationMinutes = effectiveDurationMinutes;
          
          // Se c'è un parent bound, calcola le coordinate relative al padre
          let relativeStart = startMinutes;
          let relativeHeight = totalCellHeight; // Usa altezza totale per proporzioni corrette
          let relativeTop = 0;
          
          if (parentBounds) {
            relativeTop = ((parentBounds.start) / minutesInDay) * totalCellHeight;
            relativeHeight = ((parentBounds.end - parentBounds.start) / minutesInDay) * totalCellHeight;
            relativeStart = startMinutes - parentBounds.start; // Posizione relativa al padre
          }
          
          // Calcola proporzioni usando altezza totale cella (140px): 8 ore = 1/3 = ~47px
          const topPosition = relativeTop + (relativeStart / (parentBounds ? (parentBounds.end - parentBounds.start) : minutesInDay)) * relativeHeight;
          const height = Math.max(16, (durationMinutes / (parentBounds ? (parentBounds.end - parentBounds.start) : minutesInDay)) * relativeHeight);
          
          // Determina se questo è un progetto padre (ha figli) - cerca tra TUTTE le istanze del giorno
          const hasChildren = allDayInstances.some(other => 
            other.level > level && other.window.parentPlanningWindowId === instance.window.id
          );
          
          result.push(
            <div
              key={`${instance.window.id}-${format(instance.date, 'yyyy-MM-dd')}-${instance.slotIndex}-${instance.level}`}
              onClick={() => onWindowSelect?.(instance.window)}
              className="absolute cursor-pointer"
              style={{ 
                top: `${topPosition}px`,
                height: `${height}px`,
                left: `${getLevelIndentation(level)}px`,
                right: `${getLevelIndentation(level)}px`,
                zIndex: hasChildren ? level : 10 + level,
                opacity: hasChildren ? 0.4 : 1
              }}
            >
              <div 
                className={`hover:opacity-80 text-xs p-1 rounded border h-full overflow-hidden flex flex-col justify-between ${hasChildren ? 'border-2 border-dashed' : ''} ${instance.isPartialSlot ? 'border-orange-400 border-2' : ''}`}
                style={getProjectColorStyle(getProjectHierarchyColor(instance.project), level)}
              >
                <div>
                  <div className="font-medium truncate">
                    {instance.window.name}
                  </div>
                  <div className="text-[10px] opacity-75">
                    {instance.startTime} - {effectiveEndTime}
                    {instance.isPartialSlot && (
                      <span className="ml-1 text-orange-600 font-medium">
                        ({instance.allocatedHours}h/{instance.slotDurationHours}h)
                      </span>
                    )}
                    {!instance.isPartialSlot && instance.allocatedHours > 0 && (
                      <span className="ml-1 opacity-60">
                        ({instance.allocatedHours}h)
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[9px] opacity-75 truncate">
                  {instance.project?.name || 'Finestra Standalone'}
                  {level > 0 && (
                    <span className="ml-1">
                      {'→'.repeat(level)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
          
          // Se questo ha figli, renderizza i figli all'interno
          // CRITICAL: Filter children by parentPlanningWindowId from ALL day instances
          if (hasChildren) {
            const children = allDayInstances.filter(other => 
              other.level > level && 
              other.window.parentPlanningWindowId === instance.window.id
            );
            if (children.length > 0) {
              const childElements = renderHierarchicalProjects(allDayInstances, children, totalCellHeight, {
                start: startMinutes,
                end: originalEndMinutes,
                level: level
              });
              result.push(...childElements);
            }
          }
        });
      });
      
      return result;
    };

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
          
          // Find continuous periods that include this day  
          const dayPeriods = continuousPeriods.filter(period => 
            day >= period.startDate && day <= period.endDate
          );
          
          return (
            <div 
              key={dateKey} 
              className={`
                p-2 border border-border/50 relative
                ${!isInCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-background'}
                ${isTodayDate ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800' : ''}
              `}
              style={{ height: `${FIXED_DAY_HEIGHT}px` }}
            >
              <div className={`text-sm font-medium mb-1 ${isTodayDate ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                {format(day, 'd')}
              </div>
              
              {/* Renderizzazione ricorsiva progetti padre -> figli */}
              <div className="absolute inset-x-0" style={{ 
                top: `0px`, // Inizia dall'alto della cella per proporzioni corrette
                height: `${FIXED_DAY_HEIGHT}px` // Usa altezza totale per proporzioni corrette
              }}>
                {renderHierarchicalProjects(dayInstances, dayInstances.filter(i => i.level === 0), FIXED_DAY_HEIGHT)}
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
    const hourHeight = 60;
    
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
        {/* Header con grid per allineamento perfetto */}
        <div className="grid grid-cols-8 gap-1 border-b border-border">
          <div className="p-2 text-center text-sm font-medium text-muted-foreground">
            Ora
          </div>
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        
        {/* Corpo con layout fisso che mantiene box continui */}
        <div className="flex-1 overflow-auto max-h-[600px] relative">
          <div className="grid grid-cols-8 gap-1">
            {/* Colonna orari */}
            <div className="bg-muted/30">
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
              const isTodayDate = isSameDay(day, new Date());
              
              return (
                <div key={dateKey} className={`relative ${isTodayDate ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-background'}`}>
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
                  
                  {/* Eventi sovrapposti come box continui - renderizza prima livello 0, poi livelli superiori */}
                  {dayInstances
                    .sort((a, b) => a.level - b.level) // Parents first, children on top
                    .map((instance) => {
                    const startMinutes = timeToMinutes(instance.startTime);
                    // Per slot parziali, usa le ore allocate effettive
                    const effectiveDurationMinutes = instance.allocatedHours * 60;
                    const getEffectiveEndTime = (startTime: string, allocatedHours: number): string => {
                      const [startH, startM] = startTime.split(':').map(Number);
                      const totalMinutes = startH * 60 + startM + allocatedHours * 60;
                      const endH = Math.floor(totalMinutes / 60);
                      const endM = Math.round(totalMinutes % 60);
                      return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
                    };
                    const effectiveEndTime = instance.isPartialSlot 
                      ? getEffectiveEndTime(instance.startTime, instance.allocatedHours)
                      : instance.endTime;
                    
                    const topPosition = (startMinutes / 60) * hourHeight;
                    const height = (effectiveDurationMinutes / 60) * hourHeight;
                    
                    // Unique key including all identifiers
                    const uniqueKey = `${instance.window.id}-${format(instance.date, 'yyyy-MM-dd')}-${instance.slotIndex}-${instance.level}`;
                    
                    return (
                      <div
                        key={uniqueKey}
                        onClick={() => onWindowSelect?.(instance.window)}
                        className="absolute cursor-pointer"
                        style={{ 
                          top: `${topPosition}px`,
                          height: `${height}px`,
                          left: `${2 + getLevelIndentation(instance.level)}px`,
                          right: `${2 + getLevelIndentation(instance.level)}px`,
                          zIndex: 10 + instance.level, // Higher level = higher z-index
                        }}
                      >
                        <div 
                          className={`hover:opacity-80 text-xs p-2 rounded border h-full overflow-hidden ${instance.isPartialSlot ? 'border-orange-400 border-2' : ''}`}
                          style={getProjectColorStyle(getProjectHierarchyColor(instance.project), instance.level)}
                        >
                          <div className="font-medium truncate">
                            {instance.window.name}
                          </div>
                          <div className="text-[10px] opacity-75">
                            {instance.startTime} - {effectiveEndTime}
                            {instance.isPartialSlot && (
                              <span className="ml-1 text-orange-600 font-medium">
                                ({instance.allocatedHours}h/{instance.slotDurationHours}h)
                              </span>
                            )}
                            {!instance.isPartialSlot && instance.allocatedHours > 0 && (
                              <span className="ml-1 opacity-60">
                                ({instance.allocatedHours}h)
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] opacity-75 truncate">
                            {instance.project?.name || 'Finestra Standalone'}
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
              
              {/* Eventi sovrapposti - renderizza prima livello 0, poi livelli superiori */}
              {dayInstances
                .sort((a, b) => a.level - b.level) // Parents first, children on top
                .map((instance) => {
                const startMinutes = timeToMinutes(instance.startTime);
                // Per slot parziali, usa le ore allocate effettive
                const effectiveDurationMinutes = instance.allocatedHours * 60;
                const getEffectiveEndTime = (startTime: string, allocatedHours: number): string => {
                  const [startH, startM] = startTime.split(':').map(Number);
                  const totalMinutes = startH * 60 + startM + allocatedHours * 60;
                  const endH = Math.floor(totalMinutes / 60);
                  const endM = Math.round(totalMinutes % 60);
                  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
                };
                const effectiveEndTime = instance.isPartialSlot 
                  ? getEffectiveEndTime(instance.startTime, instance.allocatedHours)
                  : instance.endTime;
                
                const topPosition = (startMinutes / 60) * hourHeight;
                const height = (effectiveDurationMinutes / 60) * hourHeight;
                
                // Unique key including all identifiers
                const uniqueKey = `${instance.window.id}-${format(instance.date, 'yyyy-MM-dd')}-${instance.slotIndex}-${instance.level}`;
                
                return (
                  <div
                    key={uniqueKey}
                    onClick={() => onWindowSelect?.(instance.window)}
                    className="absolute cursor-pointer"
                    style={{ 
                      top: `${topPosition}px`,
                      height: `${height}px`,
                      left: `${8 + getLevelIndentation(instance.level)}px`,
                      right: `${8 + getLevelIndentation(instance.level)}px`,
                      zIndex: 10 + instance.level, // Higher level = higher z-index
                    }}
                  >
                    <div 
                      className={`hover:opacity-80 p-3 rounded border h-full overflow-hidden flex flex-col ${instance.isPartialSlot ? 'border-orange-400 border-2' : ''}`}
                      style={getProjectColorStyle(getProjectHierarchyColor(instance.project), instance.level)}
                    >
                      <div className="font-medium truncate">
                        {instance.window.name}
                      </div>
                      <div className="text-sm opacity-75 mt-1">
                        {instance.startTime} - {effectiveEndTime}
                        {instance.isPartialSlot && (
                          <span className="ml-2 text-orange-600 font-medium">
                            ({instance.allocatedHours}h/{instance.slotDurationHours}h)
                          </span>
                        )}
                        {!instance.isPartialSlot && instance.allocatedHours > 0 && (
                          <span className="ml-2 opacity-60">
                            ({instance.allocatedHours}h)
                          </span>
                        )}
                      </div>
                      <div className="text-sm opacity-75 mt-1">
                        {instance.project?.name || 'Finestra Standalone'}
                        {instance.level > 0 && (
                          <span className="ml-2">
                            {'→'.repeat(instance.level)}
                          </span>
                        )}
                      </div>
                      {instance.project?.description && height > 120 && (
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
            {/* Add new planning window button */}
            {onAddNew && (
              <Button
                onClick={onAddNew}
                size="sm"
                data-testid="button-add-planning-window"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nuova Pianificazione
              </Button>
            )}
            
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