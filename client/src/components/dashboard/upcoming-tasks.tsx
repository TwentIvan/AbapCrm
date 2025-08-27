import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare } from "lucide-react";
import { Task } from "@shared/schema";
import { Link } from "wouter";

const priorityColors = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

export default function UpcomingTasks() {
  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const upcomingTasks = tasks?.filter(task => task.status !== "completed")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 5) || [];

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return "No due date";
    
    const date = new Date(dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Due: Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Due: Tomorrow";
    } else {
      return `Due: ${date.toLocaleDateString()}`;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Upcoming Tasks</CardTitle>
          <Link href="/tasks">
            <Button variant="ghost" size="sm" data-testid="button-view-all-tasks">
              View All
            </Button>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start space-x-3">
                <Skeleton className="h-4 w-4 mt-1" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : upcomingTasks.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-tasks">
              No pending tasks. You're all caught up!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingTasks.map((task) => (
              <div 
                key={task.id} 
                className="flex items-start space-x-3"
                data-testid={`card-upcoming-task-${task.id}`}
              >
                <Checkbox className="mt-1" disabled />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground" data-testid={`text-task-title-${task.id}`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid={`text-task-project-${task.id}`}>
                    {task.projectId ? "Project task" : "Personal task"}
                  </p>
                  <p 
                    className={`text-xs ${
                      isOverdue(task.dueDate) 
                        ? "text-red-600 font-medium" 
                        : "text-muted-foreground"
                    }`}
                    data-testid={`text-task-due-date-${task.id}`}
                  >
                    {formatDueDate(task.dueDate)}
                    {isOverdue(task.dueDate) && " (Overdue)"}
                  </p>
                </div>
                <Badge 
                  className={priorityColors[task.priority]}
                  data-testid={`badge-task-priority-${task.id}`}
                >
                  {task.priority}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
