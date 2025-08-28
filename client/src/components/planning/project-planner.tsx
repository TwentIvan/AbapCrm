import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Clock, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  PlayCircle,
  Calculator
} from "lucide-react";
import { Project, Task, insertTaskSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, differenceInDays, parseISO, isAfter, isBefore } from "date-fns";
import { z } from "zod";

interface TaskWithSchedule extends Task {
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
  workingDays?: number;
  isOverdue?: boolean;
  canStart?: boolean;
}

interface ProjectPlannerProps {
  projectId: string;
}

// Planning algorithm configuration
const WORKING_HOURS_PER_DAY = 8;
const BUFFER_FACTOR = 1.2; // 20% buffer for estimates

export default function ProjectPlanner({ projectId }: ProjectPlannerProps) {
  const [workingHoursPerDay, setWorkingHoursPerDay] = useState(WORKING_HOURS_PER_DAY);
  const [autoSchedule, setAutoSchedule] = useState(true);
  const { toast } = useToast();

  // Fetch project data
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
  });

  // Fetch project tasks
  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", "project", projectId],
  });

  // Calculate project schedule
  const calculateSchedule = (projectData: Project, taskList: Task[]): TaskWithSchedule[] => {
    if (!projectData.startDate || !projectData.endDate || !taskList.length) {
      return taskList;
    }

    const projectStart = new Date(projectData.startDate);
    const projectEnd = new Date(projectData.endDate);
    const totalProjectDays = differenceInDays(projectEnd, projectStart);
    
    // Sort tasks by priority (urgent > high > medium > low) then by estimated effort
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    const sortedTasks = [...taskList].sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return (b.estimatedEffort || 0) - (a.estimatedEffort || 0);
    });

    let currentDate = new Date(projectStart);
    const scheduledTasks: TaskWithSchedule[] = [];

    for (const task of sortedTasks) {
      const estimatedHours = task.remainingEffort || task.estimatedEffort || 4;
      const bufferedHours = Math.ceil(estimatedHours * BUFFER_FACTOR);
      const workingDays = Math.ceil(bufferedHours / workingHoursPerDay);
      
      const scheduledStartDate = new Date(currentDate);
      const scheduledEndDate = addDays(currentDate, Math.max(1, workingDays));
      
      // Check if task fits within project timeline
      const isOverdue = isAfter(scheduledEndDate, projectEnd);
      const canStart = !isBefore(scheduledStartDate, projectStart);

      scheduledTasks.push({
        ...task,
        scheduledStartDate,
        scheduledEndDate,
        workingDays,
        isOverdue,
        canStart,
      });

      // Move current date forward for next task
      currentDate = addDays(scheduledEndDate, 1);
    }

    return scheduledTasks;
  };

  // Auto-schedule tasks when data changes
  const scheduledTasks = project && tasks ? calculateSchedule(project, tasks) : [];

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (data: { taskId: string; updates: Partial<Task> }) => {
      const response = await apiRequest("PUT", `/api/tasks/${data.taskId}`, data.updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task updated",
        description: "Task schedule has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Apply schedule to all tasks
  const applyScheduleToTasks = useCallback(() => {
    scheduledTasks.forEach((task) => {
      if (task.scheduledStartDate && task.scheduledEndDate && autoSchedule) {
        updateTaskMutation.mutate({
          taskId: task.id,
          updates: {
            dueDate: task.scheduledEndDate ? task.scheduledEndDate.toISOString() : null,
          },
        });
      }
    });
  }, [scheduledTasks, autoSchedule, updateTaskMutation]);

  // Recalculate schedule when working hours change
  useEffect(() => {
    if (autoSchedule && scheduledTasks.length > 0) {
      // Auto-apply schedule changes
      const timer = setTimeout(() => {
        applyScheduleToTasks();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [workingHoursPerDay, autoSchedule]); // Removed applyScheduleToTasks to prevent loops

  if (projectLoading || tasksLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Project not found</p>
        </CardContent>
      </Card>
    );
  }

  const totalEstimatedHours = scheduledTasks.reduce((sum, task) => sum + (task.estimatedEffort || 0), 0);
  const totalRemainingHours = scheduledTasks.reduce((sum, task) => sum + (task.remainingEffort || task.estimatedEffort || 0), 0);
  const projectDays = project.startDate && project.endDate ? 
    differenceInDays(new Date(project.endDate), new Date(project.startDate)) : 0;
  const requiredWorkingDays = Math.ceil(totalRemainingHours / workingHoursPerDay);
  const overdueTasksCount = scheduledTasks.filter(task => task.isOverdue).length;

  return (
    <div className="space-y-6">
      {/* Project Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Project Schedule Planning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Project Timeline</Label>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                {project.startDate && project.endDate ? (
                  <span>
                    {format(new Date(project.startDate), 'MMM dd')} - {format(new Date(project.endDate), 'MMM dd')}
                    <span className="text-muted-foreground ml-1">({projectDays} days)</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Work Capacity</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <Input 
                  type="number" 
                  value={workingHoursPerDay}
                  onChange={(e) => setWorkingHoursPerDay(Number(e.target.value))}
                  className="w-20 h-8"
                  min="1" 
                  max="12"
                />
                <span className="text-sm text-muted-foreground">hours/day</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Schedule Status</Label>
              <div className="flex items-center gap-2">
                {overdueTasksCount > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600">
                      {overdueTasksCount} tasks overdue
                    </span>
                  </>
                ) : requiredWorkingDays <= projectDays ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">On schedule</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-yellow-600">Tight schedule</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Schedule Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-2xl font-bold">{totalEstimatedHours}h</div>
              <div className="text-xs text-muted-foreground">Total Estimated</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{totalRemainingHours}h</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{requiredWorkingDays}</div>
              <div className="text-xs text-muted-foreground">Working Days Needed</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{projectDays}</div>
              <div className="text-xs text-muted-foreground">Available Days</div>
            </div>
          </div>

          {/* Auto-schedule controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSchedule}
                  onChange={(e) => setAutoSchedule(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Auto-schedule tasks</span>
              </label>
            </div>
            
            <Button 
              onClick={applyScheduleToTasks}
              disabled={updateTaskMutation.isPending || !scheduledTasks.length}
              data-testid="button-apply-schedule"
            >
              {updateTaskMutation.isPending ? "Applying..." : "Apply Schedule"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Task Schedule ({scheduledTasks.length} tasks)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scheduledTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tasks found for this project
              </div>
            ) : (
              scheduledTasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`p-4 border rounded-lg transition-colors ${
                    task.isOverdue ? 'border-red-200 bg-red-50' : 
                    !task.canStart ? 'border-gray-200 bg-gray-50' :
                    'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{task.title}</h4>
                        <Badge variant={
                          task.priority === 'urgent' ? 'destructive' :
                          task.priority === 'high' ? 'default' :
                          task.priority === 'medium' ? 'secondary' :
                          'outline'
                        }>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline">
                          {task.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Scheduled: </span>
                          {task.scheduledStartDate && task.scheduledEndDate ? (
                            <span className={task.isOverdue ? 'text-red-600' : 'text-foreground'}>
                              {format(task.scheduledStartDate, 'MMM dd')} - {format(task.scheduledEndDate, 'MMM dd')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Not scheduled</span>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Effort: </span>
                          <span>{task.remainingEffort || task.estimatedEffort || 0}h remaining</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration: </span>
                          <span>{task.workingDays || 1} working days</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Progress: </span>
                          <span>{task.completionPercentage}%</span>
                        </div>
                      </div>
                      
                      {task.completionPercentage > 0 && (
                        <div className="mt-2">
                          <Progress value={task.completionPercentage} className="h-2" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {task.isOverdue && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      {task.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {task.status === 'in_progress' && (
                        <PlayCircle className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}