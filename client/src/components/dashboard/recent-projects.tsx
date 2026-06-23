import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Code, Database, ServerCog } from "lucide-react";
import { Project } from "@shared/schema";
import { Link } from "wouter";

const statusColors = {
  planning: "bg-primary/10 text-primary",
  in_progress: "bg-success/10 text-success", 
  review: "bg-warning/10 text-warning",
  completed: "bg-muted text-foreground",
  on_hold: "bg-destructive/10 text-destructive",
};

const statusLabels = {
  planning: "Planning",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed", 
  on_hold: "On Hold",
};

const projectIcons = [Code, Database, ServerCog];

export default function RecentProjects() {
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const recentProjects = projects?.slice(0, 3) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Projects</CardTitle>
          <Link href="/projects">
            <Button variant="ghost" size="sm" data-testid="button-view-all-projects">
              View All
            </Button>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div>
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="text-right">
                  <Skeleton className="h-6 w-20 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="text-center py-8">
            <Code className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-projects">
              No projects yet. Create your first project to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentProjects.map((project, index) => {
              const Icon = projectIcons[index % projectIcons.length];
              
              return (
                <div 
                  key={project.id} 
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                  data-testid={`card-recent-project-${project.id}`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground" data-testid={`text-project-name-${project.id}`}>
                        {project.name}
                      </h4>
                      <p className="text-sm text-muted-foreground" data-testid={`text-project-description-${project.id}`}>
                        {project.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge 
                      className={statusColors[project.status]}
                      data-testid={`badge-project-status-${project.id}`}
                    >
                      {statusLabels[project.status]}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1" data-testid={`text-project-progress-${project.id}`}>
                      {project.progress}% Complete
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
