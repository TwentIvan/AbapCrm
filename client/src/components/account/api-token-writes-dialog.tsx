import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ApiTokenWrite {
  id: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  organizationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface WritesPage {
  items: ApiTokenWrite[];
  nextBefore: number | null;
}

const PAGE_SIZE = 50;

function statusClass(status: number): string {
  if (status >= 500 || status === 499) return "text-destructive";
  if (status >= 400) return "text-amber-600";
  return "text-muted-foreground";
}

/** Audit delle scritture fatte con un token API (solo il proprietario, con la sessione). */
export default function ApiTokenWritesDialog({
  token,
  orgName,
  onClose,
}: {
  token: { id: number; name: string } | null;
  orgName: (id: string | null) => string;
  onClose: () => void;
}) {
  const query = useInfiniteQuery<WritesPage>({
    queryKey: ["/api/account/api-tokens", token?.id, "writes"],
    enabled: !!token,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam) params.set("before", String(pageParam));
      const res = await apiRequest("GET", `/api/account/api-tokens/${token!.id}/writes?${params}`);
      return (await res.json()) as WritesPage;
    },
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Dialog open={!!token} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Attività del token «{token?.name}»</DialogTitle>
          <DialogDescription>
            Le scritture (creazioni, modifiche, cancellazioni) fatte con questo token, dalla più recente. Il contenuto
            delle richieste non viene conservato.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">Attività non disponibile.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna scrittura registrata.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto" data-testid="api-token-writes">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Operazione</TableHead>
                  <TableHead>Esito</TableHead>
                  <TableHead>Organizzazione</TableHead>
                  <TableHead>Origine</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(w.createdAt).toLocaleString("it-IT")}
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {w.method} {w.path}
                    </TableCell>
                    <TableCell className={`text-xs ${statusClass(w.statusCode)}`}>
                      {w.statusCode} · {w.durationMs} ms
                    </TableCell>
                    <TableCell className="text-xs">{w.organizationId ? orgName(w.organizationId) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={w.userAgent ?? undefined}>
                      {w.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {query.hasNextPage && (
              <div className="pt-3 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  Mostra altre
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
