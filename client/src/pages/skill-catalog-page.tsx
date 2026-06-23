import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Plus, ChevronRight, ChevronDown, Pencil, Trash2, FolderTree, GripVertical } from "lucide-react";
import type { SkillCatalog } from "@shared/schema";

interface TreeNode extends SkillCatalog {
  children: TreeNode[];
  level: number;
}

function buildTree(items: SkillCatalog[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  items.forEach(item => {
    map.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach(item => {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      const parent = map.get(item.parentId)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const setLevels = (nodes: TreeNode[], level: number) => {
    nodes.forEach(n => { n.level = level; setLevels(n.children, level + 1); });
  };
  setLevels(roots, 0);

  return roots;
}

function getFullPath(items: SkillCatalog[], itemId: string): string {
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

function SkillTreeItem({
  node,
  allItems,
  expandedIds,
  onToggle,
  onEdit,
  onDelete,
  onAddChild,
}: {
  node: TreeNode;
  allItems: SkillCatalog[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (item: SkillCatalog) => void;
  onDelete: (item: SkillCatalog) => void;
  onAddChild: (parentId: string) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors group"
        style={{ paddingLeft: `${node.level * 24 + 12}px` }}
        data-testid={`skill-tree-${node.id}`}
      >
        <button
          className="w-5 h-5 flex items-center justify-center text-muted-foreground"
          onClick={() => hasChildren && onToggle(node.id)}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <GripVertical className="h-3 w-3 opacity-30" />
          )}
        </button>

        <span className={`flex-1 text-sm ${!node.isActive ? 'text-muted-foreground line-through' : ''}`}>
          {node.name}
        </span>

        {node.description && (
          <span className="text-xs text-muted-foreground hidden md:inline max-w-[200px] truncate">
            {node.description}
          </span>
        )}

        {hasChildren && (
          <Badge variant="secondary" className="text-xs">
            {node.children.length}
          </Badge>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddChild(node.id)} data-testid={`add-child-${node.id}`}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)} data-testid={`edit-skill-${node.id}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(node)} data-testid={`delete-skill-${node.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isExpanded && node.children.map(child => (
        <SkillTreeItem
          key={child.id}
          node={child}
          allItems={allItems}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
}

export default function SkillCatalogPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillCatalog | null>(null);
  const [parentIdForNew, setParentIdForNew] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<SkillCatalog | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formIsActive, setFormIsActive] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: skills = [], isLoading } = useQuery<SkillCatalog[]>({
    queryKey: ["/api/skill-catalog"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const tree = useMemo(() => buildTree(skills), [skills]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; parentId?: string | null; description?: string; sortOrder: number; isActive: boolean }) => {
      const res = await apiRequest("POST", "/api/skill-catalog", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skill-catalog"] });
      resetForm();
      toast({ title: "Skill creata" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore nella creazione", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/skill-catalog/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skill-catalog"] });
      resetForm();
      toast({ title: "Skill aggiornata" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/skill-catalog/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skill-catalog"] });
      setShowDeleteDialog(false);
      setDeletingSkill(null);
      toast({ title: "Skill eliminata" });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingSkill(null);
    setParentIdForNew(null);
    setFormName("");
    setFormDescription("");
    setFormParentId(null);
    setFormSortOrder(0);
    setFormIsActive(true);
  };

  const handleAdd = (parentId?: string) => {
    resetForm();
    if (parentId) {
      setFormParentId(parentId);
      setParentIdForNew(parentId);
      setExpandedIds(prev => new Set([...prev, parentId]));
    }
    setShowForm(true);
  };

  const handleEdit = (skill: SkillCatalog) => {
    setEditingSkill(skill);
    setFormName(skill.name);
    setFormDescription(skill.description || "");
    setFormParentId(skill.parentId || null);
    setFormSortOrder(skill.sortOrder);
    setFormIsActive(skill.isActive);
    setShowForm(true);
  };

  const handleDelete = (skill: SkillCatalog) => {
    setDeletingSkill(skill);
    setShowDeleteDialog(true);
  };

  const handleToggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(skills.map(s => s.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    const data = {
      name: formName.trim(),
      parentId: formParentId || null,
      description: formDescription.trim() || null,
      sortOrder: formSortOrder,
      isActive: formIsActive,
    };
    if (editingSkill) {
      updateMutation.mutate({ id: editingSkill.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const rootSkills = skills.filter(s => !s.parentId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header
          title="Catalogo Skills"
          subtitle="Gestione gerarchica delle competenze"
          onNewClick={() => handleAdd()}
        />
        <div
          className="p-6 rounded-t-lg min-h-full"
          style={{
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{skills.length} skills totali</Badge>
              <Badge variant="outline">{rootSkills.length} categorie principali</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>Espandi tutto</Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>Comprimi tutto</Button>
              <Button size="sm" onClick={() => handleAdd()} data-testid="button-add-root-skill">
                <Plus className="h-4 w-4 mr-1" />
                Nuova Skill
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Caricamento catalogo skills...</div>
          ) : skills.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FolderTree className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Nessuna skill definita</p>
                <p className="text-sm mb-4">Crea la prima categoria per iniziare a costruire l'albero delle competenze</p>
                <Button onClick={() => handleAdd()} data-testid="button-empty-add">
                  <Plus className="h-4 w-4 mr-1" />
                  Crea prima skill
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-2">
                {tree.map(node => (
                  <SkillTreeItem
                    key={node.id}
                    node={node}
                    allItems={skills}
                    expandedIds={expandedIds}
                    onToggle={handleToggle}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onAddChild={(parentId) => handleAdd(parentId)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingSkill ? "Modifica Skill" : "Nuova Skill"}
                </DialogTitle>
                <DialogDescription>
                  {editingSkill ? "Aggiorna i dati della skill" : "Aggiungi una nuova competenza al catalogo"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="es. SAP ABAP"
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    data-testid="input-skill-name"
                  />
                </div>

                <div>
                  <Label>Descrizione</Label>
                  <Textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Descrizione opzionale della competenza..."
                    className="h-20"
                    data-testid="textarea-skill-description"
                  />
                </div>

                <div>
                  <Label>Categoria Padre</Label>
                  <Select
                    value={formParentId || "none"}
                    onValueChange={(v) => setFormParentId(v === "none" ? null : v)}
                  >
                    <SelectTrigger data-testid="select-parent-skill">
                      <SelectValue placeholder="Nessuna (skill radice)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna (skill radice)</SelectItem>
                      {skills
                        .filter(s => s.id !== editingSkill?.id)
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {getFullPath(skills, s.id)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Ordine</Label>
                    <Input
                      type="number"
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                      data-testid="input-sort-order"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={formIsActive}
                      onCheckedChange={setFormIsActive}
                      data-testid="switch-skill-active"
                    />
                    <Label>Attiva</Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={resetForm}>Annulla</Button>
                  <Button
                    onClick={handleSave}
                    disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-skill"
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Salvando..." : (editingSkill ? "Aggiorna" : "Crea")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Elimina Skill</AlertDialogTitle>
                <AlertDialogDescription>
                  Sei sicuro di voler eliminare "{deletingSkill?.name}"?
                  {skills.some(s => s.parentId === deletingSkill?.id) &&
                    " Le sotto-skill diventeranno skill radice."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => deletingSkill && deleteMutation.mutate(deletingSkill.id)}>
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  );
}