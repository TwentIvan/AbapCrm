import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Plus, Pencil, Trash2, Activity, BookOpen, Settings, CheckCircle2, XCircle, Clock, Plug, ChevronRight, ChevronLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import type { McpCatalog, McpServerConfig } from "@shared/schema";

// ── 3-step Custom Server Registration Wizard ────────────────────────────────

type WizardStep = "url" | "tools" | "confirm";

interface ValidateResult {
  ok: boolean;
  transport: string;
  toolCount: number;
  readCount: number;
  writeCount: number;
  tools: { name: string; description?: string; classification: "read" | "write" }[];
  error?: string;
}

function CustomServerWizard({ open, onClose, projects, sapSystems }: {
  open: boolean;
  onClose: () => void;
  projects: any[];
  sapSystems: any[];
}) {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>("url");
  const [endpoint, setEndpoint] = useState("");
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, "read" | "write">>({});

  // Step 3 fields
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"DEV" | "QAS" | "PRD">("DEV");
  const [readOnly, setReadOnly] = useState(true);
  const [projectId, setProjectId] = useState("none");
  const [sapSystemId, setSapSystemId] = useState("none");
  const [saving, setSaving] = useState(false);

  const effectiveReadOnly = environment === "PRD" ? true : readOnly;

  const handleValidate = async () => {
    if (!endpoint.trim()) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await apiRequest("POST", "/api/mcp/custom/validate", {
        endpoint: endpoint.trim(),
        toolClassificationOverrides: overrides,
      });
      const data = await res.json();
      setValidateResult(data);
      if (data.ok) {
        setStep("tools");
        if (!name) setName(new URL(endpoint.trim()).hostname.split(".")[0] || "custom-mcp");
      } else {
        toast({ title: "Connessione fallita", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Errore validazione", description: err.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const handleRevalidate = async () => {
    setValidating(true);
    try {
      const res = await apiRequest("POST", "/api/mcp/custom/validate", {
        endpoint: endpoint.trim(),
        toolClassificationOverrides: overrides,
      });
      const data = await res.json();
      setValidateResult(data);
      if (!data.ok) toast({ title: "Server non raggiungibile", description: data.error, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obbligatorio", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/mcp/custom/register", {
        name: name.trim(),
        endpoint: endpoint.trim(),
        environment,
        readOnly: effectiveReadOnly,
        toolClassificationOverrides: overrides,
        projectId: projectId !== "none" ? projectId : null,
        sapSystemId: sapSystemId !== "none" ? sapSystemId : null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/configs"] });
      toast({ title: "Server registrato!", description: `"${name}" aggiunto alle configurazioni MCP.` });
      handleClose();
    } catch (err: any) {
      toast({ title: "Errore registrazione", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("url");
    setEndpoint("");
    setValidateResult(null);
    setOverrides({});
    setName("");
    setEnvironment("DEV");
    setReadOnly(true);
    setProjectId("none");
    setSapSystemId("none");
    onClose();
  };

  const toggleOverride = (toolName: string, currentClass: "read" | "write") => {
    if (currentClass === "read") {
      // Can only override read→write
      setOverrides(prev => {
        const next = { ...prev };
        if (next[toolName] === "write") delete next[toolName];
        else next[toolName] = "write";
        return next;
      });
    }
    // write→read not allowed
  };

  const tools = validateResult?.tools ?? [];
  const effectiveTools = tools.map(t => ({
    ...t,
    effectiveClass: overrides[t.name] === "write" && t.classification === "read" ? "write" as const : t.classification,
  }));

  const steps: { id: WizardStep; label: string }[] = [
    { id: "url", label: "1. Endpoint" },
    { id: "tools", label: "2. Tool" },
    { id: "confirm", label: "3. Configura" },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Registra Server MCP Custom
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1 text-xs mb-4">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded font-medium ${step === s.id ? "bg-primary text-primary-foreground" : steps.indexOf(steps.find(x => x.id === step)!) > i ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                {s.label}
              </span>
              {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 1: Endpoint */}
        {step === "url" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>URL Endpoint *</Label>
              <Input
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
                placeholder="http://localhost:9090/mcp"
                data-testid="wizard-endpoint"
                onKeyDown={e => e.key === "Enter" && handleValidate()}
              />
              <p className="text-xs text-muted-foreground">
                Il server deve esporre un endpoint Streamable HTTP o SSE compatibile con MCP.
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-xs text-blue-700 dark:text-blue-400">
              <strong>Sicurezza:</strong> i server custom non PRD con readOnly=false espongono tool write che richiedono <strong>approvazione umana</strong> prima di ogni esecuzione.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Annulla</Button>
              <Button onClick={handleValidate} disabled={!endpoint.trim() || validating} data-testid="wizard-test-connection">
                {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
                Testa Connessione
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Tool list + classification overrides */}
        {step === "tools" && validateResult && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 text-sm">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Connessione OK — {validateResult.transport}</span>
              </div>
              <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                {validateResult.toolCount} tool trovati ({validateResult.readCount} read, {validateResult.writeCount} write)
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Tool classification — clicca su un tool <Badge variant="outline" className="text-xs">read</Badge> per promuoverlo a <Badge variant="destructive" className="text-xs">write</Badge> (richiederà approvazione umana)
              </Label>
              <div className="border rounded divide-y max-h-72 overflow-y-auto">
                {effectiveTools.map(t => (
                  <div key={t.name} className="flex items-center gap-3 px-3 py-2">
                    {t.effectiveClass === "write"
                      ? <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      : <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-mono font-semibold">{t.name}</code>
                      {t.description && (
                        <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleOverride(t.name, t.classification)}
                      title={t.classification === "write" ? "Classificazione write non modificabile" : (overrides[t.name] ? "Rimuovi override → read" : "Promuovi a write (richiede approvazione)")}
                    >
                      <Badge
                        variant={t.effectiveClass === "write" ? "destructive" : "outline"}
                        className={`text-xs ${t.classification === "read" ? "cursor-pointer hover:opacity-80" : "opacity-60"}`}
                      >
                        {t.effectiveClass}{overrides[t.name] ? " (override)" : ""}
                      </Badge>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("url")}>
                <ChevronLeft className="mr-1 h-4 w-4" />Indietro
              </Button>
              <Button variant="outline" onClick={handleRevalidate} disabled={validating}>
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Ri-valida</span>
              </Button>
              <Button onClick={() => setStep("confirm")} data-testid="wizard-next-confirm">
                Avanti <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Name + config */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. SAP DEV Custom" data-testid="wizard-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={environment} onValueChange={v => setEnvironment(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEV">DEV</SelectItem>
                    <SelectItem value="QAS">QAS</SelectItem>
                    <SelectItem value="PRD">PRD — solo read</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Modalità</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={effectiveReadOnly}
                    onCheckedChange={setReadOnly}
                    disabled={environment === "PRD"}
                    data-testid="wizard-readonly"
                  />
                  <span className="text-sm">{effectiveReadOnly ? "Solo lettura" : "Lettura + scrittura (con approvazione)"}</span>
                  {environment === "PRD" && <span className="text-xs text-muted-foreground">Forzato</span>}
                </div>
              </div>
            </div>
            {!effectiveReadOnly && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-3 text-xs text-amber-700 dark:text-amber-400">
                <ShieldAlert className="h-3.5 w-3.5 inline mr-1" />
                I tool write richiedono <strong>approvazione umana</strong> prima dell'esecuzione. Vedrai le richieste nel tab "Approvazioni" di ogni task.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Progetto (opzionale)</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tutti</SelectItem>
                    {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sistema SAP (opzionale)</Label>
                <Select value={sapSystemId} onValueChange={setSapSystemId}>
                  <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tutti</SelectItem>
                    {sapSystems.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("tools")}>
                <ChevronLeft className="mr-1 h-4 w-4" />Indietro
              </Button>
              <Button onClick={handleRegister} disabled={!name.trim() || saving} data-testid="wizard-register">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plug className="mr-2 h-4 w-4" />
                Registra Server
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Health indicator ────────────────────────────────────────────────────────
function HealthBadge({ lastHealth }: { lastHealth: any }) {
  if (!lastHealth) return <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />N/A</span>;
  if (lastHealth.ok) {
    return (
      <span className="text-xs text-green-600 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        OK · {lastHealth.readToolCount ?? "?"} read tool{lastHealth.readToolCount !== 1 ? "s" : ""}
      </span>
    );
  }
  return (
    <span className="text-xs text-red-500 flex items-center gap-1">
      <XCircle className="h-3 w-3" />
      {lastHealth.error?.slice(0, 60) ?? "Error"}
    </span>
  );
}

// ── Config form dialog ───────────────────────────────────────────────────────
interface ConfigFormProps {
  open: boolean;
  onClose: () => void;
  initial?: McpServerConfig | null;
  catalog: McpCatalog[];
  projects: any[];
  sapSystems: any[];
}

function ConfigFormDialog({ open, onClose, initial, catalog, projects, sapSystems }: ConfigFormProps) {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState(initial?.name ?? "");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "");
  const [environment, setEnvironment] = useState(initial?.environment ?? "DEV");
  const [readOnly, setReadOnly] = useState(initial?.readOnly ?? true);
  const [catalogId, setCatalogId] = useState(initial?.catalogId ?? "none");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "none");
  const [sapSystemId, setSapSystemId] = useState(initial?.sapSystemId ?? "none");
  const [toolAllowlist, setToolAllowlist] = useState((initial?.toolAllowlist as string[] | null)?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  // PRD guardrail: force readOnly when environment is PRD
  const effectiveReadOnly = environment === "PRD" ? true : readOnly;

  const handleSave = async () => {
    if (!name.trim() || !endpoint.trim()) {
      toast({ title: "Nome ed endpoint sono obbligatori", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        endpoint: endpoint.trim(),
        environment,
        readOnly: effectiveReadOnly,
        catalogId: catalogId !== "none" ? catalogId : null,
        projectId: projectId !== "none" ? projectId : null,
        sapSystemId: sapSystemId !== "none" ? sapSystemId : null,
        toolAllowlist: toolAllowlist.split(",").map(s => s.trim()).filter(Boolean),
        enabled: true,
      };
      if (initial) {
        await apiRequest("PATCH", `/api/mcp/configs/${initial.id}`, body);
      } else {
        await apiRequest("POST", "/api/mcp/configs", body);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/configs"] });
      toast({ title: initial ? "Configurazione aggiornata" : "Configurazione creata" });
      onClose();
    } catch (err: any) {
      toast({ title: "Errore salvataggio", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Modifica Configurazione MCP" : "Nuova Configurazione MCP"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. SAP DEV MCP" data-testid="mcp-config-name" />
          </div>
          <div className="space-y-1">
            <Label>Endpoint *</Label>
            <Input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="http://localhost:9090/mcp" data-testid="mcp-config-endpoint" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Ambiente</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger data-testid="mcp-config-env"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEV">DEV</SelectItem>
                  <SelectItem value="QAS">QAS</SelectItem>
                  <SelectItem value="PRD">PRD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Solo Lettura</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={effectiveReadOnly}
                  onCheckedChange={(v) => setReadOnly(v)}
                  disabled={environment === "PRD"}
                  data-testid="mcp-config-readonly"
                />
                {environment === "PRD" && (
                  <span className="text-xs text-muted-foreground">Forzato in PRD</span>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Catalogo (opzionale)</Label>
            <Select value={catalogId} onValueChange={setCatalogId}>
              <SelectTrigger><SelectValue placeholder="Nessun catalogo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessun catalogo</SelectItem>
                {catalog.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Progetto (opzionale)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tutti</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sistema SAP (opzionale)</Label>
              <Select value={sapSystemId} onValueChange={setSapSystemId}>
                <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tutti</SelectItem>
                  {sapSystems.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Allowlist Tool (opzionale, separati da virgola)</Label>
            <Input value={toolAllowlist} onChange={e => setToolAllowlist(e.target.value)} placeholder="sap_ping, sap_get_status" data-testid="mcp-config-allowlist" />
            <p className="text-xs text-muted-foreground">Se vuoto, tutti i tool read vengono esposti al modello.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="mcp-config-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function McpLibraryPage() {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [configDialog, setConfigDialog] = useState<{ open: boolean; editing: McpServerConfig | null }>({ open: false, editing: null });
  const [customWizardOpen, setCustomWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);
  const [healthLoading, setHealthLoading] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);

  const { data: catalog = [], isLoading: catalogLoading } = useQuery<McpCatalog[]>({
    queryKey: ["/api/mcp/catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: configs = [], isLoading: configsLoading } = useQuery<McpServerConfig[]>({
    queryKey: ["/api/mcp/configs"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: sapSystems = [] } = useQuery<any[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/mcp/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/configs"] });
      toast({ title: "Configurazione eliminata" });
      setDeleteTarget(null);
    },
    onError: (err: any) => toast({ title: "Errore eliminazione", description: err.message, variant: "destructive" }),
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/mcp/catalog/sync");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog"] });
      toast({ title: `Sincronizzazione completata`, description: `${data.inserted} nuovi, ${data.updated} aggiornati${data.errors?.length ? `, ${data.errors.length} errori` : ""}` });
    } catch (err: any) {
      toast({ title: "Errore sincronizzazione", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleHealthCheck = async (cfg: McpServerConfig) => {
    setHealthLoading(prev => ({ ...prev, [cfg.id]: true }));
    try {
      const res = await apiRequest("POST", `/api/mcp/configs/${cfg.id}/health`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/configs"] });
      toast({ title: data.ok ? "Server raggiungibile" : "Server non raggiungibile", description: data.ok ? `${data.readToolCount} tool read disponibili (${data.transport})` : data.error });
    } catch (err: any) {
      toast({ title: "Errore health check", description: err.message, variant: "destructive" });
    } finally {
      setHealthLoading(prev => ({ ...prev, [cfg.id]: false }));
    }
  };

  const filteredCatalog = categoryFilter
    ? catalog.filter(c => c.category?.toLowerCase().includes(categoryFilter.toLowerCase()) || c.name.toLowerCase().includes(categoryFilter.toLowerCase()))
    : catalog;

  const categories = Array.from(new Set(catalog.map(c => c.category).filter(Boolean)));

  return (
    <div className="flex flex-col h-full">
      <Header title="MCP Library" subtitle="Catalogo server MCP e configurazioni per l'uso degli strumenti AI" />
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="catalog" className="space-y-4">
          <TabsList>
            <TabsTrigger value="catalog" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Catalogo
            </TabsTrigger>
            <TabsTrigger value="configs" className="flex items-center gap-2" data-testid="tab-mcp-configs">
              <Settings className="h-4 w-4" />
              Configurazioni
              {configs.length > 0 && <Badge variant="secondary" className="ml-1">{configs.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ─── Catalogo ─── */}
          <TabsContent value="catalog">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Server MCP SAP disponibili</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Filtra catalogo..."
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="w-48 h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} data-testid="btn-sync-catalog">
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-1">Sincronizza</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {catalogLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filteredCatalog.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {catalog.length === 0
                      ? 'Catalogo vuoto. Clicca "Sincronizza" per caricare i server MCP dal registry.'
                      : "Nessun risultato per questo filtro."}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredCatalog.map(entry => (
                      <div key={entry.id} className="py-3 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{entry.name}</span>
                            {entry.category && <Badge variant="outline" className="text-xs">{entry.category}</Badge>}
                            <Badge variant="secondary" className="text-xs">{entry.transport}</Badge>
                            {entry.writeCapable && <Badge variant="destructive" className="text-xs">write</Badge>}
                          </div>
                          {entry.description && <p className="text-xs text-muted-foreground mt-1 truncate">{entry.description}</p>}
                          {entry.repoUrl && (
                            <a href={entry.repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-0.5 block truncate">
                              {entry.repoUrl}
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {entry.authModel && entry.authModel !== "none" && <Badge variant="outline" className="text-xs">{entry.authModel}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Configurazioni ─── */}
          <TabsContent value="configs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Configurazioni server MCP</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCustomWizardOpen(true)} data-testid="btn-custom-wizard">
                    <Plug className="h-4 w-4 mr-1" />
                    Registra Custom
                  </Button>
                  <Button size="sm" onClick={() => setConfigDialog({ open: true, editing: null })} data-testid="btn-new-mcp-config">
                    <Plus className="h-4 w-4 mr-1" />
                    Nuova Configurazione
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {configsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : configs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nessuna configurazione. Crea una nuova configurazione per connettere un server MCP.
                  </div>
                ) : (
                  <div className="divide-y">
                    {configs.map(cfg => (
                      <div key={cfg.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{cfg.name}</span>
                            <Badge variant={cfg.environment === "PRD" ? "destructive" : cfg.environment === "QAS" ? "secondary" : "outline"} className="text-xs">
                              {cfg.environment}
                            </Badge>
                            {cfg.readOnly && <Badge variant="outline" className="text-xs text-green-600">read-only</Badge>}
                            {cfg.enabled === false && <Badge variant="outline" className="text-xs text-muted-foreground">disabilitato</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{cfg.endpoint}</p>
                          <HealthBadge lastHealth={cfg.lastHealth} />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => handleHealthCheck(cfg)}
                            disabled={healthLoading[cfg.id]}
                            title="Health Check"
                            data-testid={`btn-health-${cfg.id}`}
                          >
                            {healthLoading[cfg.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfigDialog({ open: true, editing: cfg })} data-testid={`btn-edit-${cfg.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(cfg)} data-testid={`btn-delete-${cfg.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Config form dialog */}
      {configDialog.open && (
        <ConfigFormDialog
          open={configDialog.open}
          onClose={() => setConfigDialog({ open: false, editing: null })}
          initial={configDialog.editing}
          catalog={catalog}
          projects={projects}
          sapSystems={sapSystems}
        />
      )}

      {/* Custom server registration wizard */}
      <CustomServerWizard
        open={customWizardOpen}
        onClose={() => setCustomWizardOpen(false)}
        projects={projects}
        sapSystems={sapSystems}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina configurazione</AlertDialogTitle>
            <AlertDialogDescription>
              Stai eliminando "{deleteTarget?.name}". I task che la usavano non potranno più accedere a questo server MCP. Questa azione non è reversibile.
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
