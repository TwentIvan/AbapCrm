import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import FormContainer, { useFormRouting } from "./form-container";
import TaskForm from "./task-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit, MessageSquare, History, Brain, AlertTriangle } from "lucide-react";
import type { Task } from "@shared/schema";

function AiCostsPanel({ task }: { task: Task }) {
  const { data: executions } = useQuery<any[]>({
    queryKey: ["/api/ai-task-executor/history", task.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!task.id,
  });

  const lastCompleted = executions?.find(
    (e) => e.status === "completed" || e.status === "approved"
  );
  const lastPaused = executions?.find((e) => e.status === "paused_budget");

  const hasEstimate = task.estimateTokensMin != null;
  const hasActual = lastCompleted != null;

  return (
    <div className="space-y-4">
      {lastPaused && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium text-sm">Esecuzione sospesa per budget</span>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            Alzare il Budget Cap nel tab Dettagli e usare "Riprendi esecuzione" per continuare.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Preventivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasEstimate ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Token</span>
                  <span className="tabular-nums">
                    {task.estimateTokensMin?.toLocaleString()} –{" "}
                    {task.estimateTokensMax?.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Costo EUR</span>
                  <span className="tabular-nums">
                    €{parseFloat((task.estimateCostMinEur as string) || "0").toFixed(4)} – €
                    {parseFloat((task.estimateCostMaxEur as string) || "0").toFixed(4)}
                  </span>
                </div>
                {task.estimateComputedAt && (
                  <p className="text-xs text-muted-foreground">
                    Calcolato il{" "}
                    {new Date(task.estimateComputedAt).toLocaleDateString("it-IT")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun preventivo. Usa "Calcola Preventivo" nel tab Dettagli.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consuntivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasActual ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Modello</span>
                  <code className="text-xs bg-muted px-1 rounded">
                    {lastCompleted.modelKey || lastCompleted.aiModel || "—"}
                  </code>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Token totali</span>
                  <span className="tabular-nums">
                    {(
                      (lastCompleted.promptTokens || 0) +
                      (lastCompleted.completionTokens || 0)
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Costo EUR</span>
                  <span className="tabular-nums font-medium">
                    €{parseFloat(lastCompleted.totalCostEur || "0").toFixed(4)}
                  </span>
                </div>
                {hasEstimate &&
                  lastCompleted.totalCostEur &&
                  task.estimateCostMaxEur && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Varianza vs preventivo</span>
                      <span
                        className={
                          parseFloat(lastCompleted.totalCostEur) <=
                          parseFloat((task.estimateCostMaxEur as string) || "0")
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-500"
                        }
                      >
                        {parseFloat((task.estimateCostMaxEur as string) || "0") > 0
                          ? (
                              (parseFloat(lastCompleted.totalCostEur) /
                                parseFloat((task.estimateCostMaxEur as string) || "0") -
                                1) *
                              100
                            ).toFixed(1) + "%"
                          : "—"}
                      </span>
                    </div>
                  )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna esecuzione completata.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface TaskFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingTask?: Task | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function TaskFormContainer({
  open = false,
  onOpenChange,
  editingTask,
  onSuccess,
}: TaskFormContainerProps) {
  const params = useParams();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/tasks", params.id);
  
  // For full-page mode, fetch task data from route params
  const { data: fullPageTask } = useQuery({
    queryKey: ["/api/tasks", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });
  
  // Determine which task to use
  const task = currentRoute.isFullPage ? fullPageTask : editingTask;
  const isEditing = !!task;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !task && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento task...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  };
  
  // Handle container close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onOpenChange?.(newOpen);
    }
  };
  
  // Only return null if we're in full page mode but not on a valid route
  // In dialog mode, we always render regardless of route
  if (currentRoute.isFullPage && !currentRoute.isCreate && !currentRoute.isEdit) {
    return null;
  }
  
  const title = isEditing ? "Modifica Task" : "Nuovo Task";
  const description = isEditing 
    ? `Modifica i dettagli del task "${(task as Task)?.title}"` 
    : "Crea un nuovo task per la tua organizzazione";
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((task as Task)?.id || "") : routes.create}
      maxWidth="max-w-4xl"
    >
      {isEditing ? (
        // Editing mode with tabs (details, messages, history, ai costs)
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" className="flex items-center space-x-2">
              <Edit className="h-4 w-4" />
              <span>Dettagli</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4" />
              <span>Messaggi</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>Storico</span>
            </TabsTrigger>
            <TabsTrigger value="ai-costs" className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>Costi AI</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="mt-6">
            <TaskForm 
              task={task as Task}
              onSuccess={handleSuccess}
            />
          </TabsContent>
          
          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="tasks" 
              recordId={(task as Task)?.id || ""}
              title="Storico Messaggi Task"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="tasks" 
              recordId={(task as Task)?.id || ""}
              title="Storico Modifiche Task"
            />
          </TabsContent>

          <TabsContent value="ai-costs" className="mt-6">
            <AiCostsPanel task={task as Task} />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode - just the form
        <TaskForm 
          task={task as Task}
          onSuccess={handleSuccess}
        />
      )}
    </FormContainer>
  );
}