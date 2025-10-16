import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { insertProjectMilestoneSchema, type ProjectMilestone, type Project } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";
import { Target, DollarSign, Calendar, FileText } from "lucide-react";

// Form schema
const formSchema = insertProjectMilestoneSchema.extend({
  name: z.string().min(1, "Nome richiesto"),
  projectId: z.string().min(1, "Progetto richiesto"),
  startDate: z.string().min(1, "Data inizio richiesta"),
  endDate: z.string().min(1, "Data fine richiesta"),
  completedDate: z.string().optional(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  budgetAmount: z.string().optional(),
  actualCost: z.string().optional(),
  currency: z.string().optional(),
  deliverables: z.string().optional(),
  description: z.string().optional(),
  dependsOnMilestoneId: z.string().optional(),
  displayOrder: z.number().optional(),
}).omit({ userId: true, organizationId: true });

type ProjectMilestoneFormData = z.infer<typeof formSchema>;

interface ProjectMilestoneFormProps {
  milestone?: ProjectMilestone;
  onSuccess?: () => void;
}

export default function ProjectMilestoneForm({ milestone, onSuccess }: ProjectMilestoneFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: milestones = [] } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/project-milestones"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<ProjectMilestoneFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: milestone?.name || "",
      description: milestone?.description || "",
      projectId: milestone?.projectId || "",
      startDate: milestone?.startDate ? new Date(milestone.startDate).toISOString().split('T')[0] : "",
      endDate: milestone?.endDate ? new Date(milestone.endDate).toISOString().split('T')[0] : "",
      completedDate: milestone?.completedDate ? new Date(milestone.completedDate).toISOString().split('T')[0] : "",
      status: milestone?.status || "planned",
      progress: milestone?.progress || 0,
      budgetAmount: milestone?.budgetAmount || "",
      actualCost: milestone?.actualCost || "",
      currency: milestone?.currency || "EUR",
      deliverables: milestone?.deliverables || "",
      dependsOnMilestoneId: milestone?.dependsOnMilestoneId || "",
      displayOrder: milestone?.displayOrder || 0,
    },
  });

  const projectId = form.watch("projectId");
  const progress = form.watch("progress") || 0;

  // Reset dependsOnMilestoneId when project changes
  useEffect(() => {
    if (projectId && projectId !== milestone?.projectId) {
      form.setValue("dependsOnMilestoneId", "");
    }
  }, [projectId, milestone?.projectId, form]);

  // Filter milestones for same project (for dependencies)
  const projectMilestones = milestones.filter(m => m.projectId === projectId && m.id !== milestone?.id);

  const createMutation = useMutation({
    mutationFn: async (data: ProjectMilestoneFormData) => {
      const payload = {
        ...data,
        budgetAmount: data.budgetAmount ? parseFloat(data.budgetAmount) : undefined,
        actualCost: data.actualCost ? parseFloat(data.actualCost) : undefined,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : undefined,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
        completedDate: data.completedDate ? new Date(data.completedDate).toISOString() : undefined,
        dependsOnMilestoneId: data.dependsOnMilestoneId || undefined,
      };
      return await apiRequest("POST", "/api/project-milestones", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-milestones"] });
      toast({
        title: "Creato",
        description: "Milestone creata con successo.",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la creazione",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProjectMilestoneFormData) => {
      const payload = {
        ...data,
        budgetAmount: data.budgetAmount ? parseFloat(data.budgetAmount) : undefined,
        actualCost: data.actualCost ? parseFloat(data.actualCost) : undefined,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : undefined,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
        completedDate: data.completedDate ? new Date(data.completedDate).toISOString() : undefined,
        dependsOnMilestoneId: data.dependsOnMilestoneId || undefined,
      };
      return await apiRequest("PUT", `/api/project-milestones/${milestone?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-milestones"] });
      toast({
        title: "Aggiornato",
        description: "Milestone aggiornata con successo.",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'aggiornamento",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProjectMilestoneFormData) => {
    if (milestone) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informazioni Base */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Informazioni Milestone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Milestone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Sprint 1, Alpha Release, Go-Live..." data-testid="input-name" />
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
                  <FormLabel>Descrizione</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Descrizione dettagliata della milestone..." data-testid="input-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progetto</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} data-testid="select-project">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona progetto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects.map((project) => (
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
              name="dependsOnMilestoneId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Milestone Prerequisito</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || ""} 
                    disabled={!projectId || projectMilestones.length === 0}
                    data-testid="select-prerequisite"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nessun prerequisito" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nessun prerequisito</SelectItem>
                      {projectMilestones.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Milestone che deve essere completata prima di questa
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Date e Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date e Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Inizio</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-start-date" />
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
                    <FormLabel>Data Fine Prevista</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="completedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Completamento Effettiva</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-completed-date" />
                  </FormControl>
                  <FormDescription>
                    Lasciare vuoto se non ancora completata
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Stato e Progresso */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Stato e Progresso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} data-testid="select-status">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="planned">Pianificato</SelectItem>
                      <SelectItem value="in_progress">In Corso</SelectItem>
                      <SelectItem value="completed">Completato</SelectItem>
                      <SelectItem value="cancelled">Cancellato</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="progress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progresso: {progress}%</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[field.value || 0]}
                      onValueChange={(vals) => field.onChange(vals[0])}
                      data-testid="slider-progress"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Budget e Costi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Budget e Costi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="budgetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Previsto</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} placeholder="0.00" data-testid="input-budget" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actualCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo Effettivo</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} placeholder="0.00" data-testid="input-actual-cost" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valuta</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} data-testid="select-currency">
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="EUR" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Deliverables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Deliverables e Note
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="deliverables"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deliverables</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Lista dei deliverables attesi..." data-testid="input-deliverables" />
                  </FormControl>
                  <FormDescription>
                    Documenti, features, o risultati tangibili da consegnare
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordine Visualizzazione</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      value={field.value || 0}
                      data-testid="input-display-order" 
                    />
                  </FormControl>
                  <FormDescription>
                    Usato per ordinare le milestone nella visualizzazione Gantt
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending ? "Salvataggio..." : (milestone ? "Aggiorna" : "Crea")} Milestone
          </Button>
        </div>
      </form>
    </Form>
  );
}
