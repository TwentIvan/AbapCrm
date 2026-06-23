import React, { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, Server, AlertCircle, Lightbulb } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganization } from "@/contexts/organization-context";

interface AiModelOption {
  id: string;
  modelKey: string;
  displayName: string;
  inputPricePerMToken: string | null;
  outputPricePerMToken: string | null;
  providerName: string;
  providerSlug: string;
  status: string;
}

interface CostEstimate {
  tokensMin: number;
  tokensMax: number;
  costMinEur: number;
  costMaxEur: number;
  basis: "historical" | "heuristic";
  sampleSize: number;
}

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
  agentModelId: z.string().optional(),
  budgetCapEur: z.string().optional(),
  mcpConfigIds: z.array(z.string()).optional(),
  connectionWorkflowId: z.string().optional(),
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
  const { currentOrganizationId } = useOrganization();

  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const { data: projects, isLoading: projectsLoading, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
    retry: 3,
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  const { data: sapSystems } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  const { data: milestones } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/project-milestones"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  const { data: usersList } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  const { data: aiModels } = useQuery<AiModelOption[]>({
    queryKey: ["/api/ai/models"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  const { data: mcpConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/mcp/configs"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: mcpCatalog = [] } = useQuery<any[]>({
    queryKey: ["/api/mcp/catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const catalogValidationMap = new Map<string, boolean>(
    mcpCatalog.map((c: any) => [c.id, c.validated ?? false])
  );

  const activeProjects = projects?.filter(project => project.status !== "completed") || [];
  const parentTasks = tasks?.filter(t => t.id !== task?.id) || [];

  const uniqueProviders = Array.from(
    new Set((aiModels || []).map(m => m.providerSlug))
  );

  const filteredModels = selectedProvider === "all"
    ? (aiModels || [])
    : (aiModels || []).filter(m => m.providerSlug === selectedProvider);

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
      agentModelId: (task as any)?.agentModelId || "none",
      budgetCapEur: (task as any)?.budgetCapEur?.toString() || "",
      mcpConfigIds: (task as any)?.mcpConfigIds ?? [],
      connectionWorkflowId: (task as any)?.connectionWorkflowId || "none",
    },
  });

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
        agentModelId: (task as any)?.agentModelId || "none",
        budgetCapEur: (task as any)?.budgetCapEur?.toString() || "",
        mcpConfigIds: (task as any)?.mcpConfigIds ?? [],
        connectionWorkflowId: (task as any)?.connectionWorkflowId || "none",
      });
      setEstimate(null);
    }
  }, [task, form]);

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects?.find(p => p.id === selectedProjectId);
  const watchSapSystemId = form.watch("sapSystemId");

  const filteredSapSystems = sapSystems?.filter(sys => {
    if (!selectedProject?.clientId) return true;
    return sys.partnerId === selectedProject.clientId;
  }) || [];

  const { data: connectionWorkflowsForTask = [] } = useQuery<any[]>({
    queryKey: ["/api/connection-workflows", { sapSystemId: watchSapSystemId }],
    queryFn: async () => {
      const params = watchSapSystemId && watchSapSystemId !== "none"
        ? `?sapSystemId=${watchSapSystemId}` : "";
      const r = await fetch(`/api/connection-workflows${params}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!currentOrganizationId,
  });

  const handleEstimate = async () => {
    if (!task?.id) return;
    setEstimating(true);
    try {
      const currentModelId = form.getValues("agentModelId");
      const selectedModel = currentModelId && currentModelId !== "none"
        ? aiModels?.find(m => m.id === currentModelId)
        : null;
      const res = await apiRequest("POST", `/api/tasks/${task.id}/estimate`, {
        modelKey: selectedModel?.modelKey,
      });
      const data: CostEstimate = await res.json();
      setEstimate(data);
    } catch (err: any) {
      toast({ title: "Errore preventivo", description: err.message, variant: "destructive" });
    } finally {
      setEstimating(false);
    }
  };

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
        agentModelId: data.agentModelId && data.agentModelId !== "none" ? data.agentModelId : null,
        budgetCapEur: data.budgetCapEur ? data.budgetCapEur : null,
        mcpConfigIds: data.mcpConfigIds ?? [],
      };

      if (task) {
        const res = await apiRequest("PUT", `/api/tasks/${task.id}`, taskData);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/tasks", taskData);
        return res.json();
      }
    },
    onSuccess: (updatedTask: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects/batch-end-to-complete"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      const projectId = updatedTask?.projectId || task?.projectId;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "end-to-complete"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }
      toast({ title: task ? "Task aggiornato" : "Task creato" });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: task ? "Errore aggiornamento" : "Errore creazione",
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
            {task ? "Aggiorna Task" : "Crea Task"}
          </Button>
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titolo Task</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-task-title" placeholder="Inserisci il titolo del task" />
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
              <FormLabel>Descrizione (Opzionale)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value || ""}
                  data-testid="input-task-description"
                  placeholder="Descrivi il task..."
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
                      <SelectValue placeholder="Seleziona status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Bozza</SelectItem>
                    <SelectItem value="todo">Da Fare</SelectItem>
                    <SelectItem value="in_progress">In Corso</SelectItem>
                    <SelectItem value="review">In Revisione</SelectItem>
                    <SelectItem value="completed">Completato</SelectItem>
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
                <FormLabel>Priorità</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-task-priority">
                      <SelectValue placeholder="Seleziona priorità" />
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
                  {usersList?.map(u => (
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
              <FormLabel>Progetto (Opzionale)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-project">
                    <SelectValue placeholder={
                      projectsLoading ? "Caricamento..." :
                      projectsError ? "Errore caricamento" :
                      "Seleziona progetto"
                    } />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Nessun progetto</SelectItem>
                  {projectsLoading ? (
                    <SelectItem value="loading" disabled>Caricamento progetti...</SelectItem>
                  ) : projectsError ? (
                    <SelectItem value="error" disabled>Errore caricamento progetti</SelectItem>
                  ) : activeProjects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>Nessun progetto attivo</SelectItem>
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
              <FormLabel>Milestone (Opzionale)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-milestone">
                    <SelectValue placeholder="Seleziona milestone" />
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
              <FormLabel>Sistema SAP (Opzionale)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-task-sap-system">
                    <SelectValue placeholder="Seleziona sistema SAP" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Nessun sistema SAP</SelectItem>
                  {filteredSapSystems.length === 0 && selectedProject?.clientId && (
                    <SelectItem value="no-systems" disabled>
                      Nessun sistema SAP per questo partner
                    </SelectItem>
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

        {/* Connection Workflow override */}
        <FormField
          control={form.control}
          name="connectionWorkflowId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Connection Workflow (Opzionale)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-connection-workflow">
                    <SelectValue placeholder="Default del sistema SAP" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">— Default del sistema SAP —</SelectItem>
                  {connectionWorkflowsForTask.map((wf: any) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      {wf.name}
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
              <FormLabel>Task Padre (Opzionale)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "no-parent"}>
                <FormControl>
                  <SelectTrigger data-testid="select-parent-task">
                    <SelectValue placeholder="Seleziona task padre" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="no-parent">Nessun task padre</SelectItem>
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
                <FormLabel>Data Inizio (Opzionale)</FormLabel>
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
                <FormLabel>Data Fine (Opzionale)</FormLabel>
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

        {/* ─── Sezione Agente AI ─── */}
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
            <Bot className="h-4 w-4 text-primary" />
            Agente AI
          </h3>

          {/* Provider filter + Model select */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger data-testid="select-ai-provider">
                  <SelectValue placeholder="Tutti i provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {uniqueProviders.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <FormField
              control={form.control}
              name="agentModelId"
              render={({ field }) => {
                const aiSpec = (task as any)?.aiSpec as any;
                const suggestedKey = aiSpec?.suggestedModelKey;
                const suggestedModel = suggestedKey
                  ? (aiModels || []).find(m => m.modelKey === suggestedKey)
                  : null;
                const currentModel = field.value && field.value !== "none"
                  ? (aiModels || []).find(m => m.id === field.value)
                  : null;
                const showHint = suggestedModel && currentModel?.modelKey !== suggestedKey;
                return (
                  <FormItem>
                    <FormLabel>Modello AI</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-agent-model">
                          <SelectValue placeholder="Default organizzazione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Default organizzazione</SelectItem>
                        {filteredModels.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.displayName}
                            {m.inputPricePerMToken
                              ? ` — $${parseFloat(m.inputPricePerMToken).toFixed(2)}/$${parseFloat(m.outputPricePerMToken || "0").toFixed(2)} /Mtok`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {showHint && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-agent">
                        <span className="flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Suggerito: <strong>{suggestedModel!.displayName}</strong> (basato su cronologia esecuzioni)</span>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-agent underline"
                          onClick={() => field.onChange(suggestedModel!.id)}
                        >
                          Applica
                        </Button>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>

          {/* Estimate */}
          {task ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEstimate}
                  disabled={estimating}
                  data-testid="button-calculate-estimate"
                >
                  {estimating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Calcola Preventivo
                </Button>
                {estimate && (
                  <Badge variant={estimate.basis === "historical" ? "default" : "secondary"}>
                    {estimate.basis === "historical"
                      ? `storico (${estimate.sampleSize} exec.)`
                      : "euristica"}
                  </Badge>
                )}
              </div>

              {estimate && (
                <div className="bg-background border rounded p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Token stimati</span>
                    <span className="tabular-nums">
                      {estimate.tokensMin.toLocaleString()} – {estimate.tokensMax.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Costo EUR stimato</span>
                    <span className="tabular-nums font-medium">
                      €{estimate.costMinEur.toFixed(4)} – €{estimate.costMaxEur.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Salva il task prima di calcolare il preventivo AI.
            </p>
          )}

          {/* Budget cap */}
          <FormField
            control={form.control}
            name="budgetCapEur"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tetto di Spesa EUR (opzionale)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="es. 0.500"
                    data-testid="input-budget-cap"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* MCP Tool Servers */}
          <TooltipProvider>
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-primary" />
                Server MCP per Tool Use
              </Label>
              {mcpConfigs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nessun server MCP configurato.{" "}
                  <a href="/mcp-library" className="underline hover:text-primary">
                    Aggiungi configurazioni
                  </a>{" "}
                  nella MCP Library.
                </p>
              ) : (
                <div className="space-y-2">
                  {mcpConfigs.map((cfg: any) => {
                    const ids: string[] = form.watch("mcpConfigIds") ?? [];
                    const checked = ids.includes(cfg.id);
                    const isValidated = cfg.catalogId
                      ? (catalogValidationMap.get(cfg.catalogId) ?? false)
                      : true;
                    const isDisabled = !isValidated;
                    return (
                      <div key={cfg.id} className={`flex items-center gap-2 ${isDisabled ? "opacity-50" : ""}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Checkbox
                                id={`mcp-${cfg.id}`}
                                checked={checked}
                                disabled={isDisabled}
                                onCheckedChange={(v) => {
                                  if (isDisabled) return;
                                  const current = form.getValues("mcpConfigIds") ?? [];
                                  if (v) {
                                    form.setValue("mcpConfigIds", [...current, cfg.id]);
                                  } else {
                                    form.setValue("mcpConfigIds", current.filter((id: string) => id !== cfg.id));
                                  }
                                }}
                                data-testid={`mcp-config-check-${cfg.id}`}
                              />
                            </span>
                          </TooltipTrigger>
                          {isDisabled && (
                            <TooltipContent>Server non validato — validarlo dalla MCP Library prima dell'uso</TooltipContent>
                          )}
                        </Tooltip>
                        <label
                          htmlFor={isDisabled ? undefined : `mcp-${cfg.id}`}
                          className={`text-sm flex items-center gap-1.5 ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {cfg.name}
                          <Badge
                            variant={cfg.environment === "PRD" ? "destructive" : cfg.environment === "QAS" ? "secondary" : "outline"}
                            className="text-xs"
                          >
                            {cfg.environment}
                          </Badge>
                          {cfg.readOnly && <Badge variant="outline" className="text-xs text-success">read</Badge>}
                          {isDisabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="h-3 w-3 text-warning" />
                              </TooltipTrigger>
                              <TooltipContent>Server non validato</TooltipContent>
                            </Tooltip>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TooltipProvider>
        </div>
      </form>
    </Form>
  );
}
