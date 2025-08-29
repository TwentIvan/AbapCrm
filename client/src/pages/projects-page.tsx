import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Code, Calendar, DollarSign, User, MoreHorizontal, Edit, Target, Grid3X3, List } from "lucide-react";
import { Project } from "@shared/schema";
import ProjectForm from "@/components/forms/project-form";
import ProjectPlanner from "@/components/planning/project-planner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const statusColors = {
  planning: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800", 
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-gray-100 text-gray-800",
  on_hold: "bg-red-100 text-red-800",
};

const statusLabels = {
  planning: "Planning",
  in_progress: "In Progress",
  review: "Review", 
  completed: "Completed",
  on_hold: "On Hold",
};

export default function ProjectsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setShowEditDialog(true);
  };

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setEditingProject(null);
  };

  const handleOpenPlanner = (project: Project) => {
    setSelectedProject(project);
    setShowPlanner(true);
  };

  const handleClosePlanner = () => {
    setShowPlanner(false);
    setSelectedProject(null);
  };

  // Define filter columns for advanced filtering
  const filterColumns = [
    { id: 'name', label: 'Nome', type: 'text' as const },
    { id: 'status', label: 'Status', type: 'select' as const, options: [
      { value: 'planning', label: 'Planning' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'review', label: 'Review' },
      { value: 'completed', label: 'Completed' },
      { value: 'on_hold', label: 'On Hold' },
    ]},
    { id: 'description', label: 'Descrizione', type: 'text' as const },
    { id: 'budget', label: 'Budget', type: 'number' as const },
    { id: 'startDate', label: 'Data Inizio', type: 'date' as const },
    { id: 'endDate', label: 'Data Fine', type: 'date' as const },
  ];

  // Define aggregation columns 
  const aggregationColumns = [
    { id: 'name', type: 'count' as const, label: 'Totale Progetti' },
    { id: 'budget', type: 'sum' as const, label: 'Budget Totale' },
    { id: 'budget', type: 'avg' as const, label: 'Budget Medio' },
  ];

  // Define table columns for list view
  const tableColumns = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }: any) => (
        <div className="font-medium" data-testid={`text-project-name-${row.original.id}`}>
          {row.original.name}
        </div>
      ),
    },
    createBadgeColumn('status', 'Status', {
      planning: 'secondary',
      in_progress: 'default', 
      review: 'outline',
      completed: 'secondary',
      on_hold: 'destructive'
    }),
    createTextColumn('description', 'Description', 50),
    {
      accessorKey: 'budget',
      header: 'Budget',
      cell: ({ row }: any) => {
        const amount = parseFloat(row.getValue('budget') || '0');
        return (
          <div className="font-medium" data-testid={`text-project-budget-${row.original.id}`}>
            €{amount.toLocaleString()}
          </div>
        );
      },
    },
    {
      accessorKey: 'startDate', 
      header: 'Start Date',
      cell: ({ row }: any) => {
        const date = row.getValue('startDate');
        return date ? new Date(date).toLocaleDateString() : '-';
      },
    },
    {
      accessorKey: 'endDate',
      header: 'End Date', 
      cell: ({ row }: any) => {
        const date = row.getValue('endDate');
        return date ? new Date(date).toLocaleDateString() : '-';
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => {
        const project = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-project-menu-${project.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => handleEditProject(project)}
                data-testid={`menu-edit-project-${project.id}`}
              >
                <Edit className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleOpenPlanner(project)}
                data-testid={`menu-planner-project-${project.id}`}
              >
                <Target className="mr-2 h-4 w-4" />
                Planner
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Projects" 
          subtitle="Manage your SAP ABAP projects"
          onNewClick={() => setShowCreateDialog(true)}
        />
        
        <div className="p-6">
          {/* View Toggle */}
          <div className="flex justify-end mb-4">
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                data-testid="button-view-cards"
              >
                <Grid3X3 className="mr-2 h-4 w-4" />
                Cards
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                data-testid="button-view-list"
              >
                <List className="mr-2 h-4 w-4" />
                List
              </Button>
            </div>
          </div>

          {isLoading ? (
            viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )
          ) : projects?.length === 0 ? (
            <div className="text-center py-12">
              <Code className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-4">Create your first SAP ABAP project to get started</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-project">
                Create Project
              </Button>
            </div>
          ) : viewMode === 'list' ? (
            <DataTable
              columns={tableColumns}
              data={projects || []}
              searchPlaceholder="Search projects..."
              onRowClick={handleEditProject}
              enableSelection={true}
              onSelectionChange={setSelectedProjects}
              tableId="projects"
              enableAdvancedFilters={true}
              filterColumns={filterColumns}
              enableAggregation={true}
              aggregationColumns={aggregationColumns}
              enableColumnReordering={true}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects?.map((project) => (
                <Card key={project.id} className="hover:shadow-lg transition-shadow" data-testid={`card-project-${project.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Code className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-project-name-${project.id}`}>
                            {project.name}
                          </CardTitle>
                          <Badge 
                            className={statusColors[project.status]}
                            data-testid={`badge-project-status-${project.id}`}
                          >
                            {statusLabels[project.status]}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleOpenPlanner(project)}
                          data-testid={`button-plan-project-${project.id}`}
                          title="Project Planner"
                        >
                          <Target className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEditProject(project)}
                          data-testid={`button-edit-project-${project.id}`}
                          title="Edit Project"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {project.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-project-description-${project.id}`}>
                        {project.description}
                      </p>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium" data-testid={`text-project-progress-${project.id}`}>
                          {project.progress}%
                        </span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>
                    
                    <div className="flex items-center justify-between pt-2">
                      {project.budget && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <DollarSign className="h-4 w-4" />
                          <span data-testid={`text-project-budget-${project.id}`}>
                            €{parseFloat(project.budget).toLocaleString()}
                          </span>
                        </div>
                      )}
                      
                      {project.endDate && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`text-project-end-date-${project.id}`}>
                            {new Date(project.endDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <ProjectForm onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          {editingProject && (
            <ProjectForm 
              project={editingProject} 
              onSuccess={handleCloseEditDialog} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPlanner} onOpenChange={handleClosePlanner}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project Schedule Planner</DialogTitle>
          </DialogHeader>
          {selectedProject && (
            <ProjectPlanner projectId={selectedProject.id} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
