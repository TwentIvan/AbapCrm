import { storage } from "./storage";
import { Task, PlanningWindow, Project } from "@shared/schema";
import { addDays } from "date-fns";

export interface TimeSlot {
  startTime: string;
  endTime: string;
  label?: string;
}

export interface EndToCompleteResult {
  projectId: string;
  projectName: string;
  state: 'completed' | 'on_track' | 'delayed' | 'no_planning_window' | 'no_tasks';
  hasTasks: boolean;
  hasWindow: boolean;
  totalEstimatedHours: number;
  totalRemainingHours: number;
  completionPercentage: number;
  plannedEndDate: string | null;
  effectiveEndDate: string | null;
  effectiveEndTime: string | null;
  simulationStartDate: string | null;
  windowId: string | null;
  windowName: string | null;
  taskBreakdown: {
    taskId: string;
    taskTitle: string;
    estimatedHours: number;
    completionPercentage: number;
    remainingHours: number;
  }[];
  slotAllocation: {
    date: string;
    startTime: string;
    endTime: string;
    allocatedHours: number;
    isPartialSlot: boolean;
  }[];
}

function getSlotDurationHours(slot: TimeSlot): number {
  const [startH, startM] = slot.startTime.split(':').map(Number);
  const [endH, endM] = slot.endTime.split(':').map(Number);
  return (endH * 60 + endM - startH * 60 - startM) / 60;
}

function isWorkingDay(date: Date, daysOfWeek: number[]): boolean {
  const dayOfWeek = date.getDay();
  const ourDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
  return daysOfWeek.includes(ourDayOfWeek);
}

function getEffectiveEndTime(startTime: string, allocatedHours: number): string {
  const [startH, startM] = startTime.split(':').map(Number);
  const totalMinutes = startH * 60 + startM + allocatedHours * 60;
  const endH = Math.floor(totalMinutes / 60);
  const endM = Math.round(totalMinutes % 60);
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

function getAncestorChain(
  projectWindow: PlanningWindow,
  allWindows: PlanningWindow[]
): PlanningWindow[] {
  const ancestorChain: PlanningWindow[] = [];
  let currentWindow: PlanningWindow | undefined = projectWindow;

  while (currentWindow?.parentPlanningWindowId) {
    const parentWindow = allWindows.find(w => w.id === currentWindow!.parentPlanningWindowId);
    if (!parentWindow) break;
    ancestorChain.unshift(parentWindow);
    currentWindow = parentWindow;
  }
  return ancestorChain;
}

function getEffectiveDateRange(
  projectWindow: PlanningWindow,
  allWindows: PlanningWindow[]
): { effectiveStart: Date; effectiveEnd: Date } {
  let effectiveStart = new Date(projectWindow.startDate);
  let effectiveEnd = new Date(projectWindow.endDate);

  // Only clamp to the DIRECT parent window, not the entire ancestor chain
  if (projectWindow.parentPlanningWindowId) {
    const directParent = allWindows.find(w => w.id === projectWindow.parentPlanningWindowId);
    if (directParent) {
      const parentStart = new Date(directParent.startDate);
      const parentEnd = new Date(directParent.endDate);
      if (parentStart > effectiveStart) {
        effectiveStart = parentStart;
      }
      if (parentEnd < effectiveEnd) {
        effectiveEnd = parentEnd;
      }
    }
  }

  return { effectiveStart, effectiveEnd };
}

async function getInheritedConfigFromHierarchy(
  projectWindow: PlanningWindow,
  allWindows: PlanningWindow[]
): Promise<{ daysOfWeek: number[]; timeSlots: TimeSlot[]; workingHoursPerDay: number }> {
  const ancestorChain = getAncestorChain(projectWindow, allWindows);

  let daysOfWeek: number[] = [1, 2, 3, 4, 5];
  let timeSlots: TimeSlot[] = [];
  let workingHoursPerDay = 8;

  for (const ancestor of ancestorChain) {
    if (ancestor.daysOfWeek && ancestor.daysOfWeek.length > 0) {
      daysOfWeek = ancestor.daysOfWeek;
    }
    if (ancestor.timeSlots && ancestor.timeSlots.length > 0) {
      timeSlots = ancestor.timeSlots;
    }
    if (ancestor.workingHoursPerDay) {
      workingHoursPerDay = ancestor.workingHoursPerDay;
    }
  }

  if (projectWindow.daysOfWeek && projectWindow.daysOfWeek.length > 0) {
    daysOfWeek = projectWindow.daysOfWeek;
  }
  if (projectWindow.timeSlots && projectWindow.timeSlots.length > 0) {
    timeSlots = projectWindow.timeSlots;
  }
  if (projectWindow.workingHoursPerDay) {
    workingHoursPerDay = projectWindow.workingHoursPerDay;
  }

  if (timeSlots.length === 0) {
    timeSlots = [{ startTime: projectWindow.startTime, endTime: projectWindow.endTime }];
  }

  return { daysOfWeek, timeSlots, workingHoursPerDay };
}

export async function calculateEndToComplete(
  projectId: string,
  userId: string,
  organizationId: string
): Promise<EndToCompleteResult> {
  const project = await storage.getProject(projectId, userId, organizationId);
  
  const baseResult: Partial<EndToCompleteResult> = {
    projectId,
    projectName: project?.name || 'Unknown',
    hasTasks: false,
    hasWindow: false,
    totalEstimatedHours: 0,
    totalRemainingHours: 0,
    completionPercentage: 0,
    plannedEndDate: null,
    effectiveEndDate: null,
    effectiveEndTime: null,
    simulationStartDate: null,
    windowId: null,
    windowName: null,
    taskBreakdown: [],
    slotAllocation: []
  };

  if (!project) {
    return {
      ...baseResult,
      state: 'no_tasks'
    } as EndToCompleteResult;
  }

  const tasks = await storage.getTasksByProject(projectId, userId, organizationId);
  
  const taskBreakdown = tasks.map(task => {
    const estimatedHours = task.estimatedEffort || 0;
    const completionPct = task.completionPercentage || 0;
    // Use effectiveRemainingHours if manually set, otherwise calculate from completion percentage
    const derivedRemainingHours = estimatedHours * (1 - completionPct / 100);
    const remainingHours = task.effectiveRemainingHours ?? derivedRemainingHours;
    
    return {
      taskId: task.id,
      taskTitle: task.title,
      estimatedHours,
      completionPercentage: completionPct,
      remainingHours: Math.round(remainingHours * 100) / 100
    };
  });

  const totalEstimatedHours = taskBreakdown.reduce((sum, t) => sum + t.estimatedHours, 0);
  const totalRemainingHours = taskBreakdown.reduce((sum, t) => sum + t.remainingHours, 0);
  const overallCompletionPercentage = totalEstimatedHours > 0 
    ? Math.round((1 - totalRemainingHours / totalEstimatedHours) * 100) 
    : 0;

  baseResult.taskBreakdown = taskBreakdown;
  baseResult.totalEstimatedHours = totalEstimatedHours;
  baseResult.totalRemainingHours = totalRemainingHours;
  baseResult.completionPercentage = overallCompletionPercentage;
  baseResult.hasTasks = tasks.length > 0;

  if (tasks.length === 0) {
    return {
      ...baseResult,
      state: 'no_tasks'
    } as EndToCompleteResult;
  }

  if (totalRemainingHours <= 0) {
    return {
      ...baseResult,
      state: 'completed',
      effectiveEndDate: new Date().toISOString()
    } as EndToCompleteResult;
  }

  const allUserWindows = await storage.getAllPlanningWindowsForUser(userId);
  
  // NEW: Use inverted relationship - project points to window via planningWindowId
  // Also support legacy windows that have projectId for backwards compatibility
  const projectWindow = project.planningWindowId
    ? allUserWindows.find(w => w.id === project.planningWindowId)
    : allUserWindows.find(w => w.projectId === projectId);

  if (!projectWindow) {
    return {
      ...baseResult,
      state: 'no_planning_window'
    } as EndToCompleteResult;
  }

  baseResult.hasWindow = true;
  baseResult.windowId = projectWindow.id;
  baseResult.windowName = projectWindow.name;
  baseResult.plannedEndDate = new Date(projectWindow.endDate).toISOString();

  const { daysOfWeek, timeSlots, workingHoursPerDay } = await getInheritedConfigFromHierarchy(projectWindow, allUserWindows);

  const { effectiveStart, effectiveEnd } = getEffectiveDateRange(projectWindow, allUserWindows);
  
  const windowStart = effectiveStart;
  const windowEnd = effectiveEnd;
  
  let remainingHours = totalRemainingHours;
  let currentDay = new Date();
  
  if (currentDay < windowStart) {
    currentDay = new Date(windowStart);
  }
  
  // Store the simulation start date (where we begin allocating hours)
  const simulationStartDate = new Date(currentDay);
  baseResult.simulationStartDate = simulationStartDate.toISOString();

  const slotAllocation: EndToCompleteResult['slotAllocation'] = [];
  let lastDate: Date | null = null;
  let lastEndTime: string | null = null;

  const maxIterations = 365 * 2;
  let iterations = 0;
  let extendedBeyondWindow = false;

  while (remainingHours > 0 && iterations < maxIterations) {
    iterations++;
    
    if (currentDay > windowEnd) {
      extendedBeyondWindow = true;
    }

    if (isWorkingDay(currentDay, daysOfWeek)) {
      for (const slot of timeSlots) {
        if (remainingHours <= 0) break;

        const slotDurationHours = getSlotDurationHours(slot);
        
        let allocatedHours: number;
        let isPartialSlot: boolean;

        if (remainingHours >= slotDurationHours) {
          allocatedHours = slotDurationHours;
          isPartialSlot = false;
          remainingHours -= slotDurationHours;
        } else {
          allocatedHours = remainingHours;
          isPartialSlot = true;
          remainingHours = 0;
        }

        const effectiveEndTime = isPartialSlot 
          ? getEffectiveEndTime(slot.startTime, allocatedHours)
          : slot.endTime;

        slotAllocation.push({
          date: new Date(currentDay).toISOString(),
          startTime: slot.startTime,
          endTime: effectiveEndTime,
          allocatedHours,
          isPartialSlot
        });

        lastDate = new Date(currentDay);
        lastEndTime = effectiveEndTime;
      }
    }

    currentDay = addDays(currentDay, 1);
  }

  const calculatedEndDate = lastDate;
  const plannedEnd = new Date(projectWindow.endDate);
  const isDelayed = calculatedEndDate && calculatedEndDate > plannedEnd;

  return {
    ...baseResult,
    state: isDelayed ? 'delayed' : 'on_track',
    effectiveEndDate: lastDate?.toISOString() || null,
    effectiveEndTime: lastEndTime,
    slotAllocation
  } as EndToCompleteResult;
}

export async function calculateEndToCompleteForAllProjects(
  userId: string,
  organizationIds: string[]
): Promise<Map<string, EndToCompleteResult>> {
  const results = new Map<string, EndToCompleteResult>();
  
  for (const orgId of organizationIds) {
    const projects = await storage.getProjects(userId, orgId);
    
    for (const project of projects) {
      const result = await calculateEndToComplete(project.id, userId, orgId);
      results.set(project.id, result);
    }
  }

  return results;
}
