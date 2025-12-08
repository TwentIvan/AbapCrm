import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { insertTaskSchema, Project, Task, SapSystem, ProjectMilestone } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const formSchema = insertTaskSchema.omit({
  userId: true,
}).extend({
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  parentTaskId: z.string().optional(),
  estimatedEffort: z.string().optional(),
  completionPercentage: z.string().optional(),
  sapSystemId: z.string().optional(),
  assignedTo: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TaskFormProps {
  task?: Task;
  onSuccess?: () => void;
}

export default function TaskForm({ task, onSuccess }: TaskFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects, isLoading: projectsLoading, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user, // Only fetch when user is authenticated
    retry: 3,
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user, // Only fetch when user is authenticated
  });

  const { data: sapSystems } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user, // Only fetch when user is authenticated
  });

  const { data: milestones } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/project-milestones"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user, // Only fetch when user is authenticated
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  const activeProjects = projects?.filter(project => project.status !== "completed") || [];
  
  const parentTasks = tasks?.filter(t => t.id !== task?.id) || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: task?.title || "",
      description: task?.description || "",
      status: task?.status || "todo",
      priority: task?.priority || "medium",
      projectId: task?.projectId || "none",
      milestoneId: task?.milestoneId || "none",
      parentTaskId: task?.parentTaskId || "no-parent",
      startDate: task?.startDate ? new Date(task.startDate).toISOString().slice(0, 16) : "",
      dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : "",
      estimatedEffort: task?.estimatedEffort?.toString() || "",
      completionPercentage: task?.completionPercentage?.toString() || "0",
      sapSystemId: task?.sapSystemId || "none",
      assignedTo: task?.assignedTo || "none",
    },
  });

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title || "",
        description: task.description || "",
        status: task.status || "todo",
        priority: task.priority || "medium",
        projectId: task.projectId || "none",
        milestoneId: task.milestoneId || "none",
        parentTaskId: task.parentTaskId || "no-parent",
        startDate: task.startDate ? new Date(task.startDate).toISOString().slice(0, 16) : "",
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : "",
        estimatedEffort: task.estimatedEffort?.toString() || "",
        completionPercentage: task.completionPercentage?.toString() || "0",
        sapSystemId: task.sapSystemId || "none",
        assignedTo: task.assignedTo || "none",
      });
    }
  }, [task, form]);

  // Watch projectId to filter SAP systems by partner
  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects?.find(p => p.id === selectedProjectId);
  
  // Filter SAP systems by the partner associated with the selected project
  const filteredSapSystems = sapSystems?.filter(sys => {
    if (!selectedProject?.clientId) return true; // Show all if no project selected
    return sys.partnerId === selectedProject.clientId;
  }) || [];

  const saveTaskMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const taskData = {
        ...data,
        userId: user!.id,
        projectId: data.projectId && !["none", "loading", "error", "no-projects"].includes(data.projectId) ? data.projectId : null,
        milestoneId: data.milestoneId && data.milestoneId !== "none" ? data.milestoneId : null,
        parentTaskId: data.parentTaskId && data.parentTaskId !== "no-parent" ? data.parentTaskId : null,
        sapSystemId: data.sapSystemId && data.sapSystemId !== "none" ? data.sapSystemId : null,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        estimatedEffort: data.estimatedEffort ? parseFloat(data.estimatedEffort) : null,
        completionPercentage: data.completionPercentage ? Math.min(100, Math.max(0, Math.round(parseFloat(data.completionPercentage)))) : 0,
        assignedTo: data.assignedTo && data.assignedTo !== "none" ? data.assignedTo : null,
      };
      
      if (task) {
        // Edit existing task
        const res = await apiRequest("PUT", `/api/tasks/${task.id}`, taskData);
        return res.json();
      } else {
        // Create new task
        const res = await apiRequest("POST", "/api/tasks", taskData);
        return res.json();
      }
    },
    onSuccess: (updatedTask: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id] });
      }
      // Invalidate project-related queries to refresh ETC calculations after task update
      queryClient.invalidateQueries({ queryKey: ["/api/projects/batch-end-to-complete"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      // Invalidate specific project ETC if task has a project
      const projectId = updatedTask?.projectId || task?.projectId;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "end-to-complete"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }
      toast({ title: task ? "Task updated successfully" : "Task created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: task ? "Failed to update task" : "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    saveTaskMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex justify-end space-x-2 pb-4 border-b">
          <Button
            type="submit"
            disabled={saveTaskMutation.isPending}
            data-testid="button-submit-task"
          >
            {saveTaskMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {task ? "Update Task" : "Create Task"}
          </Button>
        </div>
        
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Title</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-task-title" placeholder="Enter task title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="estimatedEffort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ore Stimate</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number"
                    min="0"
                    step="0.5"
                    data-testid="input-task-effort"
                    placeholder="0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="completionPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Completamento %</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    data-testid="input-task-completion"
                    placeholder="0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  value={field.value || ""}
                  data-testid="input-task-description"
                  placeholder="Describe the task..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-task-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-task-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="assignedTo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Owner (Assegnato a)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-owner">
                    <SelectValue placeholder="Seleziona owner" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Non assegnato</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-project">
                    <SelectValue placeholder={
                      projectsLoading ? "Loading projects..." : 
                      projectsError ? "Error loading projects" :
                      "Select project"
                    } />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projectsLoading ? (
                    <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                  ) : projectsError ? (
                    <SelectItem value="error" disabled>Error loading projects</SelectItem>
                  ) : activeProjects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>No active projects found</SelectItem>
                  ) : (
                    activeProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="milestoneId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Milestone (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-milestone">
                    <SelectValue placeholder="Select milestone" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Nessuna milestone</SelectItem>
                  {milestones?.map((milestone) => (
                    <SelectItem key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sapSystemId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SAP System (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-sap-system">
                    <SelectValue placeholder="Select SAP system" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No SAP system</SelectItem>
                  {filteredSapSystems.length === 0 && selectedProject?.clientId && (
                    <SelectItem value="no-systems" disabled>Nessun sistema SAP per questo partner</SelectItem>
                  )}
                  {filteredSapSystems.map((sapSystem) => (
                    <SelectItem key={sapSystem.id} value={sapSystem.id}>
                      {sapSystem.name} - {sapSystem.serverHost}:{sapSystem.applicationServerPort}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="parentTaskId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parent Task (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "no-parent"}>
                <FormControl>
                  <SelectTrigger data-testid="select-parent-task">
                    <SelectValue placeholder="Select parent task" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="no-parent">No parent task</SelectItem>
                  {parentTasks.map((parentTask) => (
                    <SelectItem key={parentTask.id} value={parentTask.id}>
                      {parentTask.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Inizio (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="datetime-local"
                    data-testid="input-task-start-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Fine (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="datetime-local"
                    data-testid="input-task-due-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}
