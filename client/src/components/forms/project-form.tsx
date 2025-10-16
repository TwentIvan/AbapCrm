import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertProjectSchema, Partner, Project, SapSystem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["planning", "in_progress", "review", "completed", "on_hold"]),
  clientId: z.string().optional(),
  parentProjectId: z.string().optional(),
  sapSystemId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
  estimatedEffort: z.string().optional(),
  progress: z.number().min(0).max(100),
});

type FormData = z.infer<typeof formSchema>;

interface ProjectFormProps {
  project?: Project;
  onSuccess?: () => void;
}

export default function ProjectForm({ project, onSuccess }: ProjectFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partners, isLoading: isLoadingPartners, error: partnersError } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });


  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user,
  });

  const { data: sapSystems, isLoading: isLoadingSapSystems } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/sap-systems", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch SAP systems');
      return res.json();
    },
  });

  const clients = partners?.filter(partner => partner.type === "client") || [];
  const parentProjects = projects?.filter(p => p.id !== project?.id) || []; // Exclude current project

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
      status: project?.status || "planning",
      clientId: project?.clientId || "no-client",
      parentProjectId: project?.parentProjectId || "no-parent",
      sapSystemId: project?.sapSystemId || "no-sap-system",
      startDate: project?.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
      endDate: project?.endDate ? new Date(project.endDate).toISOString().split('T')[0] : "",
      budget: project?.budget || "",
      progress: project?.progress || 0,
      estimatedEffort: project?.estimatedEffort?.toString() || "",
    },
  });

  const saveProjectMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const projectData = {
        ...data,
        userId: user!.id,
        clientId: data.clientId && data.clientId !== "no-client" ? data.clientId : null,
        parentProjectId: data.parentProjectId && data.parentProjectId !== "no-parent" ? data.parentProjectId : null,
        sapSystemId: data.sapSystemId && data.sapSystemId !== "no-sap-system" ? data.sapSystemId : null,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
        budget: data.budget || null,
        estimatedEffort: data.estimatedEffort ? parseInt(data.estimatedEffort) : null,
      };
      
      if (project) {
        // Edit existing project
        const res = await apiRequest("PUT", `/api/projects/${project.id}`, projectData);
        return res.json();
      } else {
        // Create new project
        const res = await apiRequest("POST", "/api/projects", projectData);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: project ? "Project updated successfully" : "Project created successfully" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: project ? "Failed to update project" : "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    saveProjectMutation.mutate(data);
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
                  value={field.value || ""}
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
                <Select onValueChange={field.onChange} value={field.value || "no-client"}>
                  <FormControl>
                    <SelectTrigger data-testid="select-project-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="no-client">No client</SelectItem>
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

          <FormField
            control={form.control}
            name="parentProjectId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Parent Project (Optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "no-parent"}>
                  <FormControl>
                    <SelectTrigger data-testid="select-parent-project">
                      <SelectValue placeholder="Select parent project" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="no-parent">No parent project</SelectItem>
                    {parentProjects.map((parentProject) => (
                      <SelectItem key={parentProject.id} value={parentProject.id}>
                        {parentProject.name}
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
                <FormLabel>Sistema SAP (Opzionale)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "no-sap-system"} disabled={isLoadingSapSystems}>
                  <FormControl>
                    <SelectTrigger data-testid="select-sap-system">
                      {isLoadingSapSystems ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Caricamento sistemi SAP...</span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Seleziona un sistema SAP" />
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="no-sap-system">Nessun sistema SAP</SelectItem>
                    {sapSystems?.map((sapSystem) => (
                      <SelectItem key={sapSystem.id} value={sapSystem.id}>
                        {sapSystem.name} ({sapSystem.landscape})
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

        <div className="grid grid-cols-2 gap-4">
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
                    data-testid="input-project-effort"
                    placeholder="0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="submit"
            disabled={saveProjectMutation.isPending}
            data-testid="button-submit-project"
          >
            {saveProjectMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {project ? "Update Project" : "Create Project"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
