import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { CompletionDialog } from "./completion-dialog";
import type { Task, TimeEntry } from "@shared/schema";

interface TaskTimerButtonsProps {
  task: Task;
}

export function TaskTimerButtons({ task }: TaskTimerButtonsProps) {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  
  const { data: runningEntry } = useQuery<any>({
    queryKey: ["/api/time-entries/running"],
    queryFn: async () => {
      const res = await fetch("/api/time-entries/running", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch running entry');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries/task", task.id],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries/task/${task.id}`, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch time entries');
      return res.json();
    },
  });

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
      queryClient.refetchQueries({ queryKey: ["/api/time-entries/running"] });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async ({ entryId, completionData }: { entryId: string; completionData?: { completionPercentage: number; notes?: string } }) => {
      const res = await apiRequest("POST", `/api/time-entries/${entryId}/stop`);
      
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

  const handleStart = (e?: any) => {
    e?.stopPropagation();
    startTimerMutation.mutate();
  };

  const handleStop = (e?: any) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (runningEntry) {
      setShowCompletionDialog(true);
    }
  };

  const getElapsedTime = () => {
    if (!isCurrentTaskRunning || !runningEntry) return "";
    
    const previousTotal = timeEntries.reduce((total, entry) => {
      return total + (entry.duration || 0);
    }, 0);
    
    const startTime = new Date(runningEntry.startTime);
    const currentSessionMinutes = (currentTime.getTime() - startTime.getTime()) / (1000 * 60);
    
    const totalMinutes = previousTotal + currentSessionMinutes;
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = Math.floor(totalMinutes % 60);
    
    if (totalHours > 0) {
      return `${totalHours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
  };

  const calculateSuggestedPercentage = () => {
    if (!runningEntry) return task.completionPercentage || 0;

    const sessionStartTime = new Date(runningEntry.startTime);
    const sessionDuration = (currentTime.getTime() - sessionStartTime.getTime()) / (1000 * 60);
    const currentCompletion = task.completionPercentage || 0;
    
    let suggestedIncrease = 0;
    
    if (sessionDuration >= 15) {
      suggestedIncrease = Math.max(5, Math.min(15, sessionDuration / 4));
    } else if (sessionDuration >= 5) {
      suggestedIncrease = Math.max(2, sessionDuration / 2);
    } else {
      suggestedIncrease = 1;
    }
    
    return Math.min(100, Math.round(currentCompletion + suggestedIncrease));
  };

  const handleCompletionSubmit = (completionData: { completionPercentage: number; notes?: string }) => {
    if (runningEntry) {
      stopTimerMutation.mutate({ entryId: runningEntry.id, completionData });
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getTotalTime = () => {
    const total = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    return formatDuration(total);
  };

  return (
    <>
      <div className="flex items-center">
        {isCurrentTaskRunning ? (
          <div className="flex items-center gap-2 animate-pulse">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStop}
              disabled={stopTimerMutation.isPending}
              data-testid={`button-stop-timer-${task.id}`}
              data-timer-button="true"
            >
              <Square className="h-3 w-3 mr-1 fill-current" />
              Stop
            </Button>
            <span className="text-xs font-mono bg-success/10 text-success px-2 py-0.5 rounded">
              {getElapsedTime()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white border-0"
              onClick={handleStart}
              disabled={startTimerMutation.isPending || hasRunningTimer}
              data-testid={`button-start-timer-${task.id}`}
              data-timer-button="true"
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
            {timeEntries.length > 0 && (
              <span className="text-xs text-muted-foreground font-medium">
                {getTotalTime()}
              </span>
            )}
          </div>
        )}
      </div>
      
      {showCompletionDialog && (
        <CompletionDialog
          isOpen={showCompletionDialog}
          onClose={() => setShowCompletionDialog(false)}
          currentPercentage={calculateSuggestedPercentage()}
          onSubmit={handleCompletionSubmit}
          isLoading={stopTimerMutation.isPending}
        />
      )}
    </>
  );
}
