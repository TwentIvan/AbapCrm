import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Message } from "@shared/schema";
import { suggestedLink, type SuggestionType } from "@shared/message-suggestion";

export const SUGGESTION_LABELS: Record<SuggestionType, string> = { project: "Progetto", task: "Task", partner: "Partner" };

function confidenceTone(confidence: number) {
  if (confidence >= 0.8) return "text-success border-success/30 bg-success/10";
  if (confidence >= 0.6) return "text-warning border-warning/30 bg-warning/10";
  return "text-destructive border-destructive/30 bg-destructive/10";
}

interface Props {
  message: Message;
  /** Nome dell'oggetto suggerito (progetto, task o partner), se noto. */
  targetName?: string;
  /** Il messaggio aggiornato dopo conferma o scarto. */
  onUpdated: (message: Message) => void;
}

/**
 * Collegamento suggerito di un messaggio (es. dallo Smistatore di Botcave): oggetto, confidenza e motivo, con
 * «Conferma» (il collegamento diventa verificato e compare tra i collegamenti dell'oggetto) e «Scarta».
 */
export function SuggestedLinkPanel({ message, targetName, onUpdated }: Props) {
  const suggestion = suggestedLink(message);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refresh = (updated: Message) => {
    queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/message-links"] });
    onUpdated(updated);
  };
  const onError = (error: Error) => {
    toast({ title: "Collegamento non aggiornato", description: error.message, variant: "destructive" });
    // 409: il suggerimento è cambiato; ricarica l'elenco per mostrare quello attuale
    queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
  };

  const confirm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/messages/${message.id}/suggestion/confirm`, { type: suggestion!.type, id: suggestion!.id });
      return (await res.json()) as { message: Message };
    },
    onSuccess: ({ message: updated }) => {
      refresh(updated);
      toast({ title: "Collegamento confermato", description: `${SUGGESTION_LABELS[suggestion!.type]}: ${targetName ?? "collegato"}` });
    },
    onError,
  });

  const reject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/messages/${message.id}/suggestion/reject`, { type: suggestion!.type, id: suggestion!.id });
      return (await res.json()) as Message;
    },
    onSuccess: (updated) => {
      refresh(updated);
      toast({ title: "Suggerimento scartato", description: "Il messaggio non è più collegato all'oggetto suggerito." });
    },
    onError,
  });

  if (!suggestion) return null;
  const busy = confirm.isPending || reject.isPending;
  const label = `${SUGGESTION_LABELS[suggestion.type]}: ${targetName ?? "Sconosciuto"}`;

  return (
    <div
      className={`rounded-lg border p-3 ${suggestion.confirmed ? "border-success/30 bg-success/5" : "border-agent/30 bg-agent/5"}`}
      data-testid="suggested-link-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {suggestion.confirmed ? (
              <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Collegamento confermato</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 text-agent" /> Collegamento suggerito</>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium" data-testid="suggested-link-target">{label}</span>
            {suggestion.confidence !== null && (
              <Badge variant="outline" className={`text-xs ${confidenceTone(suggestion.confidence)}`}>
                Confidenza {Math.round(suggestion.confidence * 100)}%
              </Badge>
            )}
          </div>
          {suggestion.reason && (
            <p className="text-xs text-muted-foreground" data-testid="suggested-link-reason">{suggestion.reason}</p>
          )}
        </div>
        {!suggestion.confirmed && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => reject.mutate()}
              data-testid="button-reject-suggestion"
            >
              {reject.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
              Scarta
            </Button>
            <Button size="sm" disabled={busy} onClick={() => confirm.mutate()} data-testid="button-confirm-suggestion">
              {confirm.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
              Conferma
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
