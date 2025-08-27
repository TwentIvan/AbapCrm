import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertTaskSchema, Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const formSchema = insertTaskSchema.extend({
  dueDate: z.string().optional(),
  projectId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TaskFormProps {
  onSuccess?: () => void;
}

export default function TaskForm({ onSuccess }: TaskFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const activeProjects = projects?.filter(project => project.status !== "completed") || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      projectId: "none",
      dueDate: "",
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log("Mutation starting with data:", data);
      const taskData = {
        ...data,
        userId: user!.id,
        projectId: data.projectId && data.projectId !== "none" ? data.projectId : null,
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
      };
      console.log("Sending task data to API:", taskData);
      const res = await apiRequest("POST", "/api/tasks", taskData);
      return res.json();
    },
    onSuccess: () => {
      console.log("Task created successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      console.error("Task creation failed:", error);
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    console.log("Form submitted with data:", data);
    console.log("Form errors:", form.formState.errors);
    createTaskMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="submit"
            disabled={createTaskMutation.isPending}
            data-testid="button-submit-task"
            onClick={() => console.log("Button clicked!", form.formState.isValid, form.formState.errors)}
          >
            {createTaskMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Task
          </Button>
        </div>
      </form>
    </Form>
  );
}
