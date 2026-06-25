import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Cpu, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiProvider {
  id: string;
  name: string;
  slug: string;
}

interface AiModel {
  id: string;
  providerId: string;
  providerName?: string;
  modelKey: string;
  modelId: string;
  displayName: string;
  inputPricePerMToken: string | null;
  outputPricePerMToken: string | null;
  capabilities: { toolUse?: boolean; vision?: boolean; json?: boolean; maxContextTokens?: number } | null;
  status: "active" | "deprecated" | "beta";
}

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  deprecated: "Deprecato",
  beta: "Beta",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  deprecated: "destructive",
  beta: "secondary",
};

const emptyForm = {
  providerId: "",
  modelKey: "",
  modelId: "",
  displayName: "",
  inputPricePerMToken: "",
  outputPricePerMToken: "",
  status: "active" as const,
};

export default function AiModelsPage() {
  const { currentOrganizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: models, isLoading } = useQuery<AiModel[]>({
    queryKey: ["/api/ai/models/all"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: providers } = useQuery<AiProvider[]>({
    queryKey: ["/api/ai/providers"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string }) => {
      const { id, ...body } = data;
      if (id) {
        return apiRequest("PATCH", `/api/ai/models/${id}`, body);
      }
      return apiRequest("POST", "/api/ai/models", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models"] });
      setEditOpen(false);
      toast({ title: editId ? "Modello aggiornato" : "Modello creato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ai/models/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/models"] });
      toast({ title: "Modello eliminato" });
    },
  });

  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setEditOpen(true);
  }

  function openEdit(m: AiModel) {
    setEditId(m.id);
    setForm({
      providerId: m.providerId,
      modelKey: m.modelKey,
      modelId: m.modelId,
      displayName: m.displayName,
      inputPricePerMToken: m.inputPricePerMToken || "",
      outputPricePerMToken: m.outputPricePerMToken || "",
      status: m.status,
    });
    setEditOpen(true);
  }

  function handleSave() {
    saveMutation.mutate({ ...form, id: editId ?? undefined });
  }

  const providerMap = new Map((providers || []).map((p) => [p.id, p.name]));

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Modelli AI" subtitle="Gestione modelli e provider AI" />
        <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              Modelli configurati
            </h2>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Nuovo Modello
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
                      <TableHead>Model Key</TableHead>
                      <TableHead>Model ID (API)</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Input $/1M</TableHead>
                      <TableHead>Output $/1M</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(models || []).map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.displayName}</TableCell>
                        <TableCell className="font-mono text-xs">{m.modelKey}</TableCell>
                        <TableCell className="font-mono text-xs">{m.modelId}</TableCell>
                        <TableCell>{(m as any).providerName || providerMap.get(m.providerId) || m.providerId}</TableCell>
                        <TableCell>{m.inputPricePerMToken ? `$${m.inputPricePerMToken}` : "—"}</TableCell>
                        <TableCell>{m.outputPricePerMToken ? `$${m.outputPricePerMToken}` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[m.status]}>
                            {STATUS_LABELS[m.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Eliminare questo modello?")) deleteMutation.mutate(m.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(models || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                          Nessun modello configurato
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editId ? "Modifica Modello" : "Nuovo Modello"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select value={form.providerId} onValueChange={(v) => setForm({ ...form, providerId: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleziona provider" /></SelectTrigger>
                    <SelectContent>
                      {(providers || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Display Name</Label>
                  <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Claude Opus 4.8" />
                </div>
                <div>
                  <Label>Model Key</Label>
                  <Input value={form.modelKey} onChange={(e) => setForm({ ...form, modelKey: e.target.value })} placeholder="anthropic/claude-opus-4-8" />
                  <p className="text-xs text-muted-foreground mt-1">Formato: provider/model-name</p>
                </div>
                <div>
                  <Label>Model ID (API)</Label>
                  <Input value={form.modelId} onChange={(e) => setForm({ ...form, modelId: e.target.value })} placeholder="claude-opus-4-8" />
                  <p className="text-xs text-muted-foreground mt-1">ID esatto inviato all'API del provider. Nessun suffisso data.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Input $/1M tokens</Label>
                    <Input value={form.inputPricePerMToken} onChange={(e) => setForm({ ...form, inputPricePerMToken: e.target.value })} placeholder="5.00" />
                  </div>
                  <div>
                    <Label>Output $/1M tokens</Label>
                    <Input value={form.outputPricePerMToken} onChange={(e) => setForm({ ...form, outputPricePerMToken: e.target.value })} placeholder="25.00" />
                  </div>
                </div>
                <div>
                  <Label>Stato</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Attivo</SelectItem>
                      <SelectItem value="beta">Beta</SelectItem>
                      <SelectItem value="deprecated">Deprecato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
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
