import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertTaskSchema, Project, Task } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const formSchema = insertTaskSchema.omit({
  userId: true,
  assignedTo: true,
}).extend({
  dueDate: z.string().optional(),
  projectId: z.string().optional(),
  parentTaskId: z.string().optional(),
  estimatedEffort: z.string().optional(),
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

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const activeProjects = projects?.filter(project => project.status !== "completed") || [];
  const parentTasks = tasks?.filter(t => t.id !== task?.id) || []; // Exclude current task

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: task?.title || "",
      description: task?.description || "",
      status: task?.status || "todo",
      priority: task?.priority || "medium",
      projectId: task?.projectId || "none",
      parentTaskId: task?.parentTaskId || "no-parent",
      dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : "",
      estimatedEffort: task?.estimatedEffort?.toString() || "",
    },
  });

  const saveTaskMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const taskData = {
        ...data,
        userId: user!.id,
        projectId: data.projectId && data.projectId !== "none" ? data.projectId : null,
        parentTaskId: data.parentTaskId && data.parentTaskId !== "no-parent" ? data.parentTaskId : null,
        dueDate: data.dueDate || null,
        estimatedEffort: data.estimatedEffort ? parseInt(data.estimatedEffort) : null,
        completionPercentage: task?.completionPercentage || 0,
        assignedTo: task?.assignedTo || null,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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

        <FormField
          control={form.control}
          name="estimatedEffort"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estimated Effort (Hours)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="number"
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
          name="projectId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {activeProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
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

        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due Date (Optional)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="date"
                  data-testid="input-task-due-date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
