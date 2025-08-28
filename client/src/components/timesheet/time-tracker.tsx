import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Play, Square, Clock, Trash2, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow, format } from "date-fns";
import { CompletionDialog } from "./completion-dialog";
import type { TimeEntry, Task } from "@shared/schema";

interface TimeTrackerProps {
  task: Task;
}

export function TimeTracker({ task }: TimeTrackerProps) {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  // Get running time entry globally to prevent multiple running timers
  const { data: runningEntry } = useQuery<TimeEntry | null>({
    queryKey: ["/api/time-entries/running"],
  });

  // Get time entries for this specific task
  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries/task", task.id],
  });

  // Create time entry mutation
  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const requestData = {
        taskId: task.id,
        startTime: new Date().toISOString(),
        isRunning: true,
      };
      const res = await apiRequest("POST", "/api/time-entries", requestData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/task", task.id] });
    },
  });

  // Stop time entry mutation
  const stopTimerMutation = useMutation({
    mutationFn: async ({ entryId, completionData }: { entryId: string; completionData?: { completionPercentage: number; notes?: string } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${entryId}/stop`);
      
      // Update task completion percentage if provided
      if (completionData) {
        await apiRequest("PUT", `/api/tasks/${task.id}`, {
          completionPercentage: completionData.completionPercentage,
        });
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/task", task.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCompletionDialog(false);
    },
  });

  // Delete time entry mutation
  const deleteTimerMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("DELETE", `/api/time-entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/running"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/task", task.id] });
    },
  });

  // Update current time every second when timer is running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (runningEntry && runningEntry.taskId === task.id) {
      interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runningEntry, task.id]);

  const isCurrentTaskRunning = runningEntry && runningEntry.taskId === task.id;
  const hasRunningTimer = !!runningEntry;

  const handleStartTimer = () => {
    startTimerMutation.mutate();
  };

  const handleStopTimer = () => {
    if (runningEntry) {
      setShowCompletionDialog(true);
    }
  };

  const handleCompletionSubmit = (completionData: { completionPercentage: number; notes?: string }) => {
    if (runningEntry) {
      stopTimerMutation.mutate({ entryId: runningEntry.id, completionData });
    }
  };

  const handleDeleteEntry = (entryId: string) => {
    deleteTimerMutation.mutate(entryId);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const getCurrentRunningTime = () => {
    if (!isCurrentTaskRunning || !runningEntry) return "0h 0m";
    const elapsed = (currentTime.getTime() - new Date(runningEntry.startTime).getTime()) / 1000 / 60;
    return formatDuration(elapsed);
  };

  const totalTime = timeEntries.reduce((total, entry) => {
    return total + (entry.duration || 0);
  }, 0);

  const totalHours = totalTime / 60;
  const estimatedHours = task.estimatedEffort || 0;
  const remainingHours = Math.max(0, estimatedHours - totalHours);
  const calculatedRemainingMinutes = task.remainingEffort || 0; // Auto-calculated by server (in minutes)
  const calculatedRemainingHours = calculatedRemainingMinutes / 60; // Convert to hours for display
  const progressPercentage = task.completionPercentage || 0;
  
  const calculateRemainingTime = () => {
    if (!estimatedHours || progressPercentage === 0) return null;
    
    const expectedHours = (estimatedHours * progressPercentage) / 100;
    const efficiency = totalHours > 0 ? expectedHours / totalHours : 1;
    const projectedTotalHours = estimatedHours / efficiency;
    const projectedRemaining = Math.max(0, projectedTotalHours - totalHours);
    
    return {
      original: remainingHours,
      projected: projectedRemaining,
      efficiency: efficiency,
    };
  };

  const remainingTimeData = calculateRemainingTime();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Time Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timer Controls */}
        <div className="flex items-center gap-2">
          {isCurrentTaskRunning ? (
            <>
              <Button 
                onClick={handleStopTimer}
                disabled={stopTimerMutation.isPending}
                variant="destructive"
                data-testid="button-stop-timer"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Timer
              </Button>
              <Badge variant="secondary" className="animate-pulse">
                <Clock className="h-3 w-3 mr-1" />
                {getCurrentRunningTime()}
              </Badge>
            </>
          ) : (
            <Button 
              onClick={handleStartTimer}
              disabled={startTimerMutation.isPending || hasRunningTimer}
              data-testid="button-start-timer"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Timer
            </Button>
          )}
          
          {hasRunningTimer && !isCurrentTaskRunning && (
            <Badge variant="outline">
              Timer running on another task
            </Badge>
          )}
        </div>

        {/* Progress and Time Summary */}
        <div className="space-y-3">
          {totalTime > 0 && (
            <div className="bg-muted p-3 rounded-lg">
              <div className="text-sm text-muted-foreground">Total Time Logged</div>
              <div className="text-lg font-semibold" data-testid="text-total-time">
                {formatDuration(totalTime)}
              </div>
            </div>
          )}

          {progressPercentage > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
              <div className="text-sm text-muted-foreground mb-2">Task Progress</div>
              <div className="space-y-2">
                <Progress value={progressPercentage} className="h-2" />
                <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                  {progressPercentage}% Complete
                </div>
              </div>
            </div>
          )}

          {estimatedHours > 0 && (
            <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <div className="text-sm text-muted-foreground">Effort Tracking</div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Estimated:</span>
                  <span className="font-medium">{formatDuration(estimatedHours * 60)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Logged:</span>
                  <span className="font-medium">{formatDuration(totalTime)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Original Remaining:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {formatDuration(remainingHours * 60)}
                  </span>
                </div>
                
                {calculatedRemainingHours > 0 && progressPercentage > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Calculated Remaining:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {formatDuration(calculatedRemainingHours * 60)}
                    </span>
                  </div>
                )}
                
                {remainingTimeData && (
                  <div className="pt-2 border-t border-green-200 dark:border-green-800">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Projected Remaining:</span>
                      <span className={`font-medium ${
                        remainingTimeData.projected > remainingTimeData.original 
                          ? 'text-amber-600 dark:text-amber-400' 
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {formatDuration(remainingTimeData.projected * 60)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Efficiency:</span>
                      <span className={`font-medium ${
                        remainingTimeData.efficiency < 1 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {(remainingTimeData.efficiency * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Time Entries List */}
        {timeEntries.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Time Entries</h4>
              {timeEntries.map((entry) => (
                <div 
                  key={entry.id} 
                  className="flex items-center justify-between p-2 border rounded"
                  data-testid={`time-entry-${entry.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm">
                        {format(new Date(entry.startTime), "MMM d, HH:mm")}
                        {entry.endTime && (
                          <span> - {format(new Date(entry.endTime), "HH:mm")}</span>
                        )}
                      </div>
                      {entry.isRunning && (
                        <Badge variant="secondary" className="text-xs">
                          Running
                        </Badge>
                      )}
                    </div>
                    {entry.duration && (
                      <div className="text-xs text-muted-foreground">
                        {formatDuration(entry.duration)}
                      </div>
                    )}
                    {entry.description && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {entry.description}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteEntry(entry.id)}
                    disabled={deleteTimerMutation.isPending || entry.isRunning}
                    data-testid={`button-delete-entry-${entry.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {timeEntries.length === 0 && (
          <div className="text-center text-muted-foreground py-4">
            No time entries yet. Start tracking time on this task!
          </div>
        )}

        {/* Completion Dialog */}
        <CompletionDialog
          isOpen={showCompletionDialog}
          onClose={() => setShowCompletionDialog(false)}
          onSubmit={handleCompletionSubmit}
          isLoading={stopTimerMutation.isPending}
          currentPercentage={progressPercentage}
        />
      </CardContent>
    </Card>
  );
}