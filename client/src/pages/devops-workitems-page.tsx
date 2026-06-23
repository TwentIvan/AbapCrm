import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { 
  GitBranch, 
  ExternalLink, 
  Clipboard, 
  ClipboardCheck, 
  RefreshCw,
  Plus,
  Link,
  CheckCircle,
  AlertCircle,
  Settings,
  Sparkles,
  Bug,
  FileText,
  Star,
  Clock
} from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { validateDevOpsData, generateBookmarkletUrl, type DevOpsWorkItemData } from "@/lib/devops-bookmarklet";
import { useOrganization } from "@/contexts/organization-context";
import type { Message, Task, Project } from "@shared/schema";

interface ExtendedMessage extends Omit<Message, 'externalMetadata'> {
  externalMetadata?: {
    workItemId?: number;
    workItemTitle?: string;
    workItemType?: string;
    workItemUrl?: string;
    project?: string;
    organization?: string;
    state?: string;
    assignedTo?: string;
    enrichedData?: DevOpsWorkItemData;
    enrichedAt?: string;
  } | null;
}

const WORK_ITEM_TYPE_ICONS: Record<string, typeof Bug> = {
  bug: Bug,
  task: FileText,
  'user story': Star,
  feature: Sparkles,
  epic: Star,
  default: GitBranch
};

const WORK_ITEM_STATE_COLORS: Record<string, string> = {
  new: 'bg-primary/10 text-primary',
  active: 'bg-warning/10 text-warning',
  resolved: 'bg-success/10 text-success',
  closed: 'bg-muted text-foreground',
  removed: 'bg-destructive/10 text-destructive',
  default: 'bg-muted text-foreground'
};

function getWorkItemIcon(type?: string) {
  if (!type) return GitBranch;
  const normalizedType = type.toLowerCase();
  return WORK_ITEM_TYPE_ICONS[normalizedType] || WORK_ITEM_TYPE_ICONS.default;
}

function getStateColor(state?: string) {
  if (!state) return WORK_ITEM_STATE_COLORS.default;
  const normalizedState = state.toLowerCase();
  return WORK_ITEM_STATE_COLORS[normalizedState] || WORK_ITEM_STATE_COLORS.default;
}

export default function DevOpsWorkItemsPage() {
  const [selectedWorkItem, setSelectedWorkItem] = useState<ExtendedMessage | null>(null);
  const [showEnrichDialog, setShowEnrichDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showBookmarkletSetup, setShowBookmarkletSetup] = useState(false);
  const [pastedJson, setPastedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useOrganization();

  const { data: workItems = [], isLoading, refetch } = useQuery<ExtendedMessage[]>({
    queryKey: ["/api/messages/devops-workitems", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const enrichMutation = useMutation({
    mutationFn: async ({ messageId, bookmarkletData }: { messageId: string; bookmarkletData: DevOpsWorkItemData }) => {
      return apiRequest("POST", `/api/messages/${messageId}/enrich-devops`, { bookmarkletData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/devops-workitems"] });
      setShowEnrichDialog(false);
      setPastedJson("");
      setJsonError(null);
      toast({
        title: "Work Item arricchito",
        description: "I dati del bookmarklet sono stati salvati con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile arricchire il work item",
        variant: "destructive",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async ({ messageId, projectId }: { messageId: string; projectId?: string }) => {
      return apiRequest("POST", `/api/messages/${messageId}/create-task-from-workitem`, { projectId });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/devops-workitems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowCreateTaskDialog(false);
      setSelectedProjectId("");
      toast({
        title: data.action === 'created' ? "Task creato" : "Task collegato",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile creare il task",
        variant: "destructive",
      });
    },
  });

  const handlePasteJson = () => {
    const validation = validateDevOpsData(pastedJson);
    if (!validation.valid) {
      setJsonError(validation.error || "Dati non validi");
      return;
    }
    
    if (!selectedWorkItem) return;
    
    enrichMutation.mutate({
      messageId: selectedWorkItem.id,
      bookmarkletData: validation.data!,
    });
  };

  const handleCreateTask = () => {
    if (!selectedWorkItem) return;
    createTaskMutation.mutate({
      messageId: selectedWorkItem.id,
      projectId: selectedProjectId || undefined,
    });
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(generateBookmarkletUrl());
      toast({
        title: "Bookmarklet copiato!",
        description: "Incolla il codice come URL di un nuovo segnalibro.",
      });
    } catch (e) {
      toast({
        title: "Errore",
        description: "Impossibile copiare negli appunti",
        variant: "destructive",
      });
    }
  };

  const linkedTaskForWorkItem = (workItem: ExtendedMessage): Task | undefined => {
    if (!workItem.taskId) return undefined;
    return tasks.find(t => t.id === workItem.taskId);
  };

  const isEnriched = (workItem: ExtendedMessage): boolean => {
    return !!(workItem.externalMetadata?.enrichedAt);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="DevOps Work Items" subtitle="Gestione Work Items da Azure DevOps" />
        <main className="p-6 flex-1">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Azure DevOps Work Items
                </CardTitle>
                <CardDescription>
                  Work Items ricevuti via email da Azure DevOps. Arricchisci con il bookmarklet e crea task.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBookmarkletSetup(true)}
                  data-testid="button-bookmarklet-setup"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Installa Bookmarklet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  data-testid="button-refresh-workitems"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : workItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">Nessun Work Item trovato</h3>
                  <p className="text-muted-foreground mt-2">
                    I Work Items di Azure DevOps verranno rilevati automaticamente dalle email.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Tipo</TableHead>
                        <TableHead className="w-[80px]">ID</TableHead>
                        <TableHead>Titolo</TableHead>
                        <TableHead className="w-[100px]">Stato</TableHead>
                        <TableHead className="w-[150px]">Progetto</TableHead>
                        <TableHead className="w-[120px]">Ricevuto</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[150px]">Azioni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workItems.map((item) => {
                        const meta = item.externalMetadata || {};
                        const Icon = getWorkItemIcon(meta.workItemType);
                        const linkedTask = linkedTaskForWorkItem(item);
                        
                        return (
                          <TableRow 
                            key={item.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedWorkItem(item)}
                            data-testid={`row-workitem-${item.id}`}
                          >
                            <TableCell>
                              <Icon className="h-4 w-4 text-primary" />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              #{meta.workItemId || '?'}
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate">
                              {meta.workItemTitle || item.subject || 'Senza titolo'}
                            </TableCell>
                            <TableCell>
                              {meta.state && (
                                <Badge className={getStateColor(meta.state)}>
                                  {meta.state}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {meta.project || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.receivedAt ? format(new Date(item.receivedAt), 'dd/MM HH:mm', { locale: it }) : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isEnriched(item) ? (
                                  <Badge variant="outline" className="text-success border-success/30">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Arricchito
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-warning border-warning/30">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Da arricchire
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {meta.workItemUrl && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    asChild
                                    data-testid={`button-open-workitem-${item.id}`}
                                  >
                                    <a href={meta.workItemUrl} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedWorkItem(item);
                                    setShowEnrichDialog(true);
                                  }}
                                  data-testid={`button-enrich-${item.id}`}
                                >
                                  <Clipboard className="h-4 w-4" />
                                </Button>
                                {linkedTask ? (
                                  <Badge variant="secondary" className="text-xs">
                                    <Link className="h-3 w-3 mr-1" />
                                    {linkedTask.title?.substring(0, 15)}...
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedWorkItem(item);
                                      setShowCreateTaskDialog(true);
                                    }}
                                    data-testid={`button-create-task-${item.id}`}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
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

          {/* Detail Panel for selected Work Item */}
          {selectedWorkItem && !showEnrichDialog && !showCreateTaskDialog && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  Work Item #{selectedWorkItem.externalMetadata?.workItemId}
                  {selectedWorkItem.externalMetadata?.workItemUrl && (
                    <a 
                      href={selectedWorkItem.externalMetadata.workItemUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="info">
                  <TabsList>
                    <TabsTrigger value="info">Informazioni</TabsTrigger>
                    <TabsTrigger value="email">Email Originale</TabsTrigger>
                    <TabsTrigger value="enriched">Dati Arricchiti</TabsTrigger>
                  </TabsList>
                  <TabsContent value="info" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Titolo</label>
                        <p>{selectedWorkItem.externalMetadata?.workItemTitle || selectedWorkItem.subject}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                        <p>{selectedWorkItem.externalMetadata?.workItemType || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Stato</label>
                        <p>{selectedWorkItem.externalMetadata?.state || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Assegnato a</label>
                        <p>{selectedWorkItem.externalMetadata?.assignedTo || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Progetto</label>
                        <p>{selectedWorkItem.externalMetadata?.project || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Organizzazione</label>
                        <p>{selectedWorkItem.externalMetadata?.organization || '-'}</p>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="email">
                    <div className="space-y-2">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Da</label>
                        <p>{selectedWorkItem.fromEmail}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Oggetto</label>
                        <p>{selectedWorkItem.subject}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Corpo</label>
                        <pre className="text-sm bg-muted p-3 rounded mt-1 overflow-auto max-h-64">
                          {selectedWorkItem.body}
                        </pre>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="enriched">
                    {selectedWorkItem.externalMetadata?.enrichedData ? (
                      <pre className="text-sm bg-muted p-3 rounded overflow-auto max-h-96">
                        {JSON.stringify(selectedWorkItem.externalMetadata.enrichedData, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clipboard className="h-8 w-8 mx-auto mb-2" />
                        <p>Nessun dato arricchito.</p>
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => setShowEnrichDialog(true)}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-2" />
                          Arricchisci con Bookmarklet
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Enrich Dialog */}
      <Dialog open={showEnrichDialog} onOpenChange={setShowEnrichDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Arricchisci Work Item con Bookmarklet</DialogTitle>
            <DialogDescription>
              Incolla il JSON copiato dal bookmarklet per arricchire i dati del Work Item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">JSON dal Bookmarklet</label>
              <Textarea
                value={pastedJson}
                onChange={(e) => {
                  setPastedJson(e.target.value);
                  setJsonError(null);
                }}
                placeholder='{"workItemId": 12345, "title": "...", ...}'
                className="font-mono text-sm h-64"
                data-testid="input-bookmarklet-json"
              />
              {jsonError && (
                <p className="text-sm text-destructive mt-1">{jsonError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnrichDialog(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handlePasteJson}
              disabled={!pastedJson || enrichMutation.isPending}
              data-testid="button-save-enrichment"
            >
              {enrichMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4 mr-2" />
              )}
              Salva Dati
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Task da Work Item</DialogTitle>
            <DialogDescription>
              Crea un nuovo task dal Work Item #{selectedWorkItem?.externalMetadata?.workItemId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Progetto (opzionale)</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Seleziona un progetto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessun progetto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-muted p-3 rounded">
              <p className="text-sm">
                <strong>Titolo:</strong> {selectedWorkItem?.externalMetadata?.workItemTitle || selectedWorkItem?.subject}
              </p>
              <p className="text-sm">
                <strong>Tipo:</strong> {selectedWorkItem?.externalMetadata?.workItemType || 'N/A'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTaskDialog(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleCreateTask}
              disabled={createTaskMutation.isPending}
              data-testid="button-confirm-create-task"
            >
              {createTaskMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Crea Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bookmarklet Setup Dialog */}
      <Dialog open={showBookmarkletSetup} onOpenChange={setShowBookmarkletSetup}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Installazione Bookmarklet DevOps</DialogTitle>
            <DialogDescription>
              Segui questi passaggi per installare il bookmarklet nel tuo browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="font-semibold">Passo 1: Crea un nuovo segnalibro</h4>
              <p className="text-sm text-muted-foreground">
                Fai clic destro sulla barra dei segnalibri e seleziona "Aggiungi pagina" o "Nuovo segnalibro".
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold">Passo 2: Configura il segnalibro</h4>
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">Nome:</label>
                  <code className="block bg-muted p-2 rounded text-sm mt-1">
                    📋 Estrai Work Item DevOps
                  </code>
                </div>
                <div>
                  <label className="text-sm font-medium">URL:</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 bg-muted p-2 rounded text-xs overflow-hidden text-ellipsis">
                      javascript:(function()...)
                    </code>
                    <Button variant="outline" size="sm" onClick={copyBookmarklet}>
                      <Clipboard className="h-4 w-4 mr-1" />
                      Copia
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Passo 3: Utilizzo</h4>
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>Vai su Azure DevOps e apri un Work Item</li>
                <li>Clicca sul segnalibro appena creato</li>
                <li>I dati verranno copiati negli appunti automaticamente</li>
                <li>Torna qui e incolla i dati nel dialog "Arricchisci"</li>
              </ol>
            </div>

            <div className="bg-primary/5 p-3 rounded border border-primary/20">
              <p className="text-sm text-primary">
                <strong>Nota:</strong> Il bookmarklet funziona solo su pagine Azure DevOps autenticate. 
                Non può accedere a dati che non sono visibili nella pagina.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowBookmarkletSetup(false)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
