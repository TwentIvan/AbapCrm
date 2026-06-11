import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { useReadOnlyMode } from "@/hooks/use-readonly-mode";
import FormContainer, { useFormRouting } from "./form-container";
import ProjectForm from "./project-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageHistory } from "@/components/ui/message-history";
import AuditHistory from "@/components/ui/audit-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Edit, MessageSquare, History, Brain, Loader2, Trash2, Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";

// ── Context Pack Panel (Phase 5) ──────────────────────────────────────────
function ContextPackPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [conventionsDraft, setConventionsDraft] = useState("");

  const { data: pack, isLoading } = useQuery<any>({
    queryKey: ["/api/context-packs/project", projectId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/context-packs/project/${projectId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-packs/project", projectId] });
      setEditMode(false);
      toast({ title: "Contesto AI salvato" });
    },
    onError: () => toast({ title: "Errore salvataggio", variant: "destructive" }),
  });

  const deleteDecisionMutation = useMutation({
    mutationFn: async (idx: number) => {
      const decisions: any[] = Array.isArray(pack?.decisions) ? [...pack.decisions] : [];
      decisions.splice(idx, 1);
      return apiRequest("PUT", `/api/context-packs/project/${projectId}`, { decisions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-packs/project", projectId] });
      toast({ title: "Decisione rimossa" });
    },
  });

  const handleStartEdit = () => {
    setBriefDraft(pack?.brief || "");
    setConventionsDraft(pack?.conventions || "");
    setEditMode(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Caricamento contesto AI...
        </CardContent>
      </Card>
    );
  }

  const decisions: any[] = Array.isArray(pack?.decisions) ? pack.decisions : [];
  const glossary: Record<string, string> = pack?.glossary && typeof pack.glossary === "object" ? pack.glossary : {};

  return (
    <div className="space-y-4">
      {/* Last updated */}
      {pack?.updatedAt && (
        <p className="text-xs text-muted-foreground">
          Ultimo aggiornamento: {new Date(pack.updatedAt).toLocaleString("it-IT")}
        </p>
      )}

      {/* Brief */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Brief del Progetto</CardTitle>
          {!editMode && (
            <Button size="sm" variant="ghost" onClick={handleStartEdit}>
              <Brain className="h-3 w-3 mr-1" />
              Modifica
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {editMode ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Brief</Label>
                <Textarea
                  rows={4}
                  value={briefDraft}
                  onChange={e => setBriefDraft(e.target.value)}
                  placeholder="Descrivi il contesto di business, obiettivi, vincoli..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Convenzioni Tecniche</Label>
                <Textarea
                  rows={3}
                  value={conventionsDraft}
                  onChange={e => setConventionsDraft(e.target.value)}
                  placeholder="Naming conventions, standard di codice, architettura..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate({ brief: briefDraft, conventions: conventionsDraft })}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                  Salva
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                  Annulla
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {pack?.brief
                ? <p className="whitespace-pre-wrap">{pack.brief}</p>
                : <p className="text-muted-foreground italic">Nessun brief. L'AI aggiorna questo campo automaticamente.</p>}
              {pack?.conventions && (
                <>
                  <p className="text-xs font-medium text-muted-foreground mt-2">Convenzioni:</p>
                  <p className="whitespace-pre-wrap text-xs">{pack.conventions}</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Glossary */}
      {Object.keys(glossary).length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Glossario</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <dl className="space-y-1 text-sm">
              {Object.entries(glossary).map(([term, def]) => (
                <div key={term} className="flex gap-2">
                  <dt className="font-medium text-foreground min-w-[100px]">{term}:</dt>
                  <dd className="text-muted-foreground">{def}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Decisions */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">
            Decisioni Architetturali ({decisions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nessuna decisione registrata. L'AI aggiunge decisioni automaticamente durante le esecuzioni.
            </p>
          ) : (
            <div className="space-y-2">
              {decisions.map((d: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded border text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{d.decision || d}</p>
                    {d.rationale && <p className="text-xs text-muted-foreground mt-0.5">{d.rationale}</p>}
                    {d.timestamp && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.timestamp).toLocaleDateString("it-IT")}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteDecisionMutation.mutate(i)}
                    disabled={deleteDecisionMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ProjectFormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editingProject?: Project | null;
  
  // Callbacks
  onSuccess?: () => void;
}

export default function ProjectFormContainer({
  open = false,
  onOpenChange,
  editingProject,
  onSuccess,
}: ProjectFormContainerProps) {
  const params = useParams();
  const [location] = useLocation();
  const { currentOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  
  // Extract ID from URL when params is empty (happens in nested routes)
  // URL format: /projects/{id}/edit or /projects/{id}/edit?readonly=true
  const extractIdFromUrl = () => {
    const match = location.match(/\/projects\/([a-f0-9-]+)\/edit/);
    return match ? match[1] : undefined;
  };
  
  const entityId = params.id || extractIdFromUrl();
  
  // Form routing
  const { routes, navigation, currentRoute } = useFormRouting("/projects", entityId);
  
  // Read-only mode (from URL parameter)
  const { isReadOnly, enableEdit, disableEdit } = useReadOnlyMode();
  
  // For full-page mode, fetch project data from route params
  const { data: fullPageProject } = useQuery({
    queryKey: ["/api/projects", entityId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!entityId && currentRoute.isEdit,
  });
  
  // Determine which project to use
  const project = currentRoute.isFullPage ? fullPageProject : editingProject;
  const isEditing = !!project;
  
  // Type safety check - show loading instead of null
  if (currentRoute.isEdit && !project && currentRoute.isFullPage) {
    return <div className="p-8 text-center">Caricamento progetto...</div>;
  }
  
  // Handle success callback
  const handleSuccess = () => {
    if (currentRoute.isFullPage) {
      navigation.toList();
    } else {
      onSuccess?.();
    }
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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
  
  const title = isEditing ? "Modifica Progetto" : "Nuovo Progetto";
  const description = isEditing 
    ? `Modifica i dettagli del progetto "${(project as Project)?.name}"` 
    : "Crea un nuovo progetto per la tua organizzazione";
  
  // Toggle function: enable edit when readonly, disable edit when editing
  const handleToggleReadOnly = isEditing 
    ? () => isReadOnly ? enableEdit() : disableEdit()
    : undefined;
  
  return (
    <FormContainer
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      fullPageRoute={isEditing ? routes.edit((project as Project)?.id || "") : routes.create}
      maxWidth="max-w-4xl"
      isReadOnly={isReadOnly}
      onToggleReadOnly={handleToggleReadOnly}
    >
      {isEditing ? (
        // Editing mode with tabs (details, messages, history)
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" className="flex items-center space-x-2">
              <Edit className="h-4 w-4" />
              <span>Dettagli</span>
            </TabsTrigger>
            <TabsTrigger value="contesto-ai" className="flex items-center space-x-2" data-testid="tab-contesto-ai">
              <Brain className="h-4 w-4" />
              <span>Contesto AI</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4" />
              <span>Messaggi</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>Storico Modifiche</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="mt-6">
            <ProjectForm 
              project={project as Project}
              onSuccess={handleSuccess}
              isReadOnly={isReadOnly}
            />
          </TabsContent>
          
          <TabsContent value="contesto-ai" className="mt-6">
            <ContextPackPanel projectId={(project as Project)?.id || ""} />
          </TabsContent>

          <TabsContent value="messages" className="mt-6">
            <MessageHistory 
              tableName="projects" 
              recordId={(project as Project)?.id || ""}
              title="Storico Messaggi Progetto"
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <AuditHistory 
              tableName="projects" 
              recordId={(project as Project)?.id || ""}
              title="Storico Modifiche Progetto"
            />
          </TabsContent>
        </Tabs>
      ) : (
        // Creation mode (simple form)
        <ProjectForm 
          project={undefined}
          onSuccess={handleSuccess}
        />
      )}
    </FormContainer>
  );
}