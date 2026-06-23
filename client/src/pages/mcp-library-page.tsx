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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, RefreshCw, Plus, Pencil, Trash2, Activity, BookOpen, Settings, CheckCircle2, XCircle, Clock, Plug, ChevronRight, ChevronLeft, ShieldAlert, ShieldCheck, ExternalLink, AlertCircle, Filter } from "lucide-react";
import type { McpCatalogWithValidation, McpServerConfig } from "@shared/schema";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog"] });
      toast({ title: "Server registrato!", description: `"${name}" aggiunto — validazione richiesta prima dell'uso.` });
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
      setOverrides(prev => {
        const next = { ...prev };
        if (next[toolName] === "write") delete next[toolName];
        else next[toolName] = "write";
        return next;
      });
    }
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

        {step === "url" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>URL Endpoint *</Label>
              <Input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="http://localhost:9090/mcp" data-testid="wizard-endpoint" onKeyDown={e => e.key === "Enter" && handleValidate()} />
              <p className="text-xs text-muted-foreground">Il server deve esporre un endpoint Streamable HTTP o SSE compatibile con MCP.</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
              I server custom nascono <strong>non validati</strong>. L'admin dovrà validarli dalla MCP Library prima che siano usabili dall'executor AI.
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
                Tool classification — clicca su un tool <Badge variant="outline" className="text-xs">read</Badge> per promuoverlo a <Badge variant="destructive" className="text-xs">write</Badge>
              </Label>
              <div className="border rounded divide-y max-h-72 overflow-y-auto">
                {effectiveTools.map(t => (
                  <div key={t.name} className="flex items-center gap-3 px-3 py-2">
                    {t.effectiveClass === "write" ? <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" /> : <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-mono font-semibold">{t.name}</code>
                      {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                    </div>
                    <button onClick={() => toggleOverride(t.name, t.classification)} title={t.classification === "write" ? "Classificazione write non modificabile" : (overrides[t.name] ? "Rimuovi override → read" : "Promuovi a write")}>
                      <Badge variant={t.effectiveClass === "write" ? "destructive" : "outline"} className={`text-xs ${t.classification === "read" ? "cursor-pointer hover:opacity-80" : "opacity-60"}`}>
                        {t.effectiveClass}{overrides[t.name] ? " (override)" : ""}
                      </Badge>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("url")}><ChevronLeft className="mr-1 h-4 w-4" />Indietro</Button>
              <Button variant="outline" onClick={handleRevalidate} disabled={validating}>
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Ri-valida</span>
              </Button>
              <Button onClick={() => setStep("confirm")} data-testid="wizard-next-confirm">Avanti <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </DialogFooter>
          </div>
        )}

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
                  <Switch checked={effectiveReadOnly} onCheckedChange={setReadOnly} disabled={environment === "PRD"} data-testid="wizard-readonly" />
                  <span className="text-sm">{effectiveReadOnly ? "Solo lettura" : "Lettura + scrittura"}</span>
                  {environment === "PRD" && <span className="text-xs text-muted-foreground">Forzato</span>}
                </div>
              </div>
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("tools")}><ChevronLeft className="mr-1 h-4 w-4" />Indietro</Button>
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

// ── Catalog Detail Dialog ────────────────────────────────────────────────────

function CatalogDetailDialog({ entryId, onClose, onValidationChange }: {
  entryId: string | null;
  onClose: () => void;
  onValidationChange: () => void;
}) {
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: detail, isLoading } = useQuery<any>({
    queryKey: ["/api/mcp/catalog", entryId, "details"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!entryId,
  });

  const validateMutation = useMutation({
    mutationFn: async (validated: boolean) =>
      apiRequest("PATCH", `/api/mcp/catalog/${entryId}/validate`, { validated }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog", entryId, "details"] });
      onValidationChange();
      toast({ title: detail?.validated ? "Validazione rimossa" : "Voce validata" });
    },
    onError: (err: any) => toast({ title: "Errore validazione", description: err.message, variant: "destructive" }),
  });

  const maturity = detail?.maturity as any;

  return (
    <Dialog open={!!entryId} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : detail ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>{detail.name}</span>
                {detail.category && <Badge variant="outline" className="text-xs">{detail.category}</Badge>}
                {maturity?.type && <Badge variant="secondary" className="text-xs">{maturity.type}</Badge>}
                {detail.stale && <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">stale</Badge>}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Meta info row */}
              <div className="flex items-center gap-3 flex-wrap text-sm">
                {detail.repoUrl && (
                  <a href={detail.repoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" />
                    GitHub
                  </a>
                )}
                {maturity?.license && <span className="text-muted-foreground">Licenza: <strong>{maturity.license}</strong></span>}
                <Badge variant={detail.writeCapable ? "destructive" : "outline"} className="text-xs">
                  {detail.writeCapable ? "write-capable" : "read-only"}
                </Badge>
                <Badge variant="secondary" className="text-xs">{detail.transport}</Badge>
              </div>

              {/* Description */}
              {detail.description && (
                <p className="text-sm text-muted-foreground">{detail.description}</p>
              )}

              {/* Validation toggle */}
              <div className="flex items-center justify-between p-3 rounded border bg-muted/30">
                <div className="flex items-center gap-2">
                  {detail.validated
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <AlertCircle className="h-4 w-4 text-amber-500" />}
                  <span className="text-sm font-medium">
                    {detail.validated ? "Validata per questa organizzazione" : "Non validata — l'executor AI ignorerà questo server"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={detail.validated ? "outline" : "default"}
                  onClick={() => validateMutation.mutate(!detail.validated)}
                  disabled={validateMutation.isPending}
                  data-testid="btn-toggle-validate"
                >
                  {validateMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {detail.validated ? "Rimuovi validazione" : "Valida"}
                </Button>
              </div>

              {/* README */}
              <div>
                <h3 className="text-sm font-semibold mb-2">README</h3>
                {detail.readmeMd ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none border rounded p-4 max-h-96 overflow-y-auto text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.readmeMd}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">README non disponibile per questa voce.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Chiudi</Button>
            </DialogFooter>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">Voce non trovata.</p>
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
  catalog: McpCatalogWithValidation[];
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
                <Switch checked={effectiveReadOnly} onCheckedChange={(v) => setReadOnly(v)} disabled={environment === "PRD"} data-testid="mcp-config-readonly" />
                {environment === "PRD" && <span className="text-xs text-muted-foreground">Forzato in PRD</span>}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Catalogo (opzionale)</Label>
            <Select value={catalogId} onValueChange={setCatalogId}>
              <SelectTrigger><SelectValue placeholder="Nessun catalogo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessun catalogo</SelectItem>
                {catalog.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.validated ? "✓" : "⚠"}
                  </SelectItem>
                ))}
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
  const [validatedOnlyFilter, setValidatedOnlyFilter] = useState(false);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [configDialog, setConfigDialog] = useState<{ open: boolean; editing: McpServerConfig | null }>({ open: false, editing: null });
  const [customWizardOpen, setCustomWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);
  const [healthLoading, setHealthLoading] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);

  const { data: catalog = [], isLoading: catalogLoading } = useQuery<McpCatalogWithValidation[]>({
    queryKey: ["/api/mcp/catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
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

  const validateCatalogMutation = useMutation({
    mutationFn: async ({ catalogId, validated }: { catalogId: string; validated: boolean }) =>
      apiRequest("PATCH", `/api/mcp/catalog/${catalogId}/validate`, { validated }),
    onSuccess: (_, { validated }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog"] });
      toast({ title: validated ? "✓ Server validato — usabile dall'AI" : "Validazione rimossa" });
    },
    onError: (err: any) => toast({ title: "Errore validazione", description: err.message, variant: "destructive" }),
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/mcp/catalog/sync");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog"] });
      toast({
        title: `Sincronizzazione completata`,
        description: `${data.inserted} nuovi, ${data.updated} aggiornati${data.stale ? `, ${data.stale} stale` : ""}${data.errors?.length ? `, ${data.errors.length} errori` : ""}`,
      });
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

  const filteredCatalog = catalog.filter(c => {
    const matchesText = !categoryFilter || c.category?.toLowerCase().includes(categoryFilter.toLowerCase()) || c.name.toLowerCase().includes(categoryFilter.toLowerCase());
    const matchesValidated = !validatedOnlyFilter || c.validated;
    return matchesText && matchesValidated;
  });

  const validatedCount = catalog.filter(c => c.validated).length;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        <Header title="MCP Library" subtitle="Catalogo server MCP e configurazioni per l'uso degli strumenti AI" />
        <div className="flex-1 p-6 overflow-auto">
          <Tabs defaultValue="catalog" className="space-y-4">
            <TabsList>
              <TabsTrigger value="catalog" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Catalogo
                {validatedCount > 0 && <Badge variant="secondary" className="ml-1">{validatedCount} validati</Badge>}
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
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Server MCP SAP disponibili</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      placeholder="Filtra catalogo..."
                      value={categoryFilter}
                      onChange={e => setCategoryFilter(e.target.value)}
                      className="w-44 h-8 text-sm"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={validatedOnlyFilter ? "default" : "outline"}
                          onClick={() => setValidatedOnlyFilter(v => !v)}
                          data-testid="btn-filter-validated"
                        >
                          <Filter className="h-3.5 w-3.5 mr-1" />
                          Solo validati
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Mostra solo le voci validate per questa organizzazione</TooltipContent>
                    </Tooltip>
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
                        <div
                          key={entry.id}
                          className="py-3 flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/30 rounded px-2 -mx-2 transition-colors"
                          onClick={() => setDetailEntryId(entry.id)}
                          data-testid={`catalog-row-${entry.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{entry.name}</span>
                              {entry.category && <Badge variant="outline" className="text-xs">{entry.category}</Badge>}
                              <Badge variant="secondary" className="text-xs">{entry.transport}</Badge>
                              {entry.writeCapable && <Badge variant="destructive" className="text-xs">write</Badge>}
                              {(entry as any).stale && <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">stale</Badge>}
                            </div>
                            {entry.description && <p className="text-xs text-muted-foreground mt-1 truncate">{entry.description}</p>}
                            {entry.repoUrl && (
                              <span className="text-xs text-primary mt-0.5 block truncate">{entry.repoUrl}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {entry.authModel && entry.authModel !== "none" && <Badge variant="outline" className="text-xs">{entry.authModel}</Badge>}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={entry.validated ? "text-green-600 hover:text-green-700" : "text-amber-500 hover:text-amber-600"}
                                  disabled={validateCatalogMutation.isPending}
                                  onClick={e => { e.stopPropagation(); validateCatalogMutation.mutate({ catalogId: entry.id, validated: !entry.validated }); }}
                                  data-testid={`btn-validate-catalog-${entry.id}`}
                                >
                                  {entry.validated
                                    ? <ShieldCheck className="h-4 w-4" />
                                    : <ShieldAlert className="h-4 w-4" />
                                  }
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{entry.validated ? "Validata ✓ — clicca per rimuovere" : "Non validata — clicca per abilitare all'AI"}</TooltipContent>
                            </Tooltip>
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
                      {configs.map(cfg => {
                        const catalogEntry = catalog.find(c => c.id === cfg.catalogId);
                        const isValidated = catalogEntry?.validated ?? false;
                        return (
                          <div key={cfg.id} className="py-3 flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{cfg.name}</span>
                                <Badge variant={cfg.environment === "PRD" ? "destructive" : cfg.environment === "QAS" ? "secondary" : "outline"} className="text-xs">
                                  {cfg.environment}
                                </Badge>
                                {cfg.readOnly && <Badge variant="outline" className="text-xs text-green-600">read-only</Badge>}
                                {cfg.enabled === false && <Badge variant="outline" className="text-xs text-muted-foreground">disabilitato</Badge>}
                                {cfg.catalogId && (
                                  isValidated
                                    ? <Tooltip>
                                        <TooltipTrigger asChild><span><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /></span></TooltipTrigger>
                                        <TooltipContent>Catalogo validato</TooltipContent>
                                      </Tooltip>
                                    : <Tooltip>
                                        <TooltipTrigger asChild><span><AlertCircle className="h-3.5 w-3.5 text-amber-500" /></span></TooltipTrigger>
                                        <TooltipContent>Catalogo non validato — skippato dall'executor AI</TooltipContent>
                                      </Tooltip>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{cfg.endpoint}</p>
                              <HealthBadge lastHealth={cfg.lastHealth} />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {cfg.catalogId && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className={isValidated ? "text-green-600 hover:text-green-700" : "text-amber-500 hover:text-amber-600"}
                                      disabled={validateCatalogMutation.isPending}
                                      onClick={() => validateCatalogMutation.mutate({ catalogId: cfg.catalogId!, validated: !isValidated })}
                                      data-testid={`btn-validate-${cfg.id}`}
                                    >
                                      {validateCatalogMutation.isPending
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : isValidated
                                          ? <ShieldCheck className="h-4 w-4" />
                                          : <ShieldAlert className="h-4 w-4" />
                                      }
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{isValidated ? "Validato ✓ — clicca per rimuovere" : "Non validato — clicca per validare e abilitare all'AI"}</TooltipContent>
                                </Tooltip>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleHealthCheck(cfg)} disabled={healthLoading[cfg.id]} title="Health Check" data-testid={`btn-health-${cfg.id}`}>
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
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Catalog detail dialog */}
        <CatalogDetailDialog
          entryId={detailEntryId}
          onClose={() => setDetailEntryId(null)}
          onValidationChange={() => queryClient.invalidateQueries({ queryKey: ["/api/mcp/catalog"] })}
        />

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
    </TooltipProvider>
  );
}
