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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ExternalLink,
  Smartphone
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { BarChart3, TrendingUp, Database, Image, Inbox } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const [filterType, setFilterType] = useState<"all" | "email" | "chat" | "sms" | "other" | "devops" | "calendar">("all");
  
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
    type: 4, // percentuale - stessa spaziatura del checkbox
    fromEmail: 36,
    subject: 38,
    receivedAt: 19
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
      const response = await apiRequest("POST", `/api/messages/${messageId}/enrich-devops`, {
        bookmarkletData: enrichData
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

  const getTypeIcon = (type: string, sourceType?: string) => {
    // Check for DevOps
    if (sourceType === 'email_devops_workitem') {
      return <GitBranch className="h-6 w-6 text-orange-500" />;
    }
    // Check for Calendar
    if (sourceType === 'email_calendar_event') {
      return <Calendar className="h-6 w-6 text-purple-500" />;
    }
    switch (type) {
      case 'email': return <Mail className="h-6 w-6 text-blue-500" />;
      case 'chat': return <MessageSquare className="h-6 w-6 text-green-500" />;
      case 'sms': return <Smartphone className="h-6 w-6 text-yellow-500" />;
      case 'other': return <FileText className="h-6 w-6 text-gray-500" />;
      default: return <Inbox className="h-6 w-6 text-slate-600" />;
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
    const devopsCount = messages.filter(m => (m as any).sourceType === 'email_devops_workitem').length;
    const calendarCount = messages.filter(m => (m as any).sourceType === 'email_calendar_event').length;
    const pureEmailCount = messages.filter(m => 
      m.type === 'email' && 
      (m as any).sourceType !== 'email_devops_workitem' && 
      (m as any).sourceType !== 'email_calendar_event'
    ).length;
    const counts = {
      all: messages.length,
      email: pureEmailCount,
      chat: messages.filter(m => m.type === 'chat').length,
      sms: messages.filter(m => m.type === 'sms').length,
      other: messages.filter(m => m.type === 'other').length,
      devops: devopsCount,
      calendar: calendarCount,
    };
    return counts;
  }, [messages]);

  // Calculate unread counts by type
  const unreadCounts = React.useMemo(() => {
    const unreadMessages = messages.filter(m => m.status === 'unread');
    const pureEmailUnread = unreadMessages.filter(m => 
      m.type === 'email' && 
      (m as any).sourceType !== 'email_devops_workitem' && 
      (m as any).sourceType !== 'email_calendar_event'
    ).length;
    const counts = {
      all: unreadMessages.length,
      email: pureEmailUnread,
      chat: unreadMessages.filter(m => m.type === 'chat').length,
      sms: unreadMessages.filter(m => m.type === 'sms').length,
      other: unreadMessages.filter(m => m.type === 'other').length,
      devops: unreadMessages.filter(m => (m as any).sourceType === 'email_devops_workitem').length,
      calendar: unreadMessages.filter(m => (m as any).sourceType === 'email_calendar_event').length,
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
      } else if (filterType === "calendar") {
        // Calendar tab: filter by sourceType
        if ((message as any).sourceType !== 'email_calendar_event') return false;
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
        
        <main className="p-6">
          <PanelGroup direction="horizontal" className="h-[calc(100vh-120px)]">
            <Panel defaultSize={40} minSize={25} maxSize={60}>
              {/* Message List */}
              <Card className="h-full flex flex-col">
              <CardHeader>
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
                {/* Filter tabs by message type - Icon buttons with badges */}
                <TooltipProvider delayDuration={300}>
                <Tabs value={filterType} onValueChange={(value) => setFilterType(value as typeof filterType)} className="w-full">
                  <TabsList className="flex justify-start gap-2 h-auto p-2 bg-transparent rounded-xl">
                    {/* Action Buttons Box */}
                    <div className="flex gap-2 p-2 bg-slate-100/80 dark:bg-slate-800/80 rounded-lg">
                      {/* Sync Button - First */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => syncMutation.mutate()}
                            disabled={syncMutation.isPending}
                            variant="outline"
                            className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-green-200 dark:border-green-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                            data-testid="button-sync-emails"
                          >
                            <RefreshCw className={`h-6 w-6 text-green-600 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-green-600 text-white">
                          <p>Sincronizza Email</p>
                        </TooltipContent>
                      </Tooltip>
                      
                      {/* THU AI Button - Header style with opacity */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => {
                              const messagesToAnalyze = selectedMessageIds.length > 0 
                                ? selectedMessageIds 
                                : (selectedMessage ? [selectedMessage.id] : []);
                              if (messagesToAnalyze.length > 0) {
                                messagesToAnalyze.forEach(id => analyzeProjectMutation.mutate(id));
                              }
                            }}
                            disabled={analyzeProjectMutation.isPending || (!selectedMessage && selectedMessageIds.length === 0)}
                            variant="ghost"
                            className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-blue-300/30 dark:border-blue-600/30 bg-sidebar-accent shadow-sm hover:shadow-md transition-all ${
                              (!selectedMessage && selectedMessageIds.length === 0) ? 'opacity-40' : 'opacity-100 hover:border-purple-400 dark:hover:border-purple-500'
                            }`}
                            data-testid="button-analyze-project"
                          >
                            <div className="relative flex flex-col items-end">
                              <div className="flex items-baseline space-x-0">
                                <span className="text-lg font-black text-blue-600 dark:text-blue-400">T</span>
                                <span className="text-2xl font-black text-blue-500 dark:text-blue-300">H</span>
                                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">U</span>
                              </div>
                              <span className="text-xs font-bold text-purple-500 dark:text-purple-400 -mt-1">AI</span>
                            </div>
                            {selectedMessageIds.length > 0 && (
                              <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {selectedMessageIds.length > 9 ? '9+' : selectedMessageIds.length}
                              </span>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-purple-500 text-white">
                          <p>{analyzeProjectMutation.isPending 
                            ? 'Analizzando...' 
                            : selectedMessageIds.length > 0 
                              ? `Analizza ${selectedMessageIds.length} messaggi con AI` 
                              : 'Analizza con AI'}</p>
                        </TooltipContent>
                      </Tooltip>
                      
                      {/* Delete Selected Button */}
                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                              <Button
                                disabled={selectedMessageIds.length === 0}
                                variant="outline"
                                className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-red-200 dark:border-red-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-red-400 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all ${
                                  selectedMessageIds.length === 0 ? 'opacity-40' : 'opacity-100'
                                }`}
                                data-testid="button-delete-selected"
                              >
                                <Trash2 className="h-6 w-6 text-red-500" />
                                {selectedMessageIds.length > 0 && (
                                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md">
                                    {selectedMessageIds.length}
                                  </span>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="bg-red-500 text-white">
                            <p>{selectedMessageIds.length > 0 
                              ? `Elimina ${selectedMessageIds.length} selezionati` 
                              : 'Seleziona messaggi da eliminare'}</p>
                          </TooltipContent>
                        </Tooltip>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare i messaggi selezionati?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Questa azione eliminerà {selectedMessageIds.length} messaggi selezionati. 
                              L'operazione non può essere annullata.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                selectedMessageIds.forEach(id => deleteMessageMutation.mutate(id));
                                setSelectedMessageIds([]);
                              }}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Elimina {selectedMessageIds.length} messaggi
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    
                    {/* Filter Tabs Box */}
                    <div className="flex gap-2 p-2 bg-blue-50/80 dark:bg-blue-900/20 rounded-lg">
                    
                    {/* All */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="all" 
                          data-testid="tab-all"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-slate-400 dark:hover:border-slate-500 transition-all data-[state=active]:bg-slate-600 data-[state=active]:text-white data-[state=active]:border-slate-600 data-[state=active]:shadow-lg"
                        >
                          <Inbox className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-slate-600 text-white rounded px-1 mt-0.5">
                            {typeCounts.all}
                          </span>
                          {unreadCounts.all > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.all}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Tutti i messaggi ({typeCounts.all})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {/* Email */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="email" 
                          data-testid="tab-email"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:border-blue-500 data-[state=active]:shadow-lg"
                        >
                          <Mail className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-blue-500 text-white rounded px-1 mt-0.5">
                            {typeCounts.email}
                          </span>
                          {unreadCounts.email > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.email}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-blue-600 text-white">
                        <p>Email ({typeCounts.email})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {/* Chat - Green */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="chat" 
                          data-testid="tab-chat"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-green-300 dark:hover:border-green-600 transition-all data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:border-green-500 data-[state=active]:shadow-lg"
                        >
                          <MessageSquare className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-green-500 text-white rounded px-1 mt-0.5">
                            {typeCounts.chat}
                          </span>
                          {unreadCounts.chat > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.chat}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-green-500 text-white">
                        <p>Chat ({typeCounts.chat})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {/* SMS - Yellow with Smartphone icon */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="sms" 
                          data-testid="tab-sms"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-yellow-400 dark:hover:border-yellow-500 transition-all data-[state=active]:bg-yellow-500 data-[state=active]:text-white data-[state=active]:border-yellow-500 data-[state=active]:shadow-lg"
                        >
                          <Smartphone className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-yellow-500 text-white rounded px-1 mt-0.5">
                            {typeCounts.sms}
                          </span>
                          {unreadCounts.sms > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.sms}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-yellow-500 text-white">
                        <p>SMS ({typeCounts.sms})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {/* DevOps */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="devops" 
                          data-testid="tab-devops"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-600 transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:border-orange-500 data-[state=active]:shadow-lg"
                        >
                          <GitBranch className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-orange-500 text-white rounded px-1 mt-0.5">
                            {typeCounts.devops}
                          </span>
                          {unreadCounts.devops > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.devops}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-orange-500 text-white">
                        <p>DevOps ({typeCounts.devops})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {/* Calendar */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="calendar" 
                          data-testid="tab-calendar"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:border-purple-500 data-[state=active]:shadow-lg"
                        >
                          <Calendar className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-purple-500 text-white rounded px-1 mt-0.5">
                            {typeCounts.calendar}
                          </span>
                          {unreadCounts.calendar > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.calendar}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-purple-500 text-white">
                        <p>Appuntamenti ({typeCounts.calendar})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    {/* Other */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger 
                          value="other" 
                          data-testid="tab-other"
                          className="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-gray-400 dark:hover:border-gray-500 transition-all data-[state=active]:bg-gray-500 data-[state=active]:text-white data-[state=active]:border-gray-500 data-[state=active]:shadow-lg"
                        >
                          <FileText className="h-5 w-5" />
                          <span className="min-w-[20px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-gray-500 text-white rounded px-1 mt-0.5">
                            {typeCounts.other}
                          </span>
                          {unreadCounts.other > 0 && (
                            <span className="absolute -top-2 -left-2 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-md animate-pulse">
                              {unreadCounts.other}
                            </span>
                          )}
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-gray-500 text-white">
                        <p>Altri ({typeCounts.other})</p>
                      </TooltipContent>
                    </Tooltip>
                    </div>
                  </TabsList>
                </Tabs>
                </TooltipProvider>
              </CardHeader>
              <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                <div className="border rounded-md">
                  <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHeader>
                      <TableRow>
                        {/* Selection Checkbox Header */}
                        <TableHead style={{ width: '3%' }} className="p-0 pl-1">
                          <Checkbox
                            checked={filteredAndSortedMessages.length > 0 && selectedMessageIds.length === filteredAndSortedMessages.length}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMessageIds(filteredAndSortedMessages.map(m => m.id));
                              } else {
                                setSelectedMessageIds([]);
                              }
                            }}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                        {filterType === 'all' && (
                          <TableHead 
                            className="p-0"
                            style={{ width: `${columnWidths.type}%` }}
                            data-testid="header-type"
                          >
                            <div className="flex items-center justify-start">
                              <Inbox className="h-5 w-5 text-slate-500" />
                            </div>
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
                                              <TableCell style={{ width: `${columnWidths.type}%` }} className="p-0">
                                                <div className="flex items-center justify-start">
                                                  {getTypeIcon(message.type, (message as any).sourceType)}
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
                              <TableCell colSpan={5} className="h-32 text-center">
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
                                } ${selectedMessageIds.includes(message.id) ? 'bg-purple-50 dark:bg-purple-900/20' : ''} ${message.status === 'unread' ? 'border-l-4 border-l-blue-500' : ''}`}
                                onClick={() => handleSelectMessage(message)}
                              >
                                {/* Colonna Checkbox */}
                                <TableCell style={{ width: '3%' }} className="p-0 pl-1">
                                  <Checkbox
                                    checked={selectedMessageIds.includes(message.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedMessageIds(prev => [...prev, message.id]);
                                      } else {
                                        setSelectedMessageIds(prev => prev.filter(id => id !== message.id));
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`checkbox-message-${message.id}`}
                                  />
                                </TableCell>
                                {/* Colonna Tipo */}
                                {filterType === 'all' && (
                                  <TableCell style={{ width: `${columnWidths.type}%` }} className="p-0">
                                    <div className="flex items-center justify-start">
                                      {getTypeIcon(message.type, (message as any).sourceType)}
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
                                    // Send fresh bookmarklet data directly - backend handles the merge
                                    ...data,
                                    // Ensure standard field mappings
                                    workItemId: data.workItemId,
                                    title: data.title,
                                    workItemType: data.workItemType,
                                    url: data.url,
                                    state: data.state,
                                    assignedTo: data.assignedTo,
                                    priority: data.priority,
                                    organization: data.organization,
                                    project: data.project,
                                    iterationPath: data.iterationPath,
                                    areaPath: data.areaPath,
                                    tags: data.tags,
                                    descriptionText: data.descriptionText,
                                    descriptionHtml: data.descriptionHtml,
                                    description: data.description || data.descriptionText,
                                    comments: data.comments,
                                    // SAP Custom Fields - explicitly include
                                    customFields: data.customFields,
                                    ticketCode: data.ticketCode,
                                    wbsCode: data.wbsCode,
                                    ticketType: data.ticketType,
                                    // Metadata
                                    source: 'bookmarklet',
                                    version: data.version || '3.2'
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
                          <div className="mt-3 pt-3 border-t border-blue-200 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-blue-600">
                                <CheckCircle className="h-3 w-3" />
                                Arricchito il {new Date(externalMeta.enrichedAt).toLocaleString('it-IT')}
                                {externalMeta.bookmarkletVersion && (
                                  <span className="text-blue-400">(v{externalMeta.bookmarkletVersion})</span>
                                )}
                              </div>
                            </div>
                            
                            {/* Info base */}
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {externalMeta.workItemOrganization && (
                                <div>
                                  <span className="text-muted-foreground">Organizzazione:</span>{' '}
                                  <span className="font-medium">{decodeURIComponent(externalMeta.workItemOrganization)}</span>
                                </div>
                              )}
                              {externalMeta.workItemProject && (
                                <div>
                                  <span className="text-muted-foreground">Progetto:</span>{' '}
                                  <span className="font-medium">{decodeURIComponent(externalMeta.workItemProject)}</span>
                                </div>
                              )}
                              {externalMeta.workItemIterationPath && (
                                <div>
                                  <span className="text-muted-foreground">Iterazione:</span>{' '}
                                  <span className="font-medium">{externalMeta.workItemIterationPath}</span>
                                </div>
                              )}
                              {externalMeta.workItemAreaPath && (
                                <div>
                                  <span className="text-muted-foreground">Area:</span>{' '}
                                  <span className="font-medium">{externalMeta.workItemAreaPath}</span>
                                </div>
                              )}
                              {externalMeta.workItemPriority && (
                                <div>
                                  <span className="text-muted-foreground">Priorità:</span>{' '}
                                  <Badge variant="outline" className="ml-1">{externalMeta.workItemPriority}</Badge>
                                </div>
                              )}
                              {(externalMeta.workItemStoryPoints || externalMeta.workItemEffort) && (
                                <div>
                                  <span className="text-muted-foreground">
                                    {externalMeta.workItemStoryPoints ? 'Story Points:' : 'Effort:'}
                                  </span>{' '}
                                  <span className="font-medium">
                                    {externalMeta.workItemStoryPoints || externalMeta.workItemEffort}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {/* Tags */}
                            {externalMeta.workItemTags && externalMeta.workItemTags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {externalMeta.workItemTags.map((tag: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            
                            {/* Descrizione - mostrata prima dei campi custom */}
                            {(externalMeta.workItemDescriptionHtml || externalMeta.description) && (
                              <Collapsible defaultOpen>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1">
                                    <span className="text-muted-foreground text-sm">📝 Descrizione</span>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div 
                                    className="mt-1 text-sm bg-white dark:bg-gray-800 rounded p-3 max-h-60 overflow-y-auto border prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(externalMeta.workItemDescriptionHtml || externalMeta.description || '', {
                                      ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
                                      ALLOWED_ATTR: ['href', 'src', 'alt', 'class'],
                                      FORBID_TAGS: ['style', 'script'],
                                      FORBID_ATTR: ['style']
                                    }) }}
                                  />
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {/* Altri dati */}
                            {(externalMeta.ticketCode || externalMeta.wbsCode || externalMeta.ticketType || (externalMeta.customFields && Object.keys(externalMeta.customFields).length > 0)) && (
                              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-amber-700 dark:text-amber-400 font-medium text-sm">🏷️ Altri dati</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  {externalMeta.ticketCode && (
                                    <div>
                                      <span className="text-muted-foreground">N. Ticket:</span>{' '}
                                      <span className="font-medium text-amber-800 dark:text-amber-300">{externalMeta.ticketCode}</span>
                                    </div>
                                  )}
                                  {externalMeta.wbsCode && (
                                    <div>
                                      <span className="text-muted-foreground">WBS:</span>{' '}
                                      <span className="font-medium text-amber-800 dark:text-amber-300">{externalMeta.wbsCode}</span>
                                    </div>
                                  )}
                                  {externalMeta.ticketType && (
                                    <div>
                                      <span className="text-muted-foreground">Tipo Ticket:</span>{' '}
                                      <span className="font-medium text-amber-800 dark:text-amber-300">{externalMeta.ticketType}</span>
                                    </div>
                                  )}
                                </div>
                                {/* Altri campi custom non mappati */}
                                {externalMeta.customFields && Object.keys(externalMeta.customFields).length > 0 && (
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1 mt-2">
                                        <span className="text-muted-foreground text-xs">
                                          Altri campi ({Object.keys(externalMeta.customFields).length})
                                        </span>
                                        <ChevronDown className="h-3 w-3" />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                                        {Object.entries(externalMeta.customFields).map(([key, value]: [string, any]) => (
                                          <div key={key}>
                                            <span className="text-muted-foreground">{key}:</span>{' '}
                                            <span className="font-medium text-amber-800 dark:text-amber-300">{String(value)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </div>
                            )}
                            
                            {/* Acceptance Criteria */}
                            {externalMeta.workItemAcceptanceCriteriaHtml && (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1">
                                    <span className="text-muted-foreground text-sm">✅ Criteri di Accettazione</span>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div 
                                    className="mt-1 text-sm bg-white dark:bg-gray-800 rounded p-3 max-h-60 overflow-y-auto border prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(externalMeta.workItemAcceptanceCriteriaHtml, {
                                      ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
                                      ALLOWED_ATTR: ['href', 'src', 'alt', 'class'],
                                      FORBID_TAGS: ['style', 'script'],
                                      FORBID_ATTR: ['style']
                                    }) }}
                                  />
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {/* Repro Steps (per Bug) */}
                            {externalMeta.workItemReproStepsHtml && (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1">
                                    <span className="text-muted-foreground text-sm">🐛 Passi per Riprodurre</span>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div 
                                    className="mt-1 text-sm bg-white dark:bg-gray-800 rounded p-3 max-h-60 overflow-y-auto border prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(externalMeta.workItemReproStepsHtml, {
                                      ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
                                      ALLOWED_ATTR: ['href', 'src', 'alt', 'class'],
                                      FORBID_TAGS: ['style', 'script'],
                                      FORBID_ATTR: ['style']
                                    }) }}
                                  />
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {/* Commenti */}
                            {externalMeta.workItemComments && externalMeta.workItemComments.length > 0 && (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1">
                                    <span className="text-muted-foreground text-sm">
                                      💬 Commenti ({externalMeta.workItemComments.length})
                                    </span>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-1 space-y-2 max-h-60 overflow-y-auto">
                                    {externalMeta.workItemComments.map((comment: any, idx: number) => (
                                      <div key={idx} className="bg-white dark:bg-gray-800 rounded p-2 border text-sm">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-medium text-xs">{comment.author}</span>
                                          {comment.date && (
                                            <span className="text-xs text-muted-foreground">{comment.date}</span>
                                          )}
                                        </div>
                                        {comment.contentHtml ? (
                                          <div 
                                            className="prose prose-sm max-w-none text-sm [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.contentHtml, {
                                              ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'img'],
                                              ALLOWED_ATTR: ['href', 'class', 'src', 'alt', 'width', 'height'],
                                              FORBID_TAGS: ['style', 'script'],
                                              FORBID_ATTR: ['style']
                                            }) }}
                                          />
                                        ) : (
                                          <p className="text-xs">{comment.content}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {/* Allegati */}
                            {externalMeta.workItemAttachments && externalMeta.workItemAttachments.length > 0 && (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1">
                                    <span className="text-muted-foreground text-sm">
                                      📎 Allegati ({externalMeta.workItemAttachments.length})
                                    </span>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-1 space-y-1">
                                    {externalMeta.workItemAttachments.map((att: any, idx: number) => (
                                      <div key={idx} className="flex items-center gap-2 text-sm bg-white rounded p-2 border">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="flex-1 truncate">{att.name}</span>
                                        {att.size && <span className="text-xs text-muted-foreground">{att.size}</span>}
                                        {att.url && (
                                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                            Apri
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {/* Work Item collegati */}
                            {externalMeta.workItemLinkedItems && externalMeta.workItemLinkedItems.length > 0 && (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full justify-between text-left h-auto py-1">
                                    <span className="text-muted-foreground text-sm">
                                      🔗 Collegamenti ({externalMeta.workItemLinkedItems.length})
                                    </span>
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-1 space-y-1">
                                    {externalMeta.workItemLinkedItems.map((link: any, idx: number) => (
                                      <div key={idx} className="flex items-center gap-2 text-sm bg-white rounded p-2 border">
                                        <Badge variant="outline" className="text-xs">{link.type}</Badge>
                                        {link.workItemId && <span className="font-mono text-xs">#{link.workItemId}</span>}
                                        {link.title && <span className="flex-1 truncate">{link.title}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Calendar Event Panel */}
                {(selectedMessage as any)?.sourceType === 'email_calendar_event' && (() => {
                  const externalMeta = (selectedMessage as any)?.externalMetadata || {};
                  
                  return (
                    <div className="border-t bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-purple-600" />
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-purple-600 text-white">Appuntamento</Badge>
                                {externalMeta.calendarType && (
                                  <Badge variant="outline" className="text-purple-700 border-purple-300 capitalize">
                                    {externalMeta.calendarType === 'teams' ? 'Microsoft Teams' : 
                                     externalMeta.calendarType === 'google' ? 'Google Meet' :
                                     externalMeta.calendarType === 'zoom' ? 'Zoom' : externalMeta.calendarType}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-lg font-semibold mt-1">
                                {externalMeta.eventTitle || selectedMessage.subject}
                              </div>
                            </div>
                          </div>
                          
                          {externalMeta.meetingLink && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(externalMeta.meetingLink, '_blank')}
                              className="bg-purple-600 hover:bg-purple-700 text-white border-0"
                              data-testid="button-join-meeting"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Partecipa
                            </Button>
                          )}
                        </div>
                        
                        {/* Dettagli evento */}
                        <div className="space-y-3">
                          {/* Data e Ora */}
                          {(externalMeta.eventDateTime || externalMeta.eventDate) && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-purple-600" />
                              <div>
                                <span className="text-muted-foreground">Quando:</span>{' '}
                                <span className="font-medium">{externalMeta.eventDateTime || externalMeta.eventDate}</span>
                                {externalMeta.eventStartTime && externalMeta.eventEndTime && !externalMeta.eventDateTime && (
                                  <span className="ml-2 text-sm">
                                    {externalMeta.eventStartTime} - {externalMeta.eventEndTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Luogo */}
                          {externalMeta.eventLocation && (
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-purple-600" />
                              <div>
                                <span className="text-muted-foreground">Dove:</span>{' '}
                                <span className="font-medium">{externalMeta.eventLocation}</span>
                              </div>
                            </div>
                          )}
                          
                          {/* Organizzatore */}
                          {externalMeta.eventOrganizer && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-purple-600" />
                              <div>
                                <span className="text-muted-foreground">Organizzatore:</span>{' '}
                                <span className="font-medium">{externalMeta.eventOrganizer}</span>
                                {externalMeta.eventOrganizerEmail && (
                                  <span className="text-sm text-muted-foreground ml-1">
                                    ({externalMeta.eventOrganizerEmail})
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Partecipanti */}
                          {externalMeta.eventAttendees && externalMeta.eventAttendees.length > 0 && (
                            <div className="flex items-start gap-2">
                              <User className="h-4 w-4 text-purple-600 mt-0.5" />
                              <div>
                                <span className="text-muted-foreground">Partecipanti:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {externalMeta.eventAttendees.map((attendee: string, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {attendee}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Dettagli Teams */}
                        {externalMeta.calendarType === 'teams' && (
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border space-y-2">
                            <div className="text-sm font-medium text-purple-700 dark:text-purple-400">
                              📞 Dettagli Microsoft Teams
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {externalMeta.teamsMeetingId && (
                                <div>
                                  <span className="text-muted-foreground">ID Riunione:</span>{' '}
                                  <span className="font-mono text-xs">{externalMeta.teamsMeetingId}</span>
                                </div>
                              )}
                              {externalMeta.teamsPasscode && (
                                <div>
                                  <span className="text-muted-foreground">Passcode:</span>{' '}
                                  <span className="font-mono text-xs">{externalMeta.teamsPasscode}</span>
                                </div>
                              )}
                              {externalMeta.teamsDialIn && (
                                <div>
                                  <span className="text-muted-foreground">Dial-in:</span>{' '}
                                  <span className="font-mono text-xs">{externalMeta.teamsDialIn}</span>
                                </div>
                              )}
                              {externalMeta.teamsConferenceId && (
                                <div>
                                  <span className="text-muted-foreground">ID Conferenza:</span>{' '}
                                  <span className="font-mono text-xs">{externalMeta.teamsConferenceId}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Dettagli Zoom */}
                        {externalMeta.calendarType === 'zoom' && (
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border space-y-2">
                            <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
                              📹 Dettagli Zoom
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {externalMeta.zoomMeetingId && (
                                <div>
                                  <span className="text-muted-foreground">Meeting ID:</span>{' '}
                                  <span className="font-mono text-xs">{externalMeta.zoomMeetingId}</span>
                                </div>
                              )}
                              {externalMeta.zoomPasscode && (
                                <div>
                                  <span className="text-muted-foreground">Passcode:</span>{' '}
                                  <span className="font-mono text-xs">{externalMeta.zoomPasscode}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Training Mode Controls - Visible only in training mode */}
                {selectedMessage && isTrainingMode && (
                  <div className="border-t border-b bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
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
                {/* Hide body for DevOps and Calendar messages - data is shown in the panel above */}
                {(selectedMessage as any)?.sourceType !== 'email_devops_workitem' && 
                 (selectedMessage as any)?.sourceType !== 'email_calendar_event' && (
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
                              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContent.bodyHtml, {
                                FORBID_TAGS: ['style', 'script'],
                                FORBID_ATTR: ['style']
                              }) }} data-testid="email-content-main" />
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
                                    <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContent.remainderHtml, {
                                      FORBID_TAGS: ['style', 'script'],
                                      FORBID_ATTR: ['style']
                                    }) }} data-testid="email-content-thread" />
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
                          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedMessage.htmlBody, {
                            FORBID_TAGS: ['style', 'script'],
                            FORBID_ATTR: ['style']
                          }) }} />
                        ) : (
                          <div className="whitespace-pre-wrap text-sm">{selectedMessage?.body || 'Nessun contenuto'}</div>
                        )
                      )
                    )}
                  </div>
                </div>
                )}

                {/* Pannello Feedback - Hidden for DevOps and Calendar messages */}
                {(selectedMessage as any)?.sourceType !== 'email_devops_workitem' && 
                 (selectedMessage as any)?.sourceType !== 'email_calendar_event' && (
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
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedMessage!.htmlBody, {
                                FORBID_TAGS: ['style', 'script'],
                                FORBID_ATTR: ['style']
                              }) }}
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
                )}

                {/* Attachments Section - Hidden for DevOps and Calendar messages */}
                {selectedMessage.attachments && selectedMessage.attachments.length > 0 && 
                 (selectedMessage as any)?.sourceType !== 'email_devops_workitem' && 
                 (selectedMessage as any)?.sourceType !== 'email_calendar_event' && (() => {
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