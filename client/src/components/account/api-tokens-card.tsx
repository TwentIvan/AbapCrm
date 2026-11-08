import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ApiTokenItem {
  id: number;
  name: string;
  prefix: string;
  /** null = «tutte le mie organizzazioni». */
  organizationId: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

interface CreatedToken extends Omit<ApiTokenItem, "createdAt" | "lastUsedAt"> {
  token: string;
}

const QUERY_KEY = ["/api/account/api-tokens"];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("it-IT") : "mai";
}

export default function ApiTokensCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizations, currentOrganization } = useOrganization();
  const [name, setName] = useState("");
  const [allOrganizations, setAllOrganizations] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiTokenItem | null>(null);

  const { data: tokens = [], isLoading } = useQuery<ApiTokenItem[]>({
    queryKey: QUERY_KEY,
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; allOrganizations: boolean }) => {
      const res = await apiRequest("POST", "/api/account/api-tokens", input);
      return (await res.json()) as CreatedToken;
    },
    onSuccess: (data) => {
      setCreated(data);
      setName("");
      setAllOrganizations(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error: Error) =>
      toast({ title: "Token non creato", description: error.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/account/api-tokens/${id}`);
    },
    onSuccess: () => {
      setToRevoke(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Token revocato" });
    },
    onError: (error: Error) =>
      toast({ title: "Token non revocato", description: error.message, variant: "destructive" }),
  });

  const orgName = (id: string | null) =>
    id === null ? "Tutte le organizzazioni" : organizations?.find((o) => o.id === id)?.name ?? id;

  const copyToken = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      toast({ title: "Token copiato" });
    } catch {
      toast({ title: "Copia non riuscita", description: "Selezionalo e copialo a mano.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token API</CardTitle>
        <CardDescription>
          Token personali per chiamare le API di The Hub Up da un agente esterno con l'intestazione
          Authorization: Bearer. Un token vale per l'organizzazione attiva alla creazione oppure per tutte
          le tue organizzazioni.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMutation.mutate({ name: name.trim(), allOrganizations });
          }}
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="api-token-name">Nuovo token</Label>
              <Input
                id="api-token-name"
                value={name}
                maxLength={100}
                placeholder="Nome, ad esempio «Botcave»"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              Crea token
            </Button>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Organizzazione: {allOrganizations ? "tutte le tue organizzazioni" : currentOrganization?.name ?? "attiva"}
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="api-token-all-orgs"
                checked={allOrganizations}
                onCheckedChange={(checked) => setAllOrganizations(checked === true)}
              />
              <Label htmlFor="api-token-all-orgs">Tutte le mie organizzazioni</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Il token usa l'organizzazione indicata da ogni richiesta (header X-Organization-Id), solo tra quelle a
              cui hai accesso.
            </p>
          </div>
        </form>

        {created && (
          <div className="rounded-md border p-4 space-y-2" data-testid="api-token-created">
            <p className="text-sm font-medium">Copialo ora: non lo vedrai più</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{created.token}</code>
              <Button type="button" variant="outline" onClick={copyToken}>
                Copia
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreated(null)}>
                Chiudi
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun token attivo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Organizzazione</TableHead>
                <TableHead>Creato il</TableHead>
                <TableHead>Scade il</TableHead>
                <TableHead>Ultimo uso</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">thu_{t.prefix}…</TableCell>
                  <TableCell>{orgName(t.organizationId)}</TableCell>
                  <TableCell>{formatDate(t.createdAt)}</TableCell>
                  <TableCell>{formatDate(t.expiresAt)}</TableCell>
                  <TableCell>{formatDate(t.lastUsedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => setToRevoke(t)}>
                      Revoca
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={!!toRevoke} onOpenChange={(open) => !open && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare il token «{toRevoke?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Chi lo usa smette di poter chiamare le API. L'operazione non si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => toRevoke && revokeMutation.mutate(toRevoke.id)}>
              Revoca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
