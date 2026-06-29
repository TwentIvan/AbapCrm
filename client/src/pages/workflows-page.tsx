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
import { Switch } from "@/components/ui/switch";
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

// Entity types whose events can drive a workflow (data-driven; extendable)
const ENTITY_TYPES = ["project", "task", "deal", "contact", "milestone", "message", "sales_order", "quote"];
const TRIGGER_EVENTS = ["created", "updated", "status_changed", "field_changed", "threshold_reached", "completed"];
const ACTOR_ACTIONS = ["inform", "approve", "review"];
const ACTION_TYPES = ["notify", "request_approval", "send_email", "create_task"];
const STATUSES = ["draft", "active", "inactive"];

interface Actor { contactEmail: string; action: string; }
interface Action { type: string; config?: Record<string, any>; }

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  entityId: string | null;
  triggerEvent: string;
  triggerConfig: Record<string, any> | null;
  actors: Actor[] | null;
  actions: Action[] | null;
  status: string;
}

interface ContactRow { id: string; name: string; email: string; }

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  active: "default", draft: "secondary", inactive: "outline",
};

const emptyForm = {
  name: "", description: "", entityType: "project", entityId: "",
  triggerEvent: "status_changed", triggerField: "", triggerValue: "",
  actors: [] as Actor[], actions: [] as Action[], status: "draft" as string,
};

export default function WorkflowsPage() {
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

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

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const triggerConfig: Record<string, any> = {};
      if (data.triggerField) triggerConfig.field = data.triggerField;
      if (data.triggerValue) {
        triggerConfig[data.triggerEvent === "threshold_reached" ? "threshold" : "toValue"] =
          data.triggerEvent === "threshold_reached" ? Number(data.triggerValue) : data.triggerValue;
      }
      const body = {
        name: data.name, description: data.description, entityType: data.entityType,
        entityId: data.entityId || null, triggerEvent: data.triggerEvent,
        triggerConfig: Object.keys(triggerConfig).length ? triggerConfig : null,
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
    const tc = w.triggerConfig || {};
    setForm({
      name: w.name, description: w.description || "", entityType: w.entityType,
      entityId: w.entityId || "", triggerEvent: w.triggerEvent,
      triggerField: tc.field || "",
      triggerValue: tc.toValue ?? tc.threshold ?? "",
      actors: w.actors || [], actions: w.actions || [], status: w.status,
    });
    setEditOpen(true);
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
                        <TableCell><Badge variant="outline">{w.entityType}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{w.triggerEvent}</TableCell>
                        <TableCell>{(w.actors || []).length}</TableCell>
                        <TableCell className="text-xs">{(w.actions || []).map(a => a.type).join(", ") || "—"}</TableCell>
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
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
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
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Approvazione completamento" />
                </div>
                <div>
                  <Label>Descrizione</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Entità (trigger)</Label>
                    <Select value={form.entityType} onValueChange={(v) => setForm({ ...form, entityType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ENTITY_TYPES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Evento</Label>
                    <Select value={form.triggerEvent} onValueChange={(v) => setForm({ ...form, triggerEvent: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_EVENTS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Campo (opzionale)</Label>
                    <Input value={form.triggerField} onChange={(e) => setForm({ ...form, triggerField: e.target.value })} placeholder="es. status, completionPercentage" />
                  </div>
                  <div>
                    <Label>Valore / Soglia</Label>
                    <Input value={form.triggerValue} onChange={(e) => setForm({ ...form, triggerValue: e.target.value })} placeholder="es. completed, 50" />
                  </div>
                </div>
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
