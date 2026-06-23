import { useState, useRef, useEffect, useMemo } from "react";
import { AiModelPickerDialog } from "@/components/dialogs/ai-model-picker-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  RotateCcw,
  Eye,
  MessageSquare,
  Mail,
  GitBranch,
  FileText,
  Layers,
  Send,
  Paperclip,
  Image,
  ChevronDown,
  ChevronUp,
  Save,
  BookMarked,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Task, AiGeneratedFile, AiAbapPattern } from "@shared/schema";

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
  contextSummary?: {
    taskInfo: {
      title: string;
      description?: string;
      projectName?: string;
    };
    devOpsWorkItem?: {
      id: string;
      title?: string;
      type?: string;
      state?: string;
      commentsCount?: number;
      hasImages?: boolean;
      imagesCount?: number;
    };
    linkedMessages: Array<{
      subject: string;
      fromName?: string;
      date?: string;
      preview: string;
      hasAttachments?: boolean;
      attachmentsCount?: number;
      hasImages?: boolean;
      imagesCount?: number;
    }>;
    taskComments: Array<{
      preview: string;
      createdAt: string;
    }>;
    projectTransports: Array<{
      requestNumber: string;
      description: string;
      objectsCount: number;
    }>;
    patternsCount: number;
  };
}

interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  base64: string;
  preview?: string; // For image previews
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: ChatAttachment[];
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
  const [showAiModelPicker, setShowAiModelPicker] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ [key: string]: { approved?: boolean; rating?: number } }>({});
  
  // Pattern selection state
  const [selectedPatternIds, setSelectedPatternIds] = useState<string[]>([]);
  const [patternsExpanded, setPatternsExpanded] = useState(false);
  const [patternCategoryFilter, setPatternCategoryFilter] = useState<string>("all");
  
  // Save pattern dialog state
  const [savePatternOpen, setSavePatternOpen] = useState(false);
  const [savePatternFile, setSavePatternFile] = useState<AiGeneratedFile | null>(null);
  const [newPatternName, setNewPatternName] = useState("");
  const [newPatternCategory, setNewPatternCategory] = useState<string>("other");
  const [newPatternDescription, setNewPatternDescription] = useState("");
  const [newPatternTags, setNewPatternTags] = useState("");
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load available patterns
  const { data: patterns = [], isLoading: patternsLoading } = useQuery<AiAbapPattern[]>({
    queryKey: ["/api/ai-abap-patterns"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: open,
  });
  
  // Filter patterns by category
  const filteredPatterns = patternCategoryFilter === "all" 
    ? patterns 
    : patterns.filter(p => p.category === patternCategoryFilter);
  
  // Pattern categories for filter
  const patternCategories = [
    { value: "all", label: "Tutti" },
    { value: "report", label: "Report" },
    { value: "function_module", label: "Function Module" },
    { value: "class", label: "Classe OO" },
    { value: "enhancement", label: "Enhancement" },
    { value: "alv", label: "ALV" },
    { value: "bapi", label: "BAPI" },
    { value: "data_extraction", label: "Estrazione Dati" },
    { value: "cds_view", label: "CDS View" },
    { value: "other", label: "Altro" },
  ];
  
  // Toggle pattern selection
  const togglePatternSelection = (patternId: string) => {
    setSelectedPatternIds(prev => 
      prev.includes(patternId) 
        ? prev.filter(id => id !== patternId)
        : [...prev, patternId]
    );
  };
  
  // Select/deselect all patterns
  const toggleAllPatterns = () => {
    if (selectedPatternIds.length === filteredPatterns.length) {
      setSelectedPatternIds([]);
    } else {
      setSelectedPatternIds(filteredPatterns.map(p => p.id));
    }
  };

  // Handle file selection for chat
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 5 * 1024 * 1024; // 5MB max per file
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedOtherTypes = ['application/pdf', 'text/plain', 'text/csv'];
    
    const isAllowedType = (mimeType: string) => {
      // Check exact match for specific types
      if (allowedOtherTypes.includes(mimeType)) return true;
      // Check if it's an allowed image type
      if (allowedImageTypes.includes(mimeType)) return true;
      return false;
    };
    
    const newAttachments: ChatAttachment[] = [];
    
    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast({
          title: "File troppo grande",
          description: `${file.name} supera il limite di 5MB`,
          variant: "destructive",
        });
        continue;
      }
      
      if (!isAllowedType(file.type)) {
        toast({
          title: "Tipo file non supportato",
          description: `${file.name} non è supportato. Tipi validi: immagini (JPEG, PNG, GIF, WebP), PDF, TXT, CSV`,
          variant: "destructive",
        });
        continue;
      }

      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data URL prefix to get pure base64
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Create preview for images
      let preview: string | undefined;
      if (file.type.startsWith('image/')) {
        preview = `data:${file.type};base64,${base64}`;
      }

      newAttachments.push({
        name: file.name,
        type: file.type,
        size: file.size,
        base64,
        preview,
      });
    }

    setChatAttachments(prev => [...prev, ...newAttachments]);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setChatAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatLoading]);

  const executeMutation = useMutation({
    mutationFn: async (modelKey?: string) => {
      // Include chat clarifications as additional context for regeneration
      const chatClarifications = chatMessages.length > 0 
        ? chatMessages.map(m => `[${m.role === 'user' ? 'Utente' : 'AI'}]: ${m.content}`).join('\n')
        : undefined;

      const response = await apiRequest("POST", "/api/ai-task-executor/execute", {
        taskIds: selectedTasks.map(t => t.id),
        customInstructions: customInstructions || undefined,
        chatClarifications,
        patternIds: selectedPatternIds.length > 0 ? selectedPatternIds : undefined,
        modelKey: modelKey || undefined,
      });
      return response.json();
    },
    onSuccess: (data: TaskExecutionResult[]) => {
      setResults(data);
      setActiveTab("generazione");
      toast({
        title: "Analisi Completata",
        description: `Elaborati ${data.length} task con successo${selectedPatternIds.length > 0 ? ` usando ${selectedPatternIds.length} pattern` : ''}`,
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
  
  // Mutation to save a new pattern from generated code
  const savePatternMutation = useMutation({
    mutationFn: async () => {
      if (!savePatternFile || !newPatternName.trim()) {
        throw new Error("Nome pattern e file richiesti");
      }
      
      const response = await apiRequest("POST", "/api/ai-abap-patterns", {
        name: newPatternName.trim(),
        category: newPatternCategory,
        description: newPatternDescription.trim() || null,
        tags: newPatternTags.split(',').map(t => t.trim()).filter(t => t),
        codeTemplate: savePatternFile.content,
        source: "ai_generated",
        sapModules: [], 
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Pattern Salvato",
        description: `Pattern "${newPatternName}" salvato con successo`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-abap-patterns"] });
      setSavePatternOpen(false);
      setSavePatternFile(null);
      setNewPatternName("");
      setNewPatternCategory("other");
      setNewPatternDescription("");
      setNewPatternTags("");
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nel salvataggio del pattern",
        variant: "destructive",
      });
    },
  });
  
  // Open save pattern dialog
  const openSavePatternDialog = (file: AiGeneratedFile) => {
    setSavePatternFile(file);
    setNewPatternName(file.filename.replace(/\.\w+$/, ''));
    setNewPatternDescription(file.description || '');
    setSavePatternOpen(true);
  };

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

  // Chat handler
  const handleChatSend = async () => {
    if ((!chatInput.trim() && chatAttachments.length === 0) || results.length === 0) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput || (chatAttachments.length > 0 ? `[${chatAttachments.length} file allegati]` : ''),
      timestamp: new Date(),
      attachments: chatAttachments.length > 0 ? [...chatAttachments] : undefined,
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    const currentAttachments = [...chatAttachments];
    setChatInput("");
    setChatAttachments([]);
    setIsChatLoading(true);

    try {
      // Get the first result's execution ID and context
      const executionId = results[0]?.executionId;
      const contextSummary = results[0]?.contextSummary;
      
      // Prepare attachments for API (only send base64 and metadata, not preview)
      const attachmentsForApi = currentAttachments.map(a => ({
        name: a.name,
        type: a.type,
        size: a.size,
        base64: a.base64,
      }));
      
      const response = await apiRequest("POST", "/api/ai-task-executor/chat", {
        executionId,
        message: chatInput,
        contextSummary,
        previousMessages: chatMessages.map(m => ({ role: m.role, content: m.content })),
        attachments: attachmentsForApi.length > 0 ? attachmentsForApi : undefined,
      });
      
      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response || "Non ho capito la domanda. Potresti riformularla?",
        timestamp: new Date(),
      };
      
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Errore: ${error.message || 'Si è verificato un errore'}`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case "low": return "bg-success";
      case "medium": return "bg-yellow-500";
      case "high": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-destructive";
      case "medium": return "text-warning";
      case "low": return "text-success";
      default: return "text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center">
              <span className="text-lg font-black text-primary">T</span>
              <span className="text-xl font-black text-primary">H</span>
              <span className="text-xl font-black text-primary">U</span>
              <span className="text-sm font-bold text-purple-500 ml-1">AI</span>
            </div>
            <span className="text-muted-foreground">- Assistente Operativo</span>
          </DialogTitle>
          <DialogDescription>
            Genera codice ABAP e assistenza operativa per {selectedTasks.length} task selezionati
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="analisi" className="flex items-center gap-2" data-testid="tab-analysis">
              <Brain className="h-4 w-4" />
              Analisi
            </TabsTrigger>
            <TabsTrigger value="contesto" className="flex items-center gap-2" data-testid="tab-context">
              <Eye className="h-4 w-4" />
              Contesto
            </TabsTrigger>
            <TabsTrigger value="generazione" className="flex items-center gap-2" data-testid="tab-generation">
              <FileCode className="h-4 w-4" />
              Codice
            </TabsTrigger>
            <TabsTrigger value="azioni" className="flex items-center gap-2" data-testid="tab-actions">
              <ListTodo className="h-4 w-4" />
              Azioni
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2" data-testid="tab-chat">
              <MessageSquare className="h-4 w-4" />
              Chat
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

                {/* Pattern Selection Section */}
                <Collapsible open={patternsExpanded} onOpenChange={setPatternsExpanded}>
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
                        data-testid="button-toggle-patterns"
                      >
                        <h3 className="font-semibold flex items-center gap-2">
                          <BookMarked className="h-4 w-4 text-warning" />
                          Pattern ABAP 
                          {patterns.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                              {patterns.length} disponibili
                            </Badge>
                          )}
                          {selectedPatternIds.length > 0 && (
                            <Badge className="bg-primary ml-2">
                              {selectedPatternIds.length} selezionati
                            </Badge>
                          )}
                        </h3>
                        {patternsExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent className="mt-3">
                      {patternsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Caricamento pattern...</span>
                        </div>
                      ) : patterns.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>Nessun pattern salvato</p>
                          <p className="text-xs mt-1">Approva codice generato per crearne automaticamente</p>
                        </div>
                      ) : (
                        <>
                          {/* Filter and select all */}
                          <div className="flex items-center gap-3 mb-3">
                            <Select 
                              value={patternCategoryFilter} 
                              onValueChange={setPatternCategoryFilter}
                            >
                              <SelectTrigger className="w-48" data-testid="select-pattern-category">
                                <SelectValue placeholder="Categoria" />
                              </SelectTrigger>
                              <SelectContent>
                                {patternCategories.map(cat => (
                                  <SelectItem key={cat.value} value={cat.value}>
                                    {cat.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={toggleAllPatterns}
                              data-testid="button-toggle-all-patterns"
                            >
                              {selectedPatternIds.length === filteredPatterns.length && filteredPatterns.length > 0
                                ? "Deseleziona Tutti"
                                : "Seleziona Tutti"
                              }
                            </Button>
                          </div>
                          
                          {/* Pattern list */}
                          <ScrollArea className="h-40">
                            <div className="space-y-2">
                              {filteredPatterns.map((pattern) => (
                                <div 
                                  key={pattern.id}
                                  className={`flex items-start gap-3 p-2 rounded border transition-colors cursor-pointer ${
                                    selectedPatternIds.includes(pattern.id) 
                                      ? 'bg-primary/5 border-primary/30'
                                      : 'hover:bg-muted/50'
                                  }`}
                                  onClick={() => togglePatternSelection(pattern.id)}
                                  data-testid={`pattern-item-${pattern.id}`}
                                >
                                  <Checkbox
                                    checked={selectedPatternIds.includes(pattern.id)}
                                    onCheckedChange={() => togglePatternSelection(pattern.id)}
                                    data-testid={`checkbox-pattern-${pattern.id}`}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">{pattern.name}</span>
                                      <Badge variant="outline" className="text-xs shrink-0">
                                        {pattern.category}
                                      </Badge>
                                      {pattern.usageCount > 0 && (
                                        <Badge variant="secondary" className="text-xs shrink-0">
                                          usato {pattern.usageCount}x
                                        </Badge>
                                      )}
                                    </div>
                                    {pattern.description && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {pattern.description}
                                      </p>
                                    )}
                                    {pattern.tags && pattern.tags.length > 0 && (
                                      <div className="flex gap-1 mt-1 flex-wrap">
                                        {pattern.tags.slice(0, 3).map((tag, i) => (
                                          <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                            {tag}
                                          </span>
                                        ))}
                                        {pattern.tags.length > 3 && (
                                          <span className="text-xs text-muted-foreground">
                                            +{pattern.tags.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {results.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Risultati Analisi</h3>
                    {results.map((result, idx) => (
                      <div key={idx} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{selectedTasks[idx]?.title}</span>
                          {result.success ? (
                            <Badge className="bg-success">Completato</Badge>
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
                          <div className="text-sm text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            {result.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={() => setShowAiModelPicker(true)}
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
                              onClick={() => openSavePatternDialog(currentFile)}
                              data-testid="button-save-pattern"
                              title="Salva come pattern riutilizzabile"
                            >
                              <Save className="mr-2 h-3 w-3" />
                              Salva Pattern
                            </Button>
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
                            <>
                              <Badge className={fb.approved ? "bg-success" : "bg-red-500"}>
                                {fb.approved ? "Approvato" : "Rifiutato"}
                              </Badge>
                              {!fb.approved && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setFeedback(prev => {
                                      const newFeedback = { ...prev };
                                      delete newFeedback[result.executionId];
                                      return newFeedback;
                                    });
                                    setResults([]);
                                    setActiveTab("analisi");
                                  }}
                                  data-testid={`button-regenerate-${idx}`}
                                  className="ml-2"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Rigenera
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => feedbackMutation.mutate({ executionId: result.executionId, approved: true, rating: 5 })}
                                disabled={feedbackMutation.isPending}
                                data-testid={`button-approve-${idx}`}
                              >
                                <CheckCircle className="h-4 w-4 text-success" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => feedbackMutation.mutate({ executionId: result.executionId, approved: false })}
                                disabled={feedbackMutation.isPending}
                                data-testid={`button-reject-${idx}`}
                              >
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Global Rigenera button when any result is rejected */}
                  {Object.values(feedback).some(fb => fb.approved === false) && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-3">
                        Hai rifiutato uno o più risultati. Puoi modificare le istruzioni e rigenerare.
                      </p>
                      <Button
                        onClick={() => {
                          setFeedback({});
                          setResults([]);
                          setActiveTab("analisi");
                        }}
                        variant="outline"
                        className="w-full"
                        data-testid="button-regenerate-all"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Torna all'Analisi e Rigenera
                      </Button>
                    </div>
                  )}
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

            {/* Tab Contesto - Mostra cosa l'AI ha ricevuto */}
            <TabsContent value="contesto" className="h-full m-0">
              <ScrollArea className="h-80">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Eye className="h-12 w-12 mb-4" />
                    <p>Nessun contesto disponibile</p>
                    <p className="text-sm">Esegui l'analisi AI per vedere il contesto raccolto</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {results.map((result, resultIdx) => result.contextSummary && (
                      <div key={resultIdx} className="rounded-lg border p-4">
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          Contesto per: {selectedTasks[resultIdx]?.title}
                        </h4>
                        
                        {/* Task Info */}
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                          <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <FileText className="h-3 w-3" />
                            Informazioni Task
                          </h5>
                          <div className="text-sm space-y-1">
                            <p><span className="text-muted-foreground">Titolo:</span> {result.contextSummary.taskInfo.title}</p>
                            {result.contextSummary.taskInfo.projectName && (
                              <p><span className="text-muted-foreground">Progetto:</span> {result.contextSummary.taskInfo.projectName}</p>
                            )}
                            {result.contextSummary.taskInfo.description && (
                              <p className="text-muted-foreground text-xs mt-1">{result.contextSummary.taskInfo.description.substring(0, 200)}...</p>
                            )}
                          </div>
                        </div>

                        {/* DevOps Work Item */}
                        {result.contextSummary.devOpsWorkItem && (
                          <div className="mb-4 p-3 bg-primary/5 rounded-lg">
                            <h5 className="text-sm font-medium mb-2 flex items-center gap-2 text-primary">
                              <GitBranch className="h-3 w-3" />
                              DevOps Work Item #{result.contextSummary.devOpsWorkItem.id}
                            </h5>
                            <div className="text-sm space-y-1">
                              {result.contextSummary.devOpsWorkItem.title && (
                                <p><span className="text-muted-foreground">Titolo:</span> {result.contextSummary.devOpsWorkItem.title}</p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                {result.contextSummary.devOpsWorkItem.type && (
                                  <Badge variant="outline" className="text-xs">{result.contextSummary.devOpsWorkItem.type}</Badge>
                                )}
                                {result.contextSummary.devOpsWorkItem.state && (
                                  <Badge variant="secondary" className="text-xs">{result.contextSummary.devOpsWorkItem.state}</Badge>
                                )}
                                {result.contextSummary.devOpsWorkItem.commentsCount ? (
                                  <Badge className="text-xs bg-purple-500">{result.contextSummary.devOpsWorkItem.commentsCount} commenti</Badge>
                                ) : null}
                                {result.contextSummary.devOpsWorkItem.hasImages && (
                                  <Badge className="text-xs bg-success flex items-center gap-1">
                                    <Image className="h-3 w-3" />
                                    {result.contextSummary.devOpsWorkItem.imagesCount || 0} immagini
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Linked Messages */}
                        {result.contextSummary.linkedMessages.length > 0 && (
                          <div className="mb-4 p-3 bg-warning/5 rounded-lg">
                            <h5 className="text-sm font-medium mb-2 flex items-center gap-2 text-warning dark:text-warning">
                              <Mail className="h-3 w-3" />
                              Messaggi Collegati ({result.contextSummary.linkedMessages.length})
                            </h5>
                            <div className="space-y-2">
                              {result.contextSummary.linkedMessages.map((msg, msgIdx) => (
                                <div key={msgIdx} className="text-xs p-2 bg-background rounded border">
                                  <div className="font-medium flex items-center gap-2">
                                    {msg.subject || '(Senza oggetto)'}
                                    {msg.hasAttachments && (
                                      <span className="flex items-center gap-0.5 text-primary" title={`${msg.attachmentsCount} allegati`}>
                                        <Paperclip className="h-3 w-3" />
                                        <span>{msg.attachmentsCount}</span>
                                      </span>
                                    )}
                                    {msg.hasImages && (
                                      <span className="flex items-center gap-0.5 text-success" title={`${msg.imagesCount} immagini`}>
                                        <Image className="h-3 w-3" />
                                        <span>{msg.imagesCount}</span>
                                      </span>
                                    )}
                                  </div>
                                  {msg.fromName && <div className="text-muted-foreground">Da: {msg.fromName}</div>}
                                  <div className="text-muted-foreground mt-1">{msg.preview}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Task Comments */}
                        {result.contextSummary.taskComments.length > 0 && (
                          <div className="mb-4 p-3 bg-warning/10 dark:bg-yellow-950 rounded-lg">
                            <h5 className="text-sm font-medium mb-2 flex items-center gap-2 text-warning dark:text-yellow-300">
                              <MessageSquare className="h-3 w-3" />
                              Commenti Task ({result.contextSummary.taskComments.length})
                            </h5>
                            <div className="space-y-2">
                              {result.contextSummary.taskComments.map((comment, cIdx) => (
                                <div key={cIdx} className="text-xs p-2 bg-background rounded border">
                                  {comment.preview}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Transport Requests */}
                        {result.contextSummary.projectTransports.length > 0 && (
                          <div className="mb-4 p-3 bg-success/10 rounded-lg">
                            <h5 className="text-sm font-medium mb-2 flex items-center gap-2 text-success dark:text-success">
                              <Code className="h-3 w-3" />
                              Transport Requests ({result.contextSummary.projectTransports.length})
                            </h5>
                            <div className="space-y-1">
                              {result.contextSummary.projectTransports.map((tr, trIdx) => (
                                <div key={trIdx} className="text-xs flex items-center gap-2">
                                  <Badge variant="outline" className="font-mono">{tr.requestNumber}</Badge>
                                  <span className="text-muted-foreground">{tr.description}</span>
                                  <Badge className="text-xs">{tr.objectsCount} oggetti</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pattern Count */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Sparkles className="h-4 w-4" />
                          <span>{result.contextSummary.patternsCount} pattern ABAP utilizzati per la generazione</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Tab Chat - Chiarisci con l'AI */}
            <TabsContent value="chat" className="h-full m-0">
              <div className="flex flex-col h-80">
                <div className="flex-1 min-h-0 border rounded-lg mb-3 overflow-hidden">
                  <ScrollArea className="h-full p-4">
                    {chatMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mb-4" />
                        <p>Nessun messaggio</p>
                        <p className="text-sm text-center max-w-md">
                          Fai domande per chiarire cosa l'AI ha capito o per guidare la generazione del codice.
                          <br />
                          <strong>I chiarimenti verranno usati per rigenerare il codice.</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chatMessages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] p-3 rounded-lg ${
                                msg.role === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {/* Display attachments if present */}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {msg.attachments.map((att, attIdx) => (
                                    <div key={attIdx} className="relative">
                                      {att.preview ? (
                                        <img 
                                          src={att.preview} 
                                          alt={att.name}
                                          className="w-20 h-20 object-cover rounded border"
                                        />
                                      ) : (
                                        <div className="w-20 h-20 bg-muted-foreground/20 rounded border flex items-center justify-center">
                                          <FileText className="h-6 w-6" />
                                        </div>
                                      )}
                                      <p className="text-[10px] truncate max-w-[80px] mt-1">{att.name}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              <p className="text-xs opacity-70 mt-1">
                                {msg.timestamp.toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        ))}
                        {isChatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-muted p-3 rounded-lg">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* File upload preview */}
                {chatAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-muted/50 mb-2">
                    {chatAttachments.map((att, idx) => (
                      <div key={idx} className="relative group">
                        {att.preview ? (
                          <img 
                            src={att.preview} 
                            alt={att.name}
                            className="w-16 h-16 object-cover rounded border"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-background rounded border flex flex-col items-center justify-center">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="text-[8px] text-muted-foreground mt-1">
                              {att.type.split('/')[1]?.toUpperCase() || 'FILE'}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-remove-attachment-${idx}`}
                        >
                          ×
                        </button>
                        <p className="text-[9px] truncate max-w-[64px] text-center">{att.name}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,.pdf,.txt,.csv"
                    multiple
                    className="hidden"
                    data-testid="input-file-upload"
                  />
                  
                  {/* Upload button */}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isChatLoading || results.length === 0}
                    title="Allega file (immagini, PDF, testo)"
                    data-testid="button-attach-file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  
                  <Input
                    placeholder="Chiedi chiarimenti all'AI..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && (chatInput.trim() || chatAttachments.length > 0)) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    disabled={isChatLoading || results.length === 0}
                    data-testid="input-chat"
                  />
                  <Button
                    onClick={handleChatSend}
                    disabled={isChatLoading || (!chatInput.trim() && chatAttachments.length === 0) || results.length === 0}
                    data-testid="button-chat-send"
                  >
                    {isChatLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {results.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Esegui prima l'analisi AI per abilitare la chat
                  </p>
                )}

                {chatMessages.length > 0 && (
                  <p className="text-xs text-success dark:text-success mt-2 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    I chiarimenti saranno inclusi nella prossima rigenerazione
                  </p>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
      
      {/* Save Pattern Dialog */}
      <Dialog open={savePatternOpen} onOpenChange={setSavePatternOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-warning" />
              Salva come Pattern ABAP
            </DialogTitle>
            <DialogDescription>
              Salva questo codice come pattern riutilizzabile per future generazioni
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pattern-name">Nome Pattern *</Label>
              <Input
                id="pattern-name"
                placeholder="Es: ALV con ordinamento dinamico"
                value={newPatternName}
                onChange={(e) => setNewPatternName(e.target.value)}
                data-testid="input-pattern-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pattern-category">Categoria *</Label>
              <Select value={newPatternCategory} onValueChange={setNewPatternCategory}>
                <SelectTrigger data-testid="select-new-pattern-category">
                  <SelectValue placeholder="Seleziona categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="function_module">Function Module</SelectItem>
                  <SelectItem value="class">Classe OO</SelectItem>
                  <SelectItem value="enhancement">Enhancement/BAdI</SelectItem>
                  <SelectItem value="form">Form Routine</SelectItem>
                  <SelectItem value="selection_screen">Selection Screen</SelectItem>
                  <SelectItem value="alv">ALV Grid/List</SelectItem>
                  <SelectItem value="bapi">BAPI</SelectItem>
                  <SelectItem value="data_extraction">Estrazione Dati</SelectItem>
                  <SelectItem value="bdc">Batch Data Communication</SelectItem>
                  <SelectItem value="idoc">IDoc</SelectItem>
                  <SelectItem value="smartform">SmartForm</SelectItem>
                  <SelectItem value="workflow">Workflow</SelectItem>
                  <SelectItem value="fiori">Fiori/UI5</SelectItem>
                  <SelectItem value="cds_view">CDS View</SelectItem>
                  <SelectItem value="amdp">AMDP HANA</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pattern-description">Descrizione</Label>
              <Textarea
                id="pattern-description"
                placeholder="Descrivi quando usare questo pattern..."
                value={newPatternDescription}
                onChange={(e) => setNewPatternDescription(e.target.value)}
                className="h-20"
                data-testid="input-pattern-description"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pattern-tags">Tag (separati da virgola)</Label>
              <Input
                id="pattern-tags"
                placeholder="Es: alv, sorting, oo, grid"
                value={newPatternTags}
                onChange={(e) => setNewPatternTags(e.target.value)}
                data-testid="input-pattern-tags"
              />
            </div>
            
            {savePatternFile && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm">
                  <Code className="h-4 w-4" />
                  <span className="font-medium">{savePatternFile.filename}</span>
                  <Badge variant="outline">{savePatternFile.language}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {savePatternFile.content.length} caratteri
                </p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setSavePatternOpen(false)}
              data-testid="button-cancel-save-pattern"
            >
              Annulla
            </Button>
            <Button 
              onClick={() => savePatternMutation.mutate()}
              disabled={!newPatternName.trim() || savePatternMutation.isPending}
              data-testid="button-confirm-save-pattern"
            >
              {savePatternMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salva Pattern
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Model Picker Dialog */}
      <AiModelPickerDialog
        open={showAiModelPicker}
        onClose={() => setShowAiModelPicker(false)}
        onConfirm={(modelKey) => {
          setShowAiModelPicker(false);
          executeMutation.mutate(modelKey);
        }}
        estimatedInputChars={
          selectedTasks.reduce((acc, t) => acc + ((t as any).description?.length || 0) + ((t as any).title?.length || 0), 0)
          + (customInstructions?.length || 0)
          + 1500
        }
        operationLabel={`Generazione ABAP per ${selectedTasks.length} task`}
      />
    </Dialog>
  );
}
