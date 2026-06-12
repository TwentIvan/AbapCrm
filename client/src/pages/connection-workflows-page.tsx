import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, Bot, User,
  Wifi, Globe, Cookie, Terminal, ScrollText, Activity, HandMetal,
  GitBranch, Loader2
} from "lucide-react";
import type {
  ConnectionWorkflow, InsertConnectionWorkflow, ConnectionStep,
  ConnectionStepType
} from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_TYPES: { value: ConnectionStepType; label: string; icon: any; actor: "auto" | "human" }[] = [
  { value: "vpn_connect", label: "VPN Connect", icon: Wifi, actor: "human" },
  { value: "open_url_await_download", label: "Apri URL / Attendi download", icon: Globe, actor: "human" },
  { value: "extract_cookie_from_shortcut", label: "Estrai cookie da shortcut", icon: Cookie, actor: "auto" },
  { value: "launch_process", label: "Avvia processo", icon: Terminal, actor: "auto" },
  { value: "run_local_script", label: "Esegui script locale", icon: ScrollText, actor: "auto" },
  { value: "mcp_health_check", label: "MCP Health Check", icon: Activity, actor: "auto" },
  { value: "manual_confirm", label: "Conferma manuale", icon: HandMetal, actor: "human" },
];

const ON_FAILURE_OPTIONS = [
  { value: "abort", label: "Interrompi (abort)" },
  { value: "retry", label: "Riprova (retry)" },
  { value: "ask_user", label: "Chiedi all'utente" },
];

// ── Step icon helper ──────────────────────────────────────────────────────────
function StepIcon({ type, className = "h-4 w-4" }: { type: ConnectionStepType; className?: string }) {
  const meta = STEP_TYPES.find(s => s.value === type);
  const Icon = meta?.icon ?? GitBranch;
  return <Icon className={className} />;
}

// ── Step params editor ────────────────────────────────────────────────────────
function StepParamsEditor({
  type, params, onChange, sapSystems = [], vpnConnections = [], mcpConfigs = []
}: {
  type: ConnectionStepType;
  params: Record<string, any>;
  onChange: (p: Record<string, any>) => void;
  sapSystems?: any[];
  vpnConnections?: any[];
  mcpConfigs?: any[];
}) {
  const set = (key: string, val: any) => onChange({ ...params, [key]: val });

  if (type === "vpn_connect") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Connessione VPN</Label>
        <Select value={params.vpnConnectionId || ""} onValueChange={v => set("vpnConnectionId", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Seleziona VPN..." />
          </SelectTrigger>
          <SelectContent>
            {vpnConnections.map((v: any) => (
              <SelectItem key={v.id} value={v.id}>{v.name} — {v.serverAddress}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "open_url_await_download") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">URL Portale</Label>
        <Input placeholder="https://portale.cliente.com/sap" value={params.url || ""}
          onChange={e => set("url", e.target.value)} />
        <Label className="text-xs">Pattern file atteso (glob)</Label>
        <Input placeholder="tx*.sap" value={params.pattern || ""}
          onChange={e => set("pattern", e.target.value)} />
      </div>
    );
  }

  if (type === "extract_cookie_from_shortcut") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Pattern nome file (opzionale)</Label>
        <Input placeholder="tx*.sap" value={params.pattern || ""}
          onChange={e => set("pattern", e.target.value)} />
        <Label className="text-xs">Filtro [System] Name= (opzionale)</Label>
        <Input placeholder="HTS" value={params.systemMatch || ""}
          onChange={e => set("systemMatch", e.target.value)} />
      </div>
    );
  }

  if (type === "launch_process") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Comando / Eseguibile</Label>
        <Input placeholder="C:\\Program Files\\vsp.exe" value={params.command || ""}
          onChange={e => set("command", e.target.value)} />
        <Label className="text-xs">Argomenti (separati da spazio)</Label>
        <Input placeholder="--arg1 value" value={(params.args || []).join(" ")}
          onChange={e => set("args", e.target.value.split(" ").filter(Boolean))} />
      </div>
    );
  }

  if (type === "run_local_script") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Script (PowerShell / bash)</Label>
        <Textarea rows={3} placeholder="# script..." value={params.script || ""}
          onChange={e => set("script", e.target.value)} />
        <Label className="text-xs">Tipo script</Label>
        <Select value={params.scriptType || "powershell"} onValueChange={v => set("scriptType", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="powershell">PowerShell</SelectItem>
            <SelectItem value="bash">Bash</SelectItem>
            <SelectItem value="cmd">CMD</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "mcp_health_check") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Config MCP</Label>
        <Select value={params.mcpConfigId || ""} onValueChange={v => set("mcpConfigId", v)}>
          <SelectTrigger><SelectValue placeholder="Seleziona config MCP..." /></SelectTrigger>
          <SelectContent>
            {mcpConfigs.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "manual_confirm") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Messaggio per l'utente (opzionale)</Label>
        <Input placeholder="Esegui il login manuale, poi clicca OK" value={params.message || ""}
          onChange={e => set("message", e.target.value)} />
      </div>
    );
  }

  return null;
}

// ── Single step row ──────────────────────────────────────────────────────────
function StepRow({
  step, index, total, onChange, onRemove, onMoveUp, onMoveDown,
  sapSystems, vpnConnections, mcpConfigs
}: {
  step: ConnectionStep; index: number; total: number;
  onChange: (s: ConnectionStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  sapSystems: any[]; vpnConnections: any[]; mcpConfigs: any[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STEP_TYPES.find(t => t.value === step.type);

  return (
    <Card className="border border-border">
      <CardContent className="p-3 space-y-3">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground w-5">{index + 1}.</span>
          <StepIcon type={step.type} />
          <div className="flex-1 min-w-0">
            <Select value={step.type} onValueChange={v =>
              onChange({ ...step, type: v as ConnectionStepType, actor: STEP_TYPES.find(t => t.value === v)?.actor ?? "human" })
            }>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEP_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant={step.actor === "auto" ? "default" : "secondary"} className="text-xs shrink-0">
            {step.actor === "auto" ? <Bot className="h-3 w-3 mr-1" /> : <User className="h-3 w-3 mr-1" />}
            {step.actor}
          </Badge>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveUp} disabled={index === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onMoveDown} disabled={index === total - 1}>
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(e => !e)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Label + actor + onFailure */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Etichetta</Label>
            <Input className="h-7 text-xs" placeholder="Descrizione passo..." value={step.label}
              onChange={e => onChange({ ...step, label: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Actor</Label>
            <Select value={step.actor} onValueChange={v => onChange({ ...step, actor: v as "auto" | "human" })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">🤖 Auto</SelectItem>
                <SelectItem value="human">👤 Human</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">In caso di errore</Label>
          <Select value={step.onFailure} onValueChange={v => onChange({ ...step, onFailure: v as any })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ON_FAILURE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Params editor */}
        {expanded && (
          <>
            <Separator />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parametri</div>
            <StepParamsEditor type={step.type} params={step.params} onChange={p => onChange({ ...step, params: p })}
              sapSystems={sapSystems} vpnConnections={vpnConnections} mcpConfigs={mcpConfigs} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Workflow form schema ──────────────────────────────────────────────────────
const wfFormSchema = z.object({
  name: z.string().min(1, "Nome richiesto"),
  sapSystemId: z.string().optional(),
});
type WfFormData = z.infer<typeof wfFormSchema>;

// ── Main component ────────────────────────────────────────────────────────────
export default function ConnectionWorkflowsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<ConnectionWorkflow | null>(null);
  const [steps, setSteps] = useState<ConnectionStep[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionWorkflow | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: workflows = [], isLoading } = useQuery<ConnectionWorkflow[]>({
    queryKey: ["/api/connection-workflows", currentOrganizationId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: sapSystems = [] } = useQuery<any[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: vpnConnections = [] } = useQuery<any[]>({
    queryKey: ["/api/vpn-connections"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: mcpConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/mcp/configs"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: InsertConnectionWorkflow) => apiRequest("POST", "/api/connection-workflows", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connection-workflows"] });
      setDialogOpen(false);
      toast({ title: "Workflow creato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertConnectionWorkflow> }) =>
      apiRequest("PATCH", `/api/connection-workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connection-workflows"] });
      setDialogOpen(false);
      toast({ title: "Workflow aggiornato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/connection-workflows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connection-workflows"] });
      setDeleteTarget(null);
      toast({ title: "Workflow eliminato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = useForm<WfFormData>({
    resolver: zodResolver(wfFormSchema),
    defaultValues: { name: "", sapSystemId: "none" },
  });

  const openCreate = () => {
    setEditingWorkflow(null);
    setSteps([]);
    form.reset({ name: "", sapSystemId: "none" });
    setDialogOpen(true);
  };

  const openEdit = (wf: ConnectionWorkflow) => {
    setEditingWorkflow(wf);
    setSteps((wf.steps as ConnectionStep[]) || []);
    form.reset({ name: wf.name, sapSystemId: wf.sapSystemId || "none" });
    setDialogOpen(true);
  };

  const handleSubmit = (values: WfFormData) => {
    const payload: InsertConnectionWorkflow = {
      name: values.name,
      organizationId: currentOrganizationId!,
      sapSystemId: values.sapSystemId && values.sapSystemId !== "none" ? values.sapSystemId : null,
      steps,
    };
    if (editingWorkflow) {
      updateMutation.mutate({ id: editingWorkflow.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // ── Step helpers ──────────────────────────────────────────────────────────
  const addStep = () => {
    const newStep: ConnectionStep = {
      id: nanoid(),
      type: "manual_confirm",
      actor: "human",
      label: "Nuovo passo",
      params: {},
      onFailure: "abort",
    };
    setSteps(s => [...s, newStep]);
  };

  const updateStep = (index: number, updated: ConnectionStep) =>
    setSteps(s => s.map((step, i) => (i === index ? updated : step)));

  const removeStep = (index: number) =>
    setSteps(s => s.filter((_, i) => i !== index));

  const moveStep = (index: number, dir: -1 | 1) =>
    setSteps(s => {
      const arr = [...s];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title="Connection Workflows" subtitle="Sequenze di connessione per sistemi SAP" />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <GitBranch className="h-6 w-6 text-primary" />
                Connection Workflows
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sequenze di passi per portare un sistema SAP allo stato &ldquo;pronto&rdquo;
              </p>
            </div>
            <Button onClick={openCreate} data-testid="button-create-workflow">
              <Plus className="h-4 w-4 mr-2" /> Nuovo Workflow
            </Button>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
              <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nessun connection workflow. Creane uno per iniziare.</p>
              <Button variant="outline" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" /> Crea il primo workflow
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {workflows.map((wf) => {
                const wfSteps = (wf.steps as ConnectionStep[]) || [];
                const sap = sapSystems.find((s: any) => s.id === wf.sapSystemId);
                const autoCount = wfSteps.filter(s => s.actor === "auto").length;
                const humanCount = wfSteps.filter(s => s.actor === "human").length;
                return (
                  <Card key={wf.id} className="hover:shadow-md transition-shadow" data-testid={`wf-card-${wf.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">{wf.name}</CardTitle>
                          {sap && (
                            <p className="text-xs text-muted-foreground mt-0.5">{sap.name}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(wf)}
                            data-testid={`button-edit-wf-${wf.id}`}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(wf)} data-testid={`button-delete-wf-${wf.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{wfSteps.length} passo{wfSteps.length !== 1 ? "i" : ""}</span>
                        {autoCount > 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Bot className="h-3 w-3" />{autoCount} auto
                          </Badge>
                        )}
                        {humanCount > 0 && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <User className="h-3 w-3" />{humanCount} human
                          </Badge>
                        )}
                      </div>
                      {/* Step pills */}
                      <div className="flex flex-wrap gap-1">
                        {wfSteps.map((s, i) => (
                          <div key={s.id}
                            className="flex items-center gap-1 text-xs bg-muted rounded px-1.5 py-0.5">
                            <span className="text-muted-foreground">{i + 1}.</span>
                            <StepIcon type={s.type} className="h-3 w-3" />
                            <span className="truncate max-w-20">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── Create/Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? "Modifica Workflow" : "Nuovo Connection Workflow"}</DialogTitle>
            <DialogDescription>
              Definisci la sequenza di passi per raggiungere il sistema SAP.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {/* Name */}
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="es. Telepass VPN + Portal Cookie" {...field} data-testid="input-wf-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* SAP System (optional) */}
              <FormField control={form.control} name="sapSystemId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sistema SAP (opzionale)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-wf-sap-system">
                        <SelectValue placeholder="Nessun sistema (template generico)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— Nessun sistema (template generico) —</SelectItem>
                      {sapSystems.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Associa il workflow a un sistema specifico.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <Separator />

              {/* Steps editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Passi ({steps.length})</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStep}
                    data-testid="button-add-step">
                    <Plus className="h-3 w-3 mr-1" /> Aggiungi passo
                  </Button>
                </div>

                {steps.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded">
                    Nessun passo. Clicca &ldquo;Aggiungi passo&rdquo; per iniziare.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {steps.map((step, i) => (
                      <StepRow
                        key={step.id}
                        step={step}
                        index={i}
                        total={steps.length}
                        onChange={updated => updateStep(i, updated)}
                        onRemove={() => removeStep(i)}
                        onMoveUp={() => moveStep(i, -1)}
                        onMoveDown={() => moveStep(i, 1)}
                        sapSystems={sapSystems}
                        vpnConnections={vpnConnections}
                        mcpConfigs={mcpConfigs}
                      />
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-workflow">
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingWorkflow ? "Salva modifiche" : "Crea workflow"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Il workflow <strong>{deleteTarget?.name}</strong> sarà eliminato definitivamente.
              I task che lo utilizzano perderanno l&apos;associazione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
