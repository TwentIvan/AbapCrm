// Storico delle esecuzioni degli agenti esterni sul task (es. le squadre di Botcave), letto da
// GET /api/tasks/:id/agent-runs: chi ha lavorato, come è andata, il dettaglio e dove trovare il risultato.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistance } from "date-fns";
import { it } from "date-fns/locale";
import { Bot, ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getQueryFn } from "@/lib/queryClient";
import type { TaskAgentRun } from "@shared/schema";

// Le date arrivano come stringhe ISO dal JSON
type AgentRunJson = Omit<TaskAgentRun, "startedAt" | "finishedAt" | "createdAt" | "updatedAt"> & {
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS: Record<string, { label: string; className: string }> = {
  running: { label: "In corso", className: "bg-primary/10 text-primary" },
  done: { label: "Completata", className: "bg-success/10 text-success" },
  blocked: { label: "Bloccata", className: "bg-warning/10 text-warning" },
  failed: { label: "Fallita", className: "bg-destructive/10 text-destructive" },
};

const isHttps = (url: string) => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

function duration(run: AgentRunJson): string | null {
  if (!run.startedAt || !run.finishedAt) return null;
  return formatDistance(new Date(run.finishedAt), new Date(run.startedAt), { locale: it });
}

function AgentRunItem({ run }: { run: AgentRunJson }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[run.status] ?? { label: run.status, className: "bg-muted text-muted-foreground" };
  const when = new Date(run.finishedAt ?? run.startedAt ?? run.createdAt);
  const took = duration(run);
  const links = (run.links ?? []).filter(l => isHttps(l.url));

  return (
    <li className="rounded-md border p-3 space-y-2" data-testid={`agent-run-${run.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        {run.status === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-mono text-sm">{run.agent}</span>
        <Badge variant="secondary" className={status.className}>{status.label}</Badge>
        <span className="ml-auto text-xs text-muted-foreground" title={format(when, "dd/MM/yyyy HH:mm", { locale: it })}>
          {formatDistance(when, new Date(), { addSuffix: true, locale: it })}
          {took ? ` · durata ${took}` : ""}
        </span>
      </div>

      {run.outcome && <p className="text-sm">{run.outcome}</p>}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {links.map((l, i) => (
            <a
              key={`${l.url}-${i}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {l.label || l.url}
            </a>
          ))}
        </div>
      )}

      {run.detail && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Dettaglio
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{run.detail}</pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {run.externalRunId && (
        <div className="text-xs text-muted-foreground">Esecuzione esterna: <span className="font-mono">{run.externalRunId}</span></div>
      )}
    </li>
  );
}

export default function AgentRunsHistory({ taskId }: { taskId: string }) {
  const { data: runs, isLoading, error } = useQuery<AgentRunJson[]>({
    queryKey: [`/api/tasks/${taskId}/agent-runs`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!taskId,
  });

  return (
    <Card data-testid="agent-runs-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Esecuzioni degli agenti esterni
        </CardTitle>
        <CardDescription>Le esecuzioni registrate dagli agenti che hanno lavorato al task, dalla più recente.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Caricamento...</div>
        ) : error ? (
          <div className="py-6 text-center text-sm text-destructive">Impossibile leggere le esecuzioni degli agenti.</div>
        ) : !runs?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nessuna esecuzione di agenti esterni registrata per questo task.</div>
        ) : (
          <ul className="space-y-3">
            {runs.map(run => <AgentRunItem key={run.id} run={run} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
