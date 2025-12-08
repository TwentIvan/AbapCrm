import { storage } from "./storage";
import { calculateEndToComplete, EndToCompleteResult, TimeSlot } from "./end-to-complete-calculator";
import { PlanningWindow } from "@shared/schema";

export interface ReschedulingResult {
  projectId: string;
  calculatedEndDate: Date | null;
  scheduleDeficitHours: number;
  previousEndDate: Date | null;
  previousDeficitHours: number;
  etcResult: EndToCompleteResult;
  superiorWindowId: string | null;
  superiorWindowEndDate: Date | null;
  changed: boolean;
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

function findRootAncestorWindow(
  projectWindow: PlanningWindow,
  allWindows: PlanningWindow[]
): PlanningWindow {
  let currentWindow = projectWindow;
  
  while (currentWindow.parentPlanningWindowId) {
    const parentWindow = allWindows.find(w => w.id === currentWindow.parentPlanningWindowId);
    if (!parentWindow) break;
    currentWindow = parentWindow;
  }
  
  return currentWindow;
}

function getInheritedConfig(
  projectWindow: PlanningWindow,
  allWindows: PlanningWindow[]
): { daysOfWeek: number[]; timeSlots: TimeSlot[]; workingHoursPerDay: number } {
  const ancestorChain: PlanningWindow[] = [];
  let currentWindow: PlanningWindow | undefined = projectWindow;

  while (currentWindow?.parentPlanningWindowId) {
    const parentWindow = allWindows.find(w => w.id === currentWindow!.parentPlanningWindowId);
    if (!parentWindow) break;
    ancestorChain.unshift(parentWindow);
    currentWindow = parentWindow;
  }

  let daysOfWeek: number[] = [1, 2, 3, 4, 5];
  let timeSlots: TimeSlot[] = [];
  let workingHoursPerDay = 8;

  for (const ancestor of ancestorChain) {
    if (ancestor.daysOfWeek && ancestor.daysOfWeek.length > 0) {
      daysOfWeek = ancestor.daysOfWeek;
    }
    if (ancestor.timeSlots && ancestor.timeSlots.length > 0) {
      timeSlots = ancestor.timeSlots as TimeSlot[];
    }
    if (ancestor.workingHoursPerDay) {
      workingHoursPerDay = ancestor.workingHoursPerDay;
    }
  }

  if (projectWindow.daysOfWeek && projectWindow.daysOfWeek.length > 0) {
    daysOfWeek = projectWindow.daysOfWeek;
  }
  if (projectWindow.timeSlots && projectWindow.timeSlots.length > 0) {
    timeSlots = projectWindow.timeSlots as TimeSlot[];
  }
  if (projectWindow.workingHoursPerDay) {
    workingHoursPerDay = projectWindow.workingHoursPerDay;
  }

  if (timeSlots.length === 0) {
    timeSlots = [{ startTime: projectWindow.startTime, endTime: projectWindow.endTime }];
  }

  return { daysOfWeek, timeSlots, workingHoursPerDay };
}

function calculateDeficitHours(
  effectiveEndDate: Date,
  superiorWindowEndDate: Date,
  projectWindow: PlanningWindow,
  allWindows: PlanningWindow[]
): number {
  if (effectiveEndDate <= superiorWindowEndDate) {
    return 0;
  }

  const { daysOfWeek, timeSlots } = getInheritedConfig(projectWindow, allWindows);
  
  let deficitHours = 0;
  let currentDay = new Date(superiorWindowEndDate);
  currentDay.setDate(currentDay.getDate() + 1);
  
  const maxIterations = 365 * 2;
  let iterations = 0;
  
  while (currentDay <= effectiveEndDate && iterations < maxIterations) {
    iterations++;
    
    if (isWorkingDay(currentDay, daysOfWeek)) {
      for (const slot of timeSlots) {
        if (currentDay < effectiveEndDate) {
          deficitHours += getSlotDurationHours(slot);
        } else if (currentDay.toDateString() === effectiveEndDate.toDateString()) {
          deficitHours += getSlotDurationHours(slot);
        }
      }
    }
    
    currentDay.setDate(currentDay.getDate() + 1);
  }
  
  return Math.round(deficitHours * 100) / 100;
}

export async function recalculateProjectSchedule(
  projectId: string,
  userId: string,
  organizationId: string
): Promise<ReschedulingResult> {
  const project = await storage.getProject(projectId, userId, organizationId);
  
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  const previousEndDate = project.calculatedEndDate ? new Date(project.calculatedEndDate) : null;
  const previousDeficitHours = project.scheduleDeficitHours || 0;
  
  const etcResult = await calculateEndToComplete(projectId, userId, organizationId);
  
  const baseResult: Partial<ReschedulingResult> = {
    projectId,
    previousEndDate,
    previousDeficitHours,
    etcResult,
    superiorWindowId: null,
    superiorWindowEndDate: null,
  };
  
  if (!etcResult.hasWindow || etcResult.state === 'no_tasks' || etcResult.state === 'no_planning_window') {
    await storage.updateProject(projectId, {
      calculatedEndDate: null,
      scheduleDeficitHours: 0,
      updatedAt: new Date()
    } as any, userId, organizationId);
    
    return {
      ...baseResult,
      calculatedEndDate: null,
      scheduleDeficitHours: 0,
      changed: previousEndDate !== null || previousDeficitHours !== 0
    } as ReschedulingResult;
  }
  
  if (etcResult.state === 'completed') {
    const completedDate = new Date();
    await storage.updateProject(projectId, {
      calculatedEndDate: completedDate,
      scheduleDeficitHours: 0,
      updatedAt: new Date()
    } as any, userId, organizationId);
    
    return {
      ...baseResult,
      calculatedEndDate: completedDate,
      scheduleDeficitHours: 0,
      changed: true
    } as ReschedulingResult;
  }
  
  const allUserWindows = await storage.getAllPlanningWindowsForUser(userId);
  const projectWindow = allUserWindows.find(w => w.projectId === projectId);
  
  if (!projectWindow) {
    await storage.updateProject(projectId, {
      calculatedEndDate: null,
      scheduleDeficitHours: 0,
      updatedAt: new Date()
    } as any, userId, organizationId);
    
    return {
      ...baseResult,
      calculatedEndDate: null,
      scheduleDeficitHours: 0,
      changed: previousEndDate !== null || previousDeficitHours !== 0
    } as ReschedulingResult;
  }
  
  const superiorWindow = findRootAncestorWindow(projectWindow, allUserWindows);
  const superiorWindowEndDate = new Date(superiorWindow.endDate);
  
  baseResult.superiorWindowId = superiorWindow.id;
  baseResult.superiorWindowEndDate = superiorWindowEndDate;
  
  const effectiveEndDate = etcResult.effectiveEndDate 
    ? new Date(etcResult.effectiveEndDate) 
    : new Date(projectWindow.endDate);
  
  let calculatedEndDate: Date;
  let scheduleDeficitHours: number;
  
  if (effectiveEndDate > superiorWindowEndDate) {
    calculatedEndDate = superiorWindowEndDate;
    scheduleDeficitHours = calculateDeficitHours(
      effectiveEndDate,
      superiorWindowEndDate,
      projectWindow,
      allUserWindows
    );
    
    if (scheduleDeficitHours === 0 && etcResult.totalRemainingHours > 0) {
      scheduleDeficitHours = etcResult.totalRemainingHours;
    }
  } else {
    calculatedEndDate = effectiveEndDate;
    scheduleDeficitHours = 0;
  }
  
  const endDateChanged = !previousEndDate || 
    previousEndDate.toISOString() !== calculatedEndDate.toISOString();
  const deficitChanged = previousDeficitHours !== scheduleDeficitHours;
  const changed = endDateChanged || deficitChanged;
  
  await storage.updateProject(projectId, {
    calculatedEndDate,
    scheduleDeficitHours,
    updatedAt: new Date()
  } as any, userId, organizationId);
  
  console.log(`[RESCHEDULE] Project ${projectId}: ` +
    `calculatedEnd=${calculatedEndDate.toISOString().split('T')[0]}, ` +
    `deficit=${scheduleDeficitHours}h, ` +
    `superiorWindowEnd=${superiorWindowEndDate.toISOString().split('T')[0]}, ` +
    `changed=${changed}`);
  
  return {
    ...baseResult,
    calculatedEndDate,
    scheduleDeficitHours,
    changed
  } as ReschedulingResult;
}

export async function recalculateProjectScheduleForTask(
  taskId: string,
  userId: string,
  organizationId: string
): Promise<ReschedulingResult | null> {
  const task = await storage.getTask(taskId, userId, organizationId);
  
  if (!task || !task.projectId) {
    return null;
  }
  
  return recalculateProjectSchedule(task.projectId, userId, organizationId);
}
