import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCurrentOrganizationId } from "@/lib/queryClient";
import {
  frequencyLabels,
  obligationBlockerLabels,
  runStatusLabels,
  startObligationWithBotcave,
  type DueObligation,
} from "@/lib/obligation-automation";

// Agenda degli obblighi dichiarativi da adempiere (GET /api/obligations/due): per ciascuno la scadenza in corso,
// l'ultima esecuzione registrata per quella scadenza e «Esegui con Botcave», che apre il pannello Botcave con
// l'obbligo come contesto. L'adempimento lo fa la squadra Botcave; qui non si scrive nulla.

const WINDOWS = ["7", "30", "90", "366"];

function dueBadge(item: DueObligation) {
  if (item.daysToDue === null) return <Badge variant="outline">Senza scadenza</Badge>;
  if (item.overdue) return <Badge variant="destructive">Scaduto da {-item.daysToDue} g</Badge>;
  if (item.daysToDue === 0) return <Badge variant="destructive">Scade oggi</Badge>;
  return <Badge variant={item.daysToDue <= 7 ? "default" : "secondary"}>Fra {item.daysToDue} g</Badge>;
}

export default function ObligationsPage() {
  const { toast } = useToast();
  const [withinDays, setWithinDays] = useState("30");
  const [includeDone, setIncludeDone] = useState(false);

  const { data, isLoading, error } = useQuery<DueObligation[]>({
    queryKey: [
      `/api/obligations/due?withinDays=${withinDays}&includeDone=${includeDone}`,
      { organizationId: getCurrentOrganizationId() },
    ],
  });

  const handleRun = async (item: DueObligation) => {
    const outcome = await startObligationWithBotcave(item.obligation);
    if (outcome.kind === "blocked") {
      toast({ title: "Obbligo non eseguibile con Botcave", description: outcome.reasons.join("; "), variant: "destructive" });
    } else if (outcome.kind === "no-panel") {
      toast({ title: "Pannello Botcave non disponibile", description: "Lo script del pannello Botcave non è caricato.", variant: "destructive" });
    } else if (outcome.kind === "error") {
      toast({ title: "Esecuzione con Botcave non avviata", description: outcome.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <Header
          title="Obblighi dichiarativi"
          subtitle="Scadenze da adempiere, automatizzate dalla squadra Botcave"
        />
        <main className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Label htmlFor="obligations-window">Scadenze entro</Label>
              <Select value={withinDays} onValueChange={setWithinDays}>
                <SelectTrigger id="obligations-window" className="w-32" data-testid="select-obligations-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((w) => (
                    <SelectItem key={w} value={w}>{w} giorni</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="obligations-include-done"
                checked={includeDone}
                onCheckedChange={setIncludeDone}
                data-testid="switch-obligations-include-done"
              />
              <Label htmlFor="obligations-include-done">Mostra anche quelli già adempiuti</Label>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Impossibile leggere gli obblighi: {(error as Error).message}</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-obligations-empty">
              Nessun obbligo da adempiere entro {withinDays} giorni.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obbligo</TableHead>
                  <TableHead>Ente</TableHead>
                  <TableHead>Frequenza</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Ultima esecuzione</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.obligation.id} data-testid={`row-obligation-${item.obligation.id}`}>
                    <TableCell>
                      <div className="font-medium">{item.obligation.code}</div>
                      <div className="text-xs text-muted-foreground">{item.obligation.name}</div>
                      {item.obligation.dueRule && (
                        <div className="text-xs text-muted-foreground italic">{item.obligation.dueRule}</div>
                      )}
                    </TableCell>
                    <TableCell>{item.obligation.authority ?? "—"}</TableCell>
                    <TableCell>{frequencyLabels[item.obligation.frequency] ?? item.obligation.frequency}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span>{item.dueDate ?? "—"}</span>
                        {dueBadge(item)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.lastRun ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant={item.lastRun.status === "done" ? "default" : item.lastRun.status === "running" ? "secondary" : "destructive"}>
                            {runStatusLabels[item.lastRun.status] ?? item.lastRun.status} · {item.lastRun.period}
                          </Badge>
                          {item.lastRun.outcome && <span className="text-xs text-muted-foreground">{item.lastRun.outcome}</span>}
                          {item.lastRun.protocol && <span className="text-xs">Protocollo {item.lastRun.protocol}</span>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRun(item)}
                        disabled={!item.readiness.ready}
                        title={item.readiness.blockers.map((b) => obligationBlockerLabels[b] ?? b).join("; ") || undefined}
                        data-testid={`button-run-obligation-${item.obligation.id}`}
                      >
                        <Bot className="mr-2 h-4 w-4" />
                        Esegui con Botcave
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </main>
      </div>
    </div>
  );
}
