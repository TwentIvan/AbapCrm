import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertProjectSchema, Partner } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const formSchema = insertProjectSchema.extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ProjectFormProps {
  onSuccess?: () => void;
}

export default function ProjectForm({ onSuccess }: ProjectFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
  });

  const clients = partners?.filter(partner => partner.type === "client") || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "planning",
      clientId: "",
      startDate: "",
      endDate: "",
      budget: "",
      progress: 0,
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const projectData = {
        ...data,
        userId: user!.id,
        clientId: data.clientId || null,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
        budget: data.budget || null,
      };
      const res = await apiRequest("POST", "/api/projects", projectData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createProjectMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-project-name" placeholder="Enter project name" />
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  data-testid="input-project-description"
                  placeholder="Describe the project..."
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
                    <SelectTrigger data-testid="select-project-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client (Optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-project-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">No client</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="date"
                    data-testid="input-project-start-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="date"
                    data-testid="input-project-end-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="budget"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Budget (Optional)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="number"
                  step="0.01"
                  data-testid="input-project-budget"
                  placeholder="0.00"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="submit"
            disabled={createProjectMutation.isPending}
            data-testid="button-submit-project"
          >
            {createProjectMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Project
          </Button>
        </div>
      </form>
    </Form>
  );
}
