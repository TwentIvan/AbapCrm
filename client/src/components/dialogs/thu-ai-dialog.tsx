import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Brain,
  FileCode,
  Download,
  Copy,
  CheckCircle,
  XCircle,
  Star,
  Sparkles,
  Code,
  ListTodo,
  AlertTriangle,
} from "lucide-react";
import type { Task, AiGeneratedFile } from "@shared/schema";

interface TaskExecutionResult {
  success: boolean;
  executionId: string;
  analysis: {
    taskType: string;
    complexity: "low" | "medium" | "high";
    suggestedApproach: string;
    estimatedEffort?: number;
    sapModules: string[];
    requiredObjects: string[];
  };
  generatedFiles: AiGeneratedFile[];
  suggestedActions: Array<{
    action: string;
    priority: "high" | "medium" | "low";
    description: string;
  }>;
  patternsUsed: string[];
  error?: string;
}

interface ThuAiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTasks: Task[];
}

export function ThuAiDialog({ open, onOpenChange, selectedTasks }: ThuAiDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("analisi");
  const [customInstructions, setCustomInstructions] = useState("");
  const [results, setResults] = useState<TaskExecutionResult[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ [key: string]: { approved?: boolean; rating?: number } }>({});

  const executeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai-task-executor/execute", {
        taskIds: selectedTasks.map(t => t.id),
        customInstructions: customInstructions || undefined,
      });
      return response.json();
    },
    onSuccess: (data: TaskExecutionResult[]) => {
      setResults(data);
      setActiveTab("generazione");
      toast({
        title: "Analisi Completata",
        description: `Elaborati ${data.length} task con successo`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'elaborazione AI",
        variant: "destructive",
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ executionId, approved, rating }: { executionId: string; approved: boolean; rating?: number }) => {
      await apiRequest("POST", `/api/ai-task-executor/feedback/${executionId}`, {
        approved,
        rating,
      });
      return { executionId, approved, rating };
    },
    onSuccess: ({ executionId, approved, rating }) => {
      setFeedback(prev => ({ ...prev, [executionId]: { approved, rating } }));
      toast({
        title: approved ? "Approvato" : "Rifiutato",
        description: approved 
          ? "Il codice è stato salvato come pattern per apprendimento futuro"
          : "Feedback registrato per migliorare le generazioni future",
      });
    },
  });

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copiato",
      description: "Codice copiato negli appunti",
    });
  };

  const downloadFile = (file: AiGeneratedFile) => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllFiles = () => {
    results.forEach(result => {
      result.generatedFiles.forEach(file => downloadFile(file));
    });
  };

  const allFiles = results.flatMap(r => r.generatedFiles);
  const currentFile = allFiles[selectedFileIndex];

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case "low": return "bg-green-500";
      case "medium": return "bg-yellow-500";
      case "high": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-500";
      case "medium": return "text-yellow-500";
      case "low": return "text-green-500";
      default: return "text-gray-500";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center">
              <span className="text-lg font-black text-blue-600">T</span>
              <span className="text-xl font-black text-blue-500">H</span>
              <span className="text-xl font-black text-blue-600">U</span>
              <span className="text-sm font-bold text-purple-500 ml-1">AI</span>
            </div>
            <span className="text-muted-foreground">- Assistente Operativo</span>
          </DialogTitle>
          <DialogDescription>
            Genera codice ABAP e assistenza operativa per {selectedTasks.length} task selezionati
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analisi" className="flex items-center gap-2" data-testid="tab-analysis">
              <Brain className="h-4 w-4" />
              Analisi
            </TabsTrigger>
            <TabsTrigger value="generazione" className="flex items-center gap-2" data-testid="tab-generation">
              <FileCode className="h-4 w-4" />
              Codice Generato
            </TabsTrigger>
            <TabsTrigger value="azioni" className="flex items-center gap-2" data-testid="tab-actions">
              <ListTodo className="h-4 w-4" />
              Azioni Suggerite
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="analisi" className="h-full m-0">
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/50">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    Task Selezionati ({selectedTasks.length})
                  </h3>
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {selectedTasks.map((task, idx) => (
                        <div key={task.id} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline">{idx + 1}</Badge>
                          <span className="font-medium">{task.title}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Istruzioni Aggiuntive (opzionale)</label>
                  <Textarea
                    placeholder="Es: Usa il pattern ALV OO, includi gestione errori dettagliata, segui naming convention ZXXX..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="h-24"
                    data-testid="input-custom-instructions"
                  />
                </div>

                {results.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Risultati Analisi</h3>
                    {results.map((result, idx) => (
                      <div key={idx} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{selectedTasks[idx]?.title}</span>
                          {result.success ? (
                            <Badge className="bg-green-500">Completato</Badge>
                          ) : (
                            <Badge variant="destructive">Errore</Badge>
                          )}
                        </div>
                        {result.success && (
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Tipo: </span>
                              <Badge variant="outline">{result.analysis.taskType}</Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Complessità: </span>
                              <span className={`w-2 h-2 rounded-full ${getComplexityColor(result.analysis.complexity)}`}></span>
                              <span className="capitalize">{result.analysis.complexity}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Effort: </span>
                              {result.analysis.estimatedEffort}h
                            </div>
                          </div>
                        )}
                        {result.error && (
                          <div className="text-sm text-red-500 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            {result.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={() => executeMutation.mutate()}
                  disabled={executeMutation.isPending || selectedTasks.length === 0}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  data-testid="button-execute-ai"
                >
                  {executeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Elaborazione in corso...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      Esegui Analisi AI
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="generazione" className="h-full m-0">
              {allFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <FileCode className="h-12 w-12 mb-4" />
                  <p>Nessun file generato ancora</p>
                  <p className="text-sm">Esegui l'analisi AI per generare codice</p>
                </div>
              ) : (
                <div className="flex gap-4 h-full">
                  <div className="w-48 shrink-0">
                    <h4 className="font-semibold mb-2 text-sm">File Generati ({allFiles.length})</h4>
                    <ScrollArea className="h-64">
                      <div className="space-y-1">
                        {allFiles.map((file, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedFileIndex(idx)}
                            className={`w-full text-left p-2 rounded text-sm transition-colors ${
                              selectedFileIndex === idx
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            }`}
                            data-testid={`button-select-file-${idx}`}
                          >
                            <div className="flex items-center gap-2">
                              <Code className="h-3 w-3" />
                              <span className="truncate">{file.filename}</span>
                            </div>
                            <div className="text-xs opacity-70">{file.objectType}</div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                    <Separator className="my-2" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={downloadAllFiles}
                      data-testid="button-download-all"
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Scarica Tutti
                    </Button>
                  </div>

                  <div className="flex-1 flex flex-col">
                    {currentFile && (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-semibold">{currentFile.filename}</h4>
                            <p className="text-sm text-muted-foreground">{currentFile.description}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(currentFile.content)}
                              data-testid="button-copy-code"
                            >
                              <Copy className="mr-2 h-3 w-3" />
                              Copia
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(currentFile)}
                              data-testid="button-download-file"
                            >
                              <Download className="mr-2 h-3 w-3" />
                              Scarica
                            </Button>
                          </div>
                        </div>
                        <ScrollArea className="flex-1 rounded-lg border bg-slate-950">
                          <pre className="p-4 text-sm font-mono text-slate-50 overflow-x-auto">
                            <code>{currentFile.content}</code>
                          </pre>
                        </ScrollArea>
                      </>
                    )}
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-semibold mb-3">Valuta la Generazione</h4>
                  <div className="flex flex-wrap gap-4">
                    {results.filter(r => r.success && r.executionId).map((result, idx) => {
                      const fb = feedback[result.executionId];
                      return (
                        <div key={result.executionId} className="flex items-center gap-2 p-2 rounded border">
                          <span className="text-sm font-medium">{selectedTasks[idx]?.title.substring(0, 30)}...</span>
                          {fb?.approved !== undefined ? (
                            <Badge className={fb.approved ? "bg-green-500" : "bg-red-500"}>
                              {fb.approved ? "Approvato" : "Rifiutato"}
                            </Badge>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => feedbackMutation.mutate({ executionId: result.executionId, approved: true, rating: 5 })}
                                disabled={feedbackMutation.isPending}
                                data-testid={`button-approve-${idx}`}
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => feedbackMutation.mutate({ executionId: result.executionId, approved: false })}
                                disabled={feedbackMutation.isPending}
                                data-testid={`button-reject-${idx}`}
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="azioni" className="h-full m-0">
              <ScrollArea className="h-80">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <ListTodo className="h-12 w-12 mb-4" />
                    <p>Nessuna azione suggerita</p>
                    <p className="text-sm">Esegui l'analisi AI per ricevere suggerimenti</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {results.map((result, resultIdx) => (
                      <div key={resultIdx} className="rounded-lg border p-4">
                        <h4 className="font-semibold mb-3">{selectedTasks[resultIdx]?.title}</h4>
                        {result.analysis.suggestedApproach && (
                          <div className="mb-3 p-3 bg-muted/50 rounded-lg text-sm">
                            <span className="font-medium">Approccio suggerito: </span>
                            {result.analysis.suggestedApproach}
                          </div>
                        )}
                        <div className="space-y-2">
                          {result.suggestedActions.map((action, actionIdx) => (
                            <div
                              key={actionIdx}
                              className="flex items-start gap-3 p-2 rounded border"
                            >
                              <div className={`mt-1 ${getPriorityColor(action.priority)}`}>
                                {action.priority === "high" ? "●" : action.priority === "medium" ? "◐" : "○"}
                              </div>
                              <div>
                                <div className="font-medium">{action.action}</div>
                                <div className="text-sm text-muted-foreground">{action.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {result.analysis.requiredObjects.length > 0 && (
                          <div className="mt-3">
                            <span className="text-sm font-medium">Oggetti SAP richiesti: </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {result.analysis.requiredObjects.map((obj, objIdx) => (
                                <Badge key={objIdx} variant="outline" className="text-xs">
                                  {obj}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
