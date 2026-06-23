import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Bot, Zap, DollarSign, AlertTriangle } from "lucide-react";
import { useOrganization } from "@/contexts/organization-context";

interface AiModel {
  id: string;
  modelKey: string;
  modelId: string;
  displayName: string;
  inputPricePerMToken: string | null;
  outputPricePerMToken: string | null;
  capabilities: { toolUse?: boolean; vision?: boolean; json?: boolean; maxContextTokens?: number } | null;
  status: string;
  providerName: string;
  providerSlug: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (modelKey: string) => void;
  estimatedInputChars?: number;
  operationLabel?: string;
}

const CHARS_PER_TOKEN = 4;

function estimateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number): number {
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}

function formatCost(usd: number): string {
  if (usd < 0.0001) return "< $0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function providerColor(slug: string): string {
  switch (slug) {
    case "openai": return "bg-success/10 text-success";
    case "anthropic": return "bg-warning/10 text-warning";
    case "google": return "bg-primary/10 text-primary";
    case "deepseek": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    default: return "bg-muted text-foreground dark:bg-card dark:text-gray-200";
  }
}

export function AiModelPickerDialog({ open, onClose, onConfirm, estimatedInputChars = 0, operationLabel = "operazione AI" }: Props) {
  const { currentOrganizationId } = useOrganization();

  const { data: allModels = [] } = useQuery<AiModel[]>({
    queryKey: ["/api/ai/models"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: orgData } = useQuery<any>({
    queryKey: ["/api/organizations", currentOrganizationId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const orgDefaultModelKey: string = orgData?.settings?.aiDefaultModelKey || "openai/gpt-5";

  const activeModels = useMemo(
    () => allModels.filter(m => m.status === "active"),
    [allModels]
  );

  const [selectedKey, setSelectedKey] = useState<string>("");
  const effectiveKey = selectedKey || orgDefaultModelKey;

  const estimatedInputTokens = Math.ceil(estimatedInputChars / CHARS_PER_TOKEN);
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.4);

  const groupedModels = useMemo(() => {
    const groups: Record<string, AiModel[]> = {};
    for (const m of activeModels) {
      const g = m.providerName || m.providerSlug;
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    }
    return groups;
  }, [activeModels]);

  const selectedModel = activeModels.find(m => m.modelKey === effectiveKey);

  const costEstimate = useMemo(() => {
    if (!selectedModel || estimatedInputChars === 0) return null;
    const inPrice = parseFloat(selectedModel.inputPricePerMToken || "0");
    const outPrice = parseFloat(selectedModel.outputPricePerMToken || "0");
    return estimateCost(estimatedInputTokens, estimatedOutputTokens, inPrice, outPrice);
  }, [selectedModel, estimatedInputTokens, estimatedOutputTokens]);

  const allCosts = useMemo(() => {
    if (estimatedInputChars === 0) return {};
    const map: Record<string, number> = {};
    for (const m of activeModels) {
      const inPrice = parseFloat(m.inputPricePerMToken || "0");
      const outPrice = parseFloat(m.outputPricePerMToken || "0");
      map[m.modelKey] = estimateCost(estimatedInputTokens, estimatedOutputTokens, inPrice, outPrice);
    }
    return map;
  }, [activeModels, estimatedInputTokens, estimatedOutputTokens, estimatedInputChars]);

  const cheapestKey = useMemo(() => {
    if (Object.keys(allCosts).length === 0) return null;
    return Object.entries(allCosts).sort((a, b) => a[1] - b[1])[0]?.[0];
  }, [allCosts]);

  const handleConfirm = () => {
    onConfirm(effectiveKey);
    setSelectedKey("");
  };

  const handleClose = () => {
    setSelectedKey("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Scegli il modello AI
          </DialogTitle>
          <DialogDescription>
            Modello per: <span className="font-medium">{operationLabel}</span>
          </DialogDescription>
        </DialogHeader>

        {estimatedInputChars > 0 && (
          <div className="flex items-center gap-2 text-sm bg-muted px-3 py-2 rounded-md">
            <Zap className="h-4 w-4 text-warning shrink-0" />
            <span>Stima input: <strong>~{estimatedInputTokens.toLocaleString()} token</strong> ({Math.round(estimatedInputChars / 1000)}k caratteri)</span>
            {costEstimate !== null && (
              <span className="ml-auto font-medium text-success dark:text-success">
                {formatCost(costEstimate)} con modello selezionato
              </span>
            )}
          </div>
        )}

        <div className="overflow-y-auto flex-1 pr-1">
          <RadioGroup value={effectiveKey} onValueChange={setSelectedKey} className="space-y-3">
            {Object.entries(groupedModels).map(([provider, models]) => (
              <div key={provider}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">{provider}</p>
                <div className="space-y-1">
                  {models.map(m => {
                    const cost = allCosts[m.modelKey];
                    const isCheapest = m.modelKey === cheapestKey;
                    const isSelected = effectiveKey === m.modelKey;
                    const isOrgDefault = orgDefaultModelKey === m.modelKey && !selectedKey;
                    return (
                      <Label
                        key={m.modelKey}
                        htmlFor={m.modelKey}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value={m.modelKey} id={m.modelKey} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{m.displayName}</span>
                            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${providerColor(m.providerSlug)}`}>
                              {m.providerSlug}
                            </Badge>
                            {isCheapest && estimatedInputChars > 0 && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0 bg-success/10 text-success dark:text-success">
                                più economico
                              </Badge>
                            )}
                            {isOrgDefault && (
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                default org
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ${m.inputPricePerMToken}/M in · ${m.outputPricePerMToken}/M out
                            {cost !== undefined && (
                              <span className="ml-2 font-medium text-foreground">→ {formatCost(cost)}</span>
                            )}
                          </p>
                        </div>
                      </Label>
                    );
                  })}
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        {estimatedInputChars === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
            <AlertTriangle className="h-3.5 w-3.5" />
            Stima costi non disponibile prima di caricare il contesto
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={handleClose}>Annulla</Button>
          <Button onClick={handleConfirm} className="gap-2">
            <DollarSign className="h-4 w-4" />
            Avvia con {selectedModel?.displayName || effectiveKey}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
