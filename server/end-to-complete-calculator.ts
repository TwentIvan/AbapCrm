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
  totalEstimatedHours: number;
  totalRemainingHours: number;
  completionPercentage: number;
  plannedEndDate: Date | null;
  effectiveEndDate: Date | null;
  effectiveEndTime: string | null;
  taskBreakdown: {
    taskId: string;
    taskTitle: string;
    estimatedHours: number;
    completionPercentage: number;
    remainingHours: number;
  }[];
  slotAllocation: {
    date: Date;
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

export async function calculateEndToComplete(
  projectId: string,
  userId: string,
  organizationId: string
): Promise<EndToCompleteResult | null> {
  const project = await storage.getProject(projectId, userId, organizationId);
  if (!project) {
    return null;
  }

  const tasks = await storage.getTasksByProject(projectId, userId, organizationId);
  
  const planningWindows = await storage.getPlanningWindows(projectId, userId);
  const projectWindow = planningWindows.find(w => w.projectId === projectId);

  const taskBreakdown = tasks.map(task => {
    const estimatedHours = task.estimatedEffort || 0;
    const completionPct = task.completionPercentage || 0;
    const remainingHours = estimatedHours * (1 - completionPct / 100);
    
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

  if (!projectWindow || totalRemainingHours <= 0) {
    return {
      projectId,
      projectName: project.name,
      totalEstimatedHours,
      totalRemainingHours,
      completionPercentage: overallCompletionPercentage,
      plannedEndDate: projectWindow ? new Date(projectWindow.endDate) : null,
      effectiveEndDate: totalRemainingHours <= 0 ? new Date() : null,
      effectiveEndTime: null,
      taskBreakdown,
      slotAllocation: []
    };
  }

  const parentWindow = projectWindow.parentPlanningWindowId 
    ? planningWindows.find(w => w.id === projectWindow.parentPlanningWindowId)
    : null;
  
  const getInheritedConfig = (window: PlanningWindow) => {
    let daysOfWeek = window.daysOfWeek || [1, 2, 3, 4, 5];
    let timeSlots: TimeSlot[] = window.timeSlots || [{ startTime: window.startTime, endTime: window.endTime }];
    let workingHoursPerDay = window.workingHoursPerDay || 8;

    if (parentWindow) {
      daysOfWeek = parentWindow.daysOfWeek || daysOfWeek;
      timeSlots = parentWindow.timeSlots || [{ startTime: parentWindow.startTime, endTime: parentWindow.endTime }];
      workingHoursPerDay = parentWindow.workingHoursPerDay || workingHoursPerDay;
    }

    return { daysOfWeek, timeSlots, workingHoursPerDay };
  };

  const { daysOfWeek, timeSlots } = getInheritedConfig(projectWindow);

  const windowStart = new Date(projectWindow.startDate);
  const windowEnd = new Date(projectWindow.endDate);
  
  let remainingHours = totalRemainingHours;
  let currentDay = new Date();
  
  if (currentDay < windowStart) {
    currentDay = new Date(windowStart);
  }

  const slotAllocation: EndToCompleteResult['slotAllocation'] = [];
  let lastDate: Date | null = null;
  let lastEndTime: string | null = null;

  const maxIterations = 365 * 2;
  let iterations = 0;

  while (remainingHours > 0 && iterations < maxIterations) {
    iterations++;
    
    if (currentDay > windowEnd) {
      currentDay = addDays(windowEnd, Math.floor((currentDay.getTime() - windowEnd.getTime()) / (24 * 60 * 60 * 1000)));
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
          date: new Date(currentDay),
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

  return {
    projectId,
    projectName: project.name,
    totalEstimatedHours,
    totalRemainingHours,
    completionPercentage: overallCompletionPercentage,
    plannedEndDate: new Date(projectWindow.endDate),
    effectiveEndDate: lastDate,
    effectiveEndTime: lastEndTime,
    taskBreakdown,
    slotAllocation
  };
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
      if (result) {
        results.set(project.id, result);
      }
    }
  }

  return results;
}
