import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DOMPurify from 'dompurify';
import { useEntityFieldMetadata, metadataToAvailableColumns } from "@/hooks/use-entity-field-metadata";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { 
  Mail, 
  MailOpen, 
  User, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  FileText,
  Bot,
  Link,
  Plus,
  Eye,
  RefreshCw,
  Trash2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Brain,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  ChevronRight,
  Sparkles,
  GitBranch,
  Clipboard,
  ExternalLink
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { BarChart3, TrendingUp, Database, Image } from "lucide-react";
import type { Message, Project, Task, Partner } from "@shared/schema";
import { format } from "date-fns";
import MessageForm from "@/components/forms/message-form";
import SimpleChatForm from "@/components/forms/simple-chat-form";
import { ProjectProposalDialog } from "@/components/dialogs/project-proposal-dialog";
import { useAuth } from "@/hooks/use-auth";

interface AISuggestion {
  type: 'project' | 'task' | 'partner';
  id: string;
  name: string;
  confidence: number;
  reason: string;
}

interface AnalysisResult {
  suggestions: AISuggestion[];
  bestMatch?: AISuggestion;
}

interface RenderedMessageContent {
  bodyText: string;
  bodyHtml: string | null;
  remainderText: string | null;
  remainderHtml: string | null;
  headerSummary: string | null;
  isForwarded: boolean;
  metadata?: {
    platform?: string;
    participants?: Array<{id: string; name: string}>;
    messages?: Array<{id: string; senderId: string; senderName: string; timestamp: string; text: string}>;
    summary?: string;
    rawSource?: string;
    parsingFailed?: boolean;
  };
}

// ✅ MODULAR: Unified selection record type
interface SelectionRecord {
  selectionType: 'body' | 'header' | 'thread' | 'signatureBody' | 'signatureHeader' | 'mailThread';
  selectedText: string;
  sourceMessageId?: string;
}

// ✅ MODULAR: Type metadata for consistent display
const selectionTypeConfig = {
  body: { label: 'Da mantenere (Body)', color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-600' },
  header: { label: 'Da eliminare (Header)', color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-600' },
  thread: { label: 'Da compattare (Thread)', color: 'yellow', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', textColor: 'text-yellow-600' },
  signatureBody: { label: 'Da conservare (Firma Body)', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-600' },
  signatureHeader: { label: 'Da eliminare (Firma Header)', color: 'purple', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', textColor: 'text-purple-600' },
  mailThread: { label: 'Da compattare (Mail Thread)', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-600' }
} as const;

// ✅ MODULAR: Helper to group selections by type
const groupSelectionsByType = (selections: SelectionRecord[]) => {
  return selections.reduce((groups, selection) => {
    if (!groups[selection.selectionType]) {
      groups[selection.selectionType] = [];
    }
    groups[selection.selectionType].push(selection);
    return groups;
  }, {} as Record<string, SelectionRecord[]>);
};

export default function MessagesPage() {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"receivedAt" | "fromEmail" | "subject">("receivedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showThreadContent, setShowThreadContent] = useState(false);
  const [showRawContent, setShowRawContent] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<string | null>(null);
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [customFeedbackReason, setCustomFeedbackReason] = useState("");
  const [selectedCustomReasonId, setSelectedCustomReasonId] = useState<string | null>(null);
  const [showThreadView, setShowThreadView] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<"all" | "email" | "chat" | "sms" | "other" | "devops">("all");
  
  // Training mode states
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'body' | 'header' | 'thread' | 'signatureBody' | 'signatureHeader' | 'mailThread'>('body');
  const [showTrainingStats, setShowTrainingStats] = useState(false);
  // ✅ MODULAR: Simple array of selection records per message
  const [selections, setSelections] = useState<{
    [messageId: string]: SelectionRecord[];
  }>({});

  // AI Project Agent states
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<any>(null);

  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState({
    type: 8, // percentuale
    fromEmail: 35,
    subject: 37,
    receivedAt: 20
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [showEnrichPanel, setShowEnrichPanel] = useState(false);
  const [enrichJsonInput, setEnrichJsonInput] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Reset thread content visibility when message changes
  useEffect(() => {
    setShowThreadContent(false);
  }, [selectedMessage?.id]);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: true, // Continue refreshing in background
    enabled: !showThreadView, // Only fetch when not in thread view
  });

  // Thread view data
  const { data: threads = [] } = useQuery<any[]>({
    queryKey: ["/api/message-threads"],
    refetchInterval: 30000, 
    refetchIntervalInBackground: true,
    enabled: showThreadView, // Only fetch when in thread view
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  // Query per i motivi di feedback personalizzati
  const { data: customFeedbackReasons = [] } = useQuery<{ id: string; reason: string; usageCount: number }[]>({
    queryKey: ["/api/feedback/custom-reasons"],
  });

  // Query per le proposte AI disponibili
  const { data: proposals = [] } = useQuery<any[]>({
    queryKey: ["/api/proposals"],
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: true,
  });

  // Query per il contenuto renderizzato del messaggio selezionato
  const { data: renderedContent } = useQuery<RenderedMessageContent>({
    queryKey: ["/api/messages", selectedMessage?.id, "rendered"],
    enabled: !!selectedMessage,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const { data: fieldMetadata } = useEntityFieldMetadata("messages");
  const availableColumns = fieldMetadata ? metadataToAvailableColumns(fieldMetadata) : [];

  // 🔍 DEBUG: Log what we actually receive from backend
  useEffect(() => {
    if (renderedContent) {
      console.log(`[FRONTEND-DEBUG] Rendered content received for ${selectedMessage?.id}:`, {
        bodyHtmlLength: renderedContent.bodyHtml?.length || 0,
        bodyTextLength: renderedContent.bodyText?.length || 0,
        remainderHtmlLength: renderedContent.remainderHtml?.length || 0,
        remainderTextLength: renderedContent.remainderText?.length || 0,
        isForwarded: renderedContent.isForwarded,
        metadata: renderedContent.metadata,
        _lastProcessed: (renderedContent as any)._lastProcessed,
        _cacheBreaker: (renderedContent as any)._cacheBreaker
      });
    }
  }, [renderedContent, selectedMessage?.id]);

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Sincronizzazione avviata",
        description: "Il sistema sta recuperando le email dalla cartella.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore di sincronizzazione",
        description: error.message || "Errore durante la sincronizzazione delle email.",
        variant: "destructive",
      });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (messageId: string) => 
      apiRequest("POST", `/api/messages/${messageId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    }
  });

  const analyzeMutation = useMutation<AnalysisResult, Error, string>({
    mutationFn: async (messageId: string) => {
      const response = await apiRequest("POST", `/api/messages/${messageId}/analyze`);
      return response as unknown as AnalysisResult;
    },
    onSuccess: () => {
      setShowSuggestions(true);
    }
  });

  const applySuggestionMutation = useMutation({
    mutationFn: ({ messageId, suggestion }: { messageId: string, suggestion: AISuggestion }) =>
      apiRequest("POST", `/api/messages/${messageId}/apply-suggestion`, { suggestion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setShowSuggestions(false);
      toast({
        title: "Collegamento applicato",
        description: "Il messaggio è stato collegato con successo.",
      });
    }
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => 
      apiRequest("DELETE", `/api/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setSelectedMessage(null);
      toast({
        title: "Messaggio eliminato",
        description: "Il messaggio è stato eliminato con successo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'eliminazione del messaggio.",
        variant: "destructive",
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (messageId: string) => 
      apiRequest("POST", `/api/messages/${messageId}/reprocess`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMessage?.id, "rendered"] });
      toast({
        title: "Email riprocessata",
        description: "L'email è stata riprocessata usando l'algoritmo migliorato.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore riprocessamento",
        description: error.message || "Errore durante il riprocessamento dell'email.",
        variant: "destructive",
      });
    },
  });

  const enrichDevOpsMutation = useMutation({
    mutationFn: async ({ messageId, enrichData }: { messageId: string; enrichData: any }) => {
      const response = await apiRequest("PUT", `/api/messages/${messageId}`, {
        externalMetadata: enrichData
      });
      return response;
    },
    onSuccess: (updatedMessage: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setShowEnrichPanel(false);
      setEnrichJsonInput("");
      if (updatedMessage && selectedMessage) {
        setSelectedMessage({
          ...selectedMessage,
          externalMetadata: updatedMessage.externalMetadata
        } as any);
      }
      toast({
        title: "Dati arricchiti!",
        description: "I dati del Work Item sono stati salvati nel messaggio.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare i dati.",
        variant: "destructive"
      });
    }
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ messageId, isCorrect, category, comment, customReasonId }: { 
      messageId: string; 
      isCorrect: boolean; 
      category?: string; 
      comment?: string;
      customReasonId?: string;
    }) => 
      apiRequest("POST", `/api/messages/${messageId}/feedback`, {
        isCorrect,
        category,
        comment,
        customReasonId,
        timestamp: new Date().toISOString()
      }),
    onSuccess: () => {
      toast({
        title: "Feedback inviato",
        description: "Grazie per il feedback! Ci aiuterà a migliorare l'algoritmo.",
      });
      setShowFeedbackPanel(false);
      setFeedbackCategory(null);
      setCustomFeedbackReason("");
      setSelectedCustomReasonId(null);
      // Invalidate custom reasons cache to refresh the list with any new reason
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/custom-reasons"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'invio del feedback.",
        variant: "destructive",
      });
    },
  });

  const clearAllMessagesMutation = useMutation({
    mutationFn: async () => {
      // Delete all messages for the current user
      const deletePromises = messages.map(message => 
        apiRequest("DELETE", `/api/messages/${message.id}`)
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      setSelectedMessage(null);
      toast({
        title: "Tutti i messaggi eliminati",
        description: "Tutti i messaggi sono stati eliminati. Usa 'Sincronizza' per ricaricarli.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'eliminazione dei messaggi.",
        variant: "destructive",
      });
    },
  });

  // AI Project Agent mutations
  const analyzeProjectMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const response = await apiRequest("POST", `/api/messages/${messageId}/analyze-project`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      // Check if message was already processed
      if (data.alreadyProcessed) {
        toast({
          title: "Messaggio già processato",
          description: data.warning || "Questo messaggio è già stato processato dall'AI.",
          variant: "default",
        });
        return;
      }
      
      setCurrentProposal(data);
      setShowProposalDialog(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore analisi",
        description: error.message || "Impossibile analizzare il messaggio.",
        variant: "destructive",
      });
    },
  });

  const applyProposalMutation = useMutation({
    mutationFn: async ({ messageId, proposal }: { messageId: string; proposal: any }) => {
      const response = await apiRequest("POST", `/api/messages/${messageId}/apply-project-proposal`, { proposal });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowProposalDialog(false);
      setCurrentProposal(null);
      toast({
        title: "Proposta applicata!",
        description: `Progetto, partner e task creati con successo.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile applicare la proposta.",
        variant: "destructive",
      });
    },
  });

  const handleSelectMessage = (message: Message) => {
    setSelectedMessage(message);
    setShowSuggestions(false);
    if (message.status === 'unread') {
      markAsReadMutation.mutate(message.id);
    }
  };

  const handleAnalyze = () => {
    if (selectedMessage) {
      analyzeMutation.mutate(selectedMessage.id);
    }
  };

  const handleApplySuggestion = (suggestion: AISuggestion) => {
    if (selectedMessage) {
      applySuggestionMutation.mutate({
        messageId: selectedMessage.id,
        suggestion
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unread': return <Mail className="h-4 w-4" />;
      case 'read': return <MailOpen className="h-4 w-4" />;
      case 'processed': return <CheckCircle className="h-4 w-4" />;
      case 'archived': return <FileText className="h-4 w-4" />;
      default: return <Mail className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="h-4 w-4 text-amber-600" />;
      case 'chat': return <MessageSquare className="h-4 w-4 text-indigo-600" />;
      case 'sms': return <MessageSquare className="h-4 w-4 text-green-400" />;
      case 'other': return <FileText className="h-4 w-4" />;
      default: return <Mail className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unread': return 'bg-blue-500';
      case 'read': return 'bg-gray-500';
      case 'processed': return 'bg-green-500';
      case 'archived': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getFileType = (filename: string): { isImage: boolean; icon: string; type: string } => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const isImage = imageExts.includes(ext);
    
    if (isImage) return { isImage: true, icon: '🖼️', type: 'Immagine' };
    
    // Altri tipi di file
    const fileTypes: { [key: string]: { isImage: boolean; icon: string; type: string } } = {
      'pdf': { isImage: false, icon: '📄', type: 'PDF' },
      'doc': { isImage: false, icon: '📝', type: 'Word' },
      'docx': { isImage: false, icon: '📝', type: 'Word' },
      'xls': { isImage: false, icon: '📊', type: 'Excel' },
      'xlsx': { isImage: false, icon: '📊', type: 'Excel' },
      'ppt': { isImage: false, icon: '📈', type: 'PowerPoint' },
      'pptx': { isImage: false, icon: '📈', type: 'PowerPoint' },
      'txt': { isImage: false, icon: '📃', type: 'Testo' },
      'zip': { isImage: false, icon: '🗜️', type: 'Archivio' },
      'rar': { isImage: false, icon: '🗜️', type: 'Archivio' }
    };
    
    return fileTypes[ext] || { isImage: false, icon: '📁', type: 'File' };
  };

  const getLinkedObjectName = (message: Message) => {
    if (message.projectId) {
      const project = projects.find(p => p.id === message.projectId);
      return { type: 'Progetto', name: project?.name || 'Sconosciuto' };
    }
    if (message.taskId) {
      const task = tasks.find(t => t.id === message.taskId);
      return { type: 'Task', name: task?.title || 'Sconosciuto' };
    }
    if (message.partnerId) {
      const partner = partners.find(p => p.id === message.partnerId);
      return { type: 'Partner', name: partner?.name || 'Sconosciuto' };
    }
    return null;
  };

  // Derive thread data for current message
  const getCurrentThreadData = () => {
    if (!selectedMessage || !showThreadView || !threads.length) {
      return null;
    }
    
    // Find the thread containing the selected message
    const currentThread = threads.find(thread => 
      thread.messages.some((msg: Message) => msg.id === selectedMessage.id)
    );
    
    if (!currentThread || currentThread.messages.length <= 1) {
      return null;
    }
    
    // Sort messages by date (oldest first)
    const sortedMessages = [...currentThread.messages].sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    );
    
    // Split into current (selected) and history (rest)
    const historyMessages = sortedMessages.filter(msg => msg.id !== selectedMessage.id);
    
    return {
      currentMessage: selectedMessage,
      historyMessages,
      totalCount: sortedMessages.length
    };
  };
  
  const threadData = getCurrentThreadData();

  const unreadCount = showThreadView 
    ? threads.reduce((sum, thread) => sum + thread.unreadCount, 0)
    : messages.filter(m => m.status === 'unread').length;

  // Calculate message counts by type
  const typeCounts = React.useMemo(() => {
    const counts = {
      all: messages.length,
      email: messages.filter(m => m.type === 'email').length,
      chat: messages.filter(m => m.type === 'chat').length,
      sms: messages.filter(m => m.type === 'sms').length,
      other: messages.filter(m => m.type === 'other').length,
      devops: messages.filter(m => (m as any).sourceType === 'email_devops_workitem').length,
    };
    return counts;
  }, [messages]);

  const toggleThread = (threadId: string) => {
    const newExpanded = new Set(expandedThreads);
    if (expandedThreads.has(threadId)) {
      newExpanded.delete(threadId);
    } else {
      newExpanded.add(threadId);
    }
    setExpandedThreads(newExpanded);
  };

  // Filtro e ordinamento messaggi
  const filteredAndSortedMessages = messages
    .filter(message => {
      // Filter by type
      if (filterType === "devops") {
        // DevOps tab: filter by sourceType
        if ((message as any).sourceType !== 'email_devops_workitem') return false;
      } else if (filterType !== "all" && message.type !== filterType) {
        return false;
      }
      
      // Filter by search term
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        (message.fromName || message.fromEmail).toLowerCase().includes(searchLower) ||
        (message.subject || '').toLowerCase().includes(searchLower) ||
        (message.body || '').toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'receivedAt':
          comparison = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
          break;
        case 'fromEmail':
          comparison = (a.fromName || a.fromEmail).localeCompare(b.fromName || b.fromEmail);
          break;
        case 'subject':
          comparison = (a.subject || '').localeCompare(b.subject || '');
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  // Column resize handlers
  const handleColumnResize = (e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidths = [...Object.values(columnWidths)]; // [type, fromEmail, subject, receivedAt]
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const containerWidth = 800; // Approssimativamente
      const deltaPercent = (deltaX / containerWidth) * 100;
      
      const newWidths = [...startWidths];
      
      if (columnIndex === 0) { // type
        newWidths[0] = Math.max(5, Math.min(15, startWidths[0] + deltaPercent));
        newWidths[1] = Math.max(20, Math.min(70, startWidths[1] - deltaPercent));
      } else if (columnIndex === 1) { // fromEmail
        newWidths[1] = Math.max(20, Math.min(70, startWidths[1] + deltaPercent));
        newWidths[2] = Math.max(20, Math.min(70, startWidths[2] - deltaPercent));
      } else if (columnIndex === 2) { // subject
        newWidths[2] = Math.max(20, Math.min(70, startWidths[2] + deltaPercent));
        newWidths[3] = Math.max(10, Math.min(40, startWidths[3] - deltaPercent));
      }
      
      setColumnWidths({
        type: newWidths[0],
        fromEmail: newWidths[1],
        subject: newWidths[2],
        receivedAt: newWidths[3]
      });
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
      setResizingColumn(null);
    };
    
    setIsResizing(true);
    setResizingColumn(columnIndex === 0 ? 'fromEmail' : 'subject');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const handleTextSelection = (event: React.MouseEvent) => {
    console.log('[TRAINING-SELECT] Text selection triggered, isTrainingMode:', isTrainingMode, 'selectedMessage:', !!selectedMessage);
    if (!isTrainingMode || !selectedMessage) return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectedText = selection.toString().trim();
    console.log('[TRAINING-SELECT] Selected text:', selectedText.substring(0, 100), 'length:', selectedText.length);
    console.log('[TRAINING-SELECT] Current selectionMode:', selectionMode);
    if (!selectedText) return;
    
    // Ensure selection is within email content
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(selection.anchorNode) || !target.contains(selection.focusNode)) {
      return;
    }
    
    const messageId = selectedMessage.id;
    
    // ✅ MODULAR: Create unified selection record  
    const newSelection: SelectionRecord = {
      selectionType: selectionMode,
      selectedText: selectedText.trim(),
      sourceMessageId: (selectionMode === 'thread' || selectionMode === 'mailThread') ? messageId : undefined
    };
    
    console.log('[TRAINING-SELECT] Creating selection:', newSelection);
    
    setSelections(prev => {
      const messageSelections = prev[messageId] || [];
      
      // ✅ MODULAR: Fixed duplicate check - compare selectionType + selectedText, plus sourceMessageId only for thread types
      const text = selectedText.trim();
      const isDuplicate = messageSelections.some(s => {
        if (s.selectionType !== selectionMode || s.selectedText !== text) {
          return false;
        }
        
        // For thread types, also compare sourceMessageId
        if (selectionMode === 'thread' || selectionMode === 'mailThread') {
          return s.sourceMessageId === messageId;
        }
        
        // For non-thread types, just match type + text within same message
        return true;
      });
      
      if (isDuplicate) {
        toast({
          title: "Testo già selezionato",
          description: "Questo testo è già stato classificato",
          duration: 2000
        });
        return prev;
      }
      
      console.log('[TRAINING-SELECT] Adding to selections, current count:', messageSelections.length);
      
      // ✅ MODULAR: Simple unified addition
      return {
        ...prev,
        [messageId]: [...messageSelections, newSelection]
      };
    });
    
    // Clear the selection
    selection.removeAllRanges();
    
    toast({
      title: `Testo classificato come ${selectionMode}`,
      description: `"${selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText}"`,
      duration: 2000
    });
  };

  return (
    <>
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Messaggi"
          subtitle="Gestisci email, chat, SMS e altri messaggi con suggerimenti AI"
        />
        
        <div className="px-6 py-2 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="text-sm">
                {unreadCount} non letti
              </Badge>
              <Button 
                onClick={() => setShowThreadView(!showThreadView)}
                size="sm"
                variant={showThreadView ? "default" : "outline"}
                data-testid="button-toggle-thread-view"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {showThreadView ? 'Vista normale' : 'Vista thread'}
              </Button>
              {(filterType === "all" || filterType === "email") && (
                <Button 
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  size="sm"
                  variant="outline"
                  data-testid="button-sync-emails"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  Sincronizza Email
                </Button>
              )}
              {(filterType === "chat" || filterType === "sms" || filterType === "other") && (
                <div className="flex items-center text-sm text-muted-foreground bg-muted px-3 py-1 rounded-md">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Solo inserimento manuale - Usa il pulsante "+" per aggiungere
                </div>
              )}
            </div>
            {messages.length > 0 && (
              <div className="flex items-center space-x-2">
                <Button 
                  onClick={() => {
                    const messagesToAnalyze = selectedMessageIds.length > 0 
                      ? selectedMessageIds 
                      : (selectedMessage ? [selectedMessage.id] : []);
                    if (messagesToAnalyze.length > 0) {
                      // Process each message sequentially
                      messagesToAnalyze.forEach(id => analyzeProjectMutation.mutate(id));
                    }
                  }}
                  disabled={analyzeProjectMutation.isPending || (!selectedMessage && selectedMessageIds.length === 0)}
                  size="sm"
                  data-testid="button-analyze-project"
                  className="bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 border-purple-200"
                >
                  <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                  {analyzeProjectMutation.isPending 
                    ? 'Analizzando...' 
                    : selectedMessageIds.length > 0 
                      ? `Analizza ${selectedMessageIds.length} messaggi` 
                      : 'Analizza con AI'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      size="sm"
                      variant="destructive"
                      data-testid="button-clear-all-messages"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Elimina tutti
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare tutti i messaggi?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Questa azione eliminerà tutti i {messages.length} messaggi email. 
                        Potrai ricaricarli usando il bottone "Sincronizza" per vedere la nuova formattazione HTML.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearAllMessagesMutation.mutate()}
                        disabled={clearAllMessagesMutation.isPending}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        {clearAllMessagesMutation.isPending ? "Eliminando..." : "Elimina tutti"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
        <main className="p-6">
          <PanelGroup direction="horizontal" className="h-[calc(100vh-120px)]">
            <Panel defaultSize={40} minSize={25} maxSize={60}>
              {/* Message List */}
              <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                  </CardTitle>
                </div>
                {/* Barra di ricerca */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca messaggi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                    data-testid="search-messages"
                  />
                </div>
                {/* Filter tabs by message type */}
                <Tabs value={filterType} onValueChange={(value) => setFilterType(value as typeof filterType)} className="w-full">
                  <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="all" data-testid="tab-all">
                      Tutti ({typeCounts.all})
                    </TabsTrigger>
                    <TabsTrigger value="email" data-testid="tab-email">
                      <Mail className="h-4 w-4 mr-1" />
                      Email ({typeCounts.email})
                    </TabsTrigger>
                    <TabsTrigger value="chat" data-testid="tab-chat">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Chat ({typeCounts.chat})
                    </TabsTrigger>
                    <TabsTrigger value="sms" data-testid="tab-sms">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      SMS ({typeCounts.sms})
                    </TabsTrigger>
                    <TabsTrigger value="devops" data-testid="tab-devops">
                      <GitBranch className="h-4 w-4 mr-1" />
                      DevOps ({typeCounts.devops})
                    </TabsTrigger>
                    <TabsTrigger value="other" data-testid="tab-other">
                      <FileText className="h-4 w-4 mr-1" />
                      Altro ({typeCounts.other})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                <div className="border rounded-md">
                  <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHeader>
                      <TableRow>
                        {filterType === 'all' && (
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 relative"
                            style={{ width: `${columnWidths.type}%` }}
                            data-testid="header-type"
                          >
                            <div className="flex items-center space-x-2">
                              <span>Tipo</span>
                            </div>
                            {/* Resize handle */}
                            <div
                              className="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-border hover:bg-primary transition-colors z-10"
                              onMouseDown={(e) => handleColumnResize(e, 0)}
                              title="Trascina per ridimensionare"
                            />
                          </TableHead>
                        )}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 relative"
                          style={{ width: `${columnWidths.fromEmail}%` }}
                          onClick={() => handleSort('fromEmail')}
                          data-testid="header-sort-sender"
                        >
                          <div className="flex items-center space-x-2">
                            <span>Mittente</span>
                            {getSortIcon('fromEmail')}
                          </div>
                          {/* Resize handle */}
                          <div
                            className="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-border hover:bg-primary transition-colors z-10"
                            onMouseDown={(e) => handleColumnResize(e, 1)}
                            title="Trascina per ridimensionare"
                          />
                        </TableHead>
                        {filterType === 'email' && (
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 relative"
                            style={{ width: `${columnWidths.subject}%` }}
                            onClick={() => handleSort('subject')}
                            data-testid="header-sort-subject"
                          >
                            <div className="flex items-center space-x-2">
                              <span>Oggetto</span>
                              {getSortIcon('subject')}
                            </div>
                            {/* Resize handle */}
                            <div
                              className="absolute right-0 top-0 w-2 h-full cursor-col-resize bg-border hover:bg-primary transition-colors z-10"
                              onMouseDown={(e) => handleColumnResize(e, 2)}
                              title="Trascina per ridimensionare"
                            />
                          </TableHead>
                        )}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50"
                          style={{ width: `${columnWidths.receivedAt}%` }}
                          onClick={() => handleSort('receivedAt')}
                          data-testid="header-sort-date"
                        >
                          <div className="flex items-center space-x-2">
                            <span>Data/Ora</span>
                            {getSortIcon('receivedAt')}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                  </Table>
                  <ScrollArea className="flex-1 min-h-0">
                    <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                      <TableBody>
                        {showThreadView ? (
                          // Thread View
                          threads.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                                  <p>Nessun thread trovato</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            threads.map((thread) => (
                              <React.Fragment key={thread.threadId}>
                                {/* Thread Header Row */}
                                <TableRow
                                  className="cursor-pointer bg-muted/30 hover:bg-muted/50 border-2 border-primary/20"
                                  onClick={() => toggleThread(thread.threadId)}
                                  data-testid={`thread-${thread.threadId}`}
                                >
                                  <TableCell colSpan={4} className="py-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        {expandedThreads.has(thread.threadId) ? (
                                          <ChevronDown className="h-4 w-4" />
                                        ) : (
                                          <ChevronUp className="h-4 w-4" />
                                        )}
                                        <MessageSquare className="h-5 w-5 text-primary" />
                                        <div>
                                          <div className="font-semibold">
                                            Thread: {thread.messages[0]?.subject || 'Nessun oggetto'}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {thread.messageCount} messaggi, {thread.unreadCount} non letti
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {format(new Date(thread.latestReceivedAt), 'dd MMM yyyy HH:mm')}
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>

                                {/* Thread Messages (when expanded) - Simple list without current/history separation */}
                                {expandedThreads.has(thread.threadId) && (
                                  <>
                                    {[...thread.messages]
                                      .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())
                                      .map((message, index) => {
                                        const linkedObject = getLinkedObjectName(message);
                                        
                                        return (
                                          <TableRow
                                            key={message.id}
                                            data-testid={`message-item-${message.id}`}
                                            className={`cursor-pointer transition-colors border-l-4 border-l-primary/30 ml-8 ${
                                              selectedMessage?.id === message.id ? 'bg-muted' : ''
                                            } ${message.status === 'unread' ? 'border-l-blue-500' : ''}`}
                                            onClick={() => handleSelectMessage(message)}
                                          >
                                            {filterType === 'all' && (
                                              <TableCell style={{ width: `${columnWidths.type}%` }}>
                                                <div className="flex items-center justify-center pl-4">
                                                  {getTypeIcon(message.type)}
                                                </div>
                                              </TableCell>
                                            )}
                                            <TableCell style={{ width: `${columnWidths.fromEmail}%` }}>
                                              <div className="space-y-1 pl-4">
                                                <div className="flex items-center gap-2">
                                                  {getStatusIcon(message.status)}
                                                  <span className={`text-sm truncate ${
                                                    message.status === 'unread' ? 'font-bold' : 'font-medium'
                                                  }`}>
                                                    {message.fromName || message.fromEmail}
                                                  </span>
                                                  <Badge variant="secondary" className="text-xs">
                                                    #{index + 1}
                                                  </Badge>
                                                </div>
                                                {linkedObject && (
                                                  <Badge variant="outline" className="text-xs">
                                                    <Link className="h-3 w-3 mr-1" />
                                                    {linkedObject.type}: {linkedObject.name}
                                                  </Badge>
                                                )}
                                              </div>
                                            </TableCell>
                                            
                                            {filterType === 'email' && (
                                              <TableCell style={{ width: `${columnWidths.subject}%` }}>
                                                <div className="space-y-1 pl-4">
                                                  <p className={`text-sm truncate ${
                                                    message.status === 'unread' ? 'font-bold text-foreground' : 'font-normal text-foreground'
                                                  }`}>
                                                    {message.subject || 'Nessun oggetto'}
                                                  </p>
                                                  <p className="text-xs text-muted-foreground truncate">
                                                    {message.body ? message.body.substring(0, 60) + '...' : 'Nessun contenuto'}
                                                  </p>
                                                </div>
                                              </TableCell>
                                            )}
                                            
                                            <TableCell className="text-xs text-muted-foreground" style={{ width: `${columnWidths.receivedAt}%` }}>
                                              <div className="space-y-1 pl-4">
                                                <div>{format(new Date(message.receivedAt), 'dd MMM yyyy')}</div>
                                                <div>{format(new Date(message.receivedAt), 'HH:mm')}</div>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                  </>
                                )}
                              </React.Fragment>
                            ))
                          )
                        ) : (
                          // Normal Message View
                          filteredAndSortedMessages.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-32 text-center">
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                  <Mail className="h-8 w-8 mb-2 opacity-50" />
                                  <p>{searchTerm ? 'Nessun messaggio trovato' : 'Nessun messaggio ricevuto'}</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredAndSortedMessages.map((message) => {
                            const linkedObject = getLinkedObjectName(message);
                            const messageProposals = proposals.filter(p => p.messageId === message.id && p.status === 'pending');
                            
                            return (
                              <TableRow
                                key={message.id}
                                data-testid={`message-item-${message.id}`}
                                className={`cursor-pointer transition-colors ${
                                  selectedMessage?.id === message.id ? 'bg-muted' : ''
                                } ${message.status === 'unread' ? 'border-l-4 border-l-blue-500' : ''}`}
                                onClick={() => handleSelectMessage(message)}
                              >
                                {/* Colonna Tipo */}
                                {filterType === 'all' && (
                                  <TableCell style={{ width: `${columnWidths.type}%` }}>
                                    <div className="flex items-center justify-center">
                                      {getTypeIcon(message.type)}
                                    </div>
                                  </TableCell>
                                )}
                                {/* Colonna Mittente */}
                                <TableCell style={{ width: `${columnWidths.fromEmail}%` }}>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      {getStatusIcon(message.status)}
                                      <span className={`text-sm truncate ${
                                        message.status === 'unread' ? 'font-bold' : 'font-medium'
                                      }`}>
                                        {message.fromName || message.fromEmail}
                                      </span>
                                    </div>
                                    {linkedObject && (
                                      <Badge variant="outline" className="text-xs">
                                        <Link className="h-3 w-3 mr-1" />
                                        {linkedObject.type}: {linkedObject.name}
                                      </Badge>
                                    )}
                                    {messageProposals.length > 0 && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-600">
                                        <Sparkles className="h-3 w-3 mr-1" />
                                        {messageProposals.length} {messageProposals.length === 1 ? 'proposta' : 'proposte'} AI
                                      </Badge>
                                    )}
                                    {message.confidenceScore && (
                                      <div className="text-xs font-medium">
                                        <span className={getConfidenceColor(message.confidenceScore ? Number(message.confidenceScore) : 0)}>
                                          Confidenza: {Math.round((message.confidenceScore ? Number(message.confidenceScore) : 0) * 100)}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                
                                {/* Colonna Oggetto */}
                                {filterType === 'email' && (
                                  <TableCell style={{ width: `${columnWidths.subject}%` }}>
                                    <div className="space-y-1">
                                      <p className={`text-sm truncate ${
                                        message.status === 'unread' ? 'font-bold text-foreground' : 'font-normal text-foreground'
                                      }`}>
                                        {message.subject || 'Nessun oggetto'}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {message.body ? message.body.substring(0, 80) + '...' : 'Nessun contenuto'}
                                      </p>
                                    </div>
                                  </TableCell>
                                )}
                                
                                {/* Colonna Data/Ora */}
                                <TableCell className="text-xs text-muted-foreground" style={{ width: `${columnWidths.receivedAt}%` }}>
                                  <div className="space-y-1">
                                    <div>{format(new Date(message.receivedAt), 'dd MMM yyyy')}</div>
                                    <div>{format(new Date(message.receivedAt), 'HH:mm')}</div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </CardContent>
              </Card>
            </Panel>

            <PanelResizeHandle className="w-2 bg-border hover:bg-muted transition-colors" />

            <Panel defaultSize={60} minSize={40} maxSize={75}>
              {/* Message Detail */}
              <Card className="h-full flex flex-col">
          <CardContent className="flex flex-col h-full p-0">
            {!selectedMessage ? (
              <div className="flex items-center justify-center h-96 text-center text-muted-foreground">
                <div>
                  <Mail className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Seleziona un messaggio</p>
                  <p className="text-sm">Clicca su un messaggio per visualizzare i dettagli</p>
                </div>
              </div>
            ) : (
              /* Normal single message view */
              <div className="flex flex-col h-full">
                {/* Header dati strutturati */}
                <div className="flex-shrink-0 p-6 pb-4 space-y-4">
                  {/* Destinatari */}
                  <div 
                    className={`border rounded-lg p-4 ${isTrainingMode ? 'training-selection-area' : ''} ${isTrainingMode && selectionMode === 'header' ? 'select-text cursor-pointer' : ''}`}
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
                    data-selection-mode={isTrainingMode ? selectionMode : undefined}
                    onMouseUp={isTrainingMode && selectionMode === 'header' ? handleTextSelection : undefined}
                    data-testid="email-header-recipients"
                  >
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {/* Destinatari TO - con fallback su toEmail */}
                        {(() => {
                          
                          const toEmails = (selectedMessage.originalToEmails && selectedMessage.originalToEmails.length > 0) 
                            ? selectedMessage.originalToEmails 
                            : [selectedMessage.toEmail];
                          
                          return (
                            <div className="flex flex-wrap gap-2">
                              {toEmails.map((email, index) => {
                                const isCurrentUser = email?.toLowerCase() === user?.email?.toLowerCase();
                                return (
                                  <Badge 
                                    key={`to-${index}`} 
                                    variant="outline" 
                                    className={`text-sm ${
                                      isCurrentUser 
                                        ? 'bg-green-50 text-green-700 border-green-200' 
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}
                                  >
                                    <User className="h-3 w-3 mr-1" />
                                    {isCurrentUser ? `Tu (${email})` : email}
                                  </Badge>
                                );
                              })}
                            </div>
                          );
                        })()}
                        
                        {/* Destinatari CC */}
                        {(selectedMessage.originalCcEmails && selectedMessage.originalCcEmails.length > 0) && (
                          <div className="flex flex-wrap gap-2">
                            {selectedMessage.originalCcEmails.map((email, index) => {
                              const isCurrentUser = email?.toLowerCase() === user?.email?.toLowerCase();
                              return (
                                <Badge 
                                  key={`cc-${index}`} 
                                  variant="outline" 
                                  className={`text-sm ${
                                    isCurrentUser 
                                      ? 'bg-green-50 text-green-700 border-green-200' 
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  <User className="h-3 w-3 mr-1" />
                                  {isCurrentUser ? `Tu (${email})` : email}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Collegamenti AI - solo se esistono */}
                  {(() => {
                    const linkedObject = getLinkedObjectName(selectedMessage);
                    const hasLinks = linkedObject || selectedMessage.confidenceScore || selectedMessage.matchingReason;
                    
                    if (!hasLinks) return null;
                    
                    return (
                      <div 
                        className={`border rounded-lg p-4 ${isTrainingMode ? 'training-selection-area' : ''} ${isTrainingMode && selectionMode === 'header' ? 'select-text cursor-pointer' : ''}`}
                        style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
                        data-selection-mode={isTrainingMode ? selectionMode : undefined}
                        onMouseUp={isTrainingMode && selectionMode === 'header' ? handleTextSelection : undefined}
                        data-testid="email-header-ai-links"
                      >
                        <div className="flex flex-wrap gap-2">
                          {linkedObject && (
                            <Badge variant="outline" className="text-sm">
                              <Link className="h-3 w-3 mr-1" />
                              {linkedObject.type}: {linkedObject.name}
                            </Badge>
                          )}
                          {selectedMessage.confidenceScore && (
                            <Badge variant="outline" className="text-sm">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Confidenza: {Math.round((selectedMessage.confidenceScore ? Number(selectedMessage.confidenceScore) : 0) * 100)}%
                            </Badge>
                          )}
                          {selectedMessage.matchingReason && (
                            <Badge variant="outline" className="text-sm">
                              <Brain className="h-3 w-3 mr-1" />
                              {selectedMessage.matchingReason}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Azure DevOps Work Item Panel */}
                  {(selectedMessage as any)?.sourceType === 'email_devops_workitem' && (() => {
                    const externalMeta = (selectedMessage as any)?.externalMetadata || {};
                    const workItemId = externalMeta.workItemId;
                    const workItemTitle = externalMeta.workItemTitle || selectedMessage.subject;
                    const workItemType = externalMeta.workItemType;
                    const workItemUrl = externalMeta.workItemUrl;
                    
                    const extractUrlFromBody = () => {
                      const body = selectedMessage.htmlBody || selectedMessage.body || '';
                      const urlPatterns = [
                        /https?:\/\/dev\.azure\.com\/[^\s<>"]+\/_workitems\/edit\/\d+/gi,
                        /https?:\/\/[^\s<>"]+\.visualstudio\.com\/[^\s<>"]+\/_workitems\/edit\/\d+/gi,
                      ];
                      for (const pattern of urlPatterns) {
                        const match = body.match(pattern);
                        if (match) return match[0];
                      }
                      return null;
                    };
                    
                    const displayUrl = workItemUrl || extractUrlFromBody();
                    
                    return (
                      <div 
                        className="border rounded-lg p-4"
                        style={{ backgroundColor: 'rgba(0, 120, 212, 0.1)', border: '1px solid rgba(0, 120, 212, 0.3)' }}
                        data-testid="devops-workitem-panel"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <GitBranch className="h-5 w-5 text-blue-600" />
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 text-white">Azure DevOps</Badge>
                                {workItemType && (
                                  <Badge variant="outline" className="text-blue-700 border-blue-300">
                                    {workItemType}
                                  </Badge>
                                )}
                                {workItemId > 0 && (
                                  <Badge variant="outline" className="text-blue-700 border-blue-300">
                                    #{workItemId}
                                  </Badge>
                                )}
                              </div>
                              {workItemTitle && (
                                <p className="text-sm text-muted-foreground mt-1 max-w-md truncate">
                                  {workItemTitle}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {externalMeta.workItemState && (
                              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                                {externalMeta.workItemState}
                              </Badge>
                            )}
                            {externalMeta.workItemAssignedTo && (
                              <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50">
                                <User className="h-3 w-3 mr-1" />
                                {externalMeta.workItemAssignedTo}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {displayUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(displayUrl, '_blank')}
                                className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                data-testid="button-open-workitem"
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Apri Work Item
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const instructions = `
📋 ISTRUZIONI BOOKMARKLET DevOps

1. Copia questo codice:
javascript:(function(){'use strict';function showNotification(message,isError){var existing=document.getElementById('devops-extractor-notification');if(existing)existing.remove();var div=document.createElement('div');div.id='devops-extractor-notification';div.style.cssText='position:fixed;top:20px;right:20px;padding:16px 24px;border-radius:8px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;'+(isError?'background:%23fee2e2;color:%23991b1b;border:1px solid %23fecaca;':'background:%23d1fae5;color:%23065f46;border:1px solid %23a7f3d0;');div.textContent=message;document.body.appendChild(div);setTimeout(function(){div.style.opacity='0';setTimeout(function(){div.remove();},300);},3000);}function getTextContent(selector){var el=document.querySelector(selector);return el?el.textContent.trim():null;}function extractWorkItemData(){var data={extractedAt:new Date().toISOString(),source:'bookmarklet',url:window.location.href};var idMatch=window.location.href.match(/_workitems\\/edit\\/(\\d+)/);if(idMatch){data.workItemId=parseInt(idMatch[1],10);}else{var idEl=document.querySelector('.work-item-form-id,.workitem-info-bar-id .id');if(idEl)data.workItemId=parseInt(idEl.textContent.replace('%23',''),10);}var typeEl=document.querySelector('.work-item-type-icon-control,.work-item-type-name,[aria-label*="Work item type"]');if(typeEl){data.workItemType=typeEl.getAttribute('aria-label')||typeEl.title||typeEl.textContent.trim();}var titleEl=document.querySelector('.work-item-form-title input,%23witc_1_txt,[aria-label="Title"]');if(titleEl){data.title=titleEl.value||titleEl.textContent.trim();}else{var titleContainer=document.querySelector('.work-item-form-title');if(titleContainer)data.title=titleContainer.textContent.trim();}var stateEl=document.querySelector('.work-item-state-dropdown,[aria-label="State"]');if(stateEl){data.state=stateEl.textContent.trim()||stateEl.value;}var assignedEl=document.querySelector('[aria-label="Assigned To"] .identity-picker-resolved-name,.workitem-identity-persona-name,.identity-picker-display-name');if(assignedEl){data.assignedTo=assignedEl.textContent.trim();}var descEl=document.querySelector('.wit-html-field-content,[data-field-name="Description"] .richeditor-container,.work-item-html-field');if(descEl){data.description=descEl.innerHTML;data.descriptionText=descEl.textContent.trim();}var urlMatch=window.location.href.match(/dev\\.azure\\.com\\/([^\\/]+)\\/([^\\/]+)/);if(urlMatch){data.organization=urlMatch[1];data.project=urlMatch[2];}return data;}try{var data=extractWorkItemData();if(!data.workItemId){showNotification('Impossibile trovare Work Item ID.',true);return;}var json=JSON.stringify(data,null,2);navigator.clipboard.writeText(json).then(function(){showNotification('✓ Work Item %23'+data.workItemId+' copiato!',false);}).catch(function(){var textarea=document.createElement('textarea');textarea.value=json;textarea.style.cssText='position:fixed;left:-9999px;';document.body.appendChild(textarea);textarea.select();document.execCommand('copy');textarea.remove();showNotification('✓ Work Item %23'+data.workItemId+' copiato!',false);});}catch(err){showNotification('Errore: '+err.message,true);}})();

2. Crea un nuovo segnalibro nel browser
3. Incolla il codice nel campo URL
4. Vai sulla pagina del Work Item in Azure DevOps
5. Clicca sul segnalibro per copiare i dati
6. Incolla qui per arricchire il messaggio
                                `.trim();
                                navigator.clipboard.writeText(instructions);
                                toast({
                                  title: "Istruzioni copiate!",
                                  description: "Le istruzioni per il bookmarklet sono state copiate negli appunti."
                                });
                              }}
                              className="text-blue-600 border-blue-300 hover:bg-blue-50"
                              data-testid="button-copy-bookmarklet"
                            >
                              <Clipboard className="h-4 w-4 mr-1" />
                              Istruzioni
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const clipboardText = await navigator.clipboard.readText();
                                  if (!clipboardText.trim()) {
                                    toast({
                                      title: "Appunti vuoti",
                                      description: "Non ci sono dati negli appunti. Usa prima il bookmarklet sulla pagina Azure DevOps.",
                                      variant: "destructive"
                                    });
                                    return;
                                  }
                                  const data = JSON.parse(clipboardText);
                                  if (!data.workItemId) {
                                    toast({
                                      title: "Formato non valido",
                                      description: "I dati negli appunti non contengono un Work Item ID valido.",
                                      variant: "destructive"
                                    });
                                    return;
                                  }
                                  const enrichData = {
                                    ...externalMeta,
                                    workItemId: data.workItemId,
                                    workItemTitle: data.title || externalMeta.workItemTitle,
                                    workItemType: data.workItemType || externalMeta.workItemType,
                                    workItemUrl: data.url || externalMeta.workItemUrl,
                                    workItemState: data.state,
                                    workItemAssignedTo: data.assignedTo,
                                    workItemDescription: data.descriptionText,
                                    workItemOrganization: data.organization,
                                    workItemProject: data.project,
                                    enrichedAt: new Date().toISOString(),
                                    enrichedFrom: 'bookmarklet'
                                  };
                                  enrichDevOpsMutation.mutate({
                                    messageId: selectedMessage.id,
                                    enrichData
                                  });
                                } catch (err: any) {
                                  if (err.name === 'NotAllowedError') {
                                    toast({
                                      title: "Permesso negato",
                                      description: "Il browser ha negato l'accesso agli appunti. Riprova cliccando direttamente sul pulsante.",
                                      variant: "destructive"
                                    });
                                  } else {
                                    toast({
                                      title: "Errore parsing",
                                      description: "I dati negli appunti non sono in formato JSON valido. Usa il bookmarklet sulla pagina Azure DevOps.",
                                      variant: "destructive"
                                    });
                                  }
                                }
                              }}
                              disabled={enrichDevOpsMutation.isPending}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              data-testid="button-paste-workitem"
                            >
                              <Clipboard className="h-4 w-4 mr-1" />
                              {enrichDevOpsMutation.isPending ? 'Salvataggio...' : 'Incolla dati'}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Dettagli arricchiti */}
                        {externalMeta.enrichedAt && (
                          <div className="mt-3 pt-3 border-t border-blue-200 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-blue-600">
                              <CheckCircle className="h-3 w-3" />
                              Arricchito il {new Date(externalMeta.enrichedAt).toLocaleString('it-IT')}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {externalMeta.workItemOrganization && (
                                <div>
                                  <span className="text-muted-foreground">Organizzazione:</span>{' '}
                                  <span className="font-medium">{externalMeta.workItemOrganization}</span>
                                </div>
                              )}
                              {externalMeta.workItemProject && (
                                <div>
                                  <span className="text-muted-foreground">Progetto:</span>{' '}
                                  <span className="font-medium">{externalMeta.workItemProject}</span>
                                </div>
                              )}
                            </div>
                            {externalMeta.workItemDescription && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Descrizione:</span>
                                <p className="mt-1 text-xs bg-white/50 rounded p-2 max-h-20 overflow-y-auto">
                                  {externalMeta.workItemDescription.substring(0, 300)}
                                  {externalMeta.workItemDescription.length > 300 && '...'}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Training Mode Controls */}
                {selectedMessage && (
                  <div className="border-t border-b bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Button
                          onClick={() => setIsTrainingMode(!isTrainingMode)}
                          variant={isTrainingMode ? "default" : "outline"}
                          size="sm"
                          data-testid="button-training-mode"
                        >
                          <Brain className="h-4 w-4 mr-2" />
                          {isTrainingMode ? 'Esci da training' : 'Modalità training'}
                        </Button>

                        <Button
                          onClick={() => selectedMessage && reprocessMutation.mutate(selectedMessage.id)}
                          variant="outline"
                          size="sm"
                          disabled={reprocessMutation.isPending || !selectedMessage}
                          data-testid="button-reprocess-message"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {reprocessMutation.isPending ? 'Riprocessando...' : 'Riprocessa email'}
                        </Button>
                        
                        {isTrainingMode && (
                          <>
                            <div className="h-4 border-l border-border" />
                            <div className="text-sm text-muted-foreground">Seleziona parti da:</div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => setSelectionMode('body')}
                                variant={selectionMode === 'body' ? "default" : "outline"}
                                size="sm"
                                className={selectionMode === 'body' ? "bg-green-600 hover:bg-green-700" : ""}
                                data-testid="button-select-body"
                              >
                                Mantenere (Body)
                              </Button>
                              <Button
                                onClick={() => setSelectionMode('header')}
                                variant={selectionMode === 'header' ? "default" : "outline"}
                                size="sm"
                                className={selectionMode === 'header' ? "bg-red-600 hover:bg-red-700" : ""}
                                data-testid="button-select-header"
                              >
                                Eliminare (Header)
                              </Button>
                              <Button
                                onClick={() => {
                                  console.log('[THREAD-MODE] Switching to thread mode! Current mode:', selectionMode);
                                  setSelectionMode('thread');
                                  console.log('[THREAD-MODE] Selection mode now set to: thread');
                                }}
                                variant={selectionMode === 'thread' ? "default" : "outline"}
                                size="sm"
                                className={selectionMode === 'thread' ? "bg-yellow-600 hover:bg-yellow-700" : ""}
                                data-testid="button-select-thread"
                              >
                                Compattare (Thread)
                              </Button>
                              <Button
                                onClick={() => setSelectionMode('signatureBody')}
                                variant={selectionMode === 'signatureBody' ? "default" : "outline"}
                                size="sm"
                                className={selectionMode === 'signatureBody' ? "bg-blue-600 hover:bg-blue-700" : ""}
                                data-testid="button-select-signature-body"
                              >
                                Conservare (Firma Body)
                              </Button>
                              <Button
                                onClick={() => setSelectionMode('signatureHeader')}
                                variant={selectionMode === 'signatureHeader' ? "default" : "outline"}
                                size="sm"
                                className={selectionMode === 'signatureHeader' ? "bg-purple-600 hover:bg-purple-700" : ""}
                                data-testid="button-select-signature-header"
                              >
                                Eliminare (Firma Header)
                              </Button>
                              <Button
                                onClick={() => setSelectionMode('mailThread')}
                                variant={selectionMode === 'mailThread' ? "default" : "outline"}
                                size="sm"
                                className={selectionMode === 'mailThread' ? "bg-orange-600 hover:bg-orange-700" : ""}
                                data-testid="button-select-mail-thread"
                              >
                                Compattare (Mail Thread)
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {isTrainingMode && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              if (selectedMessage) {
                                // ✅ MODULAR: Simple array clear
                                setSelections(prev => ({
                                  ...prev,
                                  [selectedMessage.id]: []
                                }));
                              }
                            }}
                            variant="outline"
                            size="sm"
                            data-testid="button-clear-selections"
                          >
                            Cancella selezioni
                          </Button>
                          <Button
                            onClick={async () => {
                              console.log('[TRAINING-SAVE] Save button clicked!');
                              if (selectedMessage) {
                                console.log('[TRAINING-SAVE] Selected message:', selectedMessage.id);
                                const messageSelections = selections[selectedMessage.id];
                                console.log('[TRAINING-SAVE] Message selections:', messageSelections);
                                
                                if (messageSelections && messageSelections.length > 0) {
                                  try {
                                    console.log('[TRAINING-SAVE] Saving', messageSelections.length, 'individual selections');
                                    
                                    // ✅ MODULAR: Save individual selections to modular API
                                    const results = await Promise.allSettled(
                                      messageSelections.map(selection => 
                                        apiRequest("POST", "/api/email-training-selections", {
                                          messageId: selectedMessage.id,
                                          selectionType: selection.selectionType,
                                          selectedText: selection.selectedText,
                                          sourceMessageId: selection.sourceMessageId
                                        })
                                      )
                                    );
                                    
                                    const successful = results.filter(r => r.status === 'fulfilled').length;
                                    const failed = results.length - successful;
                                    
                                    if (successful > 0) {
                                      toast({ 
                                        title: "Selezioni salvate", 
                                        description: `${successful} selezioni salvate${failed > 0 ? ` (${failed} fallite)` : ''}`
                                      });
                                      
                                      // ✅ MODULAR: Simple clear
                                      setSelections(prev => ({
                                        ...prev,
                                        [selectedMessage.id]: []
                                      }));
                                    } else {
                                      throw new Error('All selections failed to save');
                                    }
                                  } catch (error) {
                                    console.error('Error saving selections:', error);
                                    toast({ 
                                      title: "Errore salvataggio", 
                                      description: "Non è stato possibile salvare le selezioni" 
                                    });
                                  }
                                } else {
                                  toast({ 
                                    title: "Nessuna selezione", 
                                    description: "Seleziona del testo prima di salvare" 
                                  });
                                }
                              }
                            }}
                            variant="default"
                            size="sm"
                            data-testid="button-save-selections"
                          >
                            Salva selezioni
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {isTrainingMode && (
                      <>
                        <div className="mt-3 text-xs text-muted-foreground">
                          💡 Seleziona il testo nell'email per classificarlo. Verde = contenuto da mantenere, Rosso = header da rimuovere, Giallo = thread da compattare.
                        </div>
                        
                        {/* Current selections panel */}
                        {selectedMessage && selections[selectedMessage.id] && (
                          (() => {
                            // ✅ MODULAR: Check if array has any selections instead of checking old structure
                            const messageSelections = selections[selectedMessage.id] || [];
                            return messageSelections.length > 0;
                          })()
                        ) && (
                          <div className="mt-4 p-3 bg-background rounded-lg border" data-testid="panel-current-selections">
                            <div className="text-sm font-medium mb-3">Selezioni correnti:</div>
                            {/* ✅ MODULAR: Unified grouped rendering replaces all duplicated sections */}
                            <div className="space-y-3">
                              {(() => {
                                const messageSelections = selectedMessage ? selections[selectedMessage.id] || [] : [];
                                const groupedSelections = groupSelectionsByType(messageSelections);
                                
                                return Object.entries(groupedSelections).map(([selectionType, typeSelections]) => {
                                  const config = selectionTypeConfig[selectionType as keyof typeof selectionTypeConfig];
                                  if (!config) return null;
                                  
                                  return (
                                    <div key={selectionType} data-testid={`section-${selectionType}-selections`}>
                                      <div className="flex items-center justify-between mb-2">
                                        <div className={`text-xs font-medium ${config.textColor}`}>
                                          {config.label} - {typeSelections.length} items:
                                        </div>
                                        <Button
                                          onClick={() => setSelections(prev => ({
                                            ...prev,
                                            [selectedMessage!.id]: prev[selectedMessage!.id]?.filter(s => s.selectionType !== selectionType) || []
                                          }))}
                                          variant="outline"
                                          size="sm"
                                          className={`h-6 px-2 text-xs ${config.textColor} ${config.borderColor} hover:${config.bgColor}`}
                                          data-testid={`button-clear-${selectionType}-selections`}
                                        >
                                          Clear {config.label.split(' ')[0]}
                                        </Button>
                                      </div>
                                      <div className="space-y-1">
                                        {typeSelections.map((selection, index) => (
                                          <div 
                                            key={index} 
                                            className={`text-xs ${config.bgColor} ${config.borderColor} border rounded px-2 py-1 flex justify-between items-start`}
                                            data-testid={`item-${selectionType}-selection-${index}`}
                                          >
                                            <div className="truncate min-w-0 flex-1">
                                              <span className="truncate">
                                                {selection.selectedText.length > 80 ? selection.selectedText.substring(0, 80) + '...' : selection.selectedText}
                                              </span>
                                              {selection.sourceMessageId && (
                                                <div className={`text-xs ${config.textColor} mt-1 font-mono opacity-70`}>
                                                  Source: {selection.sourceMessageId.substring(0, 8)}...
                                                </div>
                                              )}
                                            </div>
                                            <Button
                                              onClick={() => setSelections(prev => ({
                                                ...prev,
                                                [selectedMessage!.id]: prev[selectedMessage!.id]?.filter((_, i) => {
                                                  const sameTypeSelections = prev[selectedMessage!.id]?.filter(s => s.selectionType === selectionType) || [];
                                                  return !(sameTypeSelections[index] === selection);
                                                }) || []
                                              }))}
                                              variant="ghost"
                                              size="sm"
                                              className={`h-auto p-1 ml-2 ${config.textColor} hover:opacity-80 flex-shrink-0`}
                                              data-testid={`button-remove-${selectionType}-selection-${index}`}
                                            >
                                              ×
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Message Body - occupa tutto lo spazio rimanente */}
                <div className="border-t">
                  <div className="h-[48rem] p-6 overflow-y-auto space-y-4">
                    {/* 🔍 DEBUG: Log rendering decision */}
                    {(() => {
                      console.log(`[RENDER-DEBUG] Rendering decision:`, {
                        isTrainingMode,
                        hasRenderedContent: !!renderedContent,
                        renderedContentBodyHtmlLength: renderedContent?.bodyHtml?.length || 0,
                        selectedMessageHtmlBodyLength: selectedMessage?.htmlBody?.length || 0
                      });
                      return null;
                    })()}
                    {isTrainingMode ? (
                      <div className="space-y-4">
                        <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                          🎯 <strong>Modalità Training</strong> - Stai visualizzando l'HTML originale completo del messaggio. Seleziona il testo per addestrare l'algoritmo.
                        </div>
                        <div 
                          className="training-selection-area select-text cursor-pointer border border-dashed border-blue-300 rounded" 
                          data-selection-mode={selectionMode} 
                          onMouseUp={handleTextSelection} 
                          data-testid="email-content-training"
                        >
                          {selectedMessage?.htmlBody ? (
                            <div 
                              className="prose prose-sm max-w-none p-4" 
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedMessage.htmlBody, { 
                                ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody'], 
                                ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'width', 'height'],
                                FORBID_TAGS: ['a', 'form', 'input', 'button', 'script', 'style'],
                                FORBID_ATTR: ['onclick', 'onload', 'onerror', 'href', 'action']
                              }) }} 
                            />
                          ) : (
                            <div className="whitespace-pre-wrap text-sm p-4">{selectedMessage?.body || 'Nessun contenuto'}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      renderedContent ? (
                        <>
                          {/* Parsing failure warning - MUST be shown before messages check */}
                          {renderedContent.metadata?.parsingFailed && (
                            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4" data-testid="warning-parsing-failed">
                              <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                                <div className="flex-1">
                                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">Formato non riconosciuto</h4>
                                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                    Il contenuto incollato non corrisponde al formato atteso per {renderedContent.metadata.platform || 'questa piattaforma'}. 
                                    Il testo originale è visualizzato sotto. Assicurati di copiare solo la conversazione senza menu o elementi dell'interfaccia.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Structured chat rendering if metadata exists */}
                          {renderedContent.metadata?.messages && renderedContent.metadata.messages.length > 0 ? (
                            <div className="space-y-4" data-testid="chat-structured-view">
                              {/* Platform badge and summary */}
                              <div className="flex items-center justify-between mb-2">
                                {renderedContent.metadata.platform && (
                                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                                    <MessageSquare className="h-4 w-4" />
                                    {renderedContent.metadata.platform.charAt(0).toUpperCase() + renderedContent.metadata.platform.slice(1)}
                                  </div>
                                )}
                                {renderedContent.metadata.summary && (
                                  <span className="text-sm text-muted-foreground">{renderedContent.metadata.summary}</span>
                                )}
                              </div>
                              
                              {/* Participants */}
                              {renderedContent.metadata.participants && renderedContent.metadata.participants.length > 0 && (
                                <div className="bg-muted/30 rounded-lg p-3 mb-4">
                                  <div className="text-sm font-medium mb-2">Partecipanti ({renderedContent.metadata.participants.length})</div>
                                  <div className="flex flex-wrap gap-2">
                                    {renderedContent.metadata.participants.map(p => (
                                      <span key={p.id} className="inline-flex items-center px-2 py-1 bg-background rounded text-xs" data-testid={`participant-${p.id}`}>
                                        {p.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Messages - Grouped View */}
                              <div className="space-y-4">
                                {(() => {
                                  const messages = renderedContent.metadata.messages;
                                  const groups: Array<{
                                    type: 'date' | 'messages';
                                    date?: string;
                                    senderId?: string;
                                    senderName?: string;
                                    timestamp?: string;
                                    messages?: Array<{id: string; text: string}>;
                                  }> = [];
                                  
                                  let currentDate = '';
                                  let currentGroup: typeof groups[0] | null = null;
                                  
                                  messages.forEach((msg, idx) => {
                                    // Check if message text looks like a date separator (e.g., "24 September", "25 September")
                                    const dateMatch = msg.text.match(/^\d{1,2}\s+\w+$/);
                                    const isDateSeparator = dateMatch !== null;
                                    
                                    if (isDateSeparator) {
                                      currentDate = msg.text;
                                      groups.push({ type: 'date', date: msg.text });
                                      currentGroup = null;
                                      return;
                                    }
                                    
                                    // Group messages by sender and timestamp (complete HH:MM)
                                    const canGroup = currentGroup && 
                                                    currentGroup.type === 'messages' &&
                                                    currentGroup.senderId === msg.senderId &&
                                                    currentGroup.timestamp === msg.timestamp;
                                    
                                    if (canGroup && currentGroup.type === 'messages' && currentGroup.messages) {
                                      // Add to existing group
                                      currentGroup.messages.push({ id: msg.id, text: msg.text });
                                    } else {
                                      // Create new group
                                      currentGroup = {
                                        type: 'messages',
                                        senderId: msg.senderId,
                                        senderName: msg.senderName,
                                        timestamp: msg.timestamp,
                                        messages: [{ id: msg.id, text: msg.text }]
                                      };
                                      groups.push(currentGroup);
                                    }
                                  });
                                  
                                  return groups.map((group, groupIdx) => {
                                    if (group.type === 'date') {
                                      return (
                                        <div key={`date-${groupIdx}`} className="flex items-center justify-center py-3">
                                          <div className="bg-blue-500 dark:bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                                            {group.date}
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    return (
                                      <div key={`group-${groupIdx}`} className="border-2 border-gray-300 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900" data-testid={`chat-group-${groupIdx}`}>
                                        {/* Header: Name, Time, ID */}
                                        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                                          <span className="font-bold text-base text-blue-600 dark:text-blue-400">{group.senderName}</span>
                                          {group.timestamp && (
                                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs font-mono">
                                              {group.timestamp}
                                            </span>
                                          )}
                                          <span className="text-xs text-muted-foreground font-mono">
                                            {group.messages && group.messages.length > 1 ? `${group.messages.length} msgs` : group.messages?.[0].id}
                                          </span>
                                        </div>
                                        
                                        {/* Messages in group */}
                                        <div className="space-y-1">
                                          {group.messages?.map((msg, msgIdx) => (
                                            <div key={msg.id} className="text-sm whitespace-pre-wrap leading-snug bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
                                              {msg.text === 'immagine' ? (
                                                <div className="inline-flex items-center gap-1 text-muted-foreground italic">
                                                  <Image className="h-4 w-4" />
                                                  <span className="text-xs">immagine non disponibile</span>
                                                </div>
                                              ) : (
                                                msg.text
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          ) : (
                            renderedContent.bodyHtml ? (
                              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderedContent.bodyHtml }} data-testid="email-content-main" />
                            ) : (
                              <div className="whitespace-pre-wrap text-sm" data-testid="email-content-main">{renderedContent.bodyText || 'Nessun contenuto'}</div>
                            )
                          )}
                          {(renderedContent.remainderText || renderedContent.remainderHtml) && (
                            <div className="border-t pt-4">
                              <Button variant="ghost" size="sm" onClick={() => {
                                console.log('[THREAD-TOGGLE] Button clicked! Current state:', showThreadContent);
                                setShowThreadContent(!showThreadContent);
                                console.log('[THREAD-TOGGLE] New state will be:', !showThreadContent);
                              }} className="flex items-center gap-2 mb-2" data-testid="button-toggle-thread">
                                {showThreadContent ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {showThreadContent ? 'Nascondi thread precedente' : 'Mostra thread precedente'}
                              </Button>
                              {showThreadContent && (
                                <div className="bg-muted/30 rounded-lg p-4" data-testid="div-thread-content">
                                  {renderedContent.remainderHtml ? (
                                    <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: renderedContent.remainderHtml }} data-testid="email-content-thread" />
                                  ) : (
                                    <div className="whitespace-pre-wrap text-sm text-muted-foreground" data-testid="email-content-thread">{renderedContent.remainderText}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        selectedMessage?.htmlBody ? (
                          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedMessage.htmlBody }} />
                        ) : (
                          <div className="whitespace-pre-wrap text-sm">{selectedMessage?.body || 'Nessun contenuto'}</div>
                        )
                      )
                    )}
                  </div>
                </div>

                {/* Pannello Feedback */}
                <div className="border-t bg-muted/10">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <h4 className="font-medium text-sm">Feedback sulla pulizia email</h4>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRawContent(!showRawContent)}
                          className="flex items-center gap-2"
                          data-testid="button-toggle-raw"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {showRawContent ? 'Nascondi' : 'Mostra'} versione raw
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">La pulizia è corretta?</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => feedbackMutation.mutate({ 
                          messageId: selectedMessage!.id, 
                          isCorrect: true 
                        })}
                        className="flex items-center gap-2"
                        data-testid="button-feedback-correct"
                        disabled={feedbackMutation.isPending}
                      >
                        <ThumbsUp className="h-3 w-3" />
                        Corretto
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFeedbackPanel(!showFeedbackPanel)}
                        className="flex items-center gap-2"
                        data-testid="button-feedback-incorrect"
                        disabled={feedbackMutation.isPending}
                      >
                        <ThumbsDown className="h-3 w-3" />
                        Sbagliato
                      </Button>
                    </div>

                    {/* Pannello dettagli feedback per errori */}
                    {showFeedbackPanel && (
                      <div className="mt-4 p-4 border rounded-lg bg-background">
                        <h5 className="font-medium mb-3">Che tipo di errore hai notato?</h5>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          {/* Motivi predefiniti */}
                          {[
                            { id: 'missing-content', label: 'Contenuto mancante', icon: AlertTriangle },
                            { id: 'wrong-order', label: 'Ordine sbagliato', icon: ArrowUpDown },
                            { id: 'mixed-threads', label: 'Thread mixati', icon: MessageSquare },
                            { id: 'extra-content', label: 'Contenuto extra', icon: Plus },
                            { id: 'signature-issues', label: 'Problemi firma', icon: User },
                            { id: 'thread-not-collapsed', label: 'Thread non imploso', icon: ChevronDown },
                            { id: 'thread-badly-collapsed', label: 'Thread non imploso correttamente', icon: ChevronUp }
                          ].map(({ id, label, icon: Icon }) => (
                            <Button
                              key={id}
                              variant={feedbackCategory === id ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFeedbackCategory(id)}
                              className="flex items-center gap-2 justify-start"
                              data-testid={`button-category-${id}`}
                            >
                              <Icon className="h-3 w-3" />
                              {label}
                            </Button>
                          ))}
                          
                          {/* Motivi personalizzati salvati */}
                          {customFeedbackReasons.map((reason) => (
                            <Button
                              key={`custom-${reason.id}`}
                              variant={feedbackCategory === `custom-${reason.id}` ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFeedbackCategory(`custom-${reason.id}`)}
                              className="flex items-center gap-2 justify-start"
                              data-testid={`button-custom-reason-${reason.id}`}
                              title={`Usato ${reason.usageCount} volta/e`}
                            >
                              <AlertCircle className="h-3 w-3" />
                              <span className="truncate">{reason.reason}</span>
                              <span className="ml-auto text-xs text-muted-foreground">({reason.usageCount})</span>
                            </Button>
                          ))}
                          
                          {/* Pulsante "Altro" per nuovi motivi personalizzati */}
                          <Button
                            key="other"
                            variant={feedbackCategory === 'other' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFeedbackCategory('other')}
                            className="flex items-center gap-2 justify-start"
                            data-testid="button-category-other"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Altro
                          </Button>
                        </div>
                        
                        {/* Campo di input per motivo personalizzato quando si seleziona "Altro" */}
                        {feedbackCategory === 'other' && (
                          <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">
                              Descrivi il problema che hai notato:
                            </label>
                            <input
                              type="text"
                              value={customFeedbackReason}
                              onChange={(e) => setCustomFeedbackReason(e.target.value)}
                              placeholder="es. Thread duplicati, sequenza temporale confusa, ecc..."
                              className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                              data-testid="input-custom-feedback-reason"
                            />
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              let category = feedbackCategory || 'unspecified';
                              let comment = undefined;
                              let customReasonId = undefined;
                              
                              if (feedbackCategory === 'other') {
                                // Nuovo motivo personalizzato
                                category = 'other';
                                comment = customFeedbackReason;
                              } else if (feedbackCategory?.startsWith('custom-')) {
                                // Motivo personalizzato esistente selezionato
                                const reasonId = feedbackCategory.replace('custom-', '');
                                const selectedReason = customFeedbackReasons.find(r => r.id === reasonId);
                                if (selectedReason) {
                                  category = 'other';
                                  comment = selectedReason.reason;
                                  customReasonId = selectedReason.id;
                                }
                              }
                              
                              feedbackMutation.mutate({ 
                                messageId: selectedMessage!.id, 
                                isCorrect: false,
                                category,
                                comment,
                                customReasonId
                              });
                            }}
                            size="sm"
                            disabled={feedbackMutation.isPending || !feedbackCategory || (feedbackCategory === 'other' && !customFeedbackReason.trim())}
                            data-testid="button-send-feedback"
                          >
                            Invia feedback
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowFeedbackPanel(false);
                              setFeedbackCategory(null);
                              setCustomFeedbackReason("");
                            }}
                            data-testid="button-cancel-feedback"
                          >
                            Annulla
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Mostra contenuto raw se richiesto */}
                    {showRawContent && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                        <h5 className="font-medium mb-3 flex items-center gap-2">
                          <RotateCcw className="h-4 w-4" />
                          Contenuto originale (raw)
                        </h5>
                        <div className="bg-background p-3 rounded border">
                          {selectedMessage!.htmlBody ? (
                            <div 
                              className="prose prose-sm max-w-none text-xs"
                              dangerouslySetInnerHTML={{ __html: selectedMessage!.htmlBody }}
                            />
                          ) : (
                            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                              {selectedMessage!.body || 'Nessun contenuto raw disponibile'}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Attachments Section */}
                {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (() => {
                  // Deduplicazione degli allegati - raggruppa per nome file originale (senza messageId prefix)
                  const uniqueAttachments = selectedMessage.attachments.reduce((acc: { originalFilename: string; fullFilename: string; count: number }[], fullFilename: string) => {
                    // Estrai il filename originale rimuovendo il prefisso messageId_
                    const originalFilename = fullFilename.replace(/^[^_]+_/, '');
                    const existing = acc.find(item => item.originalFilename === originalFilename);
                    if (existing) {
                      existing.count++;
                    } else {
                      acc.push({ originalFilename, fullFilename, count: 1 });
                    }
                    return acc;
                  }, []);

                  return (
                    <div className="flex-shrink-0 border-t bg-muted/30">
                      <div className="p-6 space-y-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <h4 className="font-medium">
                            Allegati ({uniqueAttachments.length} unici, {selectedMessage.attachments.length} totali)
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {uniqueAttachments.map((attachmentInfo, index) => {
                            const fileInfo = getFileType(attachmentInfo.originalFilename);
                            const displayFilename = attachmentInfo.originalFilename;
                            const fullFilename = attachmentInfo.fullFilename;
                            
                            return (
                              <div 
                                key={index}
                                className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {/* Anteprima immagine o icona file */}
                                  <div className="text-center flex-shrink-0">
                                    {fileInfo.isImage ? (
                                      <div className="w-12 h-12 border rounded overflow-hidden bg-gray-100">
                                        <img 
                                          src={`/api/messages/${selectedMessage.id}/attachments/${encodeURIComponent(fullFilename)}`}
                                          alt={displayFilename}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            // Fallback all'icona se l'immagine non si carica
                                            e.currentTarget.style.display = 'none';
                                            (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'block';
                                          }}
                                        />
                                        <div className="text-lg hidden">{fileInfo.icon}</div>
                                      </div>
                                    ) : (
                                      <div className="text-lg">{fileInfo.icon}</div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div 
                                      className="text-sm font-medium truncate"
                                      title={displayFilename}
                                    >
                                      {displayFilename}
                                      {attachmentInfo.count > 1 && (
                                        <Badge variant="secondary" className="ml-2 text-xs">
                                          ×{attachmentInfo.count}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{fileInfo.type}</div>
                                  </div>
                                </div>
                                <Button
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = `/api/messages/${selectedMessage.id}/attachments/${encodeURIComponent(fullFilename)}`;
                                    link.download = displayFilename;
                                    link.click();
                                  }}
                                  data-testid={`download-attachment-${index}`}
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Scarica
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
            </Panel>
          </PanelGroup>
        </main>
      </div>
    </div>

  {/* Floating Action Button for new message */}
  <Button
    onClick={() => setShowNewMessageDialog(true)}
    className="fixed bottom-8 right-8 h-16 w-16 rounded-full shadow-lg z-50"
    size="icon"
    data-testid="button-add-message"
  >
    <Plus className="h-8 w-8" />
  </Button>

  {/* Create Message Dialog */}
  <Dialog open={showNewMessageDialog} onOpenChange={setShowNewMessageDialog}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {filterType === "email" || filterType === "all" ? "Nuovo Messaggio Email" : "Aggiungi Chat"}
        </DialogTitle>
      </DialogHeader>
      {(filterType === "chat" || filterType === "sms" || filterType === "other") ? (
        <SimpleChatForm 
          key={filterType}
          onSuccess={() => setShowNewMessageDialog(false)}
          defaultType={filterType}
        />
      ) : (
        <MessageForm 
          key={filterType} 
          onSuccess={() => setShowNewMessageDialog(false)}
          defaultValues={{
            type: filterType === "all" || filterType === "devops" ? "email" : filterType
          }}
        />
      )}
    </DialogContent>
  </Dialog>

  {/* AI Project Proposal Dialog */}
  <ProjectProposalDialog
    open={showProposalDialog}
    onOpenChange={setShowProposalDialog}
    proposal={currentProposal}
    onApply={async (editedProposal) => {
      if (selectedMessage) {
        await applyProposalMutation.mutateAsync({
          messageId: selectedMessage.id,
          proposal: editedProposal
        });
      }
    }}
    isApplying={applyProposalMutation.isPending}
  />
  </>
);
}