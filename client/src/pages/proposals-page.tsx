import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Check, X, Clock, AlertCircle, Eye, Sparkles, Mail, Loader2 } from "lucide-react";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Proposal } from "@shared/schema";
import { useOrganization } from "@/contexts/organization-context";

interface ProposalWithMessage extends Proposal {
  message?: {
    id: string;
    subject?: string;
    fromEmail: string;
    receivedAt: Date;
  };
}

export default function ProposalsPage() {
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const { toast } = useToast();
  const { currentOrganizationId } = useOrganization();

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/proposals"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const applyProposalMutation = useMutation({
    mutationFn: (proposalId: string) =>
      apiRequest("POST", `/api/proposals/${proposalId}/apply`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Proposta applicata",
        description: "Le entità sono state create con successo",
      });
      setShowApplyDialog(false);
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

  const filteredProposals = proposals.filter((p) => {
    if (statusFilter === "all") return true;
    return p.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: "In sospeso", icon: Clock, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
      accepted: { label: "Accettata", icon: Check, className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
      rejected: { label: "Rigettata", icon: X, className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
      partially_accepted: { label: "Parzialmente accettata", icon: AlertCircle, className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
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

  const renderProposalData = (proposalData: any) => {
    if (!proposalData || proposalData.processing) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Analisi in corso...</span>
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
                {proposalData.partner.isNew ? "🆕 Nuovo partner da creare" : "🔗 Partner esistente"}
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

        {proposalData.project && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Progetto</CardTitle>
              <CardDescription>
                {proposalData.project.isNew ? "🆕 Nuovo progetto da creare" : "🔗 Progetto esistente"}
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
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background dark:bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
                <Sparkles className="w-8 h-8" />
                Proposte AI
              </h1>
              <p className="text-muted-foreground mt-1">
                Gestisci le proposte generate dall'AI per creare progetti, partner e task dai messaggi
              </p>
            </div>

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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {statusFilter === "all" ? "Tutte le proposte" : 
                     statusFilter === "pending" ? "Proposte in sospeso" :
                     statusFilter === "accepted" ? "Proposte accettate" :
                     "Proposte rigettate"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : filteredProposals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nessuna proposta trovata
                    </div>
                  ) : (
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-2">
                        {filteredProposals.map((proposal) => (
                          <Card
                            key={proposal.id}
                            className={`cursor-pointer transition-colors ${
                              selectedProposal?.id === proposal.id
                                ? "border-primary"
                                : "hover:bg-accent"
                            }`}
                            onClick={() => setSelectedProposal(proposal)}
                            data-testid={`card-proposal-${proposal.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  {getStatusBadge(proposal.status)}
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(proposal.createdAt), "dd MMM yyyy HH:mm", { locale: it })}
                                  </span>
                                </div>
                                {proposal.errorMessage && (
                                  <div className="text-xs text-destructive flex items-start gap-1">
                                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <span>{proposal.errorMessage}</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Dettaglio Proposta</CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedProposal ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Seleziona una proposta per visualizzarne i dettagli
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(selectedProposal.status)}
                            <span className="text-sm text-muted-foreground">
                              Creata il {format(new Date(selectedProposal.createdAt), "dd MMMM yyyy 'alle' HH:mm", { locale: it })}
                            </span>
                          </div>
                          {selectedProposal.appliedAt && (
                            <div className="text-sm text-muted-foreground">
                              Applicata il {format(new Date(selectedProposal.appliedAt), "dd MMMM yyyy 'alle' HH:mm", { locale: it })}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {selectedProposal.status === "pending" && !(selectedProposal.proposalData as any)?.processing && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => setShowApplyDialog(true)}
                                data-testid="button-apply-proposal"
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Applica
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setShowRejectDialog(true)}
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
                      </div>

                      <ScrollArea className="h-[500px]">
                        {renderProposalData(selectedProposal.proposalData)}
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

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
