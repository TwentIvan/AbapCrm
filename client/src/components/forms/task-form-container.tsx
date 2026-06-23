import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import FormContainer, { useFormRouting } from "./form-container";
import TaskForm from "./task-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Edit, MessageSquare, History, Brain, AlertTriangle, Zap, CheckCircle2, XCircle, ShieldAlert, ShieldCheck, ShieldX, Loader2, FileText, ExternalLink, CheckCheck, Wifi, Bot, User, GitBranch, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@shared/schema";

// ── Tool Calls Panel (Phase 4: write tools show approval status) ──────────────
function ToolCallsPanel({ task }: { task: Task }) {
  const { data: executions } = useQuery<any[]>({
    queryKey: ["/api/ai-task-executor/history", task.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!task.id,
  });

  // Prefer the last execution with tool calls (could be awaiting_approval or completed)
  const lastWithTools = executions?.find((e: any) => Array.isArray(e.toolCallsLog) && e.toolCallsLog.length > 0);
  const toolCalls: any[] = lastWithTools?.toolCallsLog ?? [];

  if (!executions) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Caricamento...</CardContent>
      </Card>
    );
  }

  if (toolCalls.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nessuna chiamata tool MCP registrata per questo task. Le tool call appaiono dopo una esecuzione AI che utilizza server MCP configurati.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Tool Calls — ultima esecuzione MCP
          {lastWithTools?.status === "awaiting_approval" && (
            <Badge variant="secondary" className="text-xs ml-auto text-warning">In attesa approvazione</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y text-sm">
          {toolCalls.map((tc: any, i: number) => (
            <div key={i} className="py-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {tc.requiresApproval ? (
                  tc.status === "approved" ? <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" /> :
                  tc.status === "rejected" ? <ShieldX className="h-3.5 w-3.5 text-destructive shrink-0" /> :
                  <ShieldAlert className="h-3.5 w-3.5 text-warning shrink-0" />
                ) : (
                  tc.ok != null ? (
                    tc.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> :
                             <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : null
                )}
                <code className="font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded">
                  {tc.toolName ?? tc.namespacedName}
                </code>
                {tc.requiresApproval && (
                  <Badge variant="outline" className="text-xs">
                    {tc.status === "approved" ? "approvato" : tc.status === "rejected" ? "rifiutato" : "pending"}
                  </Badge>
                )}
                {tc.durationMs != null && (
                  <span className="text-xs text-muted-foreground">{tc.durationMs}ms</span>
                )}
                {tc.ts && (
                  <span className="text-xs text-muted-foreground">{new Date(tc.ts).toLocaleTimeString()}</span>
                )}
              </div>
              {tc.args && Object.keys(tc.args).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Args</summary>
                  <pre className="bg-muted rounded p-2 mt-1 overflow-auto max-h-24">{JSON.stringify(tc.args, null, 2)}</pre>
                </details>
              )}
              {tc.result && (
                <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-28 whitespace-pre-wrap">{tc.result}</pre>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Pending Actions Panel (Phase 4 — approve / reject write tool calls) ───────
// ── Connection Plan Panel ─────────────────────────────────────────────────────
const STEP_TYPE_LABELS: Record<string, string> = {
  vpn_connect: "VPN Connect",
  open_url_await_download: "Apri URL / Attendi download",
  extract_cookie_from_shortcut: "Estrai cookie da shortcut",
  launch_process: "Avvia processo",
  run_local_script: "Esegui script locale",
  mcp_health_check: "MCP Health Check",
  manual_confirm: "Conferma manuale",
};

function ConnectionPlanPanel({ task }: { task: Task }) {
  const { data: plan, isLoading, error, refetch } = useQuery<any>({
    queryKey: ["/api/tasks", task.id, "connection-plan"],
    queryFn: async () => {
      const r = await fetch(`/api/tasks/${task.id}/connection-plan`, { credentials: "include" });
      if (!r.ok) throw new Error("Errore caricamento piano");
      return r.json();
    },
    enabled: !!task.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Caricamento piano di connessione...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-8">
        <AlertCircle className="h-4 w-4" />
        <span>Errore nel caricamento del piano di connessione</span>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>Riprova</Button>
      </div>
    );
  }

  if (!plan || !plan.workflow) {
    return (
      <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
        <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm font-medium">Nessun Connection Workflow configurato</p>
        <p className="text-xs mt-1">
          Assegna un workflow al task (tab Dettagli) o configura un sistema SAP con workflow associato.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            {plan.workflow.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sorgente: {plan.source === "task-override" ? "Override task" : "Sistema SAP"} ·{" "}
            {plan.steps.length} passo{plan.steps.length !== 1 ? "i" : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <Loader2 className="h-3 w-3 mr-1" />Aggiorna
        </Button>
      </div>

      <div className="space-y-2">
        {plan.steps.map((step: any, i: number) => (
          <div key={step.id || i}
            className="flex items-start gap-3 p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-mono shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{step.label}</span>
                <Badge variant={step.actor === "auto" ? "default" : "secondary"} className="text-xs gap-1 shrink-0">
                  {step.actor === "auto"
                    ? <Bot className="h-3 w-3" />
                    : <User className="h-3 w-3" />}
                  {step.autoExecutable ? "automatico" : "manuale"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {STEP_TYPE_LABELS[step.type] ?? step.type}
              </p>
              {step.onFailure && step.onFailure !== "abort" && (
                <p className="text-xs text-warning mt-0.5">
                  In caso di errore: {step.onFailure === "retry" ? "riprova" : "chiedi all'utente"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingActionsPanel({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const { data: executions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/ai-task-executor/history", task.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!task.id,
    refetchInterval: 4000,
  });

  const awaitingExecution = executions.find((e: any) => e.status === "awaiting_approval");

  const { data: pendingActions = [] } = useQuery<any[]>({
    queryKey: ["/api/executions", awaitingExecution?.id, "pending-actions"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!awaitingExecution?.id,
    refetchInterval: 4000,
  });

  const decideMutation = useMutation({
    mutationFn: async ({ executionId, decisions }: { executionId: string; decisions: any[] }) => {
      const res = await apiRequest("POST", `/api/executions/${executionId}/decide`, { decisions });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-task-executor/history", task.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/executions", vars.executionId, "pending-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/pending-actions/count"] });
      const msg = data.status === "completed" ? "Esecuzione completata!" :
                  data.status === "awaiting_approval" ? "Altre azioni in attesa..." :
                  "Decisione registrata";
      toast({ title: msg });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const handleDecide = (actionId: string, decision: "approved" | "rejected") => {
    if (!awaitingExecution) return;
    decideMutation.mutate({
      executionId: awaitingExecution.id,
      decisions: [{ actionId, decision, decisionNote: decisionNotes[actionId] }],
    });
  };

  const handleDecideAll = (decision: "approved" | "rejected") => {
    if (!awaitingExecution) return;
    const pendingOnly = pendingActions.filter((a: any) => a.status === "pending");
    if (pendingOnly.length === 0) return;
    decideMutation.mutate({
      executionId: awaitingExecution.id,
      decisions: pendingOnly.map((a: any) => ({ actionId: a.id, decision, decisionNote: decisionNotes[a.id] })),
    });
  };

  if (isLoading) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Caricamento...</CardContent></Card>;
  }

  if (!awaitingExecution) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-1">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p>Nessuna esecuzione in attesa di approvazione.</p>
          <p className="text-xs">Quando l'AI richiede di eseguire tool write su server MCP non read-only, le azioni appaiono qui per la tua approvazione.</p>
        </CardContent>
      </Card>
    );
  }

  const pending = pendingActions.filter((a: any) => a.status === "pending");

  return (
    <div className="space-y-4">
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
        <div className="flex items-center gap-2 text-warning">
          <ShieldAlert className="h-4 w-4" />
          <span className="font-medium text-sm">
            Esecuzione sospesa — {pending.length} azione{pending.length !== 1 ? "i" : ""} write in attesa
          </span>
        </div>
        <p className="text-xs text-warning dark:text-warning mt-1">
          Esamina ogni azione. Approva per eseguirla sul server MCP o rifiuta per interrompere. L'esecuzione riprende automaticamente quando tutte sono decise.
        </p>
      </div>

      {pending.length > 1 && (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:border-destructive/30"
            onClick={() => handleDecideAll("rejected")} disabled={decideMutation.isPending}>
            <ShieldX className="h-3.5 w-3.5 mr-1" />Rifiuta tutte
          </Button>
          <Button size="sm" className="bg-success hover:bg-success/90 text-white"
            onClick={() => handleDecideAll("approved")} disabled={decideMutation.isPending}>
            <ShieldCheck className="h-3.5 w-3.5 mr-1" />Approva tutte
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {pendingActions.map((action: any) => (
          <Card key={action.id} className={
            action.status === "approved" ? "border-success/30" :
            action.status === "rejected" ? "border-destructive/30 dark:border-red-800" :
            "border-warning/30"
          }>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {action.status === "approved" ? <ShieldCheck className="h-4 w-4 text-success shrink-0" /> :
                 action.status === "rejected" ? <ShieldX className="h-4 w-4 text-destructive shrink-0" /> :
                 <ShieldAlert className="h-4 w-4 text-warning shrink-0" />}
                <code className="font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded">{action.toolName}</code>
                <Badge variant={
                  action.status === "approved" ? "default" :
                  action.status === "rejected" ? "destructive" : "secondary"
                } className="text-xs">
                  {action.status === "approved" ? "Approvato" :
                   action.status === "rejected" ? "Rifiutato" : "In attesa"}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(action.createdAt).toLocaleTimeString("it-IT")}
                </span>
              </div>

              {action.modelRationale && (
                <div className="text-xs text-muted-foreground bg-muted/60 rounded p-2 leading-relaxed">
                  <span className="font-medium text-foreground">Motivazione AI: </span>
                  {action.modelRationale.slice(0, 300)}{action.modelRationale.length > 300 ? "…" : ""}
                </div>
              )}

              {action.toolArgs && Object.keys(action.toolArgs).length > 0 && (
                <details>
                  <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                    Parametri ({Object.keys(action.toolArgs).length})
                  </summary>
                  <pre className="text-xs bg-muted rounded p-2 mt-1 overflow-auto max-h-32">{JSON.stringify(action.toolArgs, null, 2)}</pre>
                </details>
              )}

              {action.status === "pending" && (
                <div className="space-y-2 pt-1">
                  <Input
                    placeholder="Nota decisione (opzionale)"
                    className="h-8 text-xs"
                    value={decisionNotes[action.id] ?? ""}
                    onChange={e => setDecisionNotes(prev => ({ ...prev, [action.id]: e.target.value }))}
                    data-testid={`decision-note-${action.id}`}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/30"
                      onClick={() => handleDecide(action.id, "rejected")}
                      disabled={decideMutation.isPending}
                      data-testid={`btn-reject-${action.id}`}>
                      <ShieldX className="h-3.5 w-3.5 mr-1" />Rifiuta
                    </Button>
                    <Button size="sm" className="bg-success hover:bg-success/90 text-white"
                      onClick={() => handleDecide(action.id, "approved")}
                      disabled={decideMutation.isPending}
                      data-testid={`btn-approve-${action.id}`}>
                      {decideMutation.isPending
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                      Approva
                    </Button>
                  </div>
                </div>
              )}

              {action.status !== "pending" && action.decidedAt && (
                <p className="text-xs text-muted-foreground pt-1 border-t">
                  Deciso il {new Date(action.decidedAt).toLocaleString("it-IT")}
                  {action.decisionNote ? <> — <em>"{action.decisionNote}"</em></> : ""}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── AI Costs Panel ─────────────────────────────────────────────────────────────
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
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium text-sm">Esecuzione sospesa per budget</span>
          </div>
          <p className="text-xs text-warning dark:text-warning mt-1">
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
                            ? "text-success dark:text-success"
                            : "text-destructive"
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

// ── AI Spec Panel (Phase 5) ────────────────────────────────────────────────
function AiSpecPanel({ task }: { task: Task }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const confirmDraftMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/tasks/${task.id}`, { status: "todo" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task confermato — stato impostato a 'Da fare'" });
    },
  });

  const { data: assembledCtx, isLoading: ctxLoading } = useQuery<any>({
    queryKey: ["/api/tasks", task.id, "assembled-context"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!task.id,
  });

  const spec = (task as any).aiSpec as any;

  if (!spec) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nessuna AI Spec disponibile per questo task. Le spec vengono generate automaticamente dall'agente AI durante la creazione della proposta.
        </CardContent>
      </Card>
    );
  }

  const confidenceNum = typeof spec.confidence === "number" ? spec.confidence : null;
  const confidencePct = confidenceNum !== null ? Math.round(confidenceNum * 100) : null;
  const confidenceColor =
    confidenceNum === null ? "secondary"
    : confidenceNum >= 0.7 ? "default"
    : "destructive";

  return (
    <div className="space-y-4">
      {/* Header row: status + confidence + confirm button */}
      <div className="flex items-center gap-3 flex-wrap">
        {(task as any).status === "draft" && (
          <Badge className="bg-agent/10 text-agent-foreground">
            Bozza
          </Badge>
        )}
        {confidencePct !== null && (
          <Badge variant={confidenceColor as any}>
            Confidenza: {confidencePct}%
          </Badge>
        )}
        {(task as any).status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => confirmDraftMutation.mutate()}
            disabled={confirmDraftMutation.isPending}
            data-testid="button-confirm-draft"
            className="border-agent/30 text-agent hover:bg-agent/10"
          >
            {confirmDraftMutation.isPending
              ? <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              : <CheckCheck className="mr-2 h-3 w-3" />}
            Conferma Bozza
          </Button>
        )}
      </div>

      {/* Summary */}
      {spec.summary && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Sommario</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-sm">{spec.summary}</CardContent>
        </Card>
      )}

      {/* Objective */}
      {spec.objective && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Obiettivo</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-sm">{spec.objective}</CardContent>
        </Card>
      )}

      {/* Deliverables */}
      {Array.isArray(spec.deliverables) && spec.deliverables.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Deliverable</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="list-disc pl-4 space-y-1 text-sm">
              {spec.deliverables.map((d: string, i: number) => <li key={i}>{d}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Acceptance Criteria */}
      {Array.isArray(spec.acceptanceCriteria) && spec.acceptanceCriteria.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Criteri di Accettazione</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="list-disc pl-4 space-y-1 text-sm">
              {spec.acceptanceCriteria.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Open Questions */}
      {Array.isArray(spec.openQuestions) && spec.openQuestions.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              Domande Aperte ({spec.openQuestions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="list-decimal pl-4 space-y-1 text-sm text-warning">
              {spec.openQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Assembled Context Preview */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Contesto Assemblato per AI
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {ctxLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : assembledCtx ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Sezioni incluse</span>
                <span className="font-medium text-foreground">
                  {Object.keys(assembledCtx.sections || {}).filter(k => assembledCtx.sections[k]).length}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Token stimati</span>
                <span className="font-medium text-foreground tabular-nums">
                  {(assembledCtx.totalTokens || 0).toLocaleString()}
                </span>
              </div>
              {assembledCtx.truncated && (
                <Badge variant="secondary" className="text-xs">Troncato al budget</Badge>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Contesto non disponibile.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TaskFormContainerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingTask?: Task | null;
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

  const { routes, navigation, currentRoute } = useFormRouting("/tasks", params.id);

  const { data: fullPageTask } = useQuery({
    queryKey: ["/api/tasks", params.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!params.id && currentRoute.isEdit,
  });

  const task = currentRoute.isFullPage ? fullPageTask : editingTask;
  const isEditing = !!task;

  if (currentRoute.isEdit && !task && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento task...</div>;
  }

  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onOpenChange?.(newOpen);
    }
  };

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
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="details" className="flex items-center space-x-2">
              <Edit className="h-4 w-4" />
              <span>Dettagli</span>
            </TabsTrigger>
            <TabsTrigger value="ai-spec" className="flex items-center space-x-2" data-testid="tab-ai-spec">
              <FileText className="h-4 w-4" />
              <span>Spec AI</span>
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
            <TabsTrigger value="tool-calls" className="flex items-center space-x-2" data-testid="tab-tool-calls">
              <Zap className="h-4 w-4" />
              <span>Tool Calls</span>
            </TabsTrigger>
            <TabsTrigger value="approvals" className="flex items-center space-x-2" data-testid="tab-approvals">
              <ShieldAlert className="h-4 w-4" />
              <span>Approvazioni</span>
            </TabsTrigger>
            <TabsTrigger value="connection-plan" className="flex items-center space-x-2" data-testid="tab-connection-plan">
              <Wifi className="h-4 w-4" />
              <span>Connessione</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-6">
            <TaskForm task={task as Task} onSuccess={handleSuccess} />
          </TabsContent>

          <TabsContent value="ai-spec" className="mt-6">
            <AiSpecPanel task={task as Task} />
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

          <TabsContent value="tool-calls" className="mt-6">
            <ToolCallsPanel task={task as Task} />
          </TabsContent>

          <TabsContent value="approvals" className="mt-6">
            <PendingActionsPanel task={task as Task} />
          </TabsContent>

          <TabsContent value="connection-plan" className="mt-6">
            <ConnectionPlanPanel task={task as Task} />
          </TabsContent>
        </Tabs>
      ) : (
        <TaskForm task={task as Task} onSuccess={handleSuccess} />
      )}
    </FormContainer>
  );
}
