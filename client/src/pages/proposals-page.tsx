import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { UniversalTable, type TableColumn } from "@/components/ui/universal-table";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Clock, AlertCircle, Eye, Sparkles, Mail, Loader2, RefreshCw, Brain, TrendingUp, Trash2, Link2, MessageSquare, Send, Bot, User } from "lucide-react";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Proposal, AiLearningPattern } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";

interface ProposalWithMessage extends Proposal {
  message?: {
    id: string;
    subject?: string;
    fromEmail: string;
    receivedAt: Date;
  };
}

// Gruppo di entità (es. "Task" con la lista dei titoli)
interface EntityGroup {
  label: string;
  items: string[];
}

// Estrae i gruppi di entità proposte dal proposalData
function getProposedEntityGroups(pd: any): EntityGroup[] {
  if (!pd || pd.processing || pd.failed) return [];
  const groups: EntityGroup[] = [];
  if (pd.partner) groups.push({ label: "Partner", items: [pd.partner.name].filter(Boolean) });
  if (pd.project) groups.push({ label: "Progetto", items: [pd.project.name].filter(Boolean) });
  if (pd.tasks?.length) groups.push({ label: "Task", items: pd.tasks.map((t: any) => t.title).filter(Boolean) });
  if (pd.contacts?.length) groups.push({ label: "Contatti", items: pd.contacts.map((c: any) => c.name).filter(Boolean) });
  if (pd.systems?.length) groups.push({ label: "Sistemi SAP", items: pd.systems.map((s: any) => s.name || s.systemId).filter(Boolean) });
  if (pd.connections?.length) groups.push({ label: "Connessioni", items: pd.connections.map((c: any) => c.name || c.connectionId).filter(Boolean) });
  return groups;
}

// Estrae i gruppi di entità effettivamente create (solo proposte accettate/applicate)
function getCreatedEntityGroups(proposal: Proposal): EntityGroup[] {
  const pd = proposal.proposalData as any;
  if (!pd || pd.processing || pd.failed) return [];
  if (proposal.status !== "accepted" && proposal.status !== "partially_accepted") return [];
  const groups: EntityGroup[] = [];
  if (pd.partner?.isNew) groups.push({ label: "Partner", items: [pd.partner.name].filter(Boolean) });
  if (pd.project?.isNew) groups.push({ label: "Progetto", items: [pd.project.name].filter(Boolean) });
  if (pd.tasks?.length) {
    const newTasks = pd.tasks.filter((t: any) => t.isNew).map((t: any) => t.title).filter(Boolean);
    if (newTasks.length) groups.push({ label: "Task", items: newTasks });
  }
  if (pd.contacts?.length) groups.push({ label: "Contatti", items: pd.contacts.map((c: any) => c.name).filter(Boolean) });
  return groups;
}

function countEntities(groups: EntityGroup[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}

// Badge cerchiato con numero che, cliccato, mostra il popup con l'elenco delle entità
function EntityCountBadge({
  groups,
  variant = "proposed",
  testId,
}: {
  groups: EntityGroup[];
  variant?: "proposed" | "created";
  testId?: string;
}) {
  const total = countEntities(groups);
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const colorClass =
    variant === "created"
      ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
      : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20";
  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-semibold transition-colors ${colorClass}`}
          data-testid={testId}
        >
          {total}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()} align="start">
        <div className="space-y-3">
          {groups.map((g, i) => (
            <div key={i}>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {g.label} ({g.items.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {g.items.length > 0 ? (
                  g.items.map((item, j) => (
                    <Badge key={j} variant="outline" className="text-xs font-normal">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ProposalsPage() {
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const [mainTab, setMainTab] = useState<"proposals" | "learning">("proposals");
  const [detailTab, setDetailTab] = useState<"detail" | "discussion">("detail");
  const [discussionInput, setDiscussionInput] = useState("");
  const { toast } = useToast();
  const { currentOrganizationId } = useOrganization();

  const { data: proposals = [], isLoading, refetch } = useQuery<Proposal[]>({
    queryKey: ["/api/proposals"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const { data: learningPatterns = [], isLoading: isLoadingPatterns, refetch: refetchPatterns } = useQuery<AiLearningPattern[]>({
    queryKey: ["/api/ai-learning-patterns"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const deletePatternMutation = useMutation({
    mutationFn: (patternId: string) =>
      apiRequest("DELETE", `/api/ai-learning-patterns/${patternId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-learning-patterns"] });
      toast({
        title: "Pattern eliminato",
        description: "Il pattern di apprendimento è stato eliminato",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile eliminare il pattern",
        variant: "destructive",
      });
    },
  });

  // Sincronizza la proposta selezionata con i dati aggiornati
  useEffect(() => {
    if (selectedProposal && proposals.length > 0) {
      const updatedProposal = proposals.find(p => p.id === selectedProposal.id);
      if (updatedProposal && JSON.stringify(updatedProposal.proposalData) !== JSON.stringify(selectedProposal.proposalData)) {
        setSelectedProposal(updatedProposal);
      }
    }
  }, [proposals, selectedProposal]);

  const applyProposalMutation = useMutation({
    mutationFn: (proposalId: string) =>
      apiRequest("POST", `/api/proposals/${proposalId}/apply`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Proposta applicata",
        description: "Le entità sono state create con successo, inclusi i contatti estratti",
      });
      setShowApplyDialog(false);
      setShowDetailDialog(false);
      setSelectedProposal(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile applicare la proposta",
        variant: "destructive",
      });
    },
  });

  const rejectProposalMutation = useMutation({
    mutationFn: (proposalId: string) =>
      apiRequest("POST", `/api/proposals/${proposalId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Proposta rigettata",
        description: "La proposta è stata rigettata",
      });
      setShowRejectDialog(false);
      setShowDetailDialog(false);
      setSelectedProposal(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile rigettare la proposta",
        variant: "destructive",
      });
    },
  });

  const deleteProposalMutation = useMutation({
    mutationFn: (proposalId: string) =>
      apiRequest("DELETE", `/api/proposals/${proposalId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Proposta eliminata",
        description: "La proposta è stata eliminata",
      });
      setShowDetailDialog(false);
      setSelectedProposal(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile eliminare la proposta",
        variant: "destructive",
      });
    },
  });

  const { data: discussions = [], isLoading: isLoadingDiscussions } = useQuery<any[]>({
    queryKey: ["/api/proposals", selectedProposal?.id, "discussions"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedProposal,
    refetchInterval: false,
  });

  const discussionMutation = useMutation({
    mutationFn: async (message: string) => {
      const resp = await apiRequest("POST", `/api/proposals/${selectedProposal!.id}/discussions`, { message });
      return resp.json();
    },
    onMutate: async (message: string) => {
      const key = ["/api/proposals", selectedProposal?.id, "discussions"];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key) || [];
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };
      queryClient.setQueryData<any[]>(key, [...previous, optimistic]);
      setDiscussionInput("");
      return { previous, key };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", selectedProposal?.id, "discussions"] });
      if (data.proposalUpdated) {
        queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      }
    },
    onError: (error: any, _vars, context: any) => {
      if (context?.key && context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast({
        title: "Errore",
        description: error.message || "Impossibile inviare il messaggio",
        variant: "destructive",
      });
    },
  });

  const finalizeDecisionMutation = useMutation({
    mutationFn: ({ proposalId, action }: { proposalId: string; action: "accept" | "reject" }) =>
      apiRequest("POST", `/api/proposals/${proposalId}/finalize-decision`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Decisione registrata",
        description: "La decisione e il processo decisionale sono stati salvati",
      });
    },
  });

  const filteredProposals = proposals.filter((p) => {
    if (statusFilter === "all") return true;
    return p.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: "In sospeso", icon: Clock, className: "bg-warning/10 text-warning" },
      accepted: { label: "Accettata", icon: Check, className: "bg-success/10 text-success" },
      rejected: { label: "Rigettata", icon: X, className: "bg-destructive/10 text-destructive" },
      partially_accepted: { label: "Parzialmente accettata", icon: AlertCircle, className: "bg-primary/10 text-primary" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  // Colonne della tabella proposte (modello generico UniversalTable)
  const proposalColumns: TableColumn[] = [
    {
      key: "status",
      label: "Stato",
      sortable: true,
      render: (proposal: Proposal) => {
        const pd = proposal.proposalData as any;
        const isProcessing = pd?.processing && !pd?.failed;
        return (
          <div className="flex items-center gap-1.5">
            {isProcessing ? (
              <Badge className="bg-blue-500/10 text-blue-500">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Analisi...
              </Badge>
            ) : (
              getStatusBadge(proposal.status)
            )}
            {proposal.errorMessage && (
              <AlertCircle className="w-4 h-4 text-destructive" title={proposal.errorMessage} />
            )}
          </div>
        );
      },
    },
    {
      key: "proposedEntities",
      label: "Entità proposte",
      sortable: false,
      render: (proposal: Proposal) => (
        <EntityCountBadge
          groups={getProposedEntityGroups(proposal.proposalData)}
          variant="proposed"
          testId={`badge-proposed-${proposal.id}`}
        />
      ),
    },
    {
      key: "createdEntities",
      label: "Entità create",
      sortable: false,
      render: (proposal: Proposal) => (
        <EntityCountBadge
          groups={getCreatedEntityGroups(proposal)}
          variant="created"
          testId={`badge-created-${proposal.id}`}
        />
      ),
    },
    {
      key: "estimatedTokens",
      label: "Token previsti",
      sortable: false,
      render: (proposal: Proposal) => {
        const est = (proposal.proposalData as any)?.estimatedTokens || (proposal as any).estimatedTokens;
        return est ? (
          <span className="text-xs text-muted-foreground">{Number(est).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "spentTokens",
      label: "Token spesi",
      sortable: true,
      accessor: (proposal: Proposal) =>
        ((proposal as any).promptTokens || 0) + ((proposal as any).completionTokens || 0),
      render: (proposal: Proposal) => {
        const pt = (proposal as any).promptTokens || 0;
        const ct = (proposal as any).completionTokens || 0;
        const total = pt + ct;
        return total > 0 ? (
          <span className="text-xs text-muted-foreground" title={`${pt.toLocaleString()}↑ ${ct.toLocaleString()}↓`}>
            {total.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "createdAt",
      label: "Data",
      sortable: true,
      render: (proposal: Proposal) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(proposal.createdAt), "dd MMM yyyy HH:mm", { locale: it })}
        </span>
      ),
    },
  ];

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
      return (
        <div className="text-destructive text-sm">
          Analisi fallita. Controlla i dettagli dell'errore.
        </div>
      );
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

        {proposalData.contacts && proposalData.contacts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contatti di riferimento ({proposalData.contacts.length})</CardTitle>
              <CardDescription>
                Contatti estratti dal messaggio che verranno creati quando applichi la proposta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {proposalData.contacts.map((contact: any, idx: number) => (
                  <div key={idx} className="border-l-2 border-primary/50 pl-3 py-1">
                    <div className="space-y-1">
                      <div className="font-medium">{contact.name}</div>
                      <div className="text-sm text-muted-foreground">{contact.email}</div>
                      {contact.position && (
                        <div className="text-sm">
                          <strong>Ruolo:</strong> {contact.position}
                        </div>
                      )}
                      {contact.company && (
                        <div className="text-sm">
                          <strong>Azienda:</strong> {contact.company}
                        </div>
                      )}
                      {contact.phone && (
                        <div className="text-sm">
                          <strong>Telefono:</strong> {contact.phone}
                        </div>
                      )}
                      {contact.notes && (
                        <div className="text-sm text-muted-foreground italic mt-1">
                          {contact.notes}
                        </div>
                      )}
                    </div>
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

        {proposalData.tasks && proposalData.tasks.length > 0 && (
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
                            {task.aiSpec.objective && (
                              <div>
                                <span className="text-muted-foreground">Obiettivo:</span> {task.aiSpec.objective}
                              </div>
                            )}
                            {task.aiSpec.complexity && (
                              <Badge variant="outline">Complessità {task.aiSpec.complexity}</Badge>
                            )}
                            {task.aiSpec.proposedMcpConfigs?.length > 0 ? (
                              <div>
                                <span className="text-muted-foreground">Server MCP proposti:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {task.aiSpec.proposedMcpConfigs.map((m: any, i: number) => (
                                    <Badge key={i} variant="secondary" title={m.reason}>
                                      {m.name}
                                      {m.category ? ` · ${m.category}` : ""}
                                      {m.write ? " · write" : " · read"}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : task.aiSpec.requiredMcpCategories?.length > 0 ? (
                              <div>
                                <span className="text-muted-foreground">Categorie MCP:</span>{" "}
                                {task.aiSpec.requiredMcpCategories.join(", ")}
                              </div>
                            ) : (
                              <div className="text-muted-foreground italic">Nessun server MCP proposto</div>
                            )}
                            {task.aiSpec.acceptanceCriteria?.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">Criteri di accettazione:</span>
                                <ul className="list-disc ml-4">
                                  {task.aiSpec.acceptanceCriteria.map((c: string, i: number) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {task.aiSpec.openQuestions?.length > 0 && (
                              <div className="text-warning">
                                Domande aperte: {task.aiSpec.openQuestions.join(" · ")}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {task.isNew ? (
                        <Badge variant="secondary" className="ml-2">Nuovo</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">Esistente</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chiarimenti richiesti */}
        {proposalData.needsClarification && proposalData.clarificationQuestions?.length > 0 && (
          <Card className="border-warning/30 bg-warning/10">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-warning">
                <Sparkles className="w-4 h-4" />
                Chiarimenti necessari
              </CardTitle>
              <CardDescription>
                L'AI non ha abbastanza informazioni per scomporre il lavoro. Rispondere a queste domande prima di applicare la proposta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc ml-4 space-y-1 text-sm">
                {proposalData.clarificationQuestions.map((q: string, i: number) => (
                  <li key={i} className="text-warning dark:text-warning">{q}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Sistemi SAP */}
        {proposalData.systems && proposalData.systems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sistemi SAP ({proposalData.systems.length})</CardTitle>
              <CardDescription>Sistemi coinvolti nella proposta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {proposalData.systems.map((sys: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {sys.needsManualConfig ? (
                      <Badge variant="outline" className="text-warning border-warning/30">Nuovo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-success border-success/30">Esistente</Badge>
                    )}
                    <span className="font-medium">{sys.name || sys.systemId}</span>
                    {sys.type && <span className="text-muted-foreground">· {sys.type}</span>}
                    {sys.environment && <span className="text-muted-foreground">· {sys.environment}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Connessioni */}
        {proposalData.connections && proposalData.connections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Connessioni ({proposalData.connections.length})</CardTitle>
              <CardDescription>Connessioni tecniche richieste per i task</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {proposalData.connections.map((conn: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {conn.needsManualConfig ? (
                      <Badge variant="outline" className="text-warning border-warning/30">Da configurare</Badge>
                    ) : (
                      <Badge variant="outline" className="text-success border-success/30">Configurata</Badge>
                    )}
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

  return (
    <div className="flex h-screen overflow-hidden bg-background dark:bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Proposte AI" subtitle="Gestisci le proposte generate dall'intelligenza artificiale" />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
                  <Sparkles className="w-8 h-8" />
                  Proposte AI
                </h1>
                <p className="text-muted-foreground mt-1">
                  Gestisci le proposte generate dall'AI per creare progetti, partner e task dai messaggi
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => mainTab === "proposals" ? refetch() : refetchPatterns()}
                data-testid="button-refresh-proposals"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Ricarica
              </Button>
            </div>

            <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)} className="mb-4">
              <TabsList>
                <TabsTrigger value="proposals" data-testid="tab-main-proposals" className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Proposte ({proposals.length})
                </TabsTrigger>
                <TabsTrigger value="learning" data-testid="tab-main-learning" className="gap-2">
                  <Brain className="w-4 h-4" />
                  Apprendimento AI ({learningPatterns.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="learning" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="w-5 h-5" />
                      Pattern Appresi
                    </CardTitle>
                    <CardDescription>
                      L'AI utilizza questi pattern per migliorare le proposte future basandosi sulle tue decisioni passate
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingPatterns ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : learningPatterns.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Brain className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>Nessun pattern appreso</p>
                        <p className="text-sm mt-1">Accetta o rigetta proposte per insegnare all'AI le tue preferenze</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tipo Pattern</TableHead>
                              <TableHead>Input</TableHead>
                              <TableHead>Azione Scelta</TableHead>
                              <TableHead className="text-center">Confidenza</TableHead>
                              <TableHead className="text-center">Utilizzi</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {learningPatterns.map((pattern) => {
                              const features = pattern.inputFeatures as Record<string, any> || {};
                              const action = pattern.chosenAction as Record<string, any> || {};
                              const total = pattern.acceptanceCount + pattern.rejectionCount;
                              const confidence = total > 0 ? Math.round((pattern.acceptanceCount / total) * 100) : 0;
                              
                              return (
                                <TableRow key={pattern.id} data-testid={`row-pattern-${pattern.id}`}>
                                  <TableCell>
                                    <Badge variant="outline">{pattern.patternType}</Badge>
                                  </TableCell>
                                  <TableCell className="max-w-[200px]">
                                    <div className="text-xs text-muted-foreground truncate">
                                      {Object.entries(features).map(([key, value]) => (
                                        <div key={key}><strong>{key}:</strong> {String(value)}</div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="max-w-[200px]">
                                    <div className="text-xs text-muted-foreground truncate">
                                      {Object.entries(action).map(([key, value]) => (
                                        <div key={key}><strong>{key}:</strong> {String(value)}</div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      <Progress 
                                        value={confidence} 
                                        className={`w-16 h-2 ${
                                          confidence >= 80 ? '[&>div]:bg-success' :
                                          confidence >= 50 ? '[&>div]:bg-yellow-500' :
                                          '[&>div]:bg-red-500'
                                        }`}
                                      />
                                      <span className="text-xs">{confidence}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1 text-sm">
                                      <span className="text-success">{pattern.acceptanceCount}</span>
                                      <span>/</span>
                                      <span className="text-destructive">{pattern.rejectionCount}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deletePatternMutation.mutate(pattern.id)}
                                      disabled={deletePatternMutation.isPending}
                                      data-testid={`button-delete-pattern-${pattern.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="proposals" className="mt-4">
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <TabsList>
                    <TabsTrigger value="all" data-testid="tab-all-proposals">
                      Tutte ({proposals.length})
                    </TabsTrigger>
                    <TabsTrigger value="pending" data-testid="tab-pending-proposals">
                      In sospeso ({proposals.filter(p => p.status === 'pending').length})
                    </TabsTrigger>
                    <TabsTrigger value="accepted" data-testid="tab-accepted-proposals">
                      Accettate ({proposals.filter(p => p.status === 'accepted').length})
                    </TabsTrigger>
                    <TabsTrigger value="rejected" data-testid="tab-rejected-proposals">
                      Rigettate ({proposals.filter(p => p.status === 'rejected').length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : filteredProposals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nessuna proposta trovata
                </div>
              ) : (
                <UniversalTable
                  data={filteredProposals}
                  columns={proposalColumns}
                  onRowClick={(p) => {
                    setSelectedProposal(p as Proposal);
                    setDetailTab("detail");
                    setShowDetailDialog(true);
                  }}
                />
              )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Dialog dettaglio proposta + discussione */}
      <Dialog open={showDetailDialog} onOpenChange={(open) => {
        setShowDetailDialog(open);
        if (!open) setSelectedProposal(null);
      }}>
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
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          if (discussions.length > 0) {
                            finalizeDecisionMutation.mutate({ proposalId: selectedProposal.id, action: "accept" });
                          }
                          setShowApplyDialog(true);
                        }}
                        data-testid="button-apply-proposal"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Applica
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (discussions.length > 0) {
                            finalizeDecisionMutation.mutate({ proposalId: selectedProposal.id, action: "reject" });
                          }
                          setShowRejectDialog(true);
                        }}
                        data-testid="button-reject-proposal"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Rigetta
                      </Button>
                    </>
                  )}
                  {selectedProposal.status !== "pending" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteProposalMutation.mutate(selectedProposal.id)}
                      data-testid="button-delete-proposal"
                    >
                      Elimina
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
                  {!selectedProposal ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Seleziona una proposta per visualizzarne i dettagli
                    </div>
                  ) : (
                    <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)}>
                      <TabsList className="mb-3">
                        <TabsTrigger value="detail" className="gap-1.5">
                          <Eye className="w-3.5 h-3.5" />
                          Dettaglio
                        </TabsTrigger>
                        <TabsTrigger value="discussion" className="gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Discussione
                          {discussions.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                              {discussions.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="detail" className="mt-0">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                            {getStatusBadge(selectedProposal.status)}
                            {(selectedProposal as any).modelKey && (
                              <Badge variant="outline" className="gap-1">
                                <Bot className="w-3 h-3" />
                                {(selectedProposal as any).modelKey}
                              </Badge>
                            )}
                            {(() => {
                              const pt = (selectedProposal as any).promptTokens || 0;
                              const ct = (selectedProposal as any).completionTokens || 0;
                              const total = pt + ct;
                              return total > 0 ? (
                                <Badge variant="outline" className="gap-1">
                                  <TrendingUp className="w-3 h-3" />
                                  {total.toLocaleString()} token ({pt.toLocaleString()}↑ {ct.toLocaleString()}↓)
                                </Badge>
                              ) : null;
                            })()}
                            <span>
                              Creata il {format(new Date(selectedProposal.createdAt), "dd MMMM yyyy 'alle' HH:mm", { locale: it })}
                            </span>
                          </div>
                          {selectedProposal.appliedAt && (
                            <div className="text-sm text-muted-foreground">
                              Applicata il {format(new Date(selectedProposal.appliedAt), "dd MMMM yyyy 'alle' HH:mm", { locale: it })}
                            </div>
                          )}
                          {(selectedProposal as any).decisionSummary && (
                            <Card className="bg-muted/50">
                              <CardContent className="p-3 space-y-2">
                                <div className="text-xs font-semibold uppercase text-muted-foreground">Decisione Finale</div>
                                <p className="text-sm">{(selectedProposal as any).decisionSummary}</p>
                                {(selectedProposal as any).decisionReasoning && (
                                  <>
                                    <div className="text-xs font-semibold uppercase text-muted-foreground mt-2">Processo Decisionale</div>
                                    <p className="text-sm whitespace-pre-line">{(selectedProposal as any).decisionReasoning}</p>
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
                              <div className="flex justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin" />
                              </div>
                            ) : discussions.length === 0 ? (
                              <div className="text-center py-12 text-muted-foreground">
                                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Nessuna discussione</p>
                                <p className="text-sm mt-1">
                                  Scrivi un messaggio per discutere la proposta con l'AI.
                                  Puoi chiedere modifiche, chiarimenti o approfondimenti.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3 pb-2">
                                {discussions.map((msg: any) => (
                                  <div
                                    key={msg.id}
                                    className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                  >
                                    {msg.role === "assistant" && (
                                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-4 h-4 text-primary" />
                                      </div>
                                    )}
                                    <div
                                      className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                                        msg.role === "user"
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted"
                                      }`}
                                    >
                                      <p className="whitespace-pre-wrap">{msg.content}</p>
                                      <div className={`text-xs mt-1 ${msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                        {format(new Date(msg.createdAt), "HH:mm", { locale: it })}
                                        {(msg.promptTokens != null || msg.completionTokens != null) && (
                                          <span className="ml-2">
                                            · {(msg.promptTokens || 0) + (msg.completionTokens || 0)} token
                                            ({msg.promptTokens || 0}↑ {msg.completionTokens || 0}↓)
                                          </span>
                                        )}
                                        {msg.proposalDataSnapshot && (
                                          <span className="ml-2 font-medium">
                                            Proposta aggiornata
                                          </span>
                                        )}
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
                                    <div className="bg-muted rounded-lg px-3 py-2">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    </div>
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
                                    if (discussionInput.trim() && !discussionMutation.isPending) {
                                      discussionMutation.mutate(discussionInput.trim());
                                    }
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                className="h-[60px] w-[60px]"
                                disabled={!discussionInput.trim() || discussionMutation.isPending}
                                onClick={() => discussionMutation.mutate(discussionInput.trim())}
                              >
                                {discussionMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
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

      <AlertDialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Applicare la proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione creerà/aggiornerà le entità (progetto, partner, task) come proposto dall'AI.
              Questa operazione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-apply">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedProposal && applyProposalMutation.mutate(selectedProposal.id)}
              disabled={applyProposalMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyProposalMutation.isPending ? "Applicazione..." : "Applica"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rigettare la proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              La proposta verrà marcata come rigettata e non verrà più mostrata tra quelle in sospeso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedProposal && rejectProposalMutation.mutate(selectedProposal.id)}
              disabled={rejectProposalMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectProposalMutation.isPending ? "Rifiuto..." : "Rigetta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
