import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListViewToolbar } from "@/components/ui/list-view-toolbar";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { UniversalTable, createStandardColumns } from "@/components/ui/universal-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Users, DollarSign, Calendar, User as UserIcon, Star, Plus, Trash2, Sparkles, ChevronRight, ChevronDown, Eye, EyeOff, Brain } from "lucide-react";
import { HumanResource, type ResourceSkill, type SkillCatalog } from "@shared/schema";
import { HumanResourceForm } from "@/components/forms/human-resource-form";
import { BulkEditDialog, BulkEditField } from "@/components/dialogs/bulk-edit-dialog";
import { BulkCopyDialog } from "@/components/dialogs/bulk-copy-dialog";
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className="p-0.5 hover:scale-110 transition-transform"
          data-testid={`star-${level}`}
        >
          <Star
            className={`h-4 w-4 ${level <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
          />
        </button>
      ))}
    </div>
  );
}

function getSkillFullPath(items: SkillCatalog[], itemId: string): string {
  const map = new Map<string, SkillCatalog>();
  items.forEach(i => map.set(i.id, i));
  const parts: string[] = [];
  let current = map.get(itemId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return parts.join(" > ");
}

function ResourceSkillsManager({ resourceId }: { resourceId: string }) {
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [newProficiency, setNewProficiency] = useState(3);
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: skills = [], isLoading } = useQuery<ResourceSkill[]>({
    queryKey: ["/api/human-resources", resourceId, "skills"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!resourceId,
  });

  const { data: catalogItems = [] } = useQuery<SkillCatalog[]>({
    queryKey: ["/api/skill-catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const addSkillMutation = useMutation({
    mutationFn: async (data: { skillName: string; proficiencyLevel: number; isPrimary: boolean }) => {
      const res = await apiRequest("POST", `/api/human-resources/${resourceId}/skills`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources", resourceId, "skills"] });
      setSelectedCatalogId("");
      setNewProficiency(3);
      setNewIsPrimary(false);
      toast({ title: "Skill aggiunta" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore nell'aggiunta della skill", variant: "destructive" });
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: async (skillId: string) => {
      await apiRequest("DELETE", `/api/human-resources/${resourceId}/skills/${skillId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources", resourceId, "skills"] });
      toast({ title: "Skill rimossa" });
    },
  });

  const handleAddSkill = () => {
    if (!selectedCatalogId) return;
    const catalogEntry = catalogItems.find(c => c.id === selectedCatalogId);
    const skillName = catalogEntry ? getSkillFullPath(catalogItems, catalogEntry.id) : selectedCatalogId;
    addSkillMutation.mutate({ skillName, proficiencyLevel: newProficiency, isPrimary: newIsPrimary });
  };

  const leafSkills = catalogItems.filter(item => {
    const hasChildren = catalogItems.some(c => c.parentId === item.id);
    return !hasChildren && item.isActive;
  });

  const allActiveSkills = catalogItems.filter(item => item.isActive);
  const selectableSkills = allActiveSkills.length > 0 ? allActiveSkills : [];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label>Skill dal Catalogo</Label>
          {selectableSkills.length > 0 ? (
            <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
              <SelectTrigger data-testid="select-catalog-skill">
                <SelectValue placeholder="Seleziona skill dal catalogo..." />
              </SelectTrigger>
              <SelectContent>
                {selectableSkills.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {getSkillFullPath(catalogItems, item.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-xs text-muted-foreground border rounded-md p-2">
              Nessuna skill nel catalogo. <a href="/skill-catalog" className="text-primary underline">Crea il catalogo</a>
            </div>
          )}
        </div>
        <div>
          <Label>Livello</Label>
          <StarRating value={newProficiency} onChange={setNewProficiency} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Primaria</Label>
          <Switch checked={newIsPrimary} onCheckedChange={setNewIsPrimary} data-testid="switch-primary-skill" />
        </div>
        <Button
          size="sm"
          onClick={handleAddSkill}
          disabled={!selectedCatalogId || addSkillMutation.isPending}
          data-testid="button-add-skill"
        >
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Caricamento skills...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nessuna skill definita</p>
          <p className="text-xs">Aggiungi le competenze di questa risorsa dal catalogo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              data-testid={`skill-row-${skill.id}`}
            >
              <div className="flex items-center gap-3">
                <Badge variant={skill.isPrimary ? "default" : "outline"} className="text-xs">
                  {skill.skillName}
                </Badge>
                {skill.isPrimary && (
                  <Badge variant="secondary" className="text-xs">Primaria</Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <Star
                      key={level}
                      className={`h-3.5 w-3.5 ${level <= skill.proficiencyLevel ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteSkillMutation.mutate(skill.id)}
                  disabled={deleteSkillMutation.isPending}
                  data-testid={`delete-skill-${skill.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SkillTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  children: SkillTreeNode[];
}

interface AssessmentData {
  skillId: string;
  skillName: string;
  level: number;
  confidence: number;
  source: string;
}

interface DerivedData {
  effectiveLevel: number;
  isDerived: boolean;
  coverage: number;
  leafTotal: number;
  leafWithEvidence: number;
  skillName: string;
}

function ResourceSkillAssessmentsEditor({ resourceId }: { resourceId: string }) {
  const [showDerived, setShowDerived] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assessmentData, isLoading } = useQuery<{ assessments: AssessmentData[]; derived?: Record<string, DerivedData> }>({
    queryKey: ["/api/resources", resourceId, "skill-assessments", showDerived ? "derived" : "leaf"],
    queryFn: async () => {
      const res = await fetch(`/api/resources/${resourceId}/skill-assessments?includeDerived=${showDerived ? "1" : "0"}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!resourceId,
  });

  const { data: catalogItems = [] } = useQuery<SkillCatalog[]>({
    queryKey: ["/api/skill-catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const tree = useMemo(() => {
    const nodeMap = new Map<string, SkillTreeNode>();
    catalogItems.filter(c => c.isActive).forEach(c => nodeMap.set(c.id, { ...c, children: [] }));
    const roots: SkillTreeNode[] = [];
    nodeMap.forEach(node => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [catalogItems]);

  const assessmentMap = useMemo(() => {
    const map = new Map<string, number>();
    assessmentData?.assessments?.forEach(a => map.set(a.skillId, a.level));
    pendingChanges.forEach((level, skillId) => {
      if (level === 0) map.delete(skillId);
      else map.set(skillId, level);
    });
    return map;
  }, [assessmentData, pendingChanges]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = Array.from(pendingChanges.entries()).map(([skillId, level]) => ({
        skillId, level, source: "SELF",
      }));
      const res = await apiRequest("PUT", `/api/resources/${resourceId}/skill-assessments`, items);
      return res.json();
    },
    onSuccess: () => {
      setPendingChanges(new Map());
      queryClient.invalidateQueries({ queryKey: ["/api/resources", resourceId, "skill-assessments"] });
      toast({ title: "Assessments salvati" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message || "Salvataggio fallito", variant: "destructive" });
    },
  });

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
      return next;
    });
  };

  const setLevel = (skillId: string, level: number) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const originalLevel = assessmentData?.assessments?.find(a => a.skillId === skillId)?.level;
      if (originalLevel === level) {
        next.delete(skillId);
      } else {
        next.set(skillId, level);
      }
      return next;
    });
  };

  const isLeaf = (node: SkillTreeNode) => node.children.length === 0;

  const renderNode = (node: SkillTreeNode, depth: number): JSX.Element | null => {
    const isExpanded = expandedNodes.has(node.id);
    const leaf = isLeaf(node);
    const level = assessmentMap.get(node.id) || 0;
    const derivedInfo = showDerived && assessmentData?.derived?.[node.id];
    const hasPending = pendingChanges.has(node.id);

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded transition-colors ${hasPending ? "bg-warning/10" : ""}`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {!leaf ? (
            <button onClick={() => toggleExpand(node.id)} className="p-0.5">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <span className={`text-sm flex-1 ${!leaf ? "font-medium" : ""}`}>{node.name}</span>

          {leaf ? (
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4, 5].map(l => (
                <button
                  key={l}
                  onClick={() => setLevel(node.id, l)}
                  className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                    l === level
                      ? l === 0
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-accent text-muted-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          ) : derivedInfo ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                Lv.{(derivedInfo as DerivedData).effectiveLevel}
              </Badge>
              <span className="text-[10px]">
                {Math.round((derivedInfo as DerivedData).coverage * 100)}% copertura
              </span>
            </div>
          ) : null}
        </div>
        {!leaf && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium">Skill Assessment (Catalogo)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDerived(!showDerived)}
            className="text-xs"
          >
            {showDerived ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
            {showDerived ? "Nascondi derivati" : "Mostra derivati"}
          </Button>
          {pendingChanges.size > 0 && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Salva ({pendingChanges.size})
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Caricamento...</div>
      ) : tree.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nessuna skill nel catalogo.</p>
          <p className="text-xs"><a href="/skill-catalog" className="text-primary underline">Crea il catalogo skills</a></p>
        </div>
      ) : (
        <ScrollArea className="max-h-[400px] border rounded-md p-1">
          {tree.map(node => renderNode(node, 0))}
        </ScrollArea>
      )}
    </div>
  );
}

export default function HumanResourcesPage() {
  const [selectedResources, setSelectedResources] = useState<HumanResource[]>([]);
  const [editingResource, setEditingResource] = useState<HumanResource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkCopyDialog, setShowBulkCopyDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    layout, currentLayoutName, savedLayouts, updateLayout, 
    saveLayoutAs, loadLayout, renameLayout, deleteLayout, updateExistingLayout
  } = useTableLayout('human-resources');
  const viewMode = layout.viewMode;

  const { data: resources = [], isLoading } = useQuery<HumanResource[]>({
    queryKey: ["/api/human-resources"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: fieldMetadata } = useEntityFieldMetadata("human-resources");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/human-resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setShowDeleteDialog(false);
      setEditingResource(null);
      toast({ title: "Eliminato", description: "Risorsa eliminata con successo" });
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (resources: HumanResource[]) => {
      for (const resource of resources) {
        await apiRequest("DELETE", `/api/human-resources/${resource.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setSelectedResources([]);
      setShowBulkDeleteDialog(false);
      toast({ title: "Eliminati", description: "Risorse eliminate con successo" });
    }
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ resources, updates }: { resources: HumanResource[], updates: Record<string, any> }) => {
      await Promise.all(
        resources.map(resource => apiRequest("PUT", `/api/human-resources/${resource.id}`, updates))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setSelectedResources([]);
      setShowBulkEditDialog(false);
      toast({ title: "Modificati", description: "Risorse modificate con successo" });
    }
  });

  const bulkCopyMutation = useMutation({
    mutationFn: async ({ resources, addSuffix, suffix }: { resources: HumanResource[], addSuffix: boolean, suffix: string }) => {
      await Promise.all(
        resources.map(resource => {
          const { id, createdAt, updatedAt, userId, organizationId, ...resourceData } = resource;
          const newResource = {
            ...resourceData,
            name: addSuffix ? `${resource.name}${suffix}` : resource.name,
          };
          return apiRequest("POST", "/api/human-resources", newResource);
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
      setSelectedResources([]);
      setShowBulkCopyDialog(false);
      toast({
        title: "Risorse copiate",
        description: "Le risorse selezionate sono state copiate con successo.",
      });
    },
  });

  const handleEdit = (resource: HumanResource) => {
    setEditingResource(resource);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingResource(null);
    setShowForm(true);
  };

  const handleSingleDelete = (resource: HumanResource) => {
    setEditingResource(resource);
    setShowDeleteDialog(true);
  };

  const handleDelete = (resources: HumanResource[]) => {
    if (resources.length === 0) return;
    setSelectedResources(resources);
    setShowBulkDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (editingResource) {
      deleteMutation.mutate(editingResource.id);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedResources);
  };

  const bulkEditFields: BulkEditField[] = [
    {
      key: "role",
      label: "Ruolo",
      type: "text",
      placeholder: "Es: Developer, Analyst",
    },
    {
      key: "department",
      label: "Dipartimento",
      type: "text",
      placeholder: "Es: IT, Consulting",
    },
    {
      key: "skillLevel",
      label: "Livello",
      type: "select",
      options: [
        { value: "junior", label: "Junior" },
        { value: "mid", label: "Mid" },
        { value: "senior", label: "Senior" },
        { value: "lead", label: "Lead" },
        { value: "principal", label: "Principal" },
      ],
    },
    {
      key: "isActive",
      label: "Stato",
      type: "select",
      options: [
        { value: "true", label: "Attiva" },
        { value: "false", label: "Inattiva" },
      ],
    },
  ];

  const handleBulkEditSave = (updates: Record<string, any>) => {
    const processedUpdates = { ...updates };
    if (updates.isActive !== undefined) {
      processedUpdates.isActive = updates.isActive === "true";
    }
    bulkEditMutation.mutate({ resources: selectedResources, updates: processedUpdates });
  };

  const handleBulkCopy = ({ addSuffix, suffix }: { addSuffix: boolean; suffix: string }) => {
    bulkCopyMutation.mutate({ resources: selectedResources, addSuffix, suffix });
  };

  const getSkillLevelColor = (level: string) => {
    switch(level) {
      case 'junior': return 'bg-success/10 text-success';
      case 'mid': return 'bg-primary/10 text-primary';
      case 'senior': return 'bg-purple-100 text-purple-800';
      case 'lead': return 'bg-warning/10 text-warning';
      case 'principal': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-foreground';
    }
  };

  const columns = [
    createStandardColumns.text("name", "Nome"),
    createStandardColumns.text("role", "Ruolo"),
    createStandardColumns.text("department", "Reparto"),
    createStandardColumns.badge("skillLevel", "Livello", {
      junior: "bg-success/10 text-success",
      mid: "bg-primary/10 text-primary", 
      senior: "bg-purple-100 text-purple-800",
      lead: "bg-warning/10 text-warning",
      principal: "bg-destructive/10 text-destructive"
    }),
    {
      key: "baseHourlyRate",
      label: "Tariffa", 
      sortable: true,
      searchable: false,
      render: (resource: HumanResource) => resource.baseHourlyRate ? `€${resource.baseHourlyRate}/h` : "N/A"
    },
    {
      key: "isActive",
      label: "Stato",
      sortable: true,
      searchable: false,
      render: (resource: HumanResource) => resource.isActive ? "Attivo" : "Inattivo"
    },
  ];

  // Apply layout configuration: filter visible columns and sort by position
  const visibleColumns = useMemo(() => {
    const getColumnKey = (col: any) => col.accessorKey || col.id || col.key;
    
    // If no layout configuration or empty columns config, show all columns
    if (!layout.columns || Object.keys(layout.columns).length === 0) {
      return columns;
    }
    
    // Filter and sort columns based on layout
    return columns
      .filter(col => {
        const key = getColumnKey(col);
        const config = layout.columns[key];
        return config?.visible !== false;
      })
      .sort((a, b) => {
        const posA = layout.columns[getColumnKey(a)]?.position ?? 999;
        const posB = layout.columns[getColumnKey(b)]?.position ?? 999;
        return posA - posB;
      });
  }, [columns, layout.columns]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Risorse Umane"
          subtitle="Gestisci le risorse umane"
          onNewClick={handleAdd}
        />
        <main 
          className="p-6 space-y-6 rounded-t-lg min-h-full"
          style={{ 
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          <ListViewToolbar
            currentLayoutName={currentLayoutName}
            savedLayouts={savedLayouts}
            onLoadLayout={loadLayout}
            onRenameLayout={renameLayout}
            onDeleteLayout={deleteLayout}
            onConfigureTable={() => setShowConfigDialog(true)}
            onCreateNew={handleAdd}
            onCopySelected={() => setShowBulkCopyDialog(true)}
            onBulkEdit={() => setShowBulkEditDialog(true)}
            onDeleteSelected={() => handleDelete(selectedResources)}
            hasSelection={selectedResources.length > 0}
          />

          <UniversalTable
            data={resources}
            columns={visibleColumns}
            enableSelection={true}
            enableSearch={true}
            searchPlaceholder="Cerca risorse..."
            onSelectionChange={(rows) => setSelectedResources(rows as HumanResource[])}
            onRowClick={handleEdit}
          />

          {/* Create/Edit Dialog */}
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingResource ? "Modifica Risorsa" : "Nuova Risorsa"}
                </DialogTitle>
                <DialogDescription>
                  {editingResource ? "Aggiorna" : "Crea"} una risorsa umana
                </DialogDescription>
              </DialogHeader>
              {editingResource ? (
                <Tabs defaultValue="details">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details" data-testid="tab-details">
                      <UserIcon className="h-4 w-4 mr-1" />
                      Dettagli
                    </TabsTrigger>
                    <TabsTrigger value="skills" data-testid="tab-skills">
                      <Sparkles className="h-4 w-4 mr-1" />
                      Skills
                    </TabsTrigger>
                    <TabsTrigger value="assessments" data-testid="tab-assessments">
                      <Brain className="h-4 w-4 mr-1" />
                      Assessment
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="details">
                    <HumanResourceForm
                      humanResource={editingResource}
                      onSuccess={() => {
                        setShowForm(false);
                        setEditingResource(null);
                        queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="skills">
                    <ResourceSkillsManager resourceId={editingResource.id} />
                  </TabsContent>
                  <TabsContent value="assessments">
                    <ResourceSkillAssessmentsEditor resourceId={editingResource.id} />
                  </TabsContent>
                </Tabs>
              ) : (
                <HumanResourceForm
                  onSuccess={() => {
                    setShowForm(false);
                    setEditingResource(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/human-resources"] });
                  }}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Single Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Risorsa</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare "{editingResource?.name}"? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>Elimina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bulk Delete Dialog */}
          <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma Eliminazione Multipla</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare {selectedResources.length} risorse selezionate? 
                  Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={confirmBulkDelete}>
                  Elimina {selectedResources.length} Risorse
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bulk Copy Dialog */}
          <BulkCopyDialog
            open={showBulkCopyDialog}
            onOpenChange={setShowBulkCopyDialog}
            title="Copia Risorse"
            description="Crea copie delle risorse"
            selectedCount={selectedResources.length}
            onCopy={handleBulkCopy}
            isPending={bulkCopyMutation.isPending}
          />

          {/* Table Configuration Dialog */}
          <TableConfiguration
            isOpen={showConfigDialog}
            onOpenChange={setShowConfigDialog}
            tableId="human-resources"
            availableColumns={availableColumns.length > 0 ? availableColumns : [
              { id: 'name', label: 'Nome' },
              { id: 'role', label: 'Ruolo' },
              { id: 'department', label: 'Reparto' },
              { id: 'skillLevel', label: 'Livello' },
              { id: 'baseHourlyRate', label: 'Tariffa' },
              { id: 'isActive', label: 'Stato' },
            ]}
            editingLayout={editingLayout}
            onSave={(layoutData) => {
              const { layoutName, saveAsDefault, ...config } = layoutData;
              if (layoutName && layoutName !== 'Default' && layoutName !== 'default') {
                saveLayoutAs(layoutName);
              }
              updateLayout(config);
              setShowConfigDialog(false);
            }}
            onCancel={() => setShowConfigDialog(false)}
          />

          {/* Bulk Edit Dialog */}
          <BulkEditDialog
            open={showBulkEditDialog}
            onOpenChange={setShowBulkEditDialog}
            title="Modifica Multipla Risorse"
            description={`Modifica ${selectedResources.length} risorse selezionate`}
            fields={bulkEditFields}
            selectedCount={selectedResources.length}
            onSave={handleBulkEditSave}
            isPending={bulkEditMutation.isPending}
          />
        </main>
      </div>
    </div>
  );
}