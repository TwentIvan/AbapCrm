import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { TreeView, TreeNode } from "@/components/ui/tree-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { 
  FolderOpen, 
  Folder, 
  CheckSquare, 
  Search,
  ChevronRight,
  BarChart3,
  Target,
  Plus
} from "lucide-react";
import { Project, Task } from "@shared/schema";
import { cn } from "@/lib/utils";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import ProjectFormContainer from "@/components/forms/project-form-container";

const statusColors: Record<string, string> = {
  planning: "bg-blue-500",
  active: "bg-green-500",
  on_hold: "bg-yellow-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
  in_progress: "bg-blue-500"
};

const taskStatusColors = {
  todo: "bg-gray-400",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  completed: "bg-green-500"
};

export default function ProjectHierarchyPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedByDefault, setExpandedByDefault] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  // Calcola metriche aggregate per un progetto
  const calculateProjectMetrics = (projectId: string) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId && !t.parentTaskId);
    const allSubtasks = tasks.filter(t => t.projectId === projectId);
    const completedTasks = allSubtasks.filter(t => t.status === "completed");
    
    return {
      taskCount: projectTasks.length,
      subtaskCount: allSubtasks.length - projectTasks.length,
      completedCount: completedTasks.length,
      totalTasks: allSubtasks.length,
      progress: allSubtasks.length > 0 
        ? Math.round((completedTasks.length / allSubtasks.length) * 100) 
        : 0
    };
  };

  // Costruisci l'albero gerarchico
  const buildTree = (): TreeNode[] => {
    // Filtra progetti root (senza parent)
    const rootProjects = projects.filter(p => !p.parentProjectId);
    
    const buildProjectNode = (project: Project): TreeNode => {
      const metrics = calculateProjectMetrics(project.id);
      const subProjects = projects.filter(p => p.parentProjectId === project.id);
      const rootTasks = tasks.filter(t => t.projectId === project.id && !t.parentTaskId);
      
      const children: TreeNode[] = [];
      
      // Aggiungi sottoprogetti
      subProjects.forEach(sp => {
        children.push(buildProjectNode(sp));
      });
      
      // Aggiungi task root
      rootTasks.forEach(task => {
        children.push(buildTaskNode(task, project));
      });
      
      return {
        id: `project-${project.id}`,
        label: project.name,
        icon: subProjects.length > 0 ? (
          <FolderOpen className="h-4 w-4 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 text-blue-400" />
        ),
        metadata: { type: "project", data: project, metrics },
        children: children.length > 0 ? children : undefined
      };
    };
    
    const buildTaskNode = (task: Task, project: Project): TreeNode => {
      const subTasks = tasks.filter(t => t.parentTaskId === task.id);
      
      return {
        id: `task-${task.id}`,
        label: task.title,
        icon: <CheckSquare className={cn("h-4 w-4", taskStatusColors[task.status])} />,
        metadata: { type: "task", data: task, project },
        children: subTasks.length > 0 ? subTasks.map(st => buildTaskNode(st, project)) : undefined
      };
    };
    
    return rootProjects.map(buildProjectNode);
  };

  // Filtra l'albero in base alla ricerca
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query.trim()) return nodes;
    
    const lowerQuery = query.toLowerCase();
    
    const filterNode = (node: TreeNode): TreeNode | null => {
      const matchesLabel = node.label.toLowerCase().includes(lowerQuery);
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is TreeNode => n !== null) || [];
      
      if (matchesLabel || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : undefined
        };
      }
      
      return null;
    };
    
    return nodes.map(filterNode).filter((n): n is TreeNode => n !== null);
  };

  const treeData = buildTree();
  const filteredTree = filterTree(treeData, searchQuery);

  // Custom renderer per nodi con metriche
  const renderNode = (node: TreeNode, isExpanded: boolean, hasChildren: boolean) => {
    const { metadata } = node;
    
    if (metadata?.type === "project") {
      const project = metadata.data as Project;
      const metrics = metadata.metrics;
      
      return (
        <div className="flex items-center justify-between flex-1 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {node.icon}
            <span className="font-medium truncate">{node.label}</span>
            <Badge 
              variant="outline" 
              className={cn("text-xs", statusColors[project.status], "text-white border-none")}
            >
              {project.status}
            </Badge>
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>{metrics.progress}%</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckSquare className="h-3 w-3" />
              <span>{metrics.completedCount}/{metrics.totalTasks}</span>
            </div>
          </div>
        </div>
      );
    }
    
    if (metadata?.type === "task") {
      const task = metadata.data as Task;
      
      return (
        <div className="flex items-center justify-between flex-1 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {node.icon}
            <span className="text-sm truncate">{node.label}</span>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge 
              variant="outline" 
              className={cn("text-xs", taskStatusColors[task.status], "text-white border-none")}
            >
              {task.status}
            </Badge>
            {task.priority && (
              <Badge variant="outline" className="text-xs">
                {task.priority}
              </Badge>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2">
        {node.icon}
        <span>{node.label}</span>
      </div>
    );
  };

  const isLoading = isLoadingProjects || isLoadingTasks;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Gerarchia Progetti" subtitle="Vista ad albero di progetti e task" />
        
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header con ricerca e controlli */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cerca progetti o task..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-hierarchy"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowProjectForm(true)}
                    data-testid="button-new-project"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nuovo Progetto
                  </Button>
                  <Button
                    variant={expandedByDefault ? "default" : "outline"}
                    size="sm"
                    onClick={() => setExpandedByDefault(!expandedByDefault)}
                    data-testid="button-toggle-expand"
                  >
                    <ChevronRight className={cn("h-4 w-4 mr-2", expandedByDefault && "rotate-90")} />
                    {expandedByDefault ? "Comprimi Tutto" : "Espandi Tutto"}
                  </Button>
                </div>
              </div>
              
              {/* Statistiche generali */}
              <div className="mt-4 pt-4 border-t flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Progetti totali:</span>
                  <span className="font-medium">{projects.length}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Task totali:</span>
                  <span className="font-medium">{tasks.length}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Progetti root:</span>
                  <span className="font-medium">
                    {projects.filter(p => !p.parentProjectId).length}
                  </span>
                </div>
              </div>
            </Card>

            {/* Tree View */}
            <Card className="p-4">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Caricamento gerarchia...
                </div>
              ) : filteredTree.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? "Nessun risultato trovato" : "Nessun progetto disponibile"}
                </div>
              ) : (
                <TreeView
                  nodes={filteredTree}
                  defaultExpanded={expandedByDefault}
                  renderNode={renderNode}
                />
              )}
            </Card>
          </div>
        </main>
      </div>

      {/* Form per creare nuovo progetto */}
      <ProjectFormContainer
        open={showProjectForm}
        onOpenChange={setShowProjectForm}
        onSuccess={() => {
          setShowProjectForm(false);
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        }}
      />
    </div>
  );
}
