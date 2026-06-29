import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Workflow, Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TRIGGER_EVENTS = [
  { value: "created", label: "Creazione" },
  { value: "updated", label: "Modifica" },
  { value: "deleted", label: "Eliminazione" },
];
const ACTOR_ACTIONS = ["inform", "approve", "review"];
const ACTION_TYPES = ["notify", "request_approval", "send_email", "create_task"];
const STATUSES = ["draft", "active", "inactive"];

interface WorkflowField { name: string; label: string; type: string; enumValues?: string[]; relationEntity?: string; }
interface WorkflowEntity { entityType: string; label: string; fields: WorkflowField[]; }
interface Operator { value: string; label: string; types: string[]; }
interface Actor { contactEmail: string; action: string; }
interface Action { type: string; config?: Record<string, any>; }
interface Condition { field: string; operator: string; value: string; }

interface WorkflowRow {
  id: string; name: string; description: string | null; entityType: string;
  entityId: string | null; triggerEvent: string;
  conditions: { rules?: Condition[] } | null;
  actors: Actor[] | null; actions: Action[] | null; status: string;
}
interface ContactRow { id: string; name: string; email: string; }

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  active: "default", draft: "secondary", inactive: "outline",
};

const emptyForm = {
  name: "", description: "", entityType: "project", entityId: "",
  triggerEvent: "updated", conditions: [] as Condition[],
  actors: [] as Actor[], actions: [] as Action[], status: "draft" as string,
};

export default function WorkflowsPage() {
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: meta } = useQuery<{ entities: WorkflowEntity[]; operators: Operator[] }>({
    queryKey: ["/api/workflow-entities"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const entities = meta?.entities || [];
  const operators = meta?.operators || [];

  const { data: rows, isLoading } = useQuery<WorkflowRow[]>({
    queryKey: ["/api/workflows"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: contacts } = useQuery<ContactRow[]>({
    queryKey: ["/api/contacts"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const selectedEntity = entities.find((e) => e.entityType === form.entityType);
  const entityLabel = (et: string) => entities.find((e) => e.entityType === et)?.label || et;

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const body = {
        name: data.name, description: data.description, entityType: data.entityType,
        entityId: data.entityId || null, triggerEvent: data.triggerEvent,
        conditions: data.triggerEvent === "updated" && data.conditions.length
          ? { rules: data.conditions.filter((c) => c.field && c.operator) }
          : null,
        actors: data.actors, actions: data.actions, status: data.status,
      };
      if (editId) return apiRequest("PATCH", `/api/workflows/${editId}`, body);
      return apiRequest("POST", "/api/workflows", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setEditOpen(false);
      toast({ title: editId ? "Workflow aggiornato" : "Workflow creato" });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/workflows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow eliminato" });
    },
  });

  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setEditOpen(true);
  }

  function openEdit(w: WorkflowRow) {
    setEditId(w.id);
    setForm({
      name: w.name, description: w.description || "", entityType: w.entityType,
      entityId: w.entityId || "", triggerEvent: w.triggerEvent,
      conditions: w.conditions?.rules || [],
      actors: w.actors || [], actions: w.actions || [], status: w.status,
    });
    setEditOpen(true);
  }

  // Operators valid for a given field's type
  function operatorsForField(fieldName: string): Operator[] {
    const f = selectedEntity?.fields.find((x) => x.name === fieldName);
    if (!f) return operators;
    return operators.filter((op) => op.types.includes(f.type));
  }
  function fieldMeta(fieldName: string): WorkflowField | undefined {
    return selectedEntity?.fields.find((x) => x.name === fieldName);
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Workflow" subtitle="Configuratore automazioni per entità" />
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" /> Workflow configurati
            </h2>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Nuovo Workflow
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Entità</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Condizioni</TableHead>
                      <TableHead>Attori</TableHead>
                      <TableHead>Azioni</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rows || []).map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell><Badge variant="outline">{entityLabel(w.entityType)}</Badge></TableCell>
                        <TableCell>{TRIGGER_EVENTS.find((e) => e.value === w.triggerEvent)?.label || w.triggerEvent}</TableCell>
                        <TableCell>{w.conditions?.rules?.length || 0}</TableCell>
                        <TableCell>{(w.actors || []).length}</TableCell>
                        <TableCell className="text-xs">{(w.actions || []).map((a) => a.type).join(", ") || "—"}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANTS[w.status]}>{w.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(w)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => {
                              if (confirm("Eliminare questo workflow?")) deleteMutation.mutate(w.id);
                            }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(rows || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                          Nessun workflow configurato
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>{editId ? "Modifica Workflow" : "Nuovo Workflow"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Approvazione completamento progetto" />
                </div>
                <div>
                  <Label>Descrizione</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Entità (trigger)</Label>
                    <Select value={form.entityType} onValueChange={(v) => setForm({ ...form, entityType: v, conditions: [] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {entities.map((e) => (
                          <SelectItem key={e.entityType} value={e.entityType}>
                            {e.label} <span className="text-muted-foreground font-mono text-xs">({e.entityType})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Evento</Label>
                    <Select value={form.triggerEvent} onValueChange={(v) => setForm({ ...form, triggerEvent: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Conditions — only for "updated" */}
                {form.triggerEvent === "updated" && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Label>Condizioni sui campi (modifica)</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: "", operator: "eq", value: "" }] })}>
                        <Plus className="h-3 w-3 mr-1" /> Condizione
                      </Button>
                    </div>
                    {form.conditions.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nessuna condizione: il workflow scatta ad ogni modifica.</p>
                    )}
                    {form.conditions.map((c, i) => {
                      const fm = fieldMeta(c.field);
                      return (
                        <div key={i} className="flex gap-2 items-center">
                          <Select value={c.field} onValueChange={(v) => {
                            const next = [...form.conditions]; next[i] = { ...next[i], field: v, value: "" }; setForm({ ...form, conditions: next });
                          }}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="Campo" /></SelectTrigger>
                            <SelectContent>
                              {(selectedEntity?.fields || []).map((f) => (
                                <SelectItem key={f.name} value={f.name}>
                                  {f.label} <span className="text-muted-foreground font-mono text-xs">({f.name})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={c.operator} onValueChange={(v) => {
                            const next = [...form.conditions]; next[i] = { ...next[i], operator: v }; setForm({ ...form, conditions: next });
                          }}>
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {operatorsForField(c.field).map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {c.operator !== "changed" && (
                            fm?.type === "enum" ? (
                              <Select value={c.value} onValueChange={(v) => {
                                const next = [...form.conditions]; next[i] = { ...next[i], value: v }; setForm({ ...form, conditions: next });
                              }}>
                                <SelectTrigger className="w-40"><SelectValue placeholder="Valore" /></SelectTrigger>
                                <SelectContent>
                                  {(fm.enumValues || []).map((ev) => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input className="w-40" value={c.value} placeholder="Valore" onChange={(e) => {
                                const next = [...form.conditions]; next[i] = { ...next[i], value: e.target.value }; setForm({ ...form, conditions: next });
                              }} />
                            )
                          )}
                          <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, conditions: form.conditions.filter((_, j) => j !== i) })}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <Label>ID record specifico (opzionale)</Label>
                  <Input value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} placeholder="lascia vuoto per tutti i record dell'entità" />
                </div>

                {/* Actors */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Attori (chi è coinvolto)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, actors: [...form.actors, { contactEmail: "", action: "inform" }] })}>
                      <Plus className="h-3 w-3 mr-1" /> Attore
                    </Button>
                  </div>
                  {form.actors.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Select value={a.contactEmail} onValueChange={(v) => {
                        const next = [...form.actors]; next[i] = { ...next[i], contactEmail: v }; setForm({ ...form, actors: next });
                      }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Contatto" /></SelectTrigger>
                        <SelectContent>
                          {(contacts || []).map((c) => <SelectItem key={c.id} value={c.email}>{c.name} &lt;{c.email}&gt;</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={a.action} onValueChange={(v) => {
                        const next = [...form.actors]; next[i] = { ...next[i], action: v }; setForm({ ...form, actors: next });
                      }}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTOR_ACTIONS.map((act) => <SelectItem key={act} value={act}>{act}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, actors: form.actors.filter((_, j) => j !== i) })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Azioni (cosa succede)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, actions: [...form.actions, { type: "notify" }] })}>
                      <Plus className="h-3 w-3 mr-1" /> Azione
                    </Button>
                  </div>
                  {form.actions.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Select value={a.type} onValueChange={(v) => {
                        const next = [...form.actions]; next[i] = { ...next[i], type: v }; setForm({ ...form, actions: next });
                      }}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <Label>Stato</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
                <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editId ? "Salva" : "Crea"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}
