import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { UniversalTable, createStandardColumns, type TableColumn } from "@/components/ui/universal-table";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { useTableLayout } from "@/lib/user-preferences";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Clock, AlertCircle, Eye, Sparkles, Loader2, TrendingUp, Link2, MessageSquare, Send, Bot, User } from "lucide-react";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Proposal } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface EntityItem {
  type: string;          // entity type label, e.g. "Partner", "Task"
  description: string;   // entity name/title
  targetPath?: string;   // navigation target (when the entity exists)
}

// Maps an entity type to its detail/edit route (when an id is available).
function buildTargetPath(type: string, id?: string): string | undefined {
  if (!id) return undefined;
  switch (type) {
    case "Partner": return `/partners/${id}/edit`;
    case "Progetto": return `/projects/${id}/edit`;
    case "Task": return `/tasks/${id}/edit`;
    case "Sistema SAP": return `/sap-systems/${id}/edit`;
    case "Connessione": return `/vpn-connections/${id}/edit`;
    case "Contatto": return `/contacts`;
    default: return undefined;
  }
}

function getProposedEntityItems(pd: any): EntityItem[] {
  if (!pd || pd.processing || pd.failed) return [];
  const items: EntityItem[] = [];
  const push = (type: string, description?: string, id?: string) => {
    if (description) items.push({ type, description, targetPath: buildTargetPath(type, id) });
  };
  if (pd.partner) push("Partner", pd.partner.name, pd.partner.id);
  if (pd.project) push("Progetto", pd.project.name, pd.project.id);
  pd.tasks?.forEach((t: any) => push("Task", t.title, t.id));
  pd.contacts?.forEach((c: any) => push("Contatto", c.name, c.id));
  pd.systems?.forEach((s: any) => push("Sistema SAP", s.name || s.systemId, s.id));
  pd.connections?.forEach((c: any) => push("Connessione", c.name || c.connectionId, c.id));
  return items;
}

function getCreatedEntityItems(proposal: Proposal): EntityItem[] {
  const pd = proposal.proposalData as any;
  if (!pd || pd.processing || pd.failed) return [];
  if (proposal.status !== "accepted" && proposal.status !== "partially_accepted") return [];
  const items: EntityItem[] = [];
  const push = (type: string, description?: string, id?: string) => {
    if (description) items.push({ type, description, targetPath: buildTargetPath(type, id) });
  };
  if (pd.partner?.isNew) push("Partner", pd.partner.name, pd.partner.id);
  if (pd.project?.isNew) push("Progetto", pd.project.name, pd.project.id);
  pd.tasks?.filter((t: any) => t.isNew).forEach((t: any) => push("Task", t.title, t.id));
  pd.contacts?.forEach((c: any) => push("Contatto", c.name, c.id));
  // Systems/connections: only count those actually created (apply writes back their id)
  pd.systems?.filter((s: any) => s.id).forEach((s: any) => push("Sistema SAP", s.name || s.systemId, s.id));
  pd.connections?.filter((c: any) => c.id).forEach((c: any) => push("Connessione", c.name || c.connectionId, c.id));
  return items;
}

function EntityCountBadge({
  items,
  variant = "proposed",
  testId,
  onOpen,
}: {
  items: EntityItem[];
  variant?: "proposed" | "created";
  testId?: string;
  onOpen: (label: string, items: EntityItem[]) => void;
}) {
  const total = items.length;
  if (total === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  const bg = variant === "created" ? "bg-success" : "bg-primary";
  const label = variant === "created" ? "Entità create" : "Entità proposte";
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onOpen(label, items);
  };
  return (
    <button
      type="button"
      className={`flex items-center justify-center w-8 h-8 rounded-full ${bg} text-primary-foreground font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity z-50 relative`}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => { e.stopPropagation(); e.preventDefault(); handleClick(e); }}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid={testId}
    >
      {total}
    </button>
  );
}

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "In sospeso", icon: Clock, className: "bg-warning/10 text-warning" },
  accepted: { label: "Accettata", icon: Check, className: "bg-success/10 text-success" },
  rejected: { label: "Rigettata", icon: X, className: "bg-destructive/10 text-destructive" },
  partially_accepted: { label: "Parz. accettata", icon: AlertCircle, className: "bg-primary/10 text-primary" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.className} text-xs flex items-center gap-1 w-fit`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [detailTab, setDetailTab] = useState<"detail" | "discussion">("detail");
  const [entityPreview, setEntityPreview] = useState<{ label: string; items: EntityItem[] } | null>(null);
  const [discussionInput, setDiscussionInput] = useState("");
  const [selectedProposals, setSelectedProposals] = useState<Proposal[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { currentOrganizationId } = useOrganization();
  const [, setLocation] = useLocation();

  const openEntityPreview = (label: string, items: EntityItem[]) => {
    setEntityPreview({ label, items });
  };

  const {
    layout,
    currentLayoutName,
    savedLayouts,
    updateLayout,
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
  } = useTableLayout("proposals");

  // ── Data ──

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/proposals"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const { data: discussions = [], isLoading: isLoadingDiscussions } = useQuery<any[]>({
    queryKey: ["/api/proposals", selectedProposal?.id, "discussions"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedProposal,
    refetchInterval: false,
  });

  // ── Sync selected proposal with latest data ──

  useEffect(() => {
    if (selectedProposal && proposals.length > 0) {
      const updated = proposals.find(p => p.id === selectedProposal.id);
      if (updated && JSON.stringify(updated.proposalData) !== JSON.stringify(selectedProposal.proposalData)) {
        setSelectedProposal(updated);
      }
    }
  }, [proposals, selectedProposal]);

  // ── Mutations ──

  const applyProposalMutation = useMutation({
    mutationFn: (proposalId: string) => apiRequest("POST", `/api/proposals/${proposalId}/apply`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/partners"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Proposta applicata", description: "Le entità sono state create con successo" });
      setShowApplyDialog(false);
      setShowDetailDialog(false);
      setSelectedProposal(null);
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message || "Impossibile applicare la proposta", variant: "destructive" });
    },
  });

  const rejectProposalMutation = useMutation({
    mutationFn: (proposalId: string) => apiRequest("POST", `/api/proposals/${proposalId}/reject`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: "Proposta rigettata" });
      setShowRejectDialog(false);
      setShowDetailDialog(false);
      setSelectedProposal(null);
    },
  });

  const deleteProposalMutation = useMutation({
    mutationFn: (proposalId: string) => apiRequest("DELETE", `/api/proposals/${proposalId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: "Proposta eliminata" });
      setShowDetailDialog(false);
      setSelectedProposal(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await apiRequest("DELETE", `/api/proposals/${id}`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      setSelectedProposals([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Proposte eliminate" });
    },
  });

  const discussionMutation = useMutation({
    mutationFn: async (message: string) => {
      const resp = await apiRequest("POST", `/api/proposals/${selectedProposal!.id}/discussions`, { message });
      return resp.json();
    },
    onMutate: async (message: string) => {
      const key = ["/api/proposals", selectedProposal?.id, "discussions"];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<any[]>(key) || [];
      qc.setQueryData<any[]>(key, [...previous, {
        id: `optimistic-${Date.now()}`, role: "user", content: message,
        createdAt: new Date().toISOString(), _optimistic: true,
      }]);
      setDiscussionInput("");
      return { previous, key };
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/proposals", selectedProposal?.id, "discussions"] });
      if (data.proposalUpdated) qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.key && context?.previous) qc.setQueryData(context.key, context.previous);
      toast({ title: "Errore", description: "Impossibile inviare il messaggio", variant: "destructive" });
    },
  });

  const finalizeDecisionMutation = useMutation({
    mutationFn: ({ proposalId, action }: { proposalId: string; action: "accept" | "reject" }) =>
      apiRequest("POST", `/api/proposals/${proposalId}/finalize-decision`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({ title: "Decisione registrata" });
    },
  });

  // ── Table columns (UniversalTable format, like Projects page) ──

  const columns: TableColumn[] = [
    {
      key: "status",
      label: "Stato",
      sortable: true,
      searchable: false,
      render: (proposal: Proposal) => {
        const pd = proposal.proposalData as any;
        if (pd?.processing && !pd?.failed) {
          return (
            <Badge className="bg-blue-500/10 text-blue-500 text-xs flex items-center gap-1 w-fit">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analisi...
            </Badge>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={proposal.status} />
            {proposal.errorMessage && (
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" title={proposal.errorMessage} />
            )}
          </div>
        );
      },
    },
    {
      key: "proposedEntities",
      label: "Entità proposte",
      sortable: false,
      searchable: false,
      render: (proposal: Proposal) => (
        <EntityCountBadge
          items={getProposedEntityItems(proposal.proposalData)}
          variant="proposed"
          testId={`badge-proposed-${proposal.id}`}
          onOpen={openEntityPreview}
        />
      ),
    },
    {
      key: "createdEntities",
      label: "Entità create",
      sortable: false,
      searchable: false,
      render: (proposal: Proposal) => (
        <EntityCountBadge
          items={getCreatedEntityItems(proposal)}
          variant="created"
          testId={`badge-created-${proposal.id}`}
          onOpen={openEntityPreview}
        />
      ),
    },
    {
      key: "estimatedTokens",
      label: "Token previsti",
      sortable: true,
      searchable: false,
      accessor: (proposal: Proposal) => (proposal.estimateTokensMin || 0) + (proposal.estimateTokensMax || 0),
      render: (proposal: Proposal) => {
        const min = proposal.estimateTokensMin;
        const max = proposal.estimateTokensMax;
        if (!min && !max) return <span className="text-sm text-muted-foreground">-</span>;
        return (
          <span className="text-sm">
            {(min || 0).toLocaleString()} – {(max || 0).toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "spentTokens",
      label: "Token spesi",
      sortable: true,
      searchable: false,
      accessor: (proposal: Proposal) => (proposal.promptTokens || 0) + (proposal.completionTokens || 0),
      render: (proposal: Proposal) => {
        const pt = proposal.promptTokens || 0;
        const ct = proposal.completionTokens || 0;
        const total = pt + ct;
        return total > 0 ? (
          <span className="text-sm" title={`${pt.toLocaleString()}↑ ${ct.toLocaleString()}↓`}>
            {total.toLocaleString()}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        );
      },
    },
    {
      key: "modelKey",
      label: "Modello",
      sortable: true,
      searchable: true,
      render: (proposal: Proposal) => proposal.modelKey ? (
        <Badge variant="outline" className="text-xs gap-1">
          <Bot className="w-3 h-3" />
          {proposal.modelKey.replace(/^(openai|anthropic)\//, "")}
        </Badge>
      ) : <span className="text-sm text-muted-foreground">-</span>,
    },
    {
      key: "createdAt",
      label: "Data",
      sortable: true,
      searchable: false,
      render: (proposal: Proposal) => (
        <span className="text-sm">
          {format(new Date(proposal.createdAt), "dd MMM yyyy HH:mm", { locale: it })}
        </span>
      ),
    },
  ];

  // Apply layout configuration
  const visibleColumns = useMemo(() => {
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return columns;
    }
    return columns
      .filter(col => {
        const config = layout.columns[col.key];
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[a.key]?.position ?? 999;
        const posB = layout.columns[b.key]?.position ?? 999;
        return posA - posB;
      });
  }, [columns, layout.columns]);

  // ── Handlers ──

  const handleRowClick = (proposal: any) => {
    setSelectedProposal(proposal as Proposal);
    setDetailTab("detail");
    setShowDetailDialog(true);
  };

  const handleBulkDelete = () => {
    if (selectedProposals.length > 0) setShowBulkDeleteDialog(true);
  };

  // ── Render proposal data (detail view) ──

  const renderProposalData = (proposalData: any) => {
    if (!proposalData || (proposalData.processing && !proposalData.failed)) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Analisi in corso...</span>
        </div>
      );
    }
    if (proposalData.failed) {
      return <div className="text-destructive text-sm">Analisi fallita. Controlla i dettagli dell'errore.</div>;
    }

    return (
      <div className="space-y-6">
        {proposalData.reasoning && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Ragionamento AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposalData.reasoning}</p>
            </CardContent>
          </Card>
        )}

        {proposalData.partner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Partner</CardTitle>
              <CardDescription>
                {proposalData.partner.isNew ? <><Link2 className="h-4 w-4 inline mr-1" />Nuovo partner da creare</> : <><Link2 className="h-4 w-4 inline mr-1" />Partner esistente</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div><strong>Nome:</strong> {proposalData.partner.name}</div>
              {proposalData.partner.email && <div><strong>Email:</strong> {proposalData.partner.email}</div>}
              {proposalData.partner.company && <div><strong>Azienda:</strong> {proposalData.partner.company}</div>}
              <div><strong>Tipo:</strong> {proposalData.partner.type}</div>
            </CardContent>
          </Card>
        )}

        {proposalData.contacts?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contatti di riferimento ({proposalData.contacts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {proposalData.contacts.map((contact: any, idx: number) => (
                  <div key={idx} className="border-l-2 border-primary/50 pl-3 py-1 space-y-1">
                    <div className="font-medium">{contact.name}</div>
                    <div className="text-sm text-muted-foreground">{contact.email}</div>
                    {contact.position && <div className="text-sm"><strong>Ruolo:</strong> {contact.position}</div>}
                    {contact.company && <div className="text-sm"><strong>Azienda:</strong> {contact.company}</div>}
                    {contact.phone && <div className="text-sm"><strong>Telefono:</strong> {contact.phone}</div>}
                    {contact.notes && <div className="text-sm text-muted-foreground italic mt-1">{contact.notes}</div>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {proposalData.project && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Progetto</CardTitle>
              <CardDescription>
                {proposalData.project.isNew ? <><Link2 className="h-4 w-4 inline mr-1" />Nuovo progetto da creare</> : <><Link2 className="h-4 w-4 inline mr-1" />Progetto esistente</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div><strong>Nome:</strong> {proposalData.project.name}</div>
              {proposalData.project.description && <div><strong>Descrizione:</strong> {proposalData.project.description}</div>}
              <div><strong>Stato:</strong> {proposalData.project.status}</div>
              {proposalData.project.estimatedEffort && <div><strong>Sforzo stimato:</strong> {proposalData.project.estimatedEffort}h</div>}
            </CardContent>
          </Card>
        )}

        {proposalData.tasks?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Task ({proposalData.tasks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {proposalData.tasks.map((task: any, idx: number) => (
                  <div key={idx} className="border-l-2 border-primary pl-3 py-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{task.title}</div>
                        {task.description && <div className="text-sm text-muted-foreground">{task.description}</div>}
                        <div className="flex gap-2 mt-1 text-xs">
                          <Badge variant="outline">{task.priority}</Badge>
                          <Badge variant="outline">{task.taskType}</Badge>
                          {task.estimatedEffort && <Badge variant="outline">{task.estimatedEffort}h</Badge>}
                        </div>
                        {task.aiSpec && (
                          <div className="mt-2 space-y-1 text-xs">
                            {task.aiSpec.objective && <div><span className="text-muted-foreground">Obiettivo:</span> {task.aiSpec.objective}</div>}
                            {task.aiSpec.complexity && <Badge variant="outline">Complessità {task.aiSpec.complexity}</Badge>}
                            {task.aiSpec.proposedMcpConfigs?.length > 0 ? (
                              <div>
                                <span className="text-muted-foreground">Server MCP proposti:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {task.aiSpec.proposedMcpConfigs.map((m: any, i: number) => (
                                    <Badge key={i} variant="secondary" title={m.reason}>
                                      {m.name}{m.category ? ` · ${m.category}` : ""}{m.write ? " · write" : " · read"}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : task.aiSpec.requiredMcpCategories?.length > 0 ? (
                              <div><span className="text-muted-foreground">Categorie MCP:</span> {task.aiSpec.requiredMcpCategories.join(", ")}</div>
                            ) : (
                              <div className="text-muted-foreground italic">Nessun server MCP proposto</div>
                            )}
                            {task.aiSpec.acceptanceCriteria?.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">Criteri di accettazione:</span>
                                <ul className="list-disc ml-4">{task.aiSpec.acceptanceCriteria.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
                              </div>
                            )}
                            {task.aiSpec.openQuestions?.length > 0 && (
                              <div className="text-warning">Domande aperte: {task.aiSpec.openQuestions.join(" · ")}</div>
                            )}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary" className="ml-2">{task.isNew ? "Nuovo" : "Esistente"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {proposalData.needsClarification && proposalData.clarificationQuestions?.length > 0 && (
          <Card className="border-warning/30 bg-warning/10">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-warning">
                <Sparkles className="w-4 h-4" />
                Chiarimenti necessari
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc ml-4 space-y-1 text-sm">
                {proposalData.clarificationQuestions.map((q: string, i: number) => (
                  <li key={i} className="text-warning">{q}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {proposalData.systems?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Sistemi SAP ({proposalData.systems.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {proposalData.systems.map((sys: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={sys.needsManualConfig ? "text-warning border-warning/30" : "text-success border-success/30"}>
                      {sys.needsManualConfig ? "Nuovo" : "Esistente"}
                    </Badge>
                    <span className="font-medium">{sys.name || sys.systemId}</span>
                    {sys.type && <span className="text-muted-foreground">· {sys.type}</span>}
                    {sys.environment && <span className="text-muted-foreground">· {sys.environment}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {proposalData.connections?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Connessioni ({proposalData.connections.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {proposalData.connections.map((conn: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={conn.needsManualConfig ? "text-warning border-warning/30" : "text-success border-success/30"}>
                      {conn.needsManualConfig ? "Da configurare" : "Configurata"}
                    </Badge>
                    <span className="font-medium">{conn.name || conn.connectionId}</span>
                    {conn.type && <span className="text-muted-foreground">· {conn.type}</span>}
                    {conn.reason && <span className="text-muted-foreground italic">— {conn.reason}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ── Main Render ──

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header
          title="Proposte AI"
          subtitle="Gestisci le proposte generate dall'intelligenza artificiale"
        />

        <div
          className="p-6 rounded-t-lg min-h-full"
          style={{
            borderTop: '2px solid hsl(var(--brand) / 0.3)',
            borderLeft: '2px solid hsl(var(--brand) / 0.3)',
            borderRight: '2px solid hsl(var(--brand) / 0.3)',
          }}
        >
          {/* Toolbar (same as Partner/Projects pages) */}
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onDeleteSelected={handleBulkDelete}
            hasSelection={selectedProposals.length > 0}
          />

          {/* Table */}
          {isLoading && proposals.length === 0 ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nessuna proposta</h3>
              <p className="text-muted-foreground mb-4">Le proposte vengono generate analizzando i messaggi email</p>
            </div>
          ) : (
            <UniversalTable
              data={proposals}
              columns={visibleColumns}
              enableSelection={true}
              onSelectionChange={(rows) => setSelectedProposals(rows as Proposal[])}
              onRowClick={handleRowClick}
            />
          )}
        </div>
      </main>

      {/* ── Table Configuration Dialog ── */}
      <TableConfiguration
        isOpen={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        tableId="proposals"
        availableColumns={[
          { id: "status", label: "Stato" },
          { id: "proposedEntities", label: "Entità proposte" },
          { id: "createdEntities", label: "Entità create" },
          { id: "estimatedTokens", label: "Token previsti" },
          { id: "spentTokens", label: "Token spesi" },
          { id: "modelKey", label: "Modello" },
          { id: "createdAt", label: "Data" },
        ]}
        editingLayout={editingLayout}
        onSave={(layoutData) => {
          const { layoutName, saveAsDefault, ...config } = layoutData;
          if (layoutName && layoutName !== "Default" && layoutName !== "default") {
            saveLayoutAs(layoutName);
          }
          updateLayout(config);
          setShowConfigDialog(false);
        }}
        onCancel={() => setShowConfigDialog(false)}
      />

      {/* ── Detail Dialog (proposal detail + discussion) ── */}
      <Dialog open={showDetailDialog} onOpenChange={(open) => { setShowDetailDialog(open); if (!open) setSelectedProposal(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Dettaglio Proposta
              </DialogTitle>
              {selectedProposal && (
                <div className="flex gap-2">
                  {selectedProposal.status === "pending" && !(selectedProposal.proposalData as any)?.processing && (
                    <>
                      <Button size="sm" variant="default" onClick={() => {
                        if (discussions.length > 0) finalizeDecisionMutation.mutate({ proposalId: selectedProposal.id, action: "accept" });
                        setShowApplyDialog(true);
                      }} data-testid="button-apply-proposal">
                        <Check className="w-4 h-4 mr-1" />Applica
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => {
                        if (discussions.length > 0) finalizeDecisionMutation.mutate({ proposalId: selectedProposal.id, action: "reject" });
                        setShowRejectDialog(true);
                      }} data-testid="button-reject-proposal">
                        <X className="w-4 h-4 mr-1" />Rigetta
                      </Button>
                    </>
                  )}
                  {selectedProposal.status !== "pending" && (
                    <Button size="sm" variant="destructive" onClick={() => deleteProposalMutation.mutate(selectedProposal.id)} data-testid="button-delete-proposal">
                      Elimina
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {selectedProposal && (
              <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)}>
                <TabsList className="mb-3">
                  <TabsTrigger value="detail" className="gap-1.5">
                    <Eye className="w-3.5 h-3.5" />Dettaglio
                  </TabsTrigger>
                  <TabsTrigger value="discussion" className="gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />Discussione
                    {discussions.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{discussions.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="detail" className="mt-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      <StatusBadge status={selectedProposal.status} />
                      {selectedProposal.modelKey && (
                        <Badge variant="outline" className="gap-1"><Bot className="w-3 h-3" />{selectedProposal.modelKey}</Badge>
                      )}
                      {(() => {
                        const total = (selectedProposal.promptTokens || 0) + (selectedProposal.completionTokens || 0);
                        return total > 0 ? (
                          <Badge variant="outline" className="gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {total.toLocaleString()} token ({(selectedProposal.promptTokens || 0).toLocaleString()}↑ {(selectedProposal.completionTokens || 0).toLocaleString()}↓)
                          </Badge>
                        ) : null;
                      })()}
                      <span>Creata il {format(new Date(selectedProposal.createdAt), "dd MMMM yyyy 'alle' HH:mm", { locale: it })}</span>
                    </div>
                    {selectedProposal.appliedAt && (
                      <div className="text-sm text-muted-foreground">
                        Applicata il {format(new Date(selectedProposal.appliedAt), "dd MMMM yyyy 'alle' HH:mm", { locale: it })}
                      </div>
                    )}
                    {selectedProposal.decisionSummary && (
                      <Card className="bg-muted/50">
                        <CardContent className="p-3 space-y-2">
                          <div className="text-xs font-semibold uppercase text-muted-foreground">Decisione Finale</div>
                          <p className="text-sm">{selectedProposal.decisionSummary}</p>
                          {selectedProposal.decisionReasoning && (
                            <>
                              <div className="text-xs font-semibold uppercase text-muted-foreground mt-2">Processo Decisionale</div>
                              <p className="text-sm whitespace-pre-line">{selectedProposal.decisionReasoning}</p>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    <ScrollArea className="h-[450px]">
                      {renderProposalData(selectedProposal.proposalData)}
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="discussion" className="mt-0">
                  <div className="flex flex-col h-[520px]">
                    <ScrollArea className="flex-1 pr-2">
                      {isLoadingDiscussions ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                      ) : discussions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">Nessuna discussione</p>
                          <p className="text-sm mt-1">Scrivi un messaggio per discutere la proposta con l'AI.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 pb-2">
                          {discussions.map((msg: any) => (
                            <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                              {msg.role === "assistant" && (
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                                  <Bot className="w-4 h-4 text-primary" />
                                </div>
                              )}
                              <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <div className={`text-xs mt-1 ${msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                  {format(new Date(msg.createdAt), "HH:mm", { locale: it })}
                                  {(msg.promptTokens != null || msg.completionTokens != null) && (
                                    <span className="ml-2">· {(msg.promptTokens || 0) + (msg.completionTokens || 0)} token ({msg.promptTokens || 0}↑ {msg.completionTokens || 0}↓)</span>
                                  )}
                                  {msg.proposalDataSnapshot && <span className="ml-2 font-medium">Proposta aggiornata</span>}
                                </div>
                              </div>
                              {msg.role === "user" && (
                                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                                  <User className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          ))}
                          {discussionMutation.isPending && (
                            <div className="flex gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-primary" />
                              </div>
                              <div className="bg-muted rounded-lg px-3 py-2"><Loader2 className="w-4 h-4 animate-spin" /></div>
                            </div>
                          )}
                        </div>
                      )}
                    </ScrollArea>
                    {selectedProposal.status === "pending" && (
                      <div className="flex gap-2 mt-3 pt-3 border-t">
                        <Textarea
                          value={discussionInput}
                          onChange={(e) => setDiscussionInput(e.target.value)}
                          placeholder="Scrivi un messaggio per discutere la proposta..."
                          className="min-h-[60px] max-h-[120px] resize-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (discussionInput.trim() && !discussionMutation.isPending) discussionMutation.mutate(discussionInput.trim());
                            }
                          }}
                        />
                        <Button
                          size="icon" className="h-[60px] w-[60px]"
                          disabled={!discussionInput.trim() || discussionMutation.isPending}
                          onClick={() => discussionMutation.mutate(discussionInput.trim())}
                        >
                          {discussionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Apply confirmation ── */}
      <AlertDialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Applicare la proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione creerà/aggiornerà le entità (progetto, partner, task) come proposto dall'AI. Questa operazione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-apply">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectedProposal && applyProposalMutation.mutate(selectedProposal.id)} disabled={applyProposalMutation.isPending} data-testid="button-confirm-apply">
              {applyProposalMutation.isPending ? "Applicazione..." : "Applica"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject confirmation ── */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rigettare la proposta?</AlertDialogTitle>
            <AlertDialogDescription>La proposta verrà marcata come rigettata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectedProposal && rejectProposalMutation.mutate(selectedProposal.id)} disabled={rejectProposalMutation.isPending} data-testid="button-confirm-reject">
              {rejectProposalMutation.isPending ? "Rifiuto..." : "Rigetta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Entity preview (badge click) — same format as standard list badges ── */}
      <Dialog open={!!entityPreview} onOpenChange={(open) => { if (!open) setEntityPreview(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {entityPreview?.label} ({entityPreview?.items.length})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="space-y-2 py-2">
              {entityPreview?.items.map((item, i) => {
                const clickable = !!item.targetPath;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!clickable}
                    onClick={() => {
                      if (item.targetPath) {
                        setEntityPreview(null);
                        setLocation(item.targetPath);
                      }
                    }}
                    className={`w-full text-left p-3 rounded-lg bg-muted flex items-center justify-between gap-2 ${clickable ? "hover:bg-muted/70 cursor-pointer" : "cursor-default"}`}
                    data-testid={`preview-entity-${i}`}
                  >
                    <span className="text-sm font-medium">{item.description}</span>
                    <Badge variant="outline" className="text-xs font-normal flex-shrink-0">{item.type}</Badge>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── Bulk delete ── */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {selectedProposals.length} proposte</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro di voler eliminare {selectedProposals.length} proposte selezionate?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selectedProposals.map(p => p.id))}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Eliminando..." : `Elimina ${selectedProposals.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
