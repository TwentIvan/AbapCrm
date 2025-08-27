import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckSquare, Calendar, AlertCircle, Clock } from "lucide-react";
import { Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import TaskForm from "@/components/forms/task-form";
import { useToast } from "@/hooks/use-toast";

const statusColors = {
  todo: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
};

const priorityColors = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800", 
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const statusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
};

export default function TasksPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const res = await apiRequest("PUT", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const toggleTaskComplete = (task: Task) => {
    const newStatus = task.status === "completed" ? "todo" : "completed";
    updateTaskMutation.mutate({ 
      id: task.id, 
      data: { status: newStatus }
    });
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Tasks" 
          subtitle="Manage your project tasks and deliverables"
          onNewClick={() => setShowCreateDialog(true)}
        />
        
        <div className="p-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : tasks?.length === 0 ? (
            <div className="text-center py-12">
              <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No tasks yet</h3>
              <p className="text-muted-foreground mb-4">Create your first task to start organizing your work</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-task">
                Create Task
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks?.map((task) => (
                <Card 
                  key={task.id} 
                  className={`transition-all hover:shadow-md ${
                    task.status === "completed" ? "opacity-75" : ""
                  }`}
                  data-testid={`card-task-${task.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => toggleTaskComplete(task)}
                        className="mt-1"
                        data-testid={`checkbox-task-${task.id}`}
                      />
                      
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between">
                          <h3 
                            className={`font-medium ${
                              task.status === "completed" 
                                ? "line-through text-muted-foreground" 
                                : "text-foreground"
                            }`}
                            data-testid={`text-task-title-${task.id}`}
                          >
                            {task.title}
                          </h3>
                          
                          <div className="flex items-center space-x-2">
                            <Badge 
                              className={priorityColors[task.priority]}
                              data-testid={`badge-task-priority-${task.id}`}
                            >
                              {task.priority}
                            </Badge>
                            <Badge 
                              className={statusColors[task.status]}
                              data-testid={`badge-task-status-${task.id}`}
                            >
                              {statusLabels[task.status]}
                            </Badge>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p 
                            className={`text-sm ${
                              task.status === "completed" 
                                ? "text-muted-foreground" 
                                : "text-muted-foreground"
                            }`}
                            data-testid={`text-task-description-${task.id}`}
                          >
                            {task.description}
                          </p>
                        )}
                        
                        {task.dueDate && (
                          <div className="flex items-center space-x-1">
                            {isOverdue(task.dueDate) && task.status !== "completed" ? (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span 
                              className={`text-xs ${
                                isOverdue(task.dueDate) && task.status !== "completed"
                                  ? "text-red-600 font-medium"
                                  : "text-muted-foreground"
                              }`}
                              data-testid={`text-task-due-date-${task.id}`}
                            >
                              Due: {new Date(task.dueDate).toLocaleDateString()}
                              {isOverdue(task.dueDate) && task.status !== "completed" && " (Overdue)"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          <TaskForm onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
