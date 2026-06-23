import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, CheckSquare, DollarSign, TrendingUp } from "lucide-react";
import { Project, Task, Deal } from "@shared/schema";

export default function StatsCards() {
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

  const activeProjects = projects?.filter(p => p.status !== "completed").length || 0;
  const pendingTasks = tasks?.filter(t => t.status !== "completed").length || 0;
  const openDealsValue = deals?.filter(d => !["won", "lost"].includes(d.stage))
    .reduce((sum, deal) => sum + parseFloat(deal.value), 0) || 0;
  const monthlyRevenue = deals?.filter(d => {
    if (d.stage !== "won" || !d.actualCloseDate) return false;
    const closeDate = new Date(d.actualCloseDate);
    const thisMonth = new Date();
    return closeDate.getMonth() === thisMonth.getMonth() && 
           closeDate.getFullYear() === thisMonth.getFullYear();
  }).reduce((sum, deal) => sum + parseFloat(deal.value), 0) || 0;

  const stats = [
    {
      title: "Active Projects",
      value: activeProjects,
      icon: FolderOpen,
      color: "text-primary",
      bgColor: "bg-primary/10",
      testId: "stat-active-projects",
    },
    {
      title: "Pending Tasks", 
      value: pendingTasks,
      icon: CheckSquare,
      color: "text-warning",
      bgColor: "bg-warning/10",
      testId: "stat-pending-tasks",
    },
    {
      title: "Open Deals",
      value: `€${openDealsValue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-success", 
      bgColor: "bg-success/10",
      testId: "stat-open-deals",
    },
    {
      title: "This Month",
      value: `€${monthlyRevenue.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      testId: "stat-monthly-revenue",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        
        return (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16 mt-2" />
                  ) : (
                    <p 
                      className="text-3xl font-bold text-foreground"
                      data-testid={stat.testId}
                    >
                      {stat.value}
                    </p>
                  )}
                </div>
                <div className={`w-12 h-12 ${stat.bgColor} rounded-full flex items-center justify-center`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
