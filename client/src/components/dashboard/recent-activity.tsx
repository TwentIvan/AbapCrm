import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Plus, Edit, Handshake, Calendar } from "lucide-react";
import { Project, Task, Deal } from "@shared/schema";

interface ActivityItem {
  id: string;
  type: "project" | "task" | "deal";
  action: "created" | "updated" | "completed";
  title: string;
  timestamp: Date;
  icon: typeof Check;
  iconColor: string;
  iconBg: string;
}

export default function RecentActivity() {
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: deals, isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const isLoading = projectsLoading || tasksLoading || dealsLoading;

  // Generate activity items from recent data
  const generateActivityItems = (): ActivityItem[] => {
    const activities: ActivityItem[] = [];

    // Add recent projects
    projects?.slice(0, 2).forEach(project => {
      activities.push({
        id: `project-${project.id}`,
        type: "project",
        action: project.status === "completed" ? "completed" : "created",
        title: `Project "${project.name}" ${project.status === "completed" ? "completed" : "created"}`,
        timestamp: new Date(project.updatedAt),
        icon: project.status === "completed" ? Check : Plus,
        iconColor: project.status === "completed" ? "text-success" : "text-primary",
        iconBg: project.status === "completed" ? "bg-success/10" : "bg-primary/10",
      });
    });

    // Add recent tasks
    tasks?.filter(task => task.status === "completed").slice(0, 2).forEach(task => {
      activities.push({
        id: `task-${task.id}`,
        type: "task",
        action: "completed",
        title: `Task "${task.title}" completed`,
        timestamp: task.completedAt ? new Date(task.completedAt) : new Date(task.updatedAt),
        icon: Check,
        iconColor: "text-success",
        iconBg: "bg-success/10",
      });
    });

    // Add recent deals
    deals?.slice(0, 2).forEach(deal => {
      const action = deal.stage === "won" ? "completed" : "created";
      activities.push({
        id: `deal-${deal.id}`,
        type: "deal",
        action,
        title: `Deal "${deal.title}" ${action === "completed" ? "won" : "added"} - €${parseFloat(deal.value).toLocaleString()}`,
        timestamp: new Date(deal.updatedAt),
        icon: deal.stage === "won" ? Check : Handshake,
        iconColor: deal.stage === "won" ? "text-success" : "text-purple-600",
        iconBg: deal.stage === "won" ? "bg-success/10" : "bg-purple-100",
      });
    });

    // Sort by timestamp (most recent first) and take top 5
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  };

  const activities = generateActivityItems();

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays === 1) {
        return "1 day ago";
      } else if (diffInDays < 7) {
        return `${diffInDays} days ago`;
      } else {
        return timestamp.toLocaleDateString();
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start space-x-4">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-activity">
              No recent activity. Start by creating a project or task!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activity.icon;
              
              return (
                <div 
                  key={activity.id} 
                  className="flex items-start space-x-4"
                  data-testid={`activity-${activity.id}`}
                >
                  <div className={`w-8 h-8 ${activity.iconBg} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-4 w-4 ${activity.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground" data-testid={`text-activity-title-${activity.id}`}>
                      {activity.title}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-activity-timestamp-${activity.id}`}>
                      {formatTimestamp(activity.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
